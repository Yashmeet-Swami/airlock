import { Queue } from "bullmq";
import { QUEUE_NAMES, type LogEventName, type LogEventPayloadMap, type RequestLogJobData } from "@airlock/shared-types";
import { bullmqConnection } from "../redis/bullmqConnection.js";
import { logger } from "../observability/logger.js";

export const requestsQueue = new Queue(QUEUE_NAMES.requests, { connection: bullmqConnection });

/**
 * Unconditional (unlike webhook dispatch, which is opt-in per tenant) — the
 * Log Indexer wants every request.completed/.failed/rate_limit.exceeded event.
 * Fire-and-forget: never awaited on the request/response path.
 */
export function publishRequestEvent<T extends LogEventName>(eventName: T, payload: LogEventPayloadMap[T]): void {
  // The cast is safe by construction: eventName/payload are correlated via the
  // same T the caller already narrowed. TS can't verify this itself because
  // RequestLogJobData<T>'s distributive conditional doesn't simplify for an
  // unresolved generic T (see its definition in shared-types/events.ts).
  const jobData = { eventName, payload, timestamp: new Date().toISOString() } as RequestLogJobData<T>;
  // §10.3: log indexing gets 3 attempts, fixed 2s backoff, then it's simply
  // dropped (non-critical path) — BullMQ's own attempts/backoff mechanism is
  // exactly this, set here at enqueue time (unlike the webhook worker, which
  // self-manages retries — see Phase 3 plan).
  requestsQueue
    .add(eventName, jobData, { attempts: 3, backoff: { type: "fixed", delay: 2000 } })
    .catch((err) => {
      logger.error({ err, eventName }, "request_log_publish_failed");
    });
}
