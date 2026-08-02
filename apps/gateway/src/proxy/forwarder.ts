import { env } from "../config/env.js";

export interface ForwardResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  /** "response" = a real reply from the upstream (whatever its status code);
   *  "network_error" = the gateway itself couldn't reach/finish talking to it.
   *  Lets the caller emit request.completed vs request.failed without
   *  guessing from magic status codes an upstream could legitimately return too. */
  kind: "response" | "network_error";
  attempts: number;
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

const IDEMPOTENT_METHODS = new Set(["GET", "PUT", "DELETE"]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptOnce(
  target: URL,
  method: string,
  headers: Headers,
  bodyText: string | undefined,
): Promise<ForwardResult> {
  try {
    const response = await fetch(target, {
      method,
      headers,
      body: bodyText,
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

    return { status: response.status, headers: responseHeaders, body: responseBody, kind: "response", attempts: 1 };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return {
      status: isTimeout ? 504 : 502,
      headers: {},
      body: { error: isTimeout ? "upstream_timeout" : "upstream_unreachable" },
      kind: "network_error",
      attempts: 1,
    };
  }
}

function isRetryableFailure(result: ForwardResult): boolean {
  return result.kind === "network_error" || result.status >= 500;
}

/**
 * Retries (§16.2): up to env.PROXY_MAX_RETRIES additional attempts, exponential
 * backoff + jitter, gated to idempotent methods (GET/PUT/DELETE) or a caller-
 * supplied Idempotency-Key — POST is never silently retried, avoiding duplicate
 * side effects on the upstream. Independent of circuit-breaker state, which the
 * caller checks/records separately around this call.
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
  const bodyText = hasBody ? JSON.stringify(body) : undefined;

  const canRetry = IDEMPOTENT_METHODS.has(method) || Boolean(incomingHeaders["idempotency-key"]);
  const maxAttempts = canRetry ? env.PROXY_MAX_RETRIES + 1 : 1;

  let result = await attemptOnce(target, method, headers, bodyText);
  let attempt = 1;

  while (isRetryableFailure(result) && attempt < maxAttempts) {
    const backoff = env.PROXY_RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * env.PROXY_RETRY_BASE_MS;
    await sleep(backoff);
    result = await attemptOnce(target, method, headers, bodyText);
    attempt += 1;
  }

  return { ...result, attempts: attempt };
}
