import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HttpMethod, Route } from "@airlock/shared-types";
import { apiFetch } from "../lib/apiClient.js";

export interface RouteInput {
  pathPattern: string;
  upstreamUrl: string;
  methods: HttpMethod[];
  authRequired?: boolean;
  cacheable?: boolean;
  cacheTtlS?: number;
}

export function useRoutes() {
  return useQuery({
    queryKey: ["routes"],
    queryFn: () => apiFetch<Route[]>("/admin/routes"),
  });
}

export function useCreateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RouteInput) => apiFetch<Route>("/admin/routes", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

export function useUpdateRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RouteInput> }) =>
      apiFetch<Route>(`/admin/routes/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}

export function useDeleteRoute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/admin/routes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["routes"] });
    },
  });
}
