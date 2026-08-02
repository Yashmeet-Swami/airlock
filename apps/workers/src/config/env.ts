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
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
