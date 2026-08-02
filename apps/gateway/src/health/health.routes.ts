import { Router } from "express";
import { pool } from "../db/client.js";
import { redis } from "../redis/client.js";

export const healthRouter = Router();

healthRouter.get("/liveness", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

healthRouter.get("/readiness", async (_req, res) => {
  const [dbOk, redisOk] = await Promise.all([
    pool
      .query("SELECT 1")
      .then(() => true)
      .catch(() => false),
    redis
      .ping()
      .then(() => true)
      .catch(() => false),
  ]);

  if (dbOk && redisOk) {
    res.status(200).json({ status: "ok", database: "ok", redis: "ok" });
    return;
  }

  res.status(503).json({ status: "unavailable", database: dbOk ? "ok" : "down", redis: redisOk ? "ok" : "down" });
});
