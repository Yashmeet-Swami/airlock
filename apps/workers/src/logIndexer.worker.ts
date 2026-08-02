import { Worker, type Job } from "bullmq";
import { QUEUE_NAMES, type RequestLogDocument, type RequestLogJobData } from "@airlock/shared-types";
import { env } from "./config/env.js";
import { bullmqConnection } from "./redis/bullmqConnection.js";
import { ensureIndexExists, openSearchClient } from "./opensearch/client.js";
import { logger } from "./observability/logger.js";

function toDocument(job: RequestLogJobData): RequestLogDocument {
  const { eventName, payload, timestamp } = job;
  const base = {
    request_id: payload.requestId,
    tenant_id: payload.tenantId,
    route: payload.route,
    user_agent: payload.userAgent,
    ip_hash: payload.ipHash,
    timestamp,
  };

  switch (eventName) {
    case "request.completed":
      return {
        ...base,
        method: payload.method,
        status_code: payload.statusCode,
        latency_ms: payload.latencyMs,
        upstream: payload.upstream,
        cache_hit: payload.cacheHit,
        rate_limited: false,
        error_message: null,
      };
    case "request.failed":
      return {
        ...base,
        method: null,
        status_code: null,
        latency_ms: null,
        upstream: payload.upstream,
        cache_hit: false,
        rate_limited: false,
        error_message: payload.error,
      };
    case "rate_limit.exceeded":
      return {
        ...base,
        method: null,
        status_code: 429,
        latency_ms: null,
        upstream: null,
        cache_hit: false,
        rate_limited: true,
        error_message: `rate limit exceeded (${payload.current}/${payload.limit})`,
      };
  }
}

async function processJob(job: Job<RequestLogJobData>): Promise<void> {
  const document = toDocument(job.data);
  const indexName = await ensureIndexExists(new Date(job.data.timestamp));
  await openSearchClient.index({ index: indexName, body: document, refresh: true });
}

export function startLogIndexerWorker(): Worker<RequestLogJobData> {
  const worker = new Worker<RequestLogJobData>(QUEUE_NAMES.requests, processJob, {
    connection: bullmqConnection,
    concurrency: env.LOG_INDEXER_CONCURRENCY,
  });

  worker.on("failed", (job, err) => {
    // §10.3: after 3 attempts, indexing failures are logged and dropped —
    // non-critical path, no DLQ/replay unlike webhook delivery.
    logger.error({ err, jobId: job?.id }, "log_indexing_failed_dropped");
  });

  return worker;
}
