import { Redis } from "ioredis";
import { env } from "../config/env.js";

export const bullmqConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
