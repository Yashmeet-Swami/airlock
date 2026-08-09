import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
import { seedLogDocument } from "../setup/opensearchSeed.js";
import { startEchoServer } from "../setup/echoServer.js";
import { requestsQueue } from "../../src/events/requestLogger.js";

const app = createApp();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(async () => {
  await resetDatabase();
});

async function registerOwner(tenantName = "acme-corp", email = "owner@acme.test") {
  const res = await request(app)
    .post("/auth/register")
    .send({ tenantName, email, password: "hunter22222" });
  return { accessToken: res.body.accessToken as string, tenantId: res.body.user.tenantId as string };
}

describe("GET /logs/search auth (JWT any role OR API key with read:logs)", () => {
  it("rejects a request with no auth at all", async () => {
    const res = await request(app).get("/logs/search");
    expect(res.status).toBe(401);
  });

  it("allows a dashboard JWT regardless of role (viewer)", async () => {
    const { accessToken } = await registerOwner();
    const res = await request(app).get("/logs/search").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it("allows an API key with the read:logs scope", async () => {
    const { accessToken } = await registerOwner();
    const keyRes = await request(app)
      .post("/admin/api-keys")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ scopes: ["read:logs"] });

    const res = await request(app).get("/logs/search").set("X-API-Key", keyRes.body.rawKey);
    expect(res.status).toBe(200);
  });

  it("rejects an API key missing the read:logs scope", async () => {
    const { accessToken } = await registerOwner();
    const keyRes = await request(app)
      .post("/admin/api-keys")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ scopes: ["proxy:invoke"] });

    const res = await request(app).get("/logs/search").set("X-API-Key", keyRes.body.rawKey);
    expect(res.status).toBe(403);
  });
});

describe("GET /logs/search", () => {
  it("returns only the caller's own tenant's documents (tenant isolation)", async () => {
    const tenantA = await registerOwner("acme-corp", "owner@acme.test");
    const tenantB = await registerOwner("beta-corp", "owner@beta.test");

    await seedLogDocument({ tenant_id: tenantA.tenantId, route: "/v1/payments", status_code: 200 });
    await seedLogDocument({ tenant_id: tenantB.tenantId, route: "/v1/payments", status_code: 200 });

    const res = await request(app)
      .get("/logs/search")
      .set("Authorization", `Bearer ${tenantA.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].route).toBe("/v1/payments");
  });

  it("filters by status_code and full-text-matches error_message via q", async () => {
    const { accessToken, tenantId } = await registerOwner();
    await seedLogDocument({ tenant_id: tenantId, route: "/v1/a", status_code: 200 });
    await seedLogDocument({
      tenant_id: tenantId,
      route: "/v1/b",
      status_code: 500,
      error_message: "upstream timeout exceeded",
    });

    const res = await request(app)
      .get("/logs/search")
      .query({ status_code: 500, q: "timeout" })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.results[0].route).toBe("/v1/b");
  });
});

describe("GET /logs/aggregate", () => {
  it("groups by route within the caller's tenant, counting errors", async () => {
    const { accessToken, tenantId } = await registerOwner();
    await seedLogDocument({ tenant_id: tenantId, route: "/v1/payments", status_code: 200 });
    await seedLogDocument({ tenant_id: tenantId, route: "/v1/payments", status_code: 500 });
    await seedLogDocument({ tenant_id: tenantId, route: "/v1/users", status_code: 200 });

    const res = await request(app)
      .get("/logs/aggregate")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const payments = res.body.routes.find((r: { route: string }) => r.route === "/v1/payments");
    expect(payments).toMatchObject({ route: "/v1/payments", count: 2, errorCount: 1 });
  });
});

describe("proxy pipeline emits log events onto the requests queue", () => {
  it("enqueues a request.completed job for a successful proxied call", async () => {
    const echo = await startEchoServer();
    try {
      const { accessToken } = await registerOwner();
      await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ pathPattern: "/echo", upstreamUrl: echo.url, methods: ["GET"], authRequired: false });

      const before = await requestsQueue.getJobCountByTypes("completed", "waiting", "active");
      await request(app).get("/proxy/acme-corp/echo");
      await sleep(300);
      const after = await requestsQueue.getJobCountByTypes("completed", "waiting", "active");

      expect(after).toBeGreaterThan(before);
    } finally {
      await echo.close();
    }
  });
});
