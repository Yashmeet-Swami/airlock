import type { NextFunction, Request, Response } from "express";
import type { ApiKeyScope } from "@airlock/shared-types";
import { findApiKeyByHash, touchLastUsed } from "../db/apiKeys.repo.js";
import { getCachedApiKeyAuth, setCachedApiKeyAuth } from "../redis/apiKeyCache.js";
import { sha256Hex } from "../security/hash.js";
import { verifyAccessToken } from "../security/jwt.js";
import type { JwtAuth } from "../types/express.js";

/** Safe only behind requireJwtAuth/requireRole, both of which reject anything
 *  that isn't a jwt-typed req.auth before a handler ever runs. */
export function jwtUserId(req: Request): string {
  return (req.auth as JwtAuth).userId;
}

export function jwtRole(req: Request): JwtAuth["role"] {
  return (req.auth as JwtAuth).role;
}

/** Verifies the admin/dashboard JWT (Authorization: Bearer <token>) and attaches req.auth. */
export function requireJwtAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Missing bearer token" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = { type: "jwt", userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired access token" });
  }
}

export interface ApiKeyAuthResult {
  apiKeyId: string;
  tenantId: string;
  scopes: ApiKeyScope[];
}

/** Express-agnostic lookup, reused by both requireApiKeyAuth and the proxy handler
 *  (which needs to decide, per-route, whether auth applies at all before it can
 *  invoke a fixed middleware chain). Cache-aside against Redis (`apikey:{hash}`,
 *  60s TTL, §9.1) so the hot proxy path doesn't hit Postgres on every request;
 *  revocation busts the cache entry immediately rather than waiting out the TTL. */
export async function verifyApiKey(rawKey: string): Promise<ApiKeyAuthResult | null> {
  const keyHash = sha256Hex(rawKey);

  const cached = await getCachedApiKeyAuth(keyHash);
  if (cached) {
    void touchLastUsed(cached.apiKeyId);
    return cached;
  }

  const apiKey = await findApiKeyByHash(keyHash);
  if (!apiKey) return null;

  const result: ApiKeyAuthResult = { apiKeyId: apiKey.id, tenantId: apiKey.tenantId, scopes: apiKey.scopes };
  await setCachedApiKeyAuth(keyHash, result);
  void touchLastUsed(apiKey.id);
  return result;
}

/** Verifies the machine X-API-Key header for statically-protected (non-proxy) routes. */
export async function requireApiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawKey = req.header("X-API-Key");
  if (!rawKey) {
    res.status(401).json({ error: "unauthorized", message: "Missing X-API-Key header" });
    return;
  }

  const result = await verifyApiKey(rawKey);
  if (!result) {
    res.status(401).json({ error: "unauthorized", message: "Invalid or revoked API key" });
    return;
  }

  req.auth = { type: "apikey", ...result };
  next();
}

/** §22.1: some endpoints (e.g. /logs/*) accept either a dashboard JWT (any
 *  role) or a machine API key carrying a specific scope. */
export function requireJwtOrScope(scope: ApiKeyScope) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const payload = verifyAccessToken(authHeader.slice("Bearer ".length));
        req.auth = { type: "jwt", userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
        next();
      } catch {
        res.status(401).json({ error: "unauthorized", message: "Invalid or expired access token" });
      }
      return;
    }

    const rawKey = req.header("X-API-Key");
    if (rawKey) {
      const result = await verifyApiKey(rawKey);
      if (!result) {
        res.status(401).json({ error: "unauthorized", message: "Invalid or revoked API key" });
        return;
      }
      if (!result.scopes.includes(scope)) {
        res.status(403).json({ error: "forbidden", message: `API key missing required scope: ${scope}` });
        return;
      }
      req.auth = { type: "apikey", ...result };
      next();
      return;
    }

    res.status(401).json({ error: "unauthorized", message: "Missing bearer token or X-API-Key header" });
  };
}
