import { pool } from "./client.js";

export interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
}

export async function findWebhookById(id: string): Promise<WebhookRow | null> {
  const { rows } = await pool.query<WebhookRow>(`SELECT * FROM webhooks WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function recordDeliverySuccess(deliveryId: string): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries SET status = 'delivered', attempt_count = attempt_count + 1, delivered_at = now()
     WHERE id = $1`,
    [deliveryId],
  );
}

export async function recordDeliveryFailure(
  deliveryId: string,
  lastError: string,
  isFinal: boolean,
): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries
     SET status = $2, attempt_count = attempt_count + 1, last_error = $3
     WHERE id = $1`,
    [deliveryId, isFinal ? "dead_lettered" : "retrying", lastError],
  );
}
