import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/apiClient.js";

export function useInvalidateCache() {
  return useMutation({
    mutationFn: (routeId: string) =>
      apiFetch<void>("/admin/cache/invalidate", { method: "POST", body: { routeId } }),
  });
}
