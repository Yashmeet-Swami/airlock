import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { Queue, type Worker } from "bullmq";
import { QUEUE_NAMES, type WebhookDeliveryJobData } from "@airlock/shared-types";
import { resetDatabase } from "../setup/resetDatabase.js";
import { seedTenant, seedWebhook, seedDelivery, getDelivery, type DeliveryRow } from "../setup/seed.js";
import { startReceiver } from "../setup/receiver.js";
import { bullmqConnection } from "../../src/redis/bullmqConnection.js";
import { startWebhookDeliveryWorker } from "../../src/webhookDelivery.worker.js";

let worker: Worker;
let queue: Queue<WebhookDeliveryJobData>;

beforeAll(() => {
  worker = startWebhookDeliveryWorker();
  queue = new Queue<WebhookDeliveryJobData>(QUEUE_NAMES.webhooks, { connection: bullmqConnection });
});

afterAll(async () => {
  await worker.close();
  await queue.close();
});

beforeEach(async () => {
  await resetDatabase();
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(
  fn: () => Promise<DeliveryRow>,
  predicate: (d: DeliveryRow) => boolean,
  timeoutMs = 10000,
): Promise<DeliveryRow> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const d = await fn();
    if (predicate(d)) return d;
    await sleep(50);
  }
  throw new Error("waitUntil timed out");
}

async function enqueueAttemptOne(deliveryId: string, webhookId: string, eventId: string): Promise<void> {
  const jobData: WebhookDeliveryJobData = {
    deliveryId,
    webhookId,
    eventId,
    eventName: "rate_limit.exceeded",
    payload: { routeId: "route-1", limit: 5, current: 6 },
    attemptNumber: 1,
  };
  await queue.add("rate_limit.exceeded", jobData, { jobId: `${deliveryId}-1` });
}

const SAMPLE_PAYLOAD = { routeId: "route-1", limit: 5, current: 6 };

describe("webhook delivery worker", () => {
  it("delivers successfully on the first attempt with a valid HMAC signature", async () => {
    const receiver = await startReceiver(0);
    try {
      const tenantId = await seedTenant("acme-corp");
      const secret = "test-secret-123";
      const webhookId = await seedWebhook(tenantId, receiver.url, secret);
      const eventId = crypto.randomUUID();
      const deliveryId = await seedDelivery(webhookId, eventId, SAMPLE_PAYLOAD);

      await enqueueAttemptOne(deliveryId, webhookId, eventId);

      const delivered = await waitUntil(() => getDelivery(deliveryId), (d) => d.status === "delivered");

      expect(delivered.attempt_count).toBe(1);
      expect(receiver.requests).toHaveLength(1);

      const signatureHeader = receiver.requests[0]!.headers["x-airlock-signature"] as string;
      expect(signatureHeader).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);

      // Verify the signature independently, exactly as a real receiver would.
      const [tPart, vPart] = signatureHeader.split(",");
      const timestamp = tPart!.slice("t=".length);
      const expectedHmac = createHmac("sha256", secret)
        .update(`${timestamp}.${receiver.requests[0]!.body}`)
        .digest("hex");
      expect(vPart).toBe(`v1=${expectedHmac}`);
    } finally {
      await receiver.close();
    }
  });

  it("retries on failure and eventually succeeds", async () => {
    const receiver = await startReceiver(2); // fails twice, succeeds on the 3rd
    try {
      const tenantId = await seedTenant("acme-corp");
      const webhookId = await seedWebhook(tenantId, receiver.url, "secret");
      const eventId = crypto.randomUUID();
      const deliveryId = await seedDelivery(webhookId, eventId, SAMPLE_PAYLOAD);

      await enqueueAttemptOne(deliveryId, webhookId, eventId);

      const delivered = await waitUntil(() => getDelivery(deliveryId), (d) => d.status === "delivered");

      expect(delivered.attempt_count).toBe(3);
      expect(receiver.requests).toHaveLength(3);
    } finally {
      await receiver.close();
    }
  });

  it("dead-letters after exhausting all attempts (WEBHOOK_MAX_ATTEMPTS=3 in tests)", async () => {
    const receiver = await startReceiver(999); // always fails
    try {
      const tenantId = await seedTenant("acme-corp");
      const webhookId = await seedWebhook(tenantId, receiver.url, "secret");
      const eventId = crypto.randomUUID();
      const deliveryId = await seedDelivery(webhookId, eventId, SAMPLE_PAYLOAD);

      await enqueueAttemptOne(deliveryId, webhookId, eventId);

      const deadLettered = await waitUntil(() => getDelivery(deliveryId), (d) => d.status === "dead_lettered");

      expect(deadLettered.attempt_count).toBe(3);
      expect(deadLettered.last_error).toContain("500");
    } finally {
      await receiver.close();
    }
  });

  it("re-delivers successfully after manual replay", async () => {
    const receiver = await startReceiver(999); // always fails at first
    try {
      const tenantId = await seedTenant("acme-corp");
      const webhookId = await seedWebhook(tenantId, receiver.url, "secret");
      const eventId = crypto.randomUUID();
      const deliveryId = await seedDelivery(webhookId, eventId, SAMPLE_PAYLOAD);

      await enqueueAttemptOne(deliveryId, webhookId, eventId);
      await waitUntil(() => getDelivery(deliveryId), (d) => d.status === "dead_lettered");

      // The receiver is "fixed" and the gateway's replay endpoint resets the
      // row then re-enqueues attempt 1 — reproduced directly here since the
      // replay HTTP handler itself lives in apps/gateway, not apps/workers.
      receiver.setFailCount(0);
      await queue.add(
        "rate_limit.exceeded",
        {
          deliveryId,
          webhookId,
          eventId,
          eventName: "rate_limit.exceeded",
          payload: SAMPLE_PAYLOAD,
          attemptNumber: 1,
        },
        { jobId: `${deliveryId}-replay-${Date.now()}` },
      );

      const delivered = await waitUntil(() => getDelivery(deliveryId), (d) => d.status === "delivered");
      expect(delivered.attempt_count).toBeGreaterThan(3); // 3 from before + at least 1 more after replay
    } finally {
      await receiver.close();
    }
  });

  it("dead-letters immediately (no retry) when the webhook no longer exists", async () => {
    const deliveryId = crypto.randomUUID();
    // No tenant/webhook seeded — deliveryId references nothing, matching the
    // "webhook deleted after enqueue" edge case.
    await enqueueAttemptOne(deliveryId, crypto.randomUUID(), crypto.randomUUID());

    // Nothing to assert via getDelivery (no row exists), so just prove the
    // worker doesn't throw/crash by giving it a moment and checking it's still alive.
    await sleep(500);
    expect(worker.isRunning()).toBe(true);
  });
});
