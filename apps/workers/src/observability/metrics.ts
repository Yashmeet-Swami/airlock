import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const webhookDeliveryDurationMs = new Histogram({
  name: "airlock_webhook_delivery_duration_ms",
  help: "Time spent attempting a single webhook delivery, in milliseconds",
  labelNames: ["outcome"] as const,
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  registers: [registry],
});

export const webhookDlqTotal = new Counter({
  name: "airlock_webhook_dlq_total",
  help: "Webhook deliveries that exhausted all retries and were dead-lettered",
  registers: [registry],
});
