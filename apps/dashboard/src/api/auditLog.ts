import { useQuery } from "@tanstack/react-query";
import type { AuditLogEntry } from "@airlock/shared-types";
import { apiFetch } from "../lib/apiClient.js";

export function useAuditLog(limit = 100) {
  return useQuery({
    queryKey: ["auditLog", limit],
    queryFn: () => apiFetch<AuditLogEntry[]>("/admin/audit-log", { query: { limit } }),
  });
}
