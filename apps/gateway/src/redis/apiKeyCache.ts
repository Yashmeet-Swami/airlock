import type { ApiKeyAuthResult } from "../middleware/auth.js";
import { redis } from "./client.js";

const TTL_SECONDS = 60;

function cacheKey(keyHash: string): string {
  return `apikey:${keyHash}`;
}

export async function getCachedApiKeyAuth(keyHash: string): Promise<ApiKeyAuthResult | null> {
  const raw = await redis.get(cacheKey(keyHash));
  return raw ? (JSON.parse(raw) as ApiKeyAuthResult) : null;
}

export async function setCachedApiKeyAuth(keyHash: string, result: ApiKeyAuthResult): Promise<void> {
  await redis.set(cacheKey(keyHash), JSON.stringify(result), "EX", TTL_SECONDS);
}

/** Called immediately on revoke so revocation isn't bounded by the 60s TTL (§13.4). */
export async function invalidateApiKeyCache(keyHash: string): Promise<void> {
  await redis.del(cacheKey(keyHash));
}
