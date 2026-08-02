import { pool } from "../../src/db/client.js";

export async function resetDatabase(): Promise<void> {
  await pool.query("TRUNCATE TABLE tenants, webhooks, webhook_deliveries RESTART IDENTITY CASCADE;");
}
