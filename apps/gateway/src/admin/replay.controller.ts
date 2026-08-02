import { gunzipSync } from "node:zlib";
import { Router } from "express";
import { REQUESTS_INDEX_PATTERN, type ArchivePayload } from "@airlock/shared-types";
import { jwtUserId, requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { recordAudit } from "../audit/recordAudit.js";
import { env } from "../config/env.js";
import { minioClient } from "../minio/client.js";
import { openSearchClient } from "../opensearch/client.js";
import { forwardRequest } from "../proxy/forwarder.js";
import { paramString } from "../utils/params.js";

export const replayRouter = Router();

function archiveKey(tenantId: string, requestId: string, timestamp: string): string {
  const date = new Date(timestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${tenantId}/${yyyy}/${mm}/${dd}/${requestId}.json.gz`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

// §12.3/§24.7: OpenSearch is only consulted to find *when* the request
// happened (to derive the archive's date-partitioned key) and to prove it
// belongs to the caller's own tenant — everything needed to actually replay
// the call (upstream, path, headers, body) lives in the archived object itself.
replayRouter.post("/:requestId", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const requestId = paramString(req.params.requestId);
  const tenantId = req.auth!.tenantId;

  const searchRes = await openSearchClient.search({
    index: REQUESTS_INDEX_PATTERN,
    body: {
      query: { bool: { filter: [{ term: { tenant_id: tenantId } }, { term: { request_id: requestId } }] } },
      size: 1,
    },
  });
  const hits = searchRes.body.hits.hits as Array<{ _source: { timestamp: string } }>;
  const doc = hits[0]?._source;
  if (!doc) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  let archive: ArchivePayload;
  try {
    const stream = await minioClient.getObject(env.MINIO_ARCHIVE_BUCKET, archiveKey(tenantId, requestId, doc.timestamp));
    const buffer = await streamToBuffer(stream);
    archive = JSON.parse(gunzipSync(buffer).toString("utf-8")) as ArchivePayload;
  } catch {
    res.status(404).json({ error: "archive_not_found" });
    return;
  }

  const result = await forwardRequest(
    archive.upstreamUrl,
    archive.subPath,
    archive.query,
    archive.method,
    archive.requestHeaders,
    archive.requestBody,
  );

  recordAudit(tenantId, jwtUserId(req), "request.replayed", "request", requestId);
  res.status(200).json({ status: result.status, headers: result.headers, body: result.body });
});
