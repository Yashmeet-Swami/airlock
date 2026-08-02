/** §11.1: daily indices, searched via this wildcard pattern (no formal alias —
 *  see Phase 4 plan scope decision #4). */
export const REQUESTS_INDEX_PREFIX = "airlock-requests-";
export const REQUESTS_INDEX_PATTERN = "airlock-requests-*";

export function requestsIndexNameForDate(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${REQUESTS_INDEX_PREFIX}${yyyy}.${mm}.${dd}`;
}

/** Exactly §11.1's mapping fields. */
export interface RequestLogDocument {
  request_id: string;
  tenant_id: string;
  route: string;
  method: string | null;
  status_code: number | null;
  latency_ms: number | null;
  upstream: string | null;
  cache_hit: boolean;
  rate_limited: boolean;
  error_message: string | null;
  user_agent: string | null;
  ip_hash: string | null;
  timestamp: string;
}
