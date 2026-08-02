import type { HttpMethod, Route } from "@airlock/shared-types";
import { queryUnscoped, type TenantScope } from "./client.js";

interface RouteRow {
  id: string;
  tenant_id: string;
  path_pattern: string;
  upstream_url: string;
  methods: HttpMethod[];
  auth_required: boolean;
  cacheable: boolean;
  cache_ttl_s: number;
  created_at: Date;
}

function toRoute(row: RouteRow): Route {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    pathPattern: row.path_pattern,
    upstreamUrl: row.upstream_url,
    methods: row.methods,
    authRequired: row.auth_required,
    cacheable: row.cacheable,
    cacheTtlS: row.cache_ttl_s,
    createdAt: row.created_at.toISOString(),
  };
}

export interface RouteInput {
  pathPattern: string;
  upstreamUrl: string;
  methods: HttpMethod[];
  authRequired: boolean;
  cacheable: boolean;
  cacheTtlS: number;
}

export async function createRoute(scope: TenantScope, input: RouteInput): Promise<Route> {
  const { rows } = await scope.query<RouteRow>(
    `INSERT INTO routes (tenant_id, path_pattern, upstream_url, methods, auth_required, cacheable, cache_ttl_s)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      scope.tenantId,
      input.pathPattern,
      input.upstreamUrl,
      input.methods,
      input.authRequired,
      input.cacheable,
      input.cacheTtlS,
    ],
  );
  return toRoute(rows[0]!);
}

export async function listRoutes(scope: TenantScope): Promise<Route[]> {
  const { rows } = await scope.query<RouteRow>(`SELECT * FROM routes WHERE tenant_id = $1`, [scope.tenantId]);
  return rows.map(toRoute);
}

export async function findRouteById(scope: TenantScope, id: string): Promise<Route | null> {
  const { rows } = await scope.query<RouteRow>(`SELECT * FROM routes WHERE tenant_id = $1 AND id = $2`, [
    scope.tenantId,
    id,
  ]);
  return rows[0] ? toRoute(rows[0]) : null;
}

export async function updateRoute(
  scope: TenantScope,
  id: string,
  input: Partial<RouteInput>,
): Promise<Route | null> {
  const existing = await findRouteById(scope, id);
  if (!existing) return null;

  const merged: RouteInput = {
    pathPattern: input.pathPattern ?? existing.pathPattern,
    upstreamUrl: input.upstreamUrl ?? existing.upstreamUrl,
    methods: input.methods ?? existing.methods,
    authRequired: input.authRequired ?? existing.authRequired,
    cacheable: input.cacheable ?? existing.cacheable,
    cacheTtlS: input.cacheTtlS ?? existing.cacheTtlS,
  };

  const { rows } = await scope.query<RouteRow>(
    `UPDATE routes SET path_pattern = $3, upstream_url = $4, methods = $5, auth_required = $6,
       cacheable = $7, cache_ttl_s = $8
     WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [
      scope.tenantId,
      id,
      merged.pathPattern,
      merged.upstreamUrl,
      merged.methods,
      merged.authRequired,
      merged.cacheable,
      merged.cacheTtlS,
    ],
  );
  return rows[0] ? toRoute(rows[0]) : null;
}

export async function deleteRoute(scope: TenantScope, id: string): Promise<boolean> {
  const result = await scope.query(`DELETE FROM routes WHERE tenant_id = $1 AND id = $2`, [scope.tenantId, id]);
  return (result.rowCount ?? 0) > 0;
}

/** Unscoped: the proxy edge resolves tenant-by-slug first, then looks up that tenant's routes. */
export async function findMatchingRouteForTenant(
  tenantId: string,
  requestPath: string,
  method: HttpMethod,
): Promise<Route | null> {
  const { rows } = await queryUnscoped<RouteRow>(
    `SELECT * FROM routes WHERE tenant_id = $1 AND $3 = ANY(methods)
     AND ($2 = path_pattern OR $2 LIKE (regexp_replace(path_pattern, '\\*$', '%')))
     ORDER BY length(path_pattern) DESC LIMIT 1`,
    [tenantId, requestPath, method],
  );
  return rows[0] ? toRoute(rows[0]) : null;
}
