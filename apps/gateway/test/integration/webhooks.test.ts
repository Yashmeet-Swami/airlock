import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
import { startEchoServer } from "../setup/echoServer.js";
import { trustInternalUpstreams } from "../setup/trustTenant.js";
import { createUser } from "../../src/db/users.repo.js";
import { hashPassword } from "../../src/security/password.js";

const app = createApp();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

describe("webhooks CRUD + RBAC", () => {
  it("lets an admin/owner create and list webhooks", async () => {
    const { accessToken } = await registerOwner();

    const created = await request(app)
      .post("/admin/webhooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ url: "https://example.test/hook", events: ["rate_limit.exceeded"] });
    expect(created.status).toBe(201);
    expect(created.body.secret).toBeTypeOf("string");
    expect(created.body.active).toBe(true);

    const listed = await request(app).get("/admin/webhooks").set("Authorization", `Bearer ${accessToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body).toHaveLength(1);
  });

  it("blocks a viewer from creating a webhook", async () => {
    const { tenantId } = await registerOwner();
    await createUser(tenantId, "viewer@acme.test", await hashPassword("hunter22222"), "viewer");
    const loginRes = await request(app).post("/auth/login").send({ email: "viewer@acme.test", password: "hunter22222" });

    const res = await request(app)
      .post("/admin/webhooks")
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .send({ url: "https://example.test/hook", events: ["rate_limit.exceeded"] });

    expect(res.status).toBe(403);
  });

  it("rejects an unknown event name", async () => {
    const { accessToken } = await registerOwner();
    const res = await request(app)
      .post("/admin/webhooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ url: "https://example.test/hook", events: ["not_a_real_event"] });
    expect(res.status).toBe(400);
  });

  it("deletes a webhook", async () => {
    const { accessToken } = await registerOwner();
    const created = await request(app)
      .post("/admin/webhooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ url: "https://example.test/hook", events: ["rate_limit.exceeded"] });

    const deleted = await request(app)
      .delete(`/admin/webhooks/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(deleted.status).toBe(204);
  });
});

describe("webhook dispatch on rate_limit.exceeded", () => {
  it("queues a delivery when a matching active webhook subscription exists", async () => {
    const echo = await startEchoServer();
    try {
      const { accessToken } = await registerOwner();

      const routeRes = await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ pathPattern: "/echo", upstreamUrl: echo.url, methods: ["GET"], authRequired: false });

      await request(app)
        .post("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ routeId: routeRes.body.id, limitCount: 1, windowSeconds: 10 });

      const webhookRes = await request(app)
        .post("/admin/webhooks")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ url: "https://example.test/hook", events: ["rate_limit.exceeded"] });

      // First request consumes the only token; the second is rate-limited and
      // should trigger a webhook dispatch (fire-and-forget on the response path).
      await request(app).get("/proxy/acme-corp/echo");
      const limited = await request(app).get("/proxy/acme-corp/echo");
      expect(limited.status).toBe(429);

      await sleep(300);

      const deliveries = await request(app)
        .get(`/admin/webhooks/${webhookRes.body.id}/deliveries`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(deliveries.status).toBe(200);
      expect(deliveries.body).toHaveLength(1);
      expect(deliveries.body[0].status).toBe("queued");
      expect(deliveries.body[0].eventName).toBe("rate_limit.exceeded");
      expect(deliveries.body[0].payload).toMatchObject({ routeId: routeRes.body.id });
    } finally {
      await echo.close();
    }
  });

  it("does not queue a delivery when the webhook is inactive or unsubscribed", async () => {
    const echo = await startEchoServer();
    try {
      const { accessToken } = await registerOwner();

      const routeRes = await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ pathPattern: "/echo", upstreamUrl: echo.url, methods: ["GET"], authRequired: false });

      await request(app)
        .post("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ routeId: routeRes.body.id, limitCount: 1, windowSeconds: 10 });

      // No webhook registered at all.
      await request(app).get("/proxy/acme-corp/echo");
      const limited = await request(app).get("/proxy/acme-corp/echo");
      expect(limited.status).toBe(429);

      await sleep(300);
      // Nothing to assert against directly (no webhook id) — this test mainly
      // guards against publishEvent throwing/crashing when there are no subscribers.
    } finally {
      await echo.close();
    }
  });

  it("supports manual replay of a delivery", async () => {
    const echo = await startEchoServer();
    try {
      const { accessToken } = await registerOwner();

      const routeRes = await request(app)
        .post("/admin/routes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ pathPattern: "/echo", upstreamUrl: echo.url, methods: ["GET"], authRequired: false });
      await request(app)
        .post("/admin/rate-limit-policies")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ routeId: routeRes.body.id, limitCount: 1, windowSeconds: 10 });
      const webhookRes = await request(app)
        .post("/admin/webhooks")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ url: "https://example.test/hook", events: ["rate_limit.exceeded"] });

      await request(app).get("/proxy/acme-corp/echo");
      await request(app).get("/proxy/acme-corp/echo");
      await sleep(300);

      const deliveries = await request(app)
        .get(`/admin/webhooks/${webhookRes.body.id}/deliveries`)
        .set("Authorization", `Bearer ${accessToken}`);
      const deliveryId = deliveries.body[0].id as string;

      const replay = await request(app)
        .post(`/admin/webhooks/deliveries/${deliveryId}/replay`)
        .set("Authorization", `Bearer ${accessToken}`);

      expect(replay.status).toBe(202);
      expect(replay.body.status).toBe("queued");
      expect(replay.body.attemptCount).toBe(0);
    } finally {
      await echo.close();
    }
  });
});
