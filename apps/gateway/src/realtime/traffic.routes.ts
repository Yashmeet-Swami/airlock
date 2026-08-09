import { Router } from "express";
import { redis } from "../redis/client.js";
import { verifyAccessToken } from "../security/jwt.js";

export const realtimeRouter = Router();

const HEARTBEAT_MS = 20_000;

// §21.1/Phase 6 plan scope decision #4: native EventSource cannot set custom
// request headers, so auth travels via ?token= instead of Authorization —
// a documented trade-off (the token can land in access logs/browser history)
// rather than a shortcut around auth entirely.
realtimeRouter.get("/traffic", async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!token) {
    res.status(401).json({ error: "unauthorized", message: "Missing token query parameter" });
    return;
  }

  let tenantId: string;
  try {
    tenantId = verifyAccessToken(token).tenantId;
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  // writeHead alone doesn't push headers onto the socket — Node buffers them
  // until the first res.write()/res.end(). Without an explicit flush (or an
  // immediate write), the client sees nothing at all until the first pub/sub
  // message or the next heartbeat, which is 20s away — EventSource reports
  // that as a dropped/failed connection, not a slow-but-open one.
  res.flushHeaders();
  res.write(": connected\n\n");

  // A dedicated connection: once an ioredis client issues SUBSCRIBE it can
  // only run pub/sub commands, so it can't be the shared client used elsewhere.
  const subscriber = redis.duplicate();
  await subscriber.subscribe(`realtime:traffic:${tenantId}`);
  subscriber.on("message", (_channel, message) => {
    res.write(`data: ${message}\n\n`);
  });

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    void subscriber.unsubscribe();
    subscriber.disconnect();
  });
});
