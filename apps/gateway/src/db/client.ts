import pg from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
});

/**
 * Every tenant-owned table (users, api_keys, routes, ...) must only ever be
 * queried through a TenantScope so tenant_id always comes from the authenticated
 * principal (JWT/API key), never a client-supplied route param or body field.
 * See blueprint §14.3.
 */
export interface TenantScope {
  tenantId: string;
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export function withTenantScope(tenantId: string): TenantScope {
  return {
    tenantId,
    query: (text, params = []) => pool.query(text, params),
  };
}

/** For queries that are inherently not tenant-scoped (auth lookups by email, api-key hash, tenant creation itself). */
export function queryUnscoped<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return pool.query(text, params);
}
