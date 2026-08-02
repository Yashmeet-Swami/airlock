import { Router } from "express";
import type { HttpMethod } from "@airlock/shared-types";
import { verifyApiKey } from "../middleware/auth.js";
import { publishEvent } from "../events/publisher.js";
import { publishRequestEvent } from "../events/requestLogger.js";
import { getCachedResponse, setCachedResponse } from "../redis/cache.js";
import { checkRateLimit } from "../redis/rateLimit.js";
import { sha256Hex } from "../security/hash.js";
import { forwardRequest } from "./forwarder.js";
import { resolveProxyTarget } from "./router.js";

export const proxyRouter = Router();

const SUPPORTED_METHODS = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function buildSubPath(splat: unknown): string {
  const segments = Array.isArray(splat) ? splat : splat ? [String(splat)] : [];
  return "/" + segments.join("/");
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
    res.status(429).json({ error: "rate_limit_exceeded", retryAfterSeconds: rateLimit.retryAfterS });
    return;
  }

  const cacheable = method === "GET" && route.cacheable && route.cacheTtlS > 0;

  if (cacheable) {
    const cached = await getCachedResponse(tenant.id, route.id, method, subPath, search);
    if (cached) {
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
      });
      return;
    }
  }

  const result = await forwardRequest(route.upstreamUrl, subPath, search, method, req.headers, req.body);

  if (cacheable && result.status >= 200 && result.status < 300) {
    await setCachedResponse(tenant.id, route.id, method, subPath, search, route.cacheTtlS, result);
  }

  if (cacheable) res.setHeader("X-Cache", "MISS");
  res.status(result.status);
  for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  res.json(result.body);

  if (result.kind === "network_error") {
    const body = result.body as { error?: string } | null;
    publishRequestEvent("request.failed", {
      ...baseLogFields,
      error: body?.error ?? "unknown_error",
      upstream: route.upstreamUrl,
    });
  } else {
    publishRequestEvent("request.completed", {
      ...baseLogFields,
      method,
      statusCode: result.status,
      latencyMs: Date.now() - startedAt,
      cacheHit: false,
      upstream: route.upstreamUrl,
    });
  }
});
