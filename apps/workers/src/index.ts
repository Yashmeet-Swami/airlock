import { startWebhookDeliveryWorker } from "./webhookDelivery.worker.js";
import { logger } from "./observability/logger.js";

startWebhookDeliveryWorker();
logger.info("airlock workers: webhook delivery worker started");
