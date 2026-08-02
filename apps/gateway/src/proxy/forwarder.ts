import { env } from "../config/env.js";

export interface ForwardResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-length",
  "host",
  // The gateway's own auth credentials are not the upstream's business.
  "x-api-key",
  "authorization",
]);

/**
 * Single-attempt forward with a timeout — no retries/circuit-breaker yet
 * (those land in Phase 5/16). Failures are mapped to 502/504 for the caller.
 */
export async function forwardRequest(
  upstreamUrl: string,
  subPath: string,
  query: string,
  method: string,
  incomingHeaders: Record<string, string | string[] | undefined>,
  body: unknown,
): Promise<ForwardResult> {
  const target = new URL(subPath.replace(/^\/+/, "/") + query, upstreamUrl);

  const headers = new Headers();
  for (const [key, value] of Object.entries(incomingHeaders)) {
    if (!value || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const hasBody = body !== undefined && method !== "GET" && method !== "HEAD";
  if (hasBody) headers.set("content-type", "application/json");

  try {
    const response = await fetch(target, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(env.PROXY_UPSTREAM_TIMEOUT_MS),
    });

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) responseHeaders[key] = value;
    });

    const contentType = response.headers.get("content-type") ?? "";
    const responseBody = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text();

    return { status: response.status, headers: responseHeaders, body: responseBody };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return {
      status: isTimeout ? 504 : 502,
      headers: {},
      body: { error: isTimeout ? "upstream_timeout" : "upstream_unreachable" },
    };
  }
}
