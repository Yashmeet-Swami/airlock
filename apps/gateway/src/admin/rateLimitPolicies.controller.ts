import { Router } from "express";
import { z } from "zod";
import { requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { withTenantScope } from "../db/client.js";
import { createPolicy, deletePolicy, listPolicies } from "../db/rateLimitPolicies.repo.js";
import { paramString } from "../utils/params.js";

export const rateLimitPoliciesRouter = Router();

const policyInputSchema = z.object({
  routeId: z.string().uuid().nullable().default(null),
  limitCount: z.number().int().positive(),
  windowSeconds: z.number().int().positive(),
});

rateLimitPoliciesRouter.post("/", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const parsed = policyInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  const scope = withTenantScope(req.auth!.tenantId);
  const policy = await createPolicy(scope, parsed.data);
  res.status(201).json(policy);
});

rateLimitPoliciesRouter.get("/", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const policies = await listPolicies(scope);
  res.status(200).json(policies);
});

rateLimitPoliciesRouter.delete("/:id", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const deleted = await deletePolicy(scope, paramString(req.params.id));
  if (!deleted) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.status(204).send();
});
