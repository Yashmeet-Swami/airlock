import { Router } from "express";
import { z } from "zod";
import { requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { withTenantScope } from "../db/client.js";
import { findRouteById } from "../db/routes.repo.js";
import { invalidateRouteCache } from "../redis/cache.js";

export const cacheRouter = Router();

const invalidateSchema = z.object({
  routeId: z.string().uuid(),
});

// §17.3: explicit invalidation trigger, alongside natural TTL expiry.
cacheRouter.post("/invalidate", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const parsed = invalidateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }

  const scope = withTenantScope(req.auth!.tenantId);
  const route = await findRouteById(scope, parsed.data.routeId);
  if (!route) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await invalidateRouteCache(scope.tenantId, route.id);
  res.status(204).send();
});
