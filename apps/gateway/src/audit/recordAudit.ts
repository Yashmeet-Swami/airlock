import { withTenantScope } from "../db/client.js";
import { insertAuditLog } from "../db/auditLog.repo.js";
import { logger } from "../observability/logger.js";

/**
 * Fire-and-forget, same rationale as events/publisher.ts's publishEvent —
 * an audit-trail write should never make an admin mutation slower or fail it.
 */
export function recordAudit(
  tenantId: string,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: unknown = {},
): void {
  const scope = withTenantScope(tenantId);
  void insertAuditLog(scope, actorUserId, action, resourceType, resourceId, metadata).catch((err) => {
    logger.error({ err, tenantId, action, resourceType, resourceId }, "audit_log_write_failed");
  });
}
