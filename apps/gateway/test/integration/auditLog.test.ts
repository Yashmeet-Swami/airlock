import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";

const app = createApp();

beforeEach(async () => {
  await resetDatabase();
});

async function registerOwner() {
  const res = await request(app)
    .post("/auth/register")
    .send({ tenantName: "audit-co", email: "owner@audit.test", password: "hunter22222" });
  return res.body.accessToken as string;
}

describe("audit log", () => {
  it("records an entry when a route is created and lists it back", async () => {
    const accessToken = await registerOwner();

    const routeRes = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/echo", upstreamUrl: "http://example.test", methods: ["GET"], authRequired: false });
    expect(routeRes.status).toBe(201);

    // recordAudit is fire-and-forget — give its query a moment to land.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const listRes = await request(app)
      .get("/admin/audit-log")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listRes.status).toBe(200);
    const entry = listRes.body.find((e: { action: string }) => e.action === "route.created");
    expect(entry).toBeDefined();
    expect(entry.resourceType).toBe("route");
    expect(entry.resourceId).toBe(routeRes.body.id);
  });

  it("never returns another tenant's audit entries", async () => {
    const accessToken = await registerOwner();
    await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/echo", upstreamUrl: "http://example.test", methods: ["GET"], authRequired: false });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const otherRes = await request(app)
      .post("/auth/register")
      .send({ tenantName: "other-co", email: "owner@other.test", password: "hunter22222" });
    const otherToken = otherRes.body.accessToken as string;

    const listRes = await request(app).get("/admin/audit-log").set("Authorization", `Bearer ${otherToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(0);
  });
});
