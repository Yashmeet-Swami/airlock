import { pinoHttp } from "pino-http";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../observability/logger.js";

/**
 * Binds a per-request child logger to X-Request-Id (read if present, generated
 * otherwise) so every log line for a request — including ones written later by
 * BullMQ workers processing that request's events, once Phase 3 lands — can be
 * correlated by a single id. See blueprint §19.1/§19.2.
 */
export const correlationId = pinoHttp({
  logger,
  genReqId: (req: Request, res: Response) => {
    const existing = req.headers["x-request-id"];
    const id = (Array.isArray(existing) ? existing[0] : existing) ?? uuidv4();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  customProps: (req) => ({ requestId: (req as Request).id }),
});
