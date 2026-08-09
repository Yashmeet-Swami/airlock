import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RateLimitPolicy } from "@airlock/shared-types";
import { apiFetch } from "../lib/apiClient.js";

export interface RateLimitPolicyInput {
  routeId?: string | null;
  limitCount: number;
  windowSeconds: number;
}

export function useRateLimitPolicies() {
  return useQuery({
    queryKey: ["rateLimitPolicies"],
    queryFn: () => apiFetch<RateLimitPolicy[]>("/admin/rate-limit-policies"),
  });
}

export function useCreateRateLimitPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RateLimitPolicyInput) =>
      apiFetch<RateLimitPolicy>("/admin/rate-limit-policies", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rateLimitPolicies"] });
    },
  });
}

export function useDeleteRateLimitPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/rate-limit-policies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["rateLimitPolicies"] });
    },
  });
}
