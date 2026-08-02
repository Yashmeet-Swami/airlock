import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { REQUESTS_INDEX_PATTERN } from "@airlock/shared-types";
import { jwtUserId, requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { recordAudit } from "../audit/recordAudit.js";
import { env } from "../config/env.js";
import { ensureExportsBucketExists, minioClient } from "../minio/client.js";
import { openSearchClient } from "../opensearch/client.js";

export const exportRouter = Router();

// §12.2/Phase 6 plan scope decision #3: runs synchronously in the request
// handler, not via a queue/worker — a manually-triggered, on-demand export
// blocking briefly on its own HTTP request is a different problem than
// blocking the hot proxy path (the reason a queue was used for logging/webhooks).
const MAX_EXPORT_HITS = 10_000;
const PRESIGNED_URL_EXPIRY_S = 3600;

const exportBodySchema = z.object({
  format: z.enum(["csv", "ndjson"]).default("csv"),
  route: z.string().optional(),
  status_code: z.coerce.number().int().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  return lines.join("\n");
}

function toNdjson(rows: Record<string, unknown>[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

exportRouter.post("/export", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const parsed = exportBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  const { format, route, status_code: statusCode, from, to } = parsed.data;

  const filter: Record<string, unknown>[] = [{ term: { tenant_id: req.auth!.tenantId } }];
  if (route) filter.push({ term: { route } });
  if (statusCode !== undefined) filter.push({ term: { status_code: statusCode } });
  if (from || to) {
    filter.push({ range: { timestamp: { ...(from && { gte: from }), ...(to && { lte: to }) } } });
  }

  const searchRes = await openSearchClient.search({
    index: REQUESTS_INDEX_PATTERN,
    body: {
      query: { bool: { filter } },
      sort: [{ timestamp: { order: "desc" } }],
      size: MAX_EXPORT_HITS,
    },
  });

  const rows = (searchRes.body.hits.hits as Array<{ _source: Record<string, unknown> }>).map((hit) => hit._source);
  const body = format === "csv" ? toCsv(rows) : toNdjson(rows);

  await ensureExportsBucketExists();
  const exportId = uuidv4();
  const key = `${req.auth!.tenantId}/${exportId}.${format}`;
  await minioClient.putObject(env.MINIO_EXPORTS_BUCKET, key, Buffer.from(body, "utf-8"));
  const url = await minioClient.presignedGetObject(env.MINIO_EXPORTS_BUCKET, key, PRESIGNED_URL_EXPIRY_S);

  recordAudit(req.auth!.tenantId, jwtUserId(req), "analytics.exported", "export", exportId, {
    format,
    count: rows.length,
  });
  res.status(201).json({ exportId, format, count: rows.length, url });
});
