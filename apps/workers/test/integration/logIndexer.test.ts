import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Queue, type Worker } from "bullmq";
import { QUEUE_NAMES, requestsIndexNameForDate, type RequestLogJobData } from "@airlock/shared-types";
import { bullmqConnection } from "../../src/redis/bullmqConnection.js";
import { startLogIndexerWorker } from "../../src/logIndexer.worker.js";
import { openSearchClient } from "../../src/opensearch/client.js";

let worker: Worker;
let queue: Queue<RequestLogJobData>;

beforeAll(() => {
  worker = startLogIndexerWorker();
  queue = new Queue<RequestLogJobData>(QUEUE_NAMES.requests, { connection: bullmqConnection });
});

afterAll(async () => {
  await worker.close();
  await queue.close();
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil<T>(fn: () => Promise<T | null>, timeoutMs = 10000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (result) return result;
    await sleep(100);
  }
  throw new Error("waitUntil timed out");
}

describe("log indexer worker", () => {
  it("indexes a request.completed event into the day's index with the mapped shape", async () => {
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const jobData: RequestLogJobData = {
      eventName: "request.completed",
      timestamp,
      payload: {
        requestId,
        tenantId: "tenant-1",
        route: "/v1/payments",
        method: "GET",
        statusCode: 200,
        latencyMs: 42,
        cacheHit: false,
        upstream: "http://upstream.test",
        userAgent: "vitest",
        ipHash: "deadbeef",
      },
    };
    await queue.add("request.completed", jobData);

    const indexName = requestsIndexNameForDate(new Date(timestamp));
    const hit = await waitUntil(async () => {
      const res = await openSearchClient
        .search({ index: indexName, body: { query: { term: { request_id: requestId } } } })
        .catch(() => null);
      const hits = res?.body?.hits?.hits as Array<{ _source: Record<string, unknown> }> | undefined;
      return hits && hits.length > 0 ? hits[0]!._source : null;
    });

    expect(hit).toMatchObject({
      request_id: requestId,
      tenant_id: "tenant-1",
      route: "/v1/payments",
      method: "GET",
      status_code: 200,
      latency_ms: 42,
      cache_hit: false,
      rate_limited: false,
      error_message: null,
    });
  });

  it("indexes rate_limit.exceeded with rate_limited=true and a synthesized error_message", async () => {
    const requestId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const jobData: RequestLogJobData = {
      eventName: "rate_limit.exceeded",
      timestamp,
      payload: {
        requestId,
        tenantId: "tenant-1",
        route: "/v1/payments",
        limit: 5,
        current: 6,
        userAgent: null,
        ipHash: null,
      },
    };
    await queue.add("rate_limit.exceeded", jobData);

    const indexName = requestsIndexNameForDate(new Date(timestamp));
    const hit = await waitUntil(async () => {
      const res = await openSearchClient
        .search({ index: indexName, body: { query: { term: { request_id: requestId } } } })
        .catch(() => null);
      const hits = res?.body?.hits?.hits as Array<{ _source: Record<string, unknown> }> | undefined;
      return hits && hits.length > 0 ? hits[0]!._source : null;
    });

    expect(hit).toMatchObject({
      status_code: 429,
      rate_limited: true,
      error_message: "rate limit exceeded (6/5)",
    });
  });

  it("creates a separate index for an event from a different day", async () => {
    const oldTimestamp = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const requestId = crypto.randomUUID();
    const jobData: RequestLogJobData = {
      eventName: "request.completed",
      timestamp: oldTimestamp,
      payload: {
        requestId,
        tenantId: "tenant-1",
        route: "/v1/old",
        method: "GET",
        statusCode: 200,
        latencyMs: 5,
        cacheHit: false,
        upstream: "http://upstream.test",
        userAgent: null,
        ipHash: null,
      },
    };
    await queue.add("request.completed", jobData);

    const indexName = requestsIndexNameForDate(new Date(oldTimestamp));
    await waitUntil(async () => {
      const exists = await openSearchClient.indices.exists({ index: indexName }).catch(() => null);
      return exists?.body ? true : null;
    });

    const exists = await openSearchClient.indices.exists({ index: indexName });
    expect(exists.body).toBe(true);
  });
});
