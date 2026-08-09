import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "../lib/apiClient.js";

export interface ReplayResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export function useReplayRequest() {
  return useMutation({
    mutationFn: (requestId: string) => apiFetch<ReplayResult>(`/admin/replay/${requestId}`, { method: "POST" }),
  });
}
