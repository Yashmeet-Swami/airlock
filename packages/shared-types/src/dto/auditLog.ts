export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorUserId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: string;
}
