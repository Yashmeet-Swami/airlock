import { Router } from "express";
import { z } from "zod";
import type { HttpMethod } from "@airlock/shared-types";
import { requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { withTenantScope } from "../db/client.js";
import { createRoute, deleteRoute, findRouteById, listRoutes, updateRoute } from "../db/routes.repo.js";
import { paramString } from "../utils/params.js";

export const routesRouter = Router();

const METHODS: [HttpMethod, ...HttpMethod[]] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// Well-formed absolute URL only for Phase 1 — the private/link-local IP
// blocklist (full SSRF defense) is deliberately deferred to Phase 6 (§21.3, §24.7).
const routeInputSchema = z.object({
  pathPattern: z.string().min(1).startsWith("/"),
  upstreamUrl: z.string().url(),
  methods: z.array(z.enum(METHODS)).min(1),
  authRequired: z.boolean().default(true),
  cacheable: z.boolean().default(false),
  cacheTtlS: z.number().int().min(0).default(0),
});

// NOT derived via routeInputSchema.partial(): that schema's .default()s would
// silently fill in defaults for fields the caller simply omitted from the PATCH
// body, resetting them instead of leaving them untouched.
const routeUpdateSchema = z.object({
  pathPattern: z.string().min(1).startsWith("/").optional(),
  upstreamUrl: z.string().url().optional(),
  methods: z.array(z.enum(METHODS)).min(1).optional(),
  authRequired: z.boolean().optional(),
  cacheable: z.boolean().optional(),
  cacheTtlS: z.number().int().min(0).optional(),
});

routesRouter.post("/", requireJwtAuth, requireRole("admin"), async (req, res, next) => {
  const parsed = routeInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  try {
    const scope = withTenantScope(req.auth!.tenantId);
    const route = await createRoute(scope, parsed.data);
    res.status(201).json(route);
  } catch (err) {
    next(err);
  }
});

routesRouter.get("/", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const routes = await listRoutes(scope);
  res.status(200).json(routes);
});

routesRouter.get("/:id", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const route = await findRouteById(scope, paramString(req.params.id));
  if (!route) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(200).json(route);
});

routesRouter.patch("/:id", requireJwtAuth, requireRole("admin"), async (req, res, next) => {
  const parsed = routeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  try {
    const scope = withTenantScope(req.auth!.tenantId);
    const route = await updateRoute(scope, paramString(req.params.id), parsed.data);
    if (!route) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.status(200).json(route);
  } catch (err) {
    next(err);
  }
});

routesRouter.delete("/:id", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const deleted = await deleteRoute(scope, paramString(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).send();
});
