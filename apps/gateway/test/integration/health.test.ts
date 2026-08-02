import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";

const app = createApp();

describe("health (§20.3)", () => {
  it("liveness always answers 200", async () => {
    const res = await request(app).get("/health/liveness");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("readiness reports 200 with Postgres/Redis both reachable", async () => {
    const res = await request(app).get("/health/readiness");
    expect(res.status).toBe(200);
    expect(res.body.database).toBe("ok");
    expect(res.body.redis).toBe("ok");
  });
});
