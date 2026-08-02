import { sha256Hex } from "../security/hash.js";
import { redis } from "./client.js";

export interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

function cacheKey(tenantId: string, routeId: string, method: string, subPath: string, search: string): string {
  return `cache:resp:${tenantId}:${routeId}:${sha256Hex(`${method}:${subPath}${search}`)}`;
}

export async function getCachedResponse(
  tenantId: string,
  routeId: string,
  method: string,
  subPath: string,
  search: string,
): Promise<CachedResponse | null> {
  const raw = await redis.get(cacheKey(tenantId, routeId, method, subPath, search));
  return raw ? (JSON.parse(raw) as CachedResponse) : null;
}

export async function setCachedResponse(
  tenantId: string,
  routeId: string,
  method: string,
  subPath: string,
  search: string,
  ttlSeconds: number,
  response: CachedResponse,
): Promise<void> {
  await redis.set(cacheKey(tenantId, routeId, method, subPath, search), JSON.stringify(response), "EX", ttlSeconds);
}

/** Explicit invalidation (§17.3): natural expiry via TTL handles the rest. */
export async function invalidateRouteCache(tenantId: string, routeId: string): Promise<void> {
  const pattern = `cache:resp:${tenantId}:${routeId}:*`;
  const stream = redis.scanStream({ match: pattern, count: 100 });

  const deletions: Promise<unknown>[] = [];
  for await (const keys of stream as AsyncIterable<string[]>) {
    if (keys.length > 0) deletions.push(redis.del(...keys));
  }
  await Promise.all(deletions);
}
