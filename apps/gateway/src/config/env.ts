import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.string().default("info"),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(1, "JWT_ACCESS_SECRET is required"),
  JWT_REFRESH_SECRET: z.string().min(1, "JWT_REFRESH_SECRET is required"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("7d"),
  PROXY_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  // Applied only when a tenant has no route-specific or tenant-wide rate-limit
  // policy at all — a stand-in for per-plan-tier defaults (§15.3), which the
  // blueprint doesn't specify concrete numbers for.
  RATE_LIMIT_FALLBACK_LIMIT: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_FALLBACK_WINDOW_S: z.coerce.number().int().positive().default(60),
  OPENSEARCH_URL: z.string().min(1, "OPENSEARCH_URL is required"),
  // §16.1: opens past a 50% failure rate over the last 20 requests, half-opens
  // after a 30s cooldown. Env-configurable so tests don't need 20 real failures.
  CIRCUIT_BREAKER_WINDOW_SIZE: z.coerce.number().int().positive().default(20),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD_PCT: z.coerce.number().positive().default(50),
  CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().positive().default(30000),
  // §16.2: 2 retries (3 attempts total), only for idempotent methods or when
  // the caller supplies Idempotency-Key.
  PROXY_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  PROXY_RETRY_BASE_MS: z.coerce.number().int().positive().default(100),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

export const env = parsed.data;
