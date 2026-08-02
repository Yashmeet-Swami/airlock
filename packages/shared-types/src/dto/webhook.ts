import type { WebhookEventName } from "../events.js";

export interface Webhook {
  id: string;
  tenantId: string;
  url: string;
  events: WebhookEventName[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export type WebhookDeliveryStatus = "queued" | "retrying" | "delivered" | "dead_lettered";

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventId: string;
  eventName: WebhookEventName;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  lastError: string | null;
  /** Kept on the row itself until MinIO-backed storage lands in Phase 6 (see plan deviation #2). */
  payload: unknown;
  deliveredAt: string | null;
  createdAt: string;
}
