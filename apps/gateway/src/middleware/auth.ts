import type { NextFunction, Request, Response } from "express";
import type { ApiKeyScope } from "@airlock/shared-types";
import { findApiKeyByHash, touchLastUsed } from "../db/apiKeys.repo.js";
import { sha256Hex } from "../security/hash.js";
import { verifyAccessToken } from "../security/jwt.js";

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
 *  invoke a fixed middleware chain). */
export async function verifyApiKey(rawKey: string): Promise<ApiKeyAuthResult | null> {
  const apiKey = await findApiKeyByHash(sha256Hex(rawKey));
  if (!apiKey) return null;
  void touchLastUsed(apiKey.id);
  return { apiKeyId: apiKey.id, tenantId: apiKey.tenantId, scopes: apiKey.scopes };
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
