import { readFileSync } from "node:fs";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

const rateLimitScript = readFileSync(new URL("./scripts/rateLimit.lua", import.meta.url), "utf-8");

export interface RateLimitRedisCommands {
  rateLimitIncr(key: string, limit: number, windowSeconds: number): Promise<[number, number]>;
}

export const redis = new Redis(env.REDIS_URL) as Redis & RateLimitRedisCommands;

redis.defineCommand("rateLimitIncr", {
  numberOfKeys: 1,
  lua: rateLimitScript,
});
