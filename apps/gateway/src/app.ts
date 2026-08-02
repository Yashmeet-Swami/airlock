import cors from "cors";
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env.js";
import { correlationId } from "./middleware/correlationId.js";
import { authErrorHandler, authRouter } from "./auth/auth.routes.js";
import { tenantsRouter } from "./admin/tenants.controller.js";
import { apiKeysRouter } from "./admin/apiKeys.controller.js";
import { routesRouter } from "./admin/routes.controller.js";
import { rateLimitPoliciesRouter } from "./admin/rateLimitPolicies.controller.js";
import { cacheRouter } from "./admin/cache.controller.js";
import { webhooksRouter } from "./admin/webhooks.controller.js";
import { auditLogRouter } from "./admin/auditLog.controller.js";
import { logsRouter } from "./analytics/logs.controller.js";
import { healthRouter } from "./health/health.routes.js";
import { registry } from "./observability/metrics.js";
import { proxyRouter } from "./proxy/proxy.routes.js";
import { openApiDocument } from "./openapi/document.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ALLOWED_ORIGINS.length > 0 ? env.CORS_ALLOWED_ORIGINS : true,
    }),
  );
  app.use(correlationId);
  app.use(express.json());

  app.use("/health", healthRouter);

  // Unauthenticated (§22.1) — scraped from inside the docker network, never
  // exposed publicly.
  app.get("/metrics", async (_req, res) => {
    res.setHeader("content-type", registry.contentType);
    res.status(200).send(await registry.metrics());
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get("/openapi.json", (_req, res) => {
    res.status(200).json(openApiDocument);
  });

  app.use("/auth", authRouter);
  app.use("/admin/tenants", tenantsRouter);
  app.use("/admin/routes", routesRouter);
  app.use("/admin/api-keys", apiKeysRouter);
  app.use("/admin/rate-limit-policies", rateLimitPoliciesRouter);
  app.use("/admin/cache", cacheRouter);
  app.use("/admin/webhooks", webhooksRouter);
  app.use("/admin/audit-log", auditLogRouter);
  app.use("/logs", logsRouter);
  app.use("/proxy", proxyRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use(authErrorHandler);

  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    req.log?.error({ err }, "unhandled_error");
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
