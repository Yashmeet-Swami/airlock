import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
import { startEchoServer } from "../setup/echoServer.js";
import { trustInternalUpstreams } from "../setup/trustTenant.js";
import { createUser } from "../../src/db/users.repo.js";
import { hashPassword } from "../../src/security/password.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

async function registerOwner() {
  const res = await request(app)
    .post("/auth/register")
    .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });
  // The echo fixture server below is a real loopback address (127.0.0.1) —
  // see test/setup/trustTenant.ts for why this is needed.
  await trustInternalUpstreams(res.body.user.tenantId);
  return { accessToken: res.body.accessToken as string, tenantId: res.body.user.tenantId as string };
}

async function createPublicEchoRoute(accessToken: string, upstreamUrl: string) {
  const res = await request(app)
    .post("/admin/routes")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ pathPattern: "/echo", upstreamUrl, methods: ["GET"], authRequired: false });
  return res.body.id as string;
}

describe("rate limiting", () => {
  it(
    "enforces the configured limit atomically under concurrent requests",
    async () => {
      const echo = await startEchoServer();
      try {
        const { accessToken } = await registerOwner();
        const routeId = await createPublicEchoRoute(accessToken, echo.url);

        await request(app)
          .post("/admin/rate-limit-policies")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ routeId, limitCount: 5, windowSeconds: 10 });

        const responses = await Promise.all(
          Array.from({ length: 20 }, () => request(app).get("/proxy/acme-corp/echo")),
        );

        const allowed = responses.filter((r) => r.status === 200);
        const limited = responses.filter((r) => r.status === 429);

        // Proves the Lua INCR+EXPIRE is atomic: exactly `limitCount` succeed even
        // with 20 genuinely concurrent requests racing the same Redis counter.
        expect(allowed).toHaveLength(5);
        expect(limited).toHaveLength(15);
        expect(limited[0]?.headers["retry-after"]).toBeDefined();
        expect(limited[0]?.body.error).toBe("rate_limit_exceeded");
      } finally {
        await echo.close();
      }
    },
    45_000, // 20 genuinely concurrent requests through Docker-forwarded Postgres/Redis ports can be slow locally
  );

  it("prefers a route-specific policy over a tenant-wide one", async () => {
    const echo = await startEchoServer();
    try {
      const { accessToken } = await registerOwner();
      const routeId = await createPublicEchoRoute(accessToken, echo.url);

      await request(app)
        .post("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ routeId: null, limitCount: 1000, windowSeconds: 60 });

      await request(app)
        .post("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ routeId, limitCount: 2, windowSeconds: 60 });

      const results = await Promise.all([
        request(app).get("/proxy/acme-corp/echo"),
        request(app).get("/proxy/acme-corp/echo"),
        request(app).get("/proxy/acme-corp/echo"),
      ]);

      expect(results.filter((r) => r.status === 200)).toHaveLength(2);
      expect(results.filter((r) => r.status === 429)).toHaveLength(1);
    } finally {
      await echo.close();
    }
  });

  it("sets X-RateLimit-Limit/Remaining headers on allowed requests", async () => {
    const echo = await startEchoServer();
    try {
      const { accessToken } = await registerOwner();
      await createPublicEchoRoute(accessToken, echo.url);

      const res = await request(app).get("/proxy/acme-corp/echo");
      expect(res.status).toBe(200);
      expect(res.headers["x-ratelimit-limit"]).toBeDefined();
      expect(res.headers["x-ratelimit-remaining"]).toBeDefined();
    } finally {
      await echo.close();
    }
  });

  describe("policy CRUD + RBAC", () => {
    it("lets an admin/owner create and list policies", async () => {
      const { accessToken } = await registerOwner();

      const created = await request(app)
        .post("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ limitCount: 100, windowSeconds: 60 });
      expect(created.status).toBe(201);
      expect(created.body.routeId).toBeNull();

      const listed = await request(app)
        .get("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${accessToken}`);
      expect(listed.status).toBe(200);
      expect(listed.body).toHaveLength(1);
    });

    it("blocks a viewer from creating a policy", async () => {
      const { tenantId } = await registerOwner();
      await createUser(tenantId, "viewer@acme.test", await hashPassword("hunter22222"), "viewer");
      const loginRes = await request(app)
        .post("/auth/login")
        .send({ email: "viewer@acme.test", password: "hunter22222" });

      const res = await request(app)
        .post("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
        .send({ limitCount: 100, windowSeconds: 60 });

      expect(res.status).toBe(403);
    });
  });
});
