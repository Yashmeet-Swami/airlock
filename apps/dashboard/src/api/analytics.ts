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

export function useAggregateOverTime(window: string) {
  return useQuery({
    queryKey: ["analyticsAggregate", "window", window],
    queryFn: () => apiFetch<AggregateSeriesResponse>("/logs/aggregate", { query: { window } }),
  });
}

export function useAggregateTopRoutes() {
  return useQuery({
    queryKey: ["analyticsAggregate", "routes"],
    queryFn: () => apiFetch<AggregateRoutesResponse>("/logs/aggregate"),
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
