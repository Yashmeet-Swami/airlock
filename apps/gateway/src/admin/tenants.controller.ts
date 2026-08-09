import { Router } from "express";
import { z } from "zod";
import { jwtRole, jwtUserId, requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { recordAudit } from "../audit/recordAudit.js";
import { deleteTenant, findTenantById, updateTenant } from "../db/tenants.repo.js";
import { paramString } from "../utils/params.js";

export const tenantsRouter = Router();

const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  // §21.3: defaults to true (self-hosted — pointing at a co-located service
  // is normal). Lets an owner opt OUT to the stricter SaaS-style posture —
  // owner-only even though the route itself only requires "admin" (see below).
  allowInternalUpstreams: z.boolean().optional(),
});

/** Every handler ignores :id beyond a 404 sanity check — the tenant acted on is
 *  always req.auth.tenantId (never a client-supplied value), per §14.3. */
function assertOwnTenant(paramId: string | string[] | undefined, tenantId: string): boolean {
  return paramString(paramId) === tenantId;
}

tenantsRouter.get("/:id", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  if (!assertOwnTenant(req.params.id, req.auth!.tenantId)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const tenant = await findTenantById(req.auth!.tenantId);
  res.status(200).json(tenant);
});

tenantsRouter.patch("/:id", requireJwtAuth, requireRole("admin"), async (req, res) => {
  if (!assertOwnTenant(req.params.id, req.auth!.tenantId)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  if (parsed.data.allowInternalUpstreams !== undefined && jwtRole(req) !== "owner") {
    res.status(403).json({ error: "forbidden", message: "Requires role >= owner to change allowInternalUpstreams" });
    return;
  }
  const tenant = await updateTenant(req.auth!.tenantId, parsed.data);
  recordAudit(req.auth!.tenantId, jwtUserId(req), "tenant.updated", "tenant", req.auth!.tenantId, parsed.data);
  res.status(200).json(tenant);
});

tenantsRouter.delete("/:id", requireJwtAuth, requireRole("owner"), async (req, res) => {
  if (!assertOwnTenant(req.params.id, req.auth!.tenantId)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  // No recordAudit here: audit_log FKs to tenants(id) ON DELETE CASCADE, so an
  // entry for "the tenant that just got deleted" would itself be deleted by
  // the same cascade — there's nowhere left to read it from.
  await deleteTenant(req.auth!.tenantId);
  res.status(204).send();
});
