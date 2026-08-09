import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ApiKey, ApiKeyCreated, ApiKeyScope } from "@airlock/shared-types";
import { apiFetch } from "../lib/apiClient.js";

export function useApiKeys() {
  return useQuery({
    queryKey: ["apiKeys"],
    queryFn: () => apiFetch<ApiKey[]>("/admin/api-keys"),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scopes: ApiKeyScope[]) =>
      apiFetch<ApiKeyCreated>("/admin/api-keys", { method: "POST", body: { scopes } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<ApiKey>(`/admin/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });
}
