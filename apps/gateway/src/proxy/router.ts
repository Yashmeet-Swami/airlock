import type { HttpMethod, Route, Tenant } from "@airlock/shared-types";
import { findTenantByName } from "../db/tenants.repo.js";
import { findMatchingRouteForTenant } from "../db/routes.repo.js";

export type ResolveResult =
  | { kind: "tenant_not_found" }
  | { kind: "route_not_found" }
  | { kind: "resolved"; tenant: Tenant; route: Route };

/** Resolves /proxy/:tenantSlug/<subPath> into the tenant + matching route config. */
export async function resolveProxyTarget(
  tenantSlug: string,
  subPath: string,
  method: HttpMethod,
): Promise<ResolveResult> {
  const tenant = await findTenantByName(tenantSlug);
  if (!tenant) return { kind: "tenant_not_found" };

  const route = await findMatchingRouteForTenant(tenant.id, subPath, method);
  if (!route) return { kind: "route_not_found" };

  return { kind: "resolved", tenant, route };
}
