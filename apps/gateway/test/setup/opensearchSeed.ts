import { requestsIndexNameForDate, type RequestLogDocument } from "@airlock/shared-types";
import { openSearchClient } from "../../src/opensearch/client.js";

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

const ensuredIndices = new Set<string>();

/** Test-only mirror of workers' ensureIndexExists — used to seed documents
 *  directly (bypassing the queue/worker, which don't run in gateway's own
 *  test process) so /logs/search and /logs/aggregate have something real to query. */
export async function seedLogDocument(doc: Partial<RequestLogDocument> & { tenant_id: string; route: string }) {
  const timestamp = doc.timestamp ?? new Date().toISOString();
  const indexName = requestsIndexNameForDate(new Date(timestamp));

  if (!ensuredIndices.has(indexName)) {
    const exists = await openSearchClient.indices.exists({ index: indexName });
    if (!exists.body) {
      await openSearchClient.indices.create({ index: indexName, body: { mappings: REQUESTS_INDEX_MAPPING } });
    }
    ensuredIndices.add(indexName);
  }

  const document: RequestLogDocument = {
    request_id: doc.request_id ?? crypto.randomUUID(),
    tenant_id: doc.tenant_id,
    route: doc.route,
    method: doc.method ?? "GET",
    status_code: doc.status_code ?? 200,
    latency_ms: doc.latency_ms ?? 10,
    upstream: doc.upstream ?? "http://upstream.test",
    cache_hit: doc.cache_hit ?? false,
    rate_limited: doc.rate_limited ?? false,
    error_message: doc.error_message ?? null,
    user_agent: doc.user_agent ?? null,
    ip_hash: doc.ip_hash ?? null,
    timestamp,
  };

  await openSearchClient.index({ index: indexName, body: document, refresh: true });
}

export async function deleteAllRequestIndices(): Promise<void> {
  await openSearchClient.indices.delete({ index: "airlock-requests-*" }).catch(() => undefined);
  ensuredIndices.clear();
}
