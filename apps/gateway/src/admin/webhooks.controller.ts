import { Router } from "express";
import { z } from "zod";
import type { WebhookDeliveryJobData, WebhookDeliveryStatus, WebhookEventName } from "@airlock/shared-types";
import { jwtUserId, requireJwtAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/authorize.js";
import { recordAudit } from "../audit/recordAudit.js";
import { withTenantScope } from "../db/client.js";
import { createWebhook, deleteWebhook, findWebhookById, listWebhooks } from "../db/webhooks.repo.js";
import { findDeliveryById, listDeliveries, resetForReplay } from "../db/webhookDeliveries.repo.js";
import { webhooksQueue } from "../events/publisher.js";
import { generateRawSecret } from "../security/hash.js";
import { paramString } from "../utils/params.js";

export const webhooksRouter = Router();

const EVENT_NAMES: [WebhookEventName, ...WebhookEventName[]] = ["rate_limit.exceeded", "breaker.opened"];
const DELIVERY_STATUSES: [WebhookDeliveryStatus, ...WebhookDeliveryStatus[]] = [
  "queued",
  "retrying",
  "delivered",
  "dead_lettered",
];

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.enum(EVENT_NAMES)).min(1),
});

webhooksRouter.post("/", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const parsed = createWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "validation_error", details: parsed.error.flatten() });
    return;
  }

  const scope = withTenantScope(req.auth!.tenantId);
  const secret = generateRawSecret();
  const webhook = await createWebhook(scope, parsed.data.url, parsed.data.events, secret);
  recordAudit(req.auth!.tenantId, jwtUserId(req), "webhook.created", "webhook", webhook.id, {
    url: parsed.data.url,
    events: parsed.data.events,
  });
  res.status(201).json(webhook);
});

webhooksRouter.get("/", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const webhooks = await listWebhooks(scope);
  res.status(200).json(webhooks);
});

webhooksRouter.delete("/:id", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const webhookId = paramString(req.params.id);
  const deleted = await deleteWebhook(scope, webhookId);
  if (!deleted) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  recordAudit(req.auth!.tenantId, jwtUserId(req), "webhook.deleted", "webhook", webhookId);
  res.status(204).send();
});

webhooksRouter.get("/:id/deliveries", requireJwtAuth, requireRole("viewer"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const webhookId = paramString(req.params.id);

  const webhook = await findWebhookById(scope, webhookId);
  if (!webhook) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  const statusParsed = z.enum(DELIVERY_STATUSES).optional().safeParse(req.query.status);
  if (!statusParsed.success) {
    res.status(400).json({ error: "validation_error", message: "Invalid status filter" });
    return;
  }

  const deliveries = await listDeliveries(scope, webhookId, statusParsed.data);
  res.status(200).json(deliveries);
});

// §10.5: DeadLettered -> Processing on manual replay.
webhooksRouter.post("/deliveries/:id/replay", requireJwtAuth, requireRole("admin"), async (req, res) => {
  const scope = withTenantScope(req.auth!.tenantId);
  const deliveryId = paramString(req.params.id);

  const delivery = await findDeliveryById(scope, deliveryId);
  if (!delivery) {
    res.status(404).json({ error: "not_found" });
    return;
  }

  await resetForReplay(deliveryId);

  const jobData: WebhookDeliveryJobData = {
    deliveryId: delivery.id,
    webhookId: delivery.webhookId,
    eventId: delivery.eventId,
    eventName: delivery.eventName,
    payload: delivery.payload as never,
    attemptNumber: 1,
  };
  await webhooksQueue.add(delivery.eventName, jobData, { jobId: `${delivery.id}-replay-${Date.now()}` });

  res.status(202).json({ ...delivery, status: "queued", attemptCount: 0 });
});
