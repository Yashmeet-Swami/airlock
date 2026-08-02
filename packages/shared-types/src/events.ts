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
