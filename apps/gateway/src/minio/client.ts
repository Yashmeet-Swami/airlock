import { Client } from "minio";
import { env } from "../config/env.js";

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

let exportsBucketEnsured = false;

/** Idempotent create-if-missing, cached in-memory after the first successful check. */
export async function ensureExportsBucketExists(): Promise<void> {
  if (exportsBucketEnsured) return;
  const exists = await minioClient.bucketExists(env.MINIO_EXPORTS_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(env.MINIO_EXPORTS_BUCKET);
  exportsBucketEnsured = true;
}
