import { Client } from "@opensearch-project/opensearch";
import { requestsIndexNameForDate } from "@airlock/shared-types";
import { env } from "../config/env.js";

export const openSearchClient = new Client({ node: env.OPENSEARCH_URL });

/** §11.1 mapping, exactly. Daily indices — no formal alias (Phase 4 plan, scope decision #4). */
const REQUESTS_INDEX_MAPPING = {
  properties: {
    request_id: { type: "keyword" },
    tenant_id: { type: "keyword" },
    route: { type: "keyword" },
    method: { type: "keyword" },
    status_code: { type: "integer" },
    latency_ms: { type: "integer" },
    upstream: { type: "keyword" },
    cache_hit: { type: "boolean" },
    rate_limited: { type: "boolean" },
    error_message: { type: "text" },
    user_agent: { type: "text" },
    ip_hash: { type: "keyword" },
    timestamp: { type: "date" },
  },
} as const;

const knownIndices = new Set<string>();

/** Idempotent create-if-missing — cheap after the first call per index (in-memory cache of known-existing names). */
export async function ensureIndexExists(date: Date): Promise<string> {
  const indexName = requestsIndexNameForDate(date);
  if (knownIndices.has(indexName)) return indexName;

  const exists = await openSearchClient.indices.exists({ index: indexName });
  if (!exists.body) {
    await openSearchClient.indices.create({
      index: indexName,
      body: { mappings: REQUESTS_INDEX_MAPPING },
    });
  }
  knownIndices.add(indexName);
  return indexName;
}
