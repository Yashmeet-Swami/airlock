import type { WebhookDelivery, WebhookDeliveryStatus, WebhookEventName } from "@airlock/shared-types";
import { queryUnscoped, type TenantScope } from "./client.js";

interface WebhookDeliveryRow {
  id: string;
  webhook_id: string;
  event_id: string;
  event_name: WebhookEventName;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  last_error: string | null;
  payload: unknown;
  delivered_at: Date | null;
  created_at: Date;
}

function toDelivery(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventId: row.event_id,
    eventName: row.event_name,
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    payload: row.payload,
    deliveredAt: row.delivered_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Unscoped: called by the event publisher, which runs outside any authenticated request. */
export async function insertQueuedDelivery(
  webhookId: string,
  eventId: string,
  eventName: WebhookEventName,
  payload: unknown,
): Promise<WebhookDelivery> {
  const { rows } = await queryUnscoped<WebhookDeliveryRow>(
    `INSERT INTO webhook_deliveries (webhook_id, event_id, event_name, payload) VALUES ($1, $2, $3, $4) RETURNING *`,
    [webhookId, eventId, eventName, payload],
  );
  return toDelivery(rows[0]!);
}

/** Tenant-scoped via join against webhooks — a delivery row has no tenant_id of its own. */
export async function listDeliveries(
  scope: TenantScope,
  webhookId: string,
  status?: WebhookDeliveryStatus,
): Promise<WebhookDelivery[]> {
  const { rows } = await scope.query<WebhookDeliveryRow>(
    `SELECT d.* FROM webhook_deliveries d
     JOIN webhooks w ON w.id = d.webhook_id
     WHERE w.tenant_id = $1 AND d.webhook_id = $2 AND ($3::text IS NULL OR d.status = $3)
     ORDER BY d.created_at DESC`,
    [scope.tenantId, webhookId, status ?? null],
  );
  return rows.map(toDelivery);
}

export async function findDeliveryById(scope: TenantScope, id: string): Promise<WebhookDelivery | null> {
  const { rows } = await scope.query<WebhookDeliveryRow>(
    `SELECT d.* FROM webhook_deliveries d
     JOIN webhooks w ON w.id = d.webhook_id
     WHERE w.tenant_id = $1 AND d.id = $2`,
    [scope.tenantId, id],
  );
  return rows[0] ? toDelivery(rows[0]) : null;
}

/** §10.5: DeadLettered -> Processing on manual replay. Caller re-enqueues the BullMQ job. */
export async function resetForReplay(id: string): Promise<void> {
  await queryUnscoped(
    `UPDATE webhook_deliveries SET status = 'queued', attempt_count = 0, last_error = NULL, delivered_at = NULL
     WHERE id = $1`,
    [id],
  );
}
