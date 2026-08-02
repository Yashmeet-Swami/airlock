import { Router } from "express";
import { z } from "zod";
import { REQUESTS_INDEX_PATTERN } from "@airlock/shared-types";
import { requireJwtOrScope } from "../middleware/auth.js";
import { openSearchClient } from "../opensearch/client.js";

export const logsRouter = Router();

const PAGE_SIZE = 20;

const searchQuerySchema = z.object({
  q: z.string().optional(),
  route: z.string().optional(),
  status_code: z.coerce.number().int().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
});

// §14.3: tenant_id always comes from the authenticated principal, never a
// client-supplied query param — deliberately not part of the schema above.
logsRouter.get("/search", requireJwtOrScope("read:logs"), async (req, res) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  const { q, route, status_code: statusCode, from, to, page } = parsed.data;

  const filter: Record<string, unknown>[] = [{ term: { tenant_id: req.auth!.tenantId } }];
  if (route) filter.push({ term: { route } });
  if (statusCode !== undefined) filter.push({ term: { status_code: statusCode } });
  if (from || to) {
    filter.push({ range: { timestamp: { ...(from && { gte: from }), ...(to && { lte: to }) } } });
  }

  const response = await openSearchClient.search({
    index: REQUESTS_INDEX_PATTERN,
    body: {
      query: {
        bool: {
          filter,
          must: q ? [{ multi_match: { query: q, fields: ["error_message", "user_agent"] } }] : [{ match_all: {} }],
        },
      },
      sort: [{ timestamp: { order: "desc" } }],
      from: (page - 1) * PAGE_SIZE,
      size: PAGE_SIZE,
    },
  });

  const hits = response.body.hits.hits as Array<{ _source: Record<string, unknown> }>;
  res.status(200).json({
    total: (response.body.hits.total as { value: number }).value,
    results: hits.map(({ _source: doc }) => ({
      requestId: doc.request_id,
      route: doc.route,
      statusCode: doc.status_code,
      latencyMs: doc.latency_ms,
      errorMessage: doc.error_message,
      timestamp: doc.timestamp,
    })),
  });
});

const aggregateQuerySchema = z.object({
  groupBy: z.enum(["route"]).optional(),
  window: z.string().optional(),
});

// Cross-tenant "top tenants" analytics is out of scope (no platform-operator
// role exists) — always scoped to the caller's own tenant (Phase 4 plan, scope decision #5).
logsRouter.get("/aggregate", requireJwtOrScope("read:logs"), async (req, res) => {
  const parsed = aggregateQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  const { groupBy, window } = parsed.data;
  const tenantFilter = { term: { tenant_id: req.auth!.tenantId } };
  // An "error" is either a real 5xx from the upstream (request.completed) or a
  // gateway-level failure that never got a status code at all (request.failed
  // carries null status_code — the 502/504 the client sees is synthesized by
  // the gateway, not part of the indexed event). error_message is only ever
  // set on failure-shaped documents, so its presence is a reliable OR signal.
  const errorFilter = {
    bool: { should: [{ range: { status_code: { gte: 500 } } }, { exists: { field: "error_message" } }], minimum_should_match: 1 },
  };

  if (window) {
    const response = await openSearchClient.search({
      index: REQUESTS_INDEX_PATTERN,
      body: {
        query: { bool: { filter: [tenantFilter] } },
        size: 0,
        aggs: {
          over_time: {
            date_histogram: { field: "timestamp", fixed_interval: window },
            aggs: { errors: { filter: errorFilter } },
          },
        },
      },
    });

    const buckets = (
      response.body.aggregations as {
        over_time: { buckets: Array<{ key_as_string: string; doc_count: number; errors: { doc_count: number } }> };
      }
    ).over_time.buckets;

    res.status(200).json({
      series: buckets.map((b) => ({
        bucket: b.key_as_string,
        total: b.doc_count,
        errors: b.errors.doc_count,
        errorRate: b.doc_count > 0 ? b.errors.doc_count / b.doc_count : 0,
      })),
    });
    return;
  }

  // Default / groupBy=route: top routes within the caller's tenant.
  void groupBy;
  const response = await openSearchClient.search({
    index: REQUESTS_INDEX_PATTERN,
    body: {
      query: { bool: { filter: [tenantFilter] } },
      size: 0,
      aggs: {
        by_route: {
          terms: { field: "route", size: 20 },
          aggs: { errors: { filter: errorFilter } },
        },
      },
    },
  });

  const buckets = (
    response.body.aggregations as {
      by_route: { buckets: Array<{ key: string; doc_count: number; errors: { doc_count: number } }> };
    }
  ).by_route.buckets;

  res.status(200).json({
    routes: buckets.map((b) => ({ route: b.key, count: b.doc_count, errorCount: b.errors.doc_count })),
  });
});
