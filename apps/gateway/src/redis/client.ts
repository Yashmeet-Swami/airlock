import { readFileSync } from "node:fs";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

const rateLimitScript = readFileSync(new URL("./scripts/rateLimit.lua", import.meta.url), "utf-8");
const circuitBreakerCheckScript = readFileSync(new URL("./scripts/circuitBreakerCheck.lua", import.meta.url), "utf-8");
const circuitBreakerRecordScript = readFileSync(
  new URL("./scripts/circuitBreakerRecord.lua", import.meta.url),
  "utf-8",
);

export interface RateLimitRedisCommands {
  rateLimitIncr(key: string, limit: number, windowSeconds: number): Promise<[number, number]>;
  breakerCheck(key: string, nowMs: number, cooldownMs: number): Promise<number>;
  breakerRecord(key: string, success: number, nowMs: number, windowSize: number, thresholdPct: number): Promise<number>;
}

export const redis = new Redis(env.REDIS_URL) as Redis & RateLimitRedisCommands;

redis.defineCommand("rateLimitIncr", {
  numberOfKeys: 1,
  lua: rateLimitScript,
});

redis.defineCommand("breakerCheck", {
  numberOfKeys: 1,
  lua: circuitBreakerCheckScript,
});

redis.defineCommand("breakerRecord", {
  numberOfKeys: 1,
  lua: circuitBreakerRecordScript,
});
