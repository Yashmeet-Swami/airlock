/**
 * The event catalog (blueprint §18.1) is much larger than this — request.completed/
 * .failed, breaker.opened, apikey.revoked, route.updated, etc. Only the events
 * that already fire today AND have a real Phase-3 consumer are modeled here;
 * the rest arrive alongside the phases that actually consume them (see the
 * Phase 3 plan's scope decision #1).
 */
export type WebhookEventName = "rate_limit.exceeded";

export interface RateLimitExceededPayload {
  routeId: string;
  limit: number;
  current: number;
}

export interface EventPayloadMap {
  "rate_limit.exceeded": RateLimitExceededPayload;
}

export const QUEUE_NAMES = {
  webhooks: "webhooks",
  requests: "requests",
} as const;

export interface WebhookDeliveryJobData<T extends WebhookEventName = WebhookEventName> {
  deliveryId: string;
  webhookId: string;
  /** Included in the outgoing webhook body so receivers can dedupe retried deliveries (§10.4). */
  eventId: string;
  eventName: T;
  payload: EventPayloadMap[T];
  /** Self-managed retry counter (see Phase 3 plan) — the worker computes its own
   *  backoff delay and re-enqueues rather than relying on BullMQ's built-in
   *  attempts/backoff, so this travels with the job instead of living in BullMQ's opts. */
  attemptNumber: number;
}

/**
 * Log-indexing events (Phase 4, §18.1) — a separate queue/consumer from webhook
 * dispatch above. rate_limit.exceeded fires on both: webhooks (opt-in per
 * tenant) and here (the Log Indexer wants every event unconditionally).
 */
export type LogEventName = "request.completed" | "request.failed" | "rate_limit.exceeded";

interface BaseLogFields {
  requestId: string;
  tenantId: string;
  /** Human-readable path pattern, not the route UUID — matches §11.1's mapping
   *  literally (it has no separate route_id field) and is what makes a
   *  "top routes" aggregation meaningful. */
  route: string;
  userAgent: string | null;
  /** sha256 of the client IP — §11.1 indexes ip_hash, never the raw IP. */
  ipHash: string | null;
}

export interface RequestCompletedPayload extends BaseLogFields {
  method: string;
  statusCode: number;
  latencyMs: number;
  cacheHit: boolean;
  upstream: string;
}

export interface RequestFailedPayload extends BaseLogFields {
  error: string;
  upstream: string;
}

export interface RateLimitExceededLogPayload extends BaseLogFields {
  limit: number;
  current: number;
}

export interface LogEventPayloadMap {
  "request.completed": RequestCompletedPayload;
  "request.failed": RequestFailedPayload;
  "rate_limit.exceeded": RateLimitExceededLogPayload;
}

/**
 * A distributive conditional type — with the default T = LogEventName (the
 * full union), this distributes into a real discriminated union of three
 * concrete shapes (one per event name), so a `switch (job.eventName)` in the
 * indexer correctly narrows `job.payload`'s type. A plain generic interface
 * (`{ eventName: T; payload: LogEventPayloadMap[T] }`) does NOT do this — T
 * stays an unresolved type parameter, not a discriminant TS can narrow on.
 */
export type RequestLogJobData<T extends LogEventName = LogEventName> = T extends LogEventName
  ? {
      eventName: T;
      payload: LogEventPayloadMap[T];
      /** ISO timestamp of when the event occurred (not when it's indexed). */
      timestamp: string;
    }
  : never;
