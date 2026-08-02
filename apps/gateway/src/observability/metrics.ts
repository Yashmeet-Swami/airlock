import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const requestsTotal = new Counter({
  name: "airlock_requests_total",
  help: "Total proxied requests, labeled by route, method and outcome status code",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

export const requestDurationMs = new Histogram({
  name: "airlock_request_duration_ms",
  help: "Proxied request latency in milliseconds, as measured by the gateway",
  labelNames: ["method", "route"] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const rateLimitRejectionsTotal = new Counter({
  name: "airlock_rate_limit_rejections_total",
  help: "Requests rejected by the rate limiter",
  labelNames: ["route"] as const,
  registers: [registry],
});

export const cacheHitsTotal = new Counter({
  name: "airlock_cache_hits_total",
  help: "Proxied requests served from cache",
  labelNames: ["route"] as const,
  registers: [registry],
});

export const cacheMissesTotal = new Counter({
  name: "airlock_cache_misses_total",
  help: "Cacheable requests that missed the cache",
  labelNames: ["route"] as const,
  registers: [registry],
});

/** 0 = closed, 1 = half_open, 2 = open — mirrors redis/circuitBreaker.ts's BreakerState encoding. */
export const circuitBreakerState = new Gauge({
  name: "airlock_circuit_breaker_state",
  help: "Circuit breaker state per upstream origin (0=closed, 1=half_open, 2=open)",
  labelNames: ["upstream_origin"] as const,
  registers: [registry],
});
