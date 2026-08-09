import type { TrafficEvent } from "@airlock/shared-types";
import { redis } from "../redis/client.js";

/** Fire-and-forget, same rationale as events/publisher.ts and requestLogger.ts —
 *  the live-traffic feed is a nice-to-have view, never something the request
 *  path should wait on or fail because of. */
export function publishTrafficEvent(tenantId: string, event: TrafficEvent): void {
  void redis.publish(`realtime:traffic:${tenantId}`, JSON.stringify(event)).catch(() => undefined);
}
