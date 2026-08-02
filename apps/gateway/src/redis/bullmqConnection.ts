import { Redis } from "ioredis";
import { env } from "../config/env.js";

/**
 * BullMQ requires its own Redis connection with maxRetriesPerRequest: null —
 * a setting that would be wrong for the rate-limiter/cache client in
 * redis/client.ts, so this is deliberately a separate connection, not shared.
 */
export const bullmqConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
