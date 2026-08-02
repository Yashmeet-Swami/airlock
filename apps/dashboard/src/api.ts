export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; tenantId: string; email: string; role: string };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Login failed");
  }
  return res.json();
}

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
  page?: number;
}

export async function searchLogs(accessToken: string, params: LogSearchParams): Promise<LogSearchResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }

  const res = await fetch(`/logs/search?${query.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Search failed");
  }
  return res.json();
}
