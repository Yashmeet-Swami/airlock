import { env } from "../config/env.js";
import { redis } from "./client.js";

export type BreakerState = "closed" | "half_open" | "open";

const STATE_NAMES: Record<number, BreakerState> = { 0: "closed", 1: "half_open", 2: "open" };

function breakerKey(origin: string): string {
  return `breaker:${origin}`;
}

export interface BreakerDecision {
  allowed: boolean;
  state: BreakerState;
}

/** §16.1: CLOSED always allows; OPEN short-circuits until the cooldown elapses,
 *  at which point exactly one caller becomes the HALF_OPEN probe (atomic —
 *  see circuitBreakerCheck.lua). */
export async function checkBreaker(origin: string): Promise<BreakerDecision> {
  const result = await redis.breakerCheck(breakerKey(origin), Date.now(), env.CIRCUIT_BREAKER_COOLDOWN_MS);
  return { allowed: result !== 2, state: STATE_NAMES[result]! };
}

/** Called only for requests checkBreaker actually allowed through. */
export async function recordBreakerResult(origin: string, success: boolean): Promise<BreakerState> {
  const result = await redis.breakerRecord(
    breakerKey(origin),
    success ? 1 : 0,
    Date.now(),
    env.CIRCUIT_BREAKER_WINDOW_SIZE,
    env.CIRCUIT_BREAKER_FAILURE_THRESHOLD_PCT,
  );
  return STATE_NAMES[result]!;
}

/** Read-only — used by the Prometheus gauge and admin visibility, never gates a request. */
export async function getBreakerState(origin: string): Promise<BreakerState> {
  const raw = await redis.hget(breakerKey(origin), "state");
  return STATE_NAMES[Number(raw ?? 0)]!;
}

export async function listKnownBreakerOrigins(): Promise<string[]> {
  const keys = await redis.keys("breaker:*");
  return keys.map((k) => k.slice("breaker:".length));
}
