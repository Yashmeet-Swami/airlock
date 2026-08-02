import { startWebhookDeliveryWorker } from "./webhookDelivery.worker.js";
import { startLogIndexerWorker } from "./logIndexer.worker.js";
import { logger } from "./observability/logger.js";

startWebhookDeliveryWorker();
startLogIndexerWorker();
logger.info("airlock workers: webhook delivery + log indexer workers started");
