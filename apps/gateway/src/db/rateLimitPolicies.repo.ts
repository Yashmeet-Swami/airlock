import type { RateLimitPolicy } from "@airlock/shared-types";
import { type TenantScope } from "./client.js";

interface RateLimitPolicyRow {
  id: string;
  tenant_id: string;
  route_id: string | null;
  limit_count: number;
  window_seconds: number;
  algorithm: string;
  created_at: Date;
}

function toPolicy(row: RateLimitPolicyRow): RateLimitPolicy {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    routeId: row.route_id,
    limitCount: row.limit_count,
    windowSeconds: row.window_seconds,
    algorithm: row.algorithm,
    createdAt: row.created_at.toISOString(),
  };
}

export interface RateLimitPolicyInput {
  routeId: string | null;
  limitCount: number;
  windowSeconds: number;
}

export async function createPolicy(scope: TenantScope, input: RateLimitPolicyInput): Promise<RateLimitPolicy> {
  const { rows } = await scope.query<RateLimitPolicyRow>(
    `INSERT INTO rate_limit_policies (tenant_id, route_id, limit_count, window_seconds)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [scope.tenantId, input.routeId, input.limitCount, input.windowSeconds],
  );
  return toPolicy(rows[0]!);
}

export async function listPolicies(scope: TenantScope): Promise<RateLimitPolicy[]> {
  const { rows } = await scope.query<RateLimitPolicyRow>(
    `SELECT * FROM rate_limit_policies WHERE tenant_id = $1 ORDER BY created_at DESC`,
    [scope.tenantId],
  );
  return rows.map(toPolicy);
}

export async function deletePolicy(scope: TenantScope, id: string): Promise<boolean> {
  const result = await scope.query(`DELETE FROM rate_limit_policies WHERE tenant_id = $1 AND id = $2`, [
    scope.tenantId,
    id,
  ]);
  return (result.rowCount ?? 0) > 0;
}

/** Route-specific policy > tenant-wide policy (route_id IS NULL) > null (caller applies the env fallback). */
export async function resolveEffectivePolicy(
  scope: TenantScope,
  routeId: string,
): Promise<RateLimitPolicy | null> {
  const { rows } = await scope.query<RateLimitPolicyRow>(
    `SELECT * FROM rate_limit_policies
     WHERE tenant_id = $1 AND (route_id = $2 OR route_id IS NULL)
     ORDER BY route_id NULLS LAST
     LIMIT 1`,
    [scope.tenantId, routeId],
  );
  return rows[0] ? toPolicy(rows[0]) : null;
}
