import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/apiClient.js";

export interface AggregateSeriesPoint {
  bucket: string;
  total: number;
  errors: number;
  errorRate: number;
}

export interface AggregateSeriesResponse {
  series: AggregateSeriesPoint[];
}

export interface AggregateRouteRow {
  route: string;
  count: number;
  errorCount: number;
}

export interface AggregateRoutesResponse {
  routes: AggregateRouteRow[];
}

export function useAggregateOverTime(window: string, from?: string, refetchInterval?: number | false) {
  return useQuery({
    queryKey: ["analyticsAggregate", "window", window, from],
    queryFn: () => apiFetch<AggregateSeriesResponse>("/logs/aggregate", { query: { window, from } }),
    refetchInterval,
  });
}

export function useAggregateTopRoutes(from?: string, refetchInterval?: number | false) {
  return useQuery({
    queryKey: ["analyticsAggregate", "routes", from],
    queryFn: () => apiFetch<AggregateRoutesResponse>("/logs/aggregate", { query: { from } }),
    refetchInterval,
  });
}

export interface ExportInput {
  format: "csv" | "ndjson";
  route?: string;
  status_code?: number;
  from?: string;
  to?: string;
}

export interface ExportResult {
  exportId: string;
  format: "csv" | "ndjson";
  count: number;
  url: string;
}

export function useExportLogs() {
  return useMutation({
    mutationFn: (input: ExportInput) => apiFetch<ExportResult>("/analytics/export", { method: "POST", body: input }),
  });
}
