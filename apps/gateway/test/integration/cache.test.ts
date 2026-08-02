import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
import { startEchoServer } from "../setup/echoServer.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

async function registerOwner() {
  const res = await request(app)
    .post("/auth/register")
    .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });
  return res.body.accessToken as string;
}

describe("cache-aside response caching", () => {
  it("caches a GET response and serves the second call from cache without hitting the upstream again", async () => {
    const echo = await startEchoServer();
    try {
      const accessToken = await registerOwner();
      const routeRes = await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          pathPattern: "/echo",
          upstreamUrl: echo.url,
          methods: ["GET"],
          authRequired: false,
          cacheable: true,
          cacheTtlS: 30,
        });
      expect(routeRes.status).toBe(201);

      const first = await request(app).get("/proxy/acme-corp/echo");
      expect(first.status).toBe(200);
      expect(first.headers["x-cache"]).toBe("MISS");

      const second = await request(app).get("/proxy/acme-corp/echo");
      expect(second.status).toBe(200);
      expect(second.headers["x-cache"]).toBe("HIT");

      expect(echo.callCount()).toBe(1);
    } finally {
      await echo.close();
    }
  });

  it("does not cache when the route is not marked cacheable", async () => {
    const echo = await startEchoServer();
    try {
      const accessToken = await registerOwner();
      await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ pathPattern: "/echo", upstreamUrl: echo.url, methods: ["GET"], authRequired: false });

      await request(app).get("/proxy/acme-corp/echo");
      await request(app).get("/proxy/acme-corp/echo");

      expect(echo.callCount()).toBe(2);
    } finally {
      await echo.close();
    }
  });

  it("busts the cache via POST /admin/cache/invalidate", async () => {
    const echo = await startEchoServer();
    try {
      const accessToken = await registerOwner();
      const routeRes = await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          pathPattern: "/echo",
          upstreamUrl: echo.url,
          methods: ["GET"],
          authRequired: false,
          cacheable: true,
          cacheTtlS: 30,
        });

      await request(app).get("/proxy/acme-corp/echo"); // MISS, populates cache
      await request(app).get("/proxy/acme-corp/echo"); // HIT
      expect(echo.callCount()).toBe(1);

      const invalidate = await request(app)
        .post("/admin/cache/invalidate")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ routeId: routeRes.body.id });
      expect(invalidate.status).toBe(204);

      await request(app).get("/proxy/acme-corp/echo"); // MISS again after invalidation
      expect(echo.callCount()).toBe(2);
    } finally {
      await echo.close();
    }
  });

  it("busts the cache automatically when the route is updated via PATCH", async () => {
    const echo = await startEchoServer();
    try {
      const accessToken = await registerOwner();
      const routeRes = await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          pathPattern: "/echo",
          upstreamUrl: echo.url,
          methods: ["GET"],
          authRequired: false,
          cacheable: true,
          cacheTtlS: 30,
        });

      await request(app).get("/proxy/acme-corp/echo");
      expect(echo.callCount()).toBe(1);

      await request(app)
        .patch(`/admin/routes/${routeRes.body.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ cacheTtlS: 60 });

      await request(app).get("/proxy/acme-corp/echo");
      expect(echo.callCount()).toBe(2);
    } finally {
      await echo.close();
    }
  });
});
