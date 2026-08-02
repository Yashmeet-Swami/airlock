import { env } from "../config/env.js";
import { withTenantScope } from "../db/client.js";
import { resolveEffectivePolicy } from "../db/rateLimitPolicies.repo.js";
import { redis } from "./client.js";

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterS: number;
}

/**
 * Token bucket via the atomic Redis Lua script (§9.3). The counter is always
 * keyed per (tenant, route) regardless of which policy row supplied the
 * limit/window numbers — a tenant-wide policy still isolates route A's
 * traffic from route B's.
 */
export async function checkRateLimit(tenantId: string, routeId: string): Promise<RateLimitDecision> {
  const policy = await resolveEffectivePolicy(withTenantScope(tenantId), routeId);
  const limit = policy?.limitCount ?? env.RATE_LIMIT_FALLBACK_LIMIT;
  const windowSeconds = policy?.windowSeconds ?? env.RATE_LIMIT_FALLBACK_WINDOW_S;

  const nowS = Date.now() / 1000;
  const windowIndex = Math.floor(nowS / windowSeconds);
  const key = `ratelimit:${tenantId}:${routeId}:${windowIndex}`;

  const [allowed, current] = await redis.rateLimitIncr(key, limit, windowSeconds);
  const windowEndsAtS = (windowIndex + 1) * windowSeconds;

  return {
    allowed: allowed === 1,
    limit,
    remaining: Math.max(0, limit - current),
    retryAfterS: Math.max(1, Math.ceil(windowEndsAtS - nowS)),
  };
}
