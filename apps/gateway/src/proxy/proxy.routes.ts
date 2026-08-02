import { Router } from "express";
import type { ArchivePayload, HttpMethod } from "@airlock/shared-types";
import { env } from "../config/env.js";
import { verifyApiKey } from "../middleware/auth.js";
import { publishEvent } from "../events/publisher.js";
import { publishRequestEvent } from "../events/requestLogger.js";
import {
  cacheHitsTotal,
  cacheMissesTotal,
  circuitBreakerState,
  rateLimitRejectionsTotal,
  requestDurationMs,
  requestsTotal,
} from "../observability/metrics.js";
import { checkBreaker, recordBreakerResult } from "../redis/circuitBreaker.js";
import { getCachedResponse, setCachedResponse } from "../redis/cache.js";
import { checkRateLimit } from "../redis/rateLimit.js";
import { publishTrafficEvent } from "../realtime/publisher.js";
import { sha256Hex } from "../security/hash.js";
import { forwardRequest } from "./forwarder.js";
import { resolveProxyTarget } from "./router.js";

const BREAKER_STATE_VALUES: Record<"closed" | "half_open" | "open", number> = {
  closed: 0,
  half_open: 1,
  open: 2,
};

export const proxyRouter = Router();

const SUPPORTED_METHODS = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function buildSubPath(splat: unknown): string {
  const segments = Array.isArray(splat) ? splat : splat ? [String(splat)] : [];
  return "/" + segments.join("/");
}

// §12.1: archived alongside the log event so replay (Phase 6) never needs a
// second round-trip to reconstruct the original call. Auth material is never
// archived; oversized bodies are nulled out (not omitted) rather than kept.
const MAX_ARCHIVE_BODY_CHARS = 32_000;
const REDACTED_REQUEST_HEADERS = new Set(["authorization", "x-api-key", "cookie"]);

function capArchiveBody(body: unknown): unknown {
  if (body === undefined) return null;
  try {
    return JSON.stringify(body).length > MAX_ARCHIVE_BODY_CHARS ? null : body;
  } catch {
    return null;
  }
}

function buildArchivePayload(
  upstreamUrl: string,
  subPath: string,
  query: string,
  method: string,
  requestHeaders: Record<string, string | string[] | undefined>,
  requestBody: unknown,
  responseHeaders: Record<string, string>,
  responseBody: unknown,
  statusCode: number,
): ArchivePayload {
  const redactedRequestHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (!value || REDACTED_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    redactedRequestHeaders[key] = Array.isArray(value) ? value.join(", ") : value;
  }

  return {
    upstreamUrl,
    subPath,
    query,
    method,
    requestHeaders: redactedRequestHeaders,
    requestBody: capArchiveBody(requestBody),
    responseHeaders,
    responseBody: capArchiveBody(responseBody),
    statusCode,
  };
}

