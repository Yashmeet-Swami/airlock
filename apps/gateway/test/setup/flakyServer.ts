import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FlakyServer {
  url: string;
  callCount: () => number;
  close: () => Promise<void>;
}

/** Always responds with `status` — a deterministically failing upstream for
 *  exercising forwarder retries and circuit-breaker trip/recovery. */
export function startFlakyServer(status: number): Promise<FlakyServer> {
  return new Promise((resolve) => {
    let calls = 0;
    const server = http.createServer((req, res) => {
      calls += 1;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false }));
    });

    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        callCount: () => calls,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
