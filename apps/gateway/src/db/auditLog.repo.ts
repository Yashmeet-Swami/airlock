import type { AuditLogEntry } from "@airlock/shared-types";
import type { TenantScope } from "./client.js";

interface AuditLogRow {
  id: string;
  tenant_id: string;
  actor_user_id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: unknown;
  created_at: Date;
}

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    createdAt: row.created_at.toISOString(),
  };
}

export async function insertAuditLog(
  scope: TenantScope,
  actorUserId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: unknown = {},
): Promise<AuditLogEntry> {
  const { rows } = await scope.query<AuditLogRow>(
    `INSERT INTO audit_log (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [scope.tenantId, actorUserId, action, resourceType, resourceId, JSON.stringify(metadata)],
  );
  return toAuditLogEntry(rows[0]!);
}

export async function listAuditLog(scope: TenantScope, limit: number): Promise<AuditLogEntry[]> {
  const { rows } = await scope.query<AuditLogRow>(
    `SELECT * FROM audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [scope.tenantId, limit],
  );
  return rows.map(toAuditLogEntry);
}
