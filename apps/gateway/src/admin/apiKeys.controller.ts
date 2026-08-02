import { Router } from "express";
import { z } from "zod";
import type { ApiKeyScope } from "@airlock/shared-types";
import { requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { withTenantScope } from "../db/client.js";
import { createApiKey, listApiKeys, revokeApiKey } from "../db/apiKeys.repo.js";
import { generateRawSecret, sha256Hex } from "../security/hash.js";
import { paramString } from "../utils/params.js";

export const apiKeysRouter = Router();

const SCOPES: [ApiKeyScope, ...ApiKeyScope[]] = ["proxy:invoke", "read:logs", "write:routes", "write:webhooks"];

const createApiKeySchema = z.object({
  scopes: z.array(z.enum(SCOPES)).min(1).default(["proxy:invoke"]),
});

apiKeysRouter.post("/", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const parsed = createApiKeySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }

  const rawKey = `gk_live_${generateRawSecret()}`;
  const scope = withTenantScope(req.auth!.tenantId);
  const apiKey = await createApiKey(scope, sha256Hex(rawKey), parsed.data.scopes);

  // The raw key is returned exactly once and is never recoverable again (§13.2).
  res.status(201).json({ ...apiKey, rawKey });
});

apiKeysRouter.get("/", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const keys = await listApiKeys(scope);
  res.status(200).json(keys);
});

apiKeysRouter.delete("/:id", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const revoked = await revokeApiKey(scope, paramString(req.params.id));
  if (!revoked) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(200).json(revoked);
});
