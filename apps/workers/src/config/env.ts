import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  WEBHOOK_DELIVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  WEBHOOK_CONCURRENCY: z.coerce.number().int().positive().default(5),
  // §10.3's real schedule by default; test suites override with a much shorter
  // one so retry-to-dead-letter doesn't take ~13 real minutes to exercise.
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  WEBHOOK_BACKOFF_MS: z
    .string()
    .default("1000,5000,30000,120000,600000")
    .transform((value) => value.split(",").map((ms) => Number(ms.trim()))),
  OPENSEARCH_URL: z.string().min(1, "OPENSEARCH_URL is required"),
  LOG_INDEXER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  METRICS_PORT: z.coerce.number().int().positive().default(3001),
  // §12.1 (Phase 6): where request archives are written.
  MINIO_ENDPOINT: z.string().min(1, "MINIO_ENDPOINT is required"),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1, "MINIO_ACCESS_KEY is required"),
  MINIO_SECRET_KEY: z.string().min(1, "MINIO_SECRET_KEY is required"),
  // z.coerce.boolean() would treat the string "false" as truthy — every
  // non-empty env var string is truthy in JS — so this needs an explicit map.
  MINIO_USE_SSL: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  MINIO_ARCHIVE_BUCKET: z.string().default("request-archives"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
