import { gzipSync } from "node:zlib";
import type { ArchivePayload } from "@airlock/shared-types";
import { env } from "../config/env.js";
import { ensureArchiveBucketExists, minioClient } from "../minio/client.js";

function archiveKey(tenantId: string, requestId: string, timestamp: string): string {
  const date = new Date(timestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${tenantId}/${yyyy}/${mm}/${dd}/${requestId}.json.gz`;
}

/**
 * §12.1: one archive object per request, written immediately as part of the
 * same log-indexing job (not swept later out of a hot window — see Phase 6
 * plan, scope decision #1) so replay always has something to fetch.
 */
export async function archiveRequest(
  tenantId: string,
  requestId: string,
  timestamp: string,
  payload: ArchivePayload,
): Promise<void> {
  await ensureArchiveBucketExists();
  const body = gzipSync(Buffer.from(JSON.stringify(payload), "utf-8"));
  await minioClient.putObject(env.MINIO_ARCHIVE_BUCKET, archiveKey(tenantId, requestId, timestamp), body);
}
