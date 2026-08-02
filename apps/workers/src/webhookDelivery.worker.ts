import { Queue, Worker, type Job } from "bullmq";
import { QUEUE_NAMES, type WebhookDeliveryJobData } from "@airlock/shared-types";
import { env } from "./config/env.js";
import { bullmqConnection } from "./redis/bullmqConnection.js";
import { findWebhookById, recordDeliveryFailure, recordDeliverySuccess } from "./db/webhooks.repo.js";
import { signPayload } from "./security/hmac.js";
import { logger } from "./observability/logger.js";

// Used to schedule the next self-managed retry (see below) — a second Queue
// instance on the same queue name, distinct from the Worker that consumes it.
const retryQueue = new Queue<WebhookDeliveryJobData>(QUEUE_NAMES.webhooks, { connection: bullmqConnection });

/** attemptNumber is 1-based; §10.3's schedule indexed by attempt, +/-20% jitter. */
function backoffDelayMs(attemptNumber: number): number {
  const schedule = env.WEBHOOK_BACKOFF_MS;
  const base = schedule[Math.min(attemptNumber - 1, schedule.length - 1)] ?? schedule[schedule.length - 1] ?? 1000;
  const jitter = base * (Math.random() * 0.4 - 0.2);
  return Math.max(0, Math.round(base + jitter));
}

async function processJob(job: Job<WebhookDeliveryJobData>): Promise<void> {
  const { deliveryId, webhookId, eventId, eventName, payload, attemptNumber } = job.data;

  const webhook = await findWebhookById(webhookId);
  if (!webhook || !webhook.active) {
    await recordDeliveryFailure(deliveryId, "webhook not found or inactive", true);
    return;
  }

  const body = JSON.stringify({ eventId, event: eventName, data: payload });
  const timestampS = Math.floor(Date.now() / 1000);
  const signature = signPayload(webhook.secret, timestampS, body);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-airlock-signature": signature,
        "x-airlock-event": eventName,
      },
      body,
      signal: AbortSignal.timeout(env.WEBHOOK_DELIVERY_TIMEOUT_MS),
    });

    if (response.ok) {
      await recordDeliverySuccess(deliveryId);
      return;
    }
    throw new Error(`upstream responded ${response.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isFinal = attemptNumber >= env.WEBHOOK_MAX_ATTEMPTS;
    await recordDeliveryFailure(deliveryId, message, isFinal);

    // Retries are scheduled explicitly via a delayed re-add, not BullMQ's own
    // attempts/backoff (see Phase 3 plan) — so the error is swallowed here
    // rather than re-thrown; BullMQ should treat this job as "done."
    if (!isFinal) {
      const nextAttempt = attemptNumber + 1;
      await retryQueue.add(
        eventName,
        { deliveryId, webhookId, eventId, eventName, payload, attemptNumber: nextAttempt },
        { jobId: `${deliveryId}-${nextAttempt}`, delay: backoffDelayMs(attemptNumber) },
      );
    }
  }
}

export function startWebhookDeliveryWorker(): Worker<WebhookDeliveryJobData> {
  const worker = new Worker<WebhookDeliveryJobData>(QUEUE_NAMES.webhooks, processJob, {
    connection: bullmqConnection,
    concurrency: env.WEBHOOK_CONCURRENCY,
  });

  worker.on("failed", (job, err) => {
    logger.error({ err, jobId: job?.id }, "webhook_job_processor_error");
  });

  return worker;
}
