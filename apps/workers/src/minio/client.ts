import { Client } from "minio";
import { env } from "../config/env.js";

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

let bucketEnsured = false;

/** Idempotent create-if-missing, cached in-memory after the first successful check. */
export async function ensureArchiveBucketExists(): Promise<void> {
  if (bucketEnsured) return;
  const exists = await minioClient.bucketExists(env.MINIO_ARCHIVE_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(env.MINIO_ARCHIVE_BUCKET);
  bucketEnsured = true;
}
