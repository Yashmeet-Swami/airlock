import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
import { startEchoServer } from "../setup/echoServer.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("GET /metrics (§20.1/§22.1)", () => {
  it("exposes Prometheus-formatted counters after a proxied request", async () => {
    const echo = await startEchoServer();
    try {
      const registerRes = await request(app)
        .post("/auth/register")
        .send({ tenantName: "metrics-co", email: "owner@metrics.test", password: "hunter22222" });
      const accessToken = registerRes.body.accessToken as string;

      await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ pathPattern: "/echo", upstreamUrl: echo.url, methods: ["GET"], authRequired: false });

      await request(app).get("/proxy/metrics-co/echo");

      const metrics = await request(app).get("/metrics");
      expect(metrics.status).toBe(200);
      expect(metrics.headers["content-type"]).toContain("text/plain");
      expect(metrics.text).toContain("airlock_requests_total");
      expect(metrics.text).toContain("airlock_request_duration_ms");
    } finally {
      await echo.close();
    }
  });
});
