import type { ApiKey, ApiKeyScope } from "@airlock/shared-types";
import { queryUnscoped, type TenantScope } from "./client.js";

interface ApiKeyRow {
  id: string;
  tenant_id: string;
  key_hash: string;
  scopes: ApiKeyScope[];
  revoked_at: Date | null;
  created_at: Date;
  last_used_at: Date | null;
}

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    scopes: row.scopes,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
  };
}

export async function createApiKey(scope: TenantScope, keyHash: string, scopes: ApiKeyScope[]): Promise<ApiKey> {
  const { rows } = await scope.query<ApiKeyRow>(
    `INSERT INTO api_keys (tenant_id, key_hash, scopes) VALUES ($1, $2, $3) RETURNING *`,
    [scope.tenantId, keyHash, scopes],
  );
  return toApiKey(rows[0]!);
}

export async function listApiKeys(scope: TenantScope): Promise<ApiKey[]> {
  const { rows } = await scope.query<ApiKeyRow>(`SELECT * FROM api_keys WHERE tenant_id = $1`, [scope.tenantId]);
  return rows.map(toApiKey);
}

/** Also returns the raw key_hash (not part of the public ApiKey DTO) so the
 *  caller can bust the Redis apikey:{hash} cache entry immediately (§13.4). */
export async function revokeApiKey(
  scope: TenantScope,
  id: string,
): Promise<{ apiKey: ApiKey; keyHash: string } | null> {
  const { rows } = await scope.query<ApiKeyRow>(
    `UPDATE api_keys SET revoked_at = now() WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL RETURNING *`,
    [scope.tenantId, id],
  );
  return rows[0] ? { apiKey: toApiKey(rows[0]), keyHash: rows[0].key_hash } : null;
}

/** Unscoped: used at the proxy edge to resolve a raw API key's hash into its owning tenant + scopes. */
export async function findApiKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const { rows } = await queryUnscoped<ApiKeyRow>(
    `SELECT * FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash],
  );
  return rows[0] ? toApiKey(rows[0]) : null;
}

export async function touchLastUsed(id: string): Promise<void> {
  await queryUnscoped(`UPDATE api_keys SET last_used_at = now() WHERE id = $1`, [id]);
}
