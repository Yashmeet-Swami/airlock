import { Queue } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { QUEUE_NAMES, type WebhookDeliveryJobData, type WebhookEventName } from "@airlock/shared-types";
import { findActiveWebhooksForTenantAndEvent } from "../db/webhooks.repo.js";
import { insertQueuedDelivery } from "../db/webhookDeliveries.repo.js";
import { bullmqConnection } from "../redis/bullmqConnection.js";
import { logger } from "../observability/logger.js";

export const webhooksQueue = new Queue(QUEUE_NAMES.webhooks, { connection: bullmqConnection });

/**
 * Fire-and-forget from the caller's perspective — never awaited on the
 * request/response path (§24.4 objective: move work off the critical path).
 * Fans an event out to every active webhook subscription that matches it.
 */
export function publishEvent<T extends WebhookEventName>(tenantId: string, eventName: T, payload: unknown): void {
  void dispatch(tenantId, eventName, payload).catch((err) => {
    logger.error({ err, tenantId, eventName }, "event_publish_failed");
  });
}

async function dispatch(tenantId: string, eventName: WebhookEventName, payload: unknown): Promise<void> {
  const webhooks = await findActiveWebhooksForTenantAndEvent(tenantId, eventName);
  if (webhooks.length === 0) return;

  const eventId = uuidv4();

  await Promise.all(
    webhooks.map(async (webhook) => {
      const delivery = await insertQueuedDelivery(webhook.id, eventId, eventName, payload);

      // The worker self-manages retries/backoff/DLQ (see Phase 3 plan) rather
      // than using BullMQ's built-in attempts/backoff, so none of those job
      // options are passed here — just the starting attemptNumber.
      const jobData: WebhookDeliveryJobData = {
        deliveryId: delivery.id,
        webhookId: webhook.id,
        eventId,
        eventName,
        payload: payload as never,
        attemptNumber: 1,
      };

      await webhooksQueue.add(eventName, jobData, { jobId: `${delivery.id}-1` });
    }),
  );
}
