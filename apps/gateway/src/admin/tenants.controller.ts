import { Router } from "express";
import { z } from "zod";
import { requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { deleteTenant, findTenantById, updateTenantName } from "../db/tenants.repo.js";
import { paramString } from "../utils/params.js";

export const tenantsRouter = Router();

const updateTenantSchema = z.object({
  name: z.string().min(2).max(100),
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
  const tenant = await updateTenantName(req.auth!.tenantId, parsed.data.name);
  res.status(200).json(tenant);
});

tenantsRouter.delete("/:id", requireJwtAuth, requireRole("owner"), async (req, res) => {
  if (!assertOwnTenant(req.params.id, req.auth!.tenantId)) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await deleteTenant(req.auth!.tenantId);
  res.status(204).send();
});
