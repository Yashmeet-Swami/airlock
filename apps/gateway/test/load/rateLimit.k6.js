// Best-effort load test (Phase 6 plan, scope decision #6) — not part of the
// regular test suite or a CI gate. Run against the live docker-compose stack:
//
//   docker network ls                     # find the compose network name
//   npm run test:load -- <network-name>   # defaults to "docker_default"
//
// or directly:
//   docker run --rm --network docker_default -i grafana/k6 run - < test/load/rateLimit.k6.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://gateway:3000";
const LIMIT_COUNT = 100;
const WINDOW_SECONDS = 10;

export const options = {
  scenarios: {
    burst: {
      executor: "constant-vus",
      vus: 50,
      duration: "20s",
    },
  },
};

export function setup() {
  const tenantName = `k6-load-${Date.now()}`;
  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ tenantName, email: `owner@${tenantName}.test`, password: "hunter22222" }),
    { headers: { "content-type": "application/json" } },
  );
  const accessToken = registerRes.json("accessToken");
  const authHeaders = { headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` } };

  http.post(
    `${BASE_URL}/admin/routes`,
    JSON.stringify({
      pathPattern: "/echo",
      upstreamUrl: "http://mock-upstream:4000",
      methods: ["GET"],
      authRequired: false,
    }),
    authHeaders,
  );

  http.post(
    `${BASE_URL}/admin/rate-limit-policies`,
    JSON.stringify({ routeId: null, limitCount: LIMIT_COUNT, windowSeconds: WINDOW_SECONDS }),
    authHeaders,
  );

  return { tenantName };
}

export default function (data) {
  const res = http.get(`${BASE_URL}/proxy/${data.tenantName}/echo`);
  check(res, {
    "status is 200 or 429 (rate limiter enforces, never errors)": (r) => r.status === 200 || r.status === 429,
    "never a 5xx": (r) => r.status < 500,
  });
  sleep(0.05);
}
