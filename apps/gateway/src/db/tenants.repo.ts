import type { Tenant } from "@airlock/shared-types";
import { queryUnscoped } from "./client.js";

interface TenantRow {
  id: string;
  name: string;
  plan: string;
  allow_internal_upstreams: boolean;
  created_at: Date;
}

function toTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    plan: row.plan,
    allowInternalUpstreams: row.allow_internal_upstreams,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createTenant(name: string, plan = "free"): Promise<Tenant> {
  const { rows } = await queryUnscoped<TenantRow>(
    `INSERT INTO tenants (name, plan) VALUES ($1, $2) RETURNING *`,
    [name, plan],
  );
  return toTenant(rows[0]!);
}

/** Unscoped by design: this is the only lookup that resolves a tenant slug into an id,
 *  used at the proxy edge and during login before a tenant scope exists yet. */
export async function findTenantByName(name: string): Promise<Tenant | null> {
  const { rows } = await queryUnscoped<TenantRow>(`SELECT * FROM tenants WHERE name = $1`, [name]);
  return rows[0] ? toTenant(rows[0]) : null;
}

export async function findTenantById(id: string): Promise<Tenant | null> {
  const { rows } = await queryUnscoped<TenantRow>(`SELECT * FROM tenants WHERE id = $1`, [id]);
  return rows[0] ? toTenant(rows[0]) : null;
}

export async function updateTenant(
  id: string,
  fields: { name?: string; allowInternalUpstreams?: boolean },
): Promise<Tenant | null> {
  const { rows } = await queryUnscoped<TenantRow>(
    `UPDATE tenants
     SET name = COALESCE($2, name), allow_internal_upstreams = COALESCE($3, allow_internal_upstreams)
     WHERE id = $1 RETURNING *`,
    [id, fields.name ?? null, fields.allowInternalUpstreams ?? null],
  );
  return rows[0] ? toTenant(rows[0]) : null;
}

export async function deleteTenant(id: string): Promise<void> {
  await queryUnscoped(`DELETE FROM tenants WHERE id = $1`, [id]);
}
