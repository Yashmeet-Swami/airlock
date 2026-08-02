import { createServer } from "node:http";
import { env } from "../config/env.js";
import { logger } from "./logger.js";
import { registry } from "./metrics.js";

/** Workers has no Express dependency and no other HTTP surface — a bare
 *  http.Server for the one /metrics route (plus /health) is simpler than
 *  pulling in a framework for this alone. */
export function startMetricsServer() {
  const server = createServer((req, res) => {
    if (req.url === "/metrics") {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { "content-type": registry.contentType });
          res.end(body);
        })
        .catch((err) => {
          logger.error({ err }, "metrics_collection_failed");
          res.writeHead(500);
          res.end();
        });
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    res.writeHead(404);
    res.end();
  });

  server.listen(env.METRICS_PORT, () => {
    logger.info({ port: env.METRICS_PORT }, "workers_metrics_server_listening");
  });

  return server;
}
