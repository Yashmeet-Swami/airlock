import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { loginSchema, refreshSchema, registerSchema } from "../auth/schemas.js";

// Must run before any zod schema is registered or generated against — it patches
// ZodType.prototype with the .openapi() method the generator relies on.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "BearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

registry.registerComponent("securitySchemes", "ApiKeyAuth", {
  type: "apiKey",
  in: "header",
  name: "X-API-Key",
});

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { type: "object" as const, properties: { error: { type: "string" as const } } },
    },
  },
};

registry.registerPath({
  method: "post",
  path: "/auth/register",
  tags: ["Auth"],
  summary: "Create a new tenant and its first (owner) user",
  request: { body: { content: { "application/json": { schema: registerSchema } } } },
  responses: {
    201: { description: "Tenant + owner created, tokens issued" },
    409: errorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/login",
  tags: ["Auth"],
  summary: "Exchange email/password for an access + refresh token pair",
  request: { body: { content: { "application/json": { schema: loginSchema } } } },
  responses: {
    200: { description: "Tokens issued" },
    401: errorResponse,
  },
});

registry.registerPath({
  method: "post",
  path: "/auth/refresh",
  tags: ["Auth"],
  summary: "Rotate a refresh token for a new access + refresh token pair",
  request: { body: { content: { "application/json": { schema: refreshSchema } } } },
  responses: {
    200: { description: "New tokens issued" },
    401: errorResponse,
  },
});

const bearerSecurity = [{ BearerAuth: [] }];

registry.registerPath({
  method: "get",
  path: "/admin/tenants/{id}",
  tags: ["Tenants"],
  summary: "Get the caller's own tenant",
  security: bearerSecurity,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Tenant" }, 404: errorResponse },
});

registry.registerPath({
  method: "post",
  path: "/admin/routes",
  tags: ["Routes"],
  summary: "Create a proxied route for the caller's tenant",
  security: bearerSecurity,
  responses: { 201: { description: "Route created" }, 400: errorResponse },
});

registry.registerPath({
  method: "get",
  path: "/admin/routes",
  tags: ["Routes"],
  summary: "List routes for the caller's tenant",
  security: bearerSecurity,
  responses: { 200: { description: "Routes" } },
});

registry.registerPath({
  method: "post",
  path: "/admin/api-keys",
  tags: ["API Keys"],
  summary: "Issue a new API key (raw key returned once)",
  security: bearerSecurity,
  responses: { 201: { description: "API key created" }, 400: errorResponse },
});

registry.registerPath({
  method: "get",
  path: "/admin/api-keys",
  tags: ["API Keys"],
  summary: "List API keys for the caller's tenant",
  security: bearerSecurity,
  responses: { 200: { description: "API keys" } },
});

registry.registerPath({
  method: "post",
  path: "/admin/rate-limit-policies",
  tags: ["Rate Limit Policies"],
  summary: "Create a rate-limit policy (route-specific if routeId given, tenant-wide otherwise)",
  security: bearerSecurity,
  responses: { 201: { description: "Policy created" }, 400: errorResponse },
});

registry.registerPath({
  method: "get",
  path: "/admin/rate-limit-policies",
  tags: ["Rate Limit Policies"],
  summary: "List rate-limit policies for the caller's tenant",
  security: bearerSecurity,
  responses: { 200: { description: "Policies" } },
});

registry.registerPath({
  method: "post",
  path: "/admin/cache/invalidate",
  tags: ["Cache"],
  summary: "Explicitly invalidate all cached responses for a route (§17.3)",
  security: bearerSecurity,
  responses: { 204: { description: "Invalidated" }, 404: errorResponse },
});

registry.registerPath({
  method: "post",
  path: "/admin/webhooks",
  tags: ["Webhooks"],
  summary: "Register a webhook subscription (HMAC secret returned, visible indefinitely)",
  security: bearerSecurity,
  responses: { 201: { description: "Webhook created" }, 400: errorResponse },
});

registry.registerPath({
  method: "get",
  path: "/admin/webhooks",
  tags: ["Webhooks"],
  summary: "List webhook subscriptions for the caller's tenant",
  security: bearerSecurity,
  responses: { 200: { description: "Webhooks" } },
});

registry.registerPath({
  method: "get",
  path: "/admin/webhooks/{id}/deliveries",
  tags: ["Webhooks"],
  summary: "List delivery attempts for a webhook (optionally filtered by status)",
  security: bearerSecurity,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Deliveries" }, 404: errorResponse },
});

registry.registerPath({
  method: "post",
  path: "/admin/webhooks/deliveries/{id}/replay",
  tags: ["Webhooks"],
  summary: "Manually replay a dead-lettered (or any) delivery (§10.5)",
  security: bearerSecurity,
  request: { params: z.object({ id: z.string() }) },
  responses: { 202: { description: "Re-queued" }, 404: errorResponse },
});

const bearerOrApiKeySecurity: Record<string, string[]>[] = [{ BearerAuth: [] }, { ApiKeyAuth: [] }];

registry.registerPath({
  method: "get",
  path: "/logs/search",
  tags: ["Logs"],
  summary: "Full-text + filtered search over the caller's tenant's request logs",
  security: bearerOrApiKeySecurity,
  responses: { 200: { description: "Search results" }, 400: errorResponse },
});

registry.registerPath({
  method: "get",
  path: "/logs/aggregate",
  tags: ["Logs"],
  summary: "Top routes, or error rate over time (window=), within the caller's tenant",
  security: bearerOrApiKeySecurity,
  responses: { 200: { description: "Aggregation results" }, 400: errorResponse },
});

registry.registerPath({
  method: "get",
  path: "/proxy/{tenantSlug}/{path}",
  tags: ["Proxy"],
  summary: "Proxy a request through to the tenant's configured upstream",
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: { description: "Upstream response (or cached response — see X-Cache header)" },
    401: errorResponse,
    404: errorResponse,
    429: errorResponse,
  },
});
