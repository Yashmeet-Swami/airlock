import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Tenant } from "@airlock/shared-types";
import { apiFetch } from "../lib/apiClient.js";
import { useAuth } from "../lib/auth.js";

export function useTenant() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => apiFetch<Tenant>(`/admin/tenants/${tenantId}`),
    enabled: tenantId !== null,
  });
}

export interface UpdateTenantInput {
  name?: string;
  allowInternalUpstreams?: boolean;
}

export function useUpdateTenant() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantInput) =>
      apiFetch<Tenant>(`/admin/tenants/${tenantId}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant"] });
    },
  });
}
