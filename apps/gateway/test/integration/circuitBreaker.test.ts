import http from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { resetDatabase } from "../setup/resetDatabase.js";
import { startFlakyServer } from "../setup/flakyServer.js";

const app = createApp();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function registerOwner(tenantName: string) {
  const res = await request(app)
    .post("/auth/register")
    .send({ tenantName, email: `owner@${tenantName}.test`, password: "hunter22222" });
  return res.body.accessToken as string;
}

async function createPublicRoute(accessToken: string, upstreamUrl: string, pathPattern: string) {
  const res = await request(app)
    .post("/admin/routes")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ pathPattern, upstreamUrl, methods: ["GET"], authRequired: false });
  return res.body.id as string;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("circuit breaker (§16.1)", () => {
  it("opens once the failure-rate threshold is reached and short-circuits without calling the upstream", async () => {
    const flaky = await startFlakyServer(500);
    try {
      const accessToken = await registerOwner("cb-open");
      await createPublicRoute(accessToken, flaky.url, "/flaky");

      // CIRCUIT_BREAKER_WINDOW_SIZE=4 in the test env — 4 all-failing requests trips it.
      for (let i = 0; i < 4; i++) {
        const res = await request(app).get("/proxy/cb-open/flaky");
        expect(res.status).toBe(500);
      }

      const callsBeforeTrip = flaky.callCount();
      const shortCircuited = await request(app).get("/proxy/cb-open/flaky");
      expect(shortCircuited.status).toBe(503);
      expect(shortCircuited.body.error).toBe("circuit_open");
      expect(flaky.callCount()).toBe(callsBeforeTrip);
    } finally {
      await flaky.close();
    }
  });

  it("half-opens after the cooldown and recovers to closed on a successful probe", async () => {
    let shouldFail = true;
    const server = http.createServer((_req, res) => {
      if (shouldFail) {
        res.writeHead(500);
        res.end();
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;

    try {
      const accessToken = await registerOwner("cb-recover");
      await createPublicRoute(accessToken, url, "/svc");

      for (let i = 0; i < 4; i++) {
        await request(app).get("/proxy/cb-recover/svc");
      }
      const tripped = await request(app).get("/proxy/cb-recover/svc");
      expect(tripped.status).toBe(503);

      shouldFail = false;
      await sleep(350); // CIRCUIT_BREAKER_COOLDOWN_MS=300 in the test env

      const probe = await request(app).get("/proxy/cb-recover/svc");
      expect(probe.status).toBe(200);

      const afterRecovery = await request(app).get("/proxy/cb-recover/svc");
      expect(afterRecovery.status).toBe(200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
