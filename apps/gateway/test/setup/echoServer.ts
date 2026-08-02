import http from "node:http";
import type { AddressInfo } from "node:net";

export interface EchoServer {
  url: string;
  close: () => Promise<void>;
}

/** Minimal in-process stand-in for the mock-upstream fixture, used so proxy
 *  integration tests don't depend on the separate mock-upstream container. */
export function startEchoServer(): Promise<EchoServer> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ echo: true, method: req.method, path: req.url, body: body || null }));
      });
    });

    server.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
