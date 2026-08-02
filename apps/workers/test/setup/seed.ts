import { pool } from "../../src/db/client.js";

export async function seedTenant(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`INSERT INTO tenants (name) VALUES ($1) RETURNING id`, [name]);
  return rows[0]!.id;
}

export async function seedWebhook(tenantId: string, url: string, secret: string, active = true): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO webhooks (tenant_id, url, events, secret, active) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [tenantId, url, ["rate_limit.exceeded"], secret, active],
  );
  return rows[0]!.id;
}

export async function seedDelivery(
  webhookId: string,
  eventId: string,
  payload: Record<string, unknown>,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO webhook_deliveries (webhook_id, event_id, event_name, payload)
     VALUES ($1, $2, 'rate_limit.exceeded', $3) RETURNING id`,
    [webhookId, eventId, payload],
  );
  return rows[0]!.id;
}

export interface DeliveryRow {
  id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
}

export async function getDelivery(id: string): Promise<DeliveryRow> {
  const { rows } = await pool.query<DeliveryRow>(`SELECT * FROM webhook_deliveries WHERE id = $1`, [id]);
  return rows[0]!;
}
