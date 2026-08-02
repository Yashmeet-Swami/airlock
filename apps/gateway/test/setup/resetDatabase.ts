import { pool } from "../../src/db/client.js";

export async function resetDatabase(): Promise<void> {
  await pool.query("TRUNCATE TABLE tenants, users, api_keys, routes, refresh_tokens RESTART IDENTITY CASCADE;");
}
