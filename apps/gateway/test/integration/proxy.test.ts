import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
import { startEchoServer, type EchoServer } from "../setup/echoServer.js";

const app = createApp();
let echo: EchoServer;

beforeEach(async () => {
  await resetDatabase();
  echo = await startEchoServer();
});

afterEach(async () => {
  await echo.close();
});

async function setUpTenant(tenantName: string, email: string) {
  const registerRes = await request(app)
    .post("/auth/register")
    .send({ tenantName, email, password: "hunter22222" });
  const accessToken = registerRes.body.accessToken as string;

  await request(app)
    .post("/admin/routes")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ pathPattern: "/echo", upstreamUrl: echo.url, methods: ["GET", "POST"], authRequired: true });

  const keyRes = await request(app)
    .post("/admin/api-keys")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ scopes: ["proxy:invoke"] });

  return { accessToken, rawKey: keyRes.body.rawKey as string, apiKeyId: keyRes.body.id as string };
}

describe("proxy", () => {
  it("forwards an authenticated request through to the upstream", async () => {
    const { rawKey } = await setUpTenant("acme-corp", "owner@acme.test");

    const res = await request(app).get("/proxy/acme-corp/echo").set("X-API-Key", rawKey);

    expect(res.status).toBe(200);
    expect(res.body.echo).toBe(true);
    expect(res.body.path).toBe("/echo");
  });

  it("rejects a request with no API key on an auth-required route", async () => {
    await setUpTenant("acme-corp", "owner@acme.test");
    const res = await request(app).get("/proxy/acme-corp/echo");
    expect(res.status).toBe(401);
  });

  it("rejects a revoked API key", async () => {
    const { accessToken, rawKey, apiKeyId } = await setUpTenant("acme-corp", "owner@acme.test");

    await request(app).delete(`/admin/api-keys/${apiKeyId}`).set("Authorization", `Bearer ${accessToken}`);

    const res = await request(app).get("/proxy/acme-corp/echo").set("X-API-Key", rawKey);
    expect(res.status).toBe(401);
  });

  it("rejects an unknown tenant slug", async () => {
    const { rawKey } = await setUpTenant("acme-corp", "owner@acme.test");
    const res = await request(app).get("/proxy/does-not-exist/echo").set("X-API-Key", rawKey);
    expect(res.status).toBe(404);
  });

  it("rejects a valid API key from a different tenant (cross-tenant isolation)", async () => {
    await setUpTenant("acme-corp", "owner@acme.test");
    const beta = await setUpTenant("beta-corp", "owner@beta.test");

    const res = await request(app).get("/proxy/acme-corp/echo").set("X-API-Key", beta.rawKey);
    expect(res.status).toBe(401);
  });
});
