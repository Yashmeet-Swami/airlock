import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiFetch } from "../lib/apiClient.js";

export interface LogSearchResult {
  requestId: string;
  route: string;
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  timestamp: string;
}

export interface LogSearchResponse {
  total: number;
  results: LogSearchResult[];
}

export interface LogSearchParams {
  q?: string;
  route?: string;
  status_code?: string;
  from?: string;
  to?: string;
  page?: number;
}

export function useLogSearch(params: LogSearchParams) {
  return useQuery({
    queryKey: ["logsSearch", params],
    queryFn: () => apiFetch<LogSearchResponse>("/logs/search", { query: params }),
    placeholderData: keepPreviousData,
  });
}
