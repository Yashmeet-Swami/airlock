import { Router } from "express";
import { z } from "zod";
import { requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { withTenantScope } from "../db/client.js";
import { listAuditLog } from "../db/auditLog.repo.js";

export const auditLogRouter = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(100),
});

auditLogRouter.get("/", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }
  const scope = withTenantScope(req.auth!.tenantId);
  const entries = await listAuditLog(scope, parsed.data.limit);
  res.status(200).json(entries);
});
