import { useEffect, useState } from "react";

interface TrafficEvent {
  requestId: string;
  route: string;
  method: string | null;
  statusCode: number | null;
  latencyMs: number | null;
  cacheHit: boolean;
  outcome: "completed" | "failed" | "rate_limited" | "circuit_open";
  timestamp: string;
}

const MAX_EVENTS = 100;

// Native EventSource can't set an Authorization header, so the JWT travels
// via ?token= instead (see gateway realtime/traffic.routes.ts).
export function LiveTraffic({ accessToken }: { accessToken: string }) {
  const [events, setEvents] = useState<TrafficEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/realtime/traffic?token=${encodeURIComponent(accessToken)}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      const event = JSON.parse(e.data) as TrafficEvent;
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS));
    };
    return () => source.close();
  }, [accessToken]);

  return (
    <div>
      <h1>Live Traffic {connected ? "(connected)" : "(disconnected)"}</h1>
      <table border={1} cellPadding={4}>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Route</th>
            <th>Method</th>
            <th>Status</th>
            <th>Latency (ms)</th>
            <th>Cache</th>
            <th>Outcome</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => (
            <tr key={`${e.requestId}-${i}`}>
              <td>{e.timestamp}</td>
              <td>{e.route}</td>
              <td>{e.method ?? "-"}</td>
              <td>{e.statusCode ?? "-"}</td>
              <td>{e.latencyMs ?? "-"}</td>
              <td>{e.cacheHit ? "HIT" : "MISS"}</td>
              <td>{e.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
