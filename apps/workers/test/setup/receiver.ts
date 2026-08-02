import http from "node:http";
import type { AddressInfo } from "node:net";

export interface ReceivedRequest {
  body: string;
  headers: http.IncomingHttpHeaders;
}

export interface Receiver {
  url: string;
  requests: ReceivedRequest[];
  /** Requests numbered <= this fail with a 500; anything after succeeds. Can be
   *  changed mid-test (e.g. to simulate "the receiver came back up"). */
  setFailCount: (count: number) => void;
  close: () => Promise<void>;
}

/** failCount requests get a 500; every request after that gets a 200. */
export function startReceiver(failCount = 0): Promise<Receiver> {
  return new Promise((resolve) => {
    const requests: ReceivedRequest[] = [];
    let count = 0;
    let currentFailCount = failCount;

    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        requests.push({ body, headers: req.headers });
        count += 1;
        if (count <= currentFailCount) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "simulated_failure" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        setFailCount: (n: number) => {
          currentFailCount = n;
        },
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
