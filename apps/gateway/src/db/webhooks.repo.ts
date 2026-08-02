import type { Webhook, WebhookEventName } from "@airlock/shared-types";
import { queryUnscoped, type TenantScope } from "./client.js";

interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  events: WebhookEventName[];
  secret: string;
  active: boolean;
  created_at: Date;
}

function toWebhook(row: WebhookRow): Webhook {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    url: row.url,
    events: row.events,
    secret: row.secret,
    active: row.active,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createWebhook(
  scope: TenantScope,
  url: string,
  events: WebhookEventName[],
  secret: string,
): Promise<Webhook> {
  const { rows } = await scope.query<WebhookRow>(
    `INSERT INTO webhooks (tenant_id, url, events, secret) VALUES ($1, $2, $3, $4) RETURNING *`,
    [scope.tenantId, url, events, secret],
  );
  return toWebhook(rows[0]!);
}

export async function listWebhooks(scope: TenantScope): Promise<Webhook[]> {
  const { rows } = await scope.query<WebhookRow>(
    `SELECT * FROM webhooks WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [scope.tenantId],
  );
  return rows.map(toWebhook);
}

export async function findWebhookById(scope: TenantScope, id: string): Promise<Webhook | null> {
  const { rows } = await scope.query<WebhookRow>(`SELECT * FROM webhooks WHERE tenant_id = $1 AND id = $2`, [
    scope.tenantId,
    id,
  ]);
  return rows[0] ? toWebhook(rows[0]) : null;
}

export async function deleteWebhook(scope: TenantScope, id: string): Promise<boolean> {
  const result = await scope.query(`DELETE FROM webhooks WHERE tenant_id = $1 AND id = $2`, [scope.tenantId, id]);
  return (result.rowCount ?? 0) > 0;
}

/** Unscoped: the event publisher runs outside any authenticated request context. */
export async function findActiveWebhooksForTenantAndEvent(
  tenantId: string,
  eventName: WebhookEventName,
): Promise<Webhook[]> {
  const { rows } = await queryUnscoped<WebhookRow>(
    `SELECT * FROM webhooks WHERE tenant_id = $1 AND active = true AND $2 = ANY(events)`,
    [tenantId, eventName],
  );
  return rows.map(toWebhook);
}