proxyRouter.all("/:tenantSlug/*splat", async (req, res) => {
  const startedAt = Date.now();
  const method = req.method as HttpMethod;
  if (!SUPPORTED_METHODS.has(method)) {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const subPath = buildSubPath(req.params.splat);
  const search = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";

  const resolved = await resolveProxyTarget(req.params.tenantSlug, subPath, method);
  if (resolved.kind === "tenant_not_found") {
    res.status(404).json({ error: "tenant_not_found" });
    return;
  }
  if (resolved.kind === "route_not_found") {
    res.status(404).json({ error: "route_not_found" });
    return;
  }

  const { tenant, route } = resolved;
  const requestId = String(req.id);
  const baseLogFields = {
    requestId,
    tenantId: tenant.id,
    route: route.pathPattern,
    userAgent: req.header("user-agent") ?? null,
    ipHash: req.ip ? sha256Hex(req.ip) : null,
  };

  // Auth before rate limiting: a request that fails auth shouldn't burn the
  // tenant's real rate-limit budget (see Phase 2 plan, scope decision #2).
  if (route.authRequired) {
    const rawKey = req.header("X-API-Key");
    const apiKeyAuth = rawKey ? await verifyApiKey(rawKey) : null;

    if (!apiKeyAuth) {
      res.status(401).json({ error: "unauthorized", message: "Missing or invalid X-API-Key header" });
      return;
    }
    if (apiKeyAuth.tenantId !== tenant.id) {
      res.status(401).json({ error: "unauthorized", message: "API key does not belong to this tenant" });
      return;
    }
    if (!apiKeyAuth.scopes.includes("proxy:invoke")) {
      res.status(403).json({ error: "forbidden", message: "API key missing required scope: proxy:invoke" });
      return;
    }
    req.auth = { type: "apikey", ...apiKeyAuth };
  }

  const rateLimit = await checkRateLimit(tenant.id, route.id);
  res.setHeader("X-RateLimit-Limit", String(rateLimit.limit));
  res.setHeader("X-RateLimit-Remaining", String(rateLimit.remaining));
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfterS));
    const rateLimitPayload = {
      routeId: route.id,
      limit: rateLimit.limit,
      current: rateLimit.limit - rateLimit.remaining,
    };
    publishEvent(tenant.id, "rate_limit.exceeded", rateLimitPayload);
    publishRequestEvent("rate_limit.exceeded", { ...baseLogFields, ...rateLimitPayload });
    publishTrafficEvent(tenant.id, {
      requestId,
      route: route.pathPattern,
      method,
      statusCode: 429,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      outcome: "rate_limited",
      timestamp: new Date().toISOString(),
    });
    rateLimitRejectionsTotal.inc({ route: route.pathPattern });
    requestsTotal.inc({ method, route: route.pathPattern, status_code: "429" });
    res.status(429).json({ error: "rate_limit_exceeded", retryAfterSeconds: rateLimit.retryAfterS });
    return;
  }

  const cacheable = method === "GET" && route.cacheable && route.cacheTtlS > 0;

  if (cacheable) {
    const cached = await getCachedResponse(tenant.id, route.id, method, subPath, search);
    if (cached) {
      cacheHitsTotal.inc({ route: route.pathPattern });
      res.setHeader("X-Cache", "HIT");
      res.status(cached.status);
      for (const [key, value] of Object.entries(cached.headers)) res.setHeader(key, value);
      res.json(cached.body);
      publishRequestEvent("request.completed", {
        ...baseLogFields,
        method,
        statusCode: cached.status,
        latencyMs: Date.now() - startedAt,
        cacheHit: true,
        upstream: route.upstreamUrl,
        archive: buildArchivePayload(
          route.upstreamUrl,
          subPath,
          search,
          method,
          req.headers,
          req.body,
          cached.headers,
          cached.body,
          cached.status,
        ),
      });
      requestsTotal.inc({ method, route: route.pathPattern, status_code: String(cached.status) });
      requestDurationMs.observe({ method, route: route.pathPattern }, Date.now() - startedAt);
      publishTrafficEvent(tenant.id, {
        requestId,
        route: route.pathPattern,
        method,
        statusCode: cached.status,
        latencyMs: Date.now() - startedAt,
        cacheHit: true,
        outcome: "completed",
        timestamp: new Date().toISOString(),
      });
      return;
    }
    cacheMissesTotal.inc({ route: route.pathPattern });
  }

  // §16.1: the breaker gates the whole upstream origin, not just this route —
  // several routes can share a backend, and one route's outage shouldn't need
  // to be independently rediscovered per route.
  const upstreamOrigin = new URL(route.upstreamUrl).origin;
  const breakerDecision = await checkBreaker(upstreamOrigin);
  if (!breakerDecision.allowed) {
    publishRequestEvent("request.failed", {
      ...baseLogFields,
      error: "circuit_open",
      upstream: route.upstreamUrl,
    });
    requestsTotal.inc({ method, route: route.pathPattern, status_code: "503" });
    publishTrafficEvent(tenant.id, {
      requestId,
      route: route.pathPattern,
      method,
      statusCode: 503,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      outcome: "circuit_open",
      timestamp: new Date().toISOString(),
    });
    res.status(503).json({ error: "circuit_open" });
    return;
  }

  const result = await forwardRequest(route.upstreamUrl, subPath, search, method, req.headers, req.body);

  const breakerSuccess = result.kind !== "network_error" && result.status < 500;
  const breakerState = await recordBreakerResult(upstreamOrigin, breakerSuccess);
  circuitBreakerState.set({ upstream_origin: upstreamOrigin }, BREAKER_STATE_VALUES[breakerState]);
  // checkBreaker only lets a request through when the breaker was closed or
  // acting as the single half-open probe — so "open" here always means this
  // call is the one that just tripped it, never a stale read.
  if (breakerState === "open") {
    publishEvent(tenant.id, "breaker.opened", {
      upstreamOrigin,
      failureRate: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD_PCT,
    });
  }

  if (cacheable && result.status >= 200 && result.status < 300) {
    await setCachedResponse(tenant.id, route.id, method, subPath, search, route.cacheTtlS, result);
  }

  if (cacheable) res.setHeader("X-Cache", "MISS");
  res.status(result.status);
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  res.json(result.body);

  requestsTotal.inc({ method, route: route.pathPattern, status_code: String(result.status) });
  requestDurationMs.observe({ method, route: route.pathPattern }, Date.now() - startedAt);

  const archive = buildArchivePayload(
    route.upstreamUrl,
    subPath,
    search,
    method,
    req.headers,
    req.body,
    result.headers,
    result.body,
    result.status,
  );

  if (result.kind === "network_error") {
    const body = result.body as { error?: string } | null;
    publishRequestEvent("request.failed", {
      ...baseLogFields,
      error: body?.error ?? "unknown_error",
      upstream: route.upstreamUrl,
      archive,
    });
    publishTrafficEvent(tenant.id, {
      requestId,
      route: route.pathPattern,
      method,
      statusCode: result.status,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      outcome: "failed",
      timestamp: new Date().toISOString(),
    });
  } else {
    publishRequestEvent("request.completed", {
      ...baseLogFields,
      method,
      statusCode: result.status,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      upstream: route.upstreamUrl,
      archive,
    });
    publishTrafficEvent(tenant.id, {
      requestId,
      route: route.pathPattern,
      method,
      statusCode: result.status,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      outcome: "completed",
      timestamp: new Date().toISOString(),
    });
  }
});
