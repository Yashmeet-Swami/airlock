import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
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
  return { accessToken: res.body.accessToken as string, tenantId: res.body.user.tenantId as string };
}

async function loginAsViewer(tenantId: string) {
  await createUser(tenantId, "viewer@acme.test", await hashPassword("hunter22222"), "viewer");
  const res = await request(app).post("/auth/login").send({ email: "viewer@acme.test", password: "hunter22222" });
  return res.body.accessToken as string;
}

describe("route CRUD + RBAC", () => {
  it("lets an admin/owner create a route", async () => {
    const { accessToken } = await registerOwner();

    const res = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/v1/payments", upstreamUrl: "http://upstream.test:4000", methods: ["GET"] });

    expect(res.status).toBe(201);
    expect(res.body.pathPattern).toBe("/v1/payments");
  });

  it("blocks a viewer from creating a route", async () => {
    const { tenantId } = await registerOwner();
    const viewerToken = await loginAsViewer(tenantId);

    const res = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ pathPattern: "/v1/payments", upstreamUrl: "http://upstream.test:4000", methods: ["GET"] });

    expect(res.status).toBe(403);
  });

  it("still lets a viewer list routes (read-only access)", async () => {
    const { accessToken, tenantId } = await registerOwner();
    await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/v1/payments", upstreamUrl: "http://upstream.test:4000", methods: ["GET"] });

    const viewerToken = await loginAsViewer(tenantId);
    const res = await request(app).get("/admin/routes").set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("rejects an invalid upstreamUrl", async () => {
    const { accessToken } = await registerOwner();
    const res = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/v1/payments", upstreamUrl: "not-a-url", methods: ["GET"] });

    expect(res.status).toBe(400);
  });

  it("PATCH without a field leaves it unchanged (no accidental default reset)", async () => {
    const { accessToken } = await registerOwner();
    const created = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        pathPattern: "/v1/payments",
        upstreamUrl: "http://upstream.test:4000",
        methods: ["GET"],
        cacheable: true,
        cacheTtlS: 30,
      });

    const patched = await request(app)
      .patch(`/admin/routes/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ methods: ["GET", "POST"] });

    expect(patched.status).toBe(200);
    expect(patched.body.cacheable).toBe(true);
    expect(patched.body.cacheTtlS).toBe(30);
    expect(patched.body.methods).toEqual(["GET", "POST"]);
  });
});
