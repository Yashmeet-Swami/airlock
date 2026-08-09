import { useEffect, useState } from "react";
import type { TrafficEvent } from "@airlock/shared-types";
import { PageHeader } from "../components/layout/index.js";
import { Badge, EmptyState, TBody, TD, TH, THead, TR, Table, type StatusTone } from "../components/ui/index.js";
import { useAuth } from "../lib/auth.js";
import { API_PREFIX } from "../lib/apiClient.js";

const MAX_EVENTS = 100;

const OUTCOME_TONE: Record<TrafficEvent["outcome"], StatusTone> = {
  completed: "good",
  failed: "critical",
  rate_limited: "warning",
  circuit_open: "critical",
};

// Native EventSource can't set an Authorization header, so the JWT travels
// via ?token= instead (see gateway realtime/traffic.routes.ts).
export function LiveTrafficPage() {
  const { accessToken } = useAuth();
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const source = new EventSource(`${API_PREFIX}/realtime/traffic?token=${encodeURIComponent(accessToken)}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e: MessageEvent<string>) => {
      const event = JSON.parse(e.data) as TrafficEvent;
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    };
    return () => source.close();
  }, [accessToken]);

  return (
    <div>
      <PageHeader
        title="Live Traffic"
        description="Streaming proxied requests as they happen."
        action={<Badge tone={connected ? "good" : "critical"}>{connected ? "Connected" : "Disconnected"}</Badge>}
      />

      {events.length === 0 ? (
        <EmptyState
          title="Waiting for traffic"
          description="Proxy a request through one of your routes to see it appear here live."
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Timestamp</TH>
              <TH>Route</TH>
              <TH>Method</TH>
              <TH>Status</TH>
              <TH>Latency</TH>
              <TH>Cache</TH>
              <TH>Outcome</TH>
            </tr>
          </THead>
          <TBody>
            {events.map((e, i) => (
              <TR key={`${e.requestId}-${i}`}>
                <TD className="whitespace-nowrap text-ink-secondary">{new Date(e.timestamp).toLocaleTimeString()}</TD>
                <TD className="font-mono text-xs">{e.route}</TD>
                <TD>{e.method ?? "-"}</TD>
                <TD className="tabular-nums">{e.statusCode ?? "-"}</TD>
                <TD className="tabular-nums">{e.latencyMs ?? "-"} ms</TD>
                <TD>{e.cacheHit ? <Badge tone="good">HIT</Badge> : <Badge tone="neutral">MISS</Badge>}</TD>
                <TD>
                  <Badge tone={OUTCOME_TONE[e.outcome]}>{e.outcome}</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
