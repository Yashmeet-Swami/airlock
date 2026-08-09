import { clearTokens, getAccessToken, getRefreshToken, setTokens, type TokenPair } from "./tokenStore.js";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => ({}));
  const record = body as { message?: string; error?: string };
  return record.message ?? record.error ?? `Request failed (${res.status})`;
}

let refreshPromise: Promise<boolean> | null = null;

// Single-flight: concurrent 401s all await the same in-flight refresh instead
// of each independently burning the (single-use, rotating) refresh token.
async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshPromise ??= fetch("/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const pair = (await res.json()) as TokenPair;
      setTokens(pair);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  // Loosely typed `object` (not Record<string, ...>) so callers can pass any
  // params interface directly without needing its own index signature —
  // TypeScript only allows Record<string, X> assignment from types that
  // structurally declare an index signature themselves.
  query?: object;
}

/** Every dashboard API call goes through this — auth header injection, a
 *  single silent-refresh-and-retry on 401, and normalized JSON error bodies. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const url = new URL(path, window.location.origin);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query as Record<string, unknown>)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  const accessToken = getAccessToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;

  const res = await fetch(url.pathname + url.search, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && accessToken && !isRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiFetch<T>(path, options, true);
    clearTokens();
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorMessage(res));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
