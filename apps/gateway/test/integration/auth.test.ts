import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /auth/register", () => {
  it("creates a tenant + owner user and returns tokens", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("owner");
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.refreshToken).toBeTypeOf("string");
  });

  it("rejects a duplicate email", async () => {
    await request(app)
      .post("/auth/register")
      .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });

    const res = await request(app)
      .post("/auth/register")
      .send({ tenantName: "other-corp", email: "owner@acme.test", password: "hunter22222" });

    expect(res.status).toBe(409);
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    await request(app)
      .post("/auth/register")
      .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });

    const res = await request(app).post("/auth/login").send({ email: "owner@acme.test", password: "hunter22222" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf("string");
  });

  it("rejects incorrect credentials", async () => {
    await request(app)
      .post("/auth/register")
      .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });

    const res = await request(app).post("/auth/login").send({ email: "owner@acme.test", password: "wrong" });
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates the refresh token and issues a new pair", async () => {
    const registerRes = await request(app)
      .post("/auth/register")
      .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: registerRes.body.refreshToken });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.refreshToken).not.toBe(registerRes.body.refreshToken);
  });

  it("detects reuse of an already-rotated refresh token and revokes the session", async () => {
    const registerRes = await request(app)
      .post("/auth/register")
      .send({ tenantName: "acme-corp", email: "owner@acme.test", password: "hunter22222" });
    const originalRefreshToken = registerRes.body.refreshToken as string;

    const firstRefresh = await request(app).post("/auth/refresh").send({ refreshToken: originalRefreshToken });
    expect(firstRefresh.status).toBe(200);

    // Reusing the already-rotated token is treated as a compromise signal (§13.3).
    const reuse = await request(app).post("/auth/refresh").send({ refreshToken: originalRefreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toBe("refresh_token_reuse_detected");

    // The whole session family (including the token issued by the first, legitimate refresh) is now dead.
    const afterReuse = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: firstRefresh.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });
});
