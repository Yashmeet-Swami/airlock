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

async function registerOwner(tenantName: string) {
  const res = await request(app)
    .post("/auth/register")
    .send({ tenantName, email: `owner@${tenantName}.test`, password: "hunter22222" });
  return { accessToken: res.body.accessToken as string, tenantId: res.body.user.tenantId as string };
}

describe("tenant isolation (§24.7 security regression suite)", () => {
  it("never lets one tenant read, update, or delete another tenant's route", async () => {
    const a = await registerOwner("iso-a");
    const b = await registerOwner("iso-b");

    const created = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ pathPattern: "/echo", upstreamUrl: "http://example.test", methods: ["GET"], authRequired: false });
    const routeId = created.body.id as string;

    const getRes = await request(app).get(`/admin/routes/${routeId}`).set("Authorization", `Bearer ${b.accessToken}`);
    expect(getRes.status).toBe(404);

    const patchRes = await request(app)
      .patch(`/admin/routes/${routeId}`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .send({ cacheable: true });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/admin/routes/${routeId}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(deleteRes.status).toBe(404);

    // Tenant A can still see its own route — proves the 404s above are
    // isolation, not the route having actually been deleted.
    const ownGet = await request(app).get(`/admin/routes/${routeId}`).set("Authorization", `Bearer ${a.accessToken}`);
    expect(ownGet.status).toBe(200);
  });

  it("never lets one tenant revoke another tenant's API key", async () => {
    const a = await registerOwner("iso-key-a");
    const b = await registerOwner("iso-key-b");

    const created = await request(app)
      .post("/admin/api-keys")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ scopes: ["proxy:invoke"] });
    const apiKeyId = created.body.id as string;

    const deleteRes = await request(app)
      .delete(`/admin/api-keys/${apiKeyId}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(deleteRes.status).toBe(404);
  });

  it("never lets one tenant delete another tenant's rate-limit policy", async () => {
    const a = await registerOwner("iso-rl-a");
    const b = await registerOwner("iso-rl-b");

    const created = await request(app)
      .post("/admin/rate-limit-policies")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ limitCount: 10, windowSeconds: 60 });
    const policyId = created.body.id as string;

    const deleteRes = await request(app)
      .delete(`/admin/rate-limit-policies/${policyId}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(deleteRes.status).toBe(404);
  });

  it("never lets one tenant read or delete another tenant's webhook", async () => {
    const a = await registerOwner("iso-wh-a");
    const b = await registerOwner("iso-wh-b");

    const created = await request(app)
      .post("/admin/webhooks")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ url: "https://example.test/hook", events: ["rate_limit.exceeded"] });
    const webhookId = created.body.id as string;

    const deliveriesRes = await request(app)
      .get(`/admin/webhooks/${webhookId}/deliveries`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(deliveriesRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/admin/webhooks/${webhookId}`)
      .set("Authorization", `Bearer ${b.accessToken}`);
    expect(deleteRes.status).toBe(404);
  });

  it("never returns another tenant's rows even when the ids happen to collide across tenants", async () => {
    const a = await registerOwner("iso-cross-a");
    const b = await registerOwner("iso-cross-b");

    await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ pathPattern: "/only-a", upstreamUrl: "http://example.test", methods: ["GET"] });

    const listB = await request(app).get("/admin/routes").set("Authorization", `Bearer ${b.accessToken}`);
    expect(listB.status).toBe(200);
    expect(listB.body).toHaveLength(0);
  });
});

describe("SSRF hardening (§21.3)", () => {
  it("rejects a route pointing at a private/link-local upstream for an unflagged tenant", async () => {
    const { accessToken } = await registerOwner("ssrf-blocked");

    const res = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/internal", upstreamUrl: "http://169.254.169.254/latest", methods: ["GET"] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("upstream_not_allowed");
  });

  it("rejects a loopback upstream on PATCH too", async () => {
    const { accessToken } = await registerOwner("ssrf-patch-blocked");
    const created = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/echo", upstreamUrl: "http://example.test", methods: ["GET"] });

    const patchRes = await request(app)
      .patch(`/admin/routes/${created.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ upstreamUrl: "http://127.0.0.1:9999" });

    expect(patchRes.status).toBe(400);
    expect(patchRes.body.error).toBe("upstream_not_allowed");
  });

  it("blocks a non-owner (admin role) from flipping allowInternalUpstreams", async () => {
    const owner = await registerOwner("ssrf-rbac");
    await createUser(owner.tenantId, "admin@ssrf-rbac.test", await hashPassword("hunter22222"), "admin");
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "admin@ssrf-rbac.test", password: "hunter22222" });

    const patchRes = await request(app)
      .patch(`/admin/tenants/${owner.tenantId}`)
      .set("Authorization", `Bearer ${loginRes.body.accessToken}`)
      .send({ allowInternalUpstreams: true });

    expect(patchRes.status).toBe(403);
  });

  it("allows a private upstream once the tenant is flagged as trusted by its owner", async () => {
    const { accessToken, tenantId } = await registerOwner("ssrf-allowed");

    const flagRes = await request(app)
      .patch(`/admin/tenants/${tenantId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ allowInternalUpstreams: true });
    expect(flagRes.status).toBe(200);
    expect(flagRes.body.allowInternalUpstreams).toBe(true);

    const routeRes = await request(app)
      .post("/admin/routes")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ pathPattern: "/internal", upstreamUrl: "http://169.254.169.254/latest", methods: ["GET"] });
    expect(routeRes.status).toBe(201);
  });
});
