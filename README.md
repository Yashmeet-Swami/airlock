# Airlock

[![CI](https://github.com/Yashmeet-Swami/airlock/actions/workflows/ci.yml/badge.svg)](https://github.com/Yashmeet-Swami/airlock/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A self-hosted, multi-tenant API Gateway & Developer Platform: reverse proxy
routing, JWT + API-key auth, Redis-backed rate limiting/caching, async
webhooks (BullMQ), OpenSearch-powered log search/analytics, a per-upstream
circuit breaker, Prometheus/Grafana observability, and MinIO-backed request
archival/replay + exports — built in six incremental, independently
tested/committed phases (see Status below).

## Status

**Phase 1 — Foundation** (blueprint §24.2) is implemented: reverse proxy routing,
tenant/user model, JWT admin auth with refresh rotation, API-key issuance, route
CRUD, and OpenAPI/Swagger docs.

**Phase 2 — Redis: Caching & Rate Limiting** (blueprint §24.3) is implemented:
atomic token-bucket rate limiting (Redis Lua script, per-route/tenant-wide/fallback
policy resolution, `X-RateLimit-*`/`Retry-After` headers), cache-aside response
caching (`X-Cache: HIT|MISS`, explicit `/admin/cache/invalidate` + automatic
invalidation on route update), and a Redis-backed API-key validation cache with
immediate revocation busting.

**Phase 3 — Async: BullMQ, Workers, Webhooks** (blueprint §24.4) is implemented:
a separate `apps/workers` service consuming a BullMQ `webhooks` queue, tenant
webhook subscriptions (`/admin/webhooks`), HMAC-SHA256-signed delivery
(`X-Airlock-Signature: t=<unix>,v1=<hmac>` — see below), self-managed
retry/backoff matching §10.3's schedule (1s/5s/30s/2m/10m + jitter), a dead
letter state per delivery, and manual replay (`/admin/webhooks/deliveries/:id/replay`).
Only `rate_limit.exceeded` is wired as a dispatchable event so far — see the
Phase 3 plan for why the rest of the event catalog waits for the phases that
actually consume it.

**Phase 4 — Search: OpenSearch, Log Explorer, Analytics** (blueprint §24.5) is
implemented: every proxied request (`request.completed`/`.failed`) and every
`rate_limit.exceeded` event is indexed into a daily OpenSearch index
(`airlock-requests-{yyyy.MM.dd}`, §11.1's mapping exactly), via a second
`apps/workers` consumer (`logIndexer.worker.ts`) reading a new `requests`
BullMQ queue. `GET /logs/search` (full-text + filtered, tenant-scoped) and
`GET /logs/aggregate` (top routes / error-rate-over-time, also tenant-scoped)
sit on top of it, callable with either a dashboard JWT (any role) or an API
key carrying `read:logs`. A first, deliberately minimal `apps/dashboard`
(Vite + React, unstyled — see the backend-first policy below) adds a login
page and a Log Explorer table over `/logs/search`.

**Phase 5 — Resilience & Metrics** (blueprint §24.6) is implemented: a
per-upstream-origin circuit breaker (Redis Lua state machine — closed → open
past a configurable failure rate → half-open probe → closed/open again),
retries in the forwarder (idempotent methods or an `Idempotency-Key` header,
exponential backoff + jitter), Prometheus metrics (`GET /metrics` on the
gateway; a new minimal HTTP server on `apps/workers` exposing its own
`/metrics` + `/health`), `/health` split into `/health/liveness` and
`/health/readiness` (the latter checking Postgres + Redis), and an
`audit_log` table + `GET /admin/audit-log` recording every mutating admin
endpoint. Prometheus + Grafana ship in docker-compose, provisioned with one
dashboard (Traffic Overview: requests/sec, error rate, latency percentiles,
cache hit rate).

**Phase 6 — Advanced: Replay, Exports, Realtime, Hardening** (blueprint
§24.7) is implemented: every `request.completed`/`.failed` event now archives
its request/response (headers + size-capped bodies, auth headers redacted)
to MinIO as part of the same log-indexing job
(`request-archives/{tenant}/{yyyy}/{MM}/{dd}/{requestId}.json.gz`);
`POST /admin/replay/:requestId` looks the request up in OpenSearch, fetches
its archive, and re-issues it through the same `forwardRequest` used for live
traffic; `POST /analytics/export` runs the same filters as `/logs/search`,
formats matching hits as CSV/NDJSON, and returns a presigned MinIO URL;
`GET /realtime/traffic` streams live proxied-request events over SSE
(auth via `?token=`, since `EventSource` can't set headers) and the dashboard
gained a Live Traffic page; and routes are now checked against a
private/link-local/loopback IP blocklist unless the owning tenant has
explicitly opted in via `tenants.allow_internal_upstreams` (owner-only,
`PATCH /admin/tenants/:id`).

**A note on the dashboard.** Airlock is intentionally backend-first: each
backend phase gets only the bare-minimum UI needed to verify/manage what it
built (no styling, no UX polish) until a dedicated later phase expands the
whole thing into a proper developer-experience UI. `apps/dashboard` today has
exactly three pages — login, Log Explorer, and Live Traffic — and nothing more.

### Verifying a webhook signature

Every delivery includes an `X-Airlock-Signature: t=<unix seconds>,v1=<hex hmac>`
header (Stripe-style) and an `X-Airlock-Event` header. To verify:

```
expected = HMAC-SHA256(secret, `${t}.${rawRequestBody}`)
compare `expected` to `v1` using a constant-time comparison
```

Reject the request if the signature doesn't match, or if `t` is too far from
the current time (replay defense, §21.1).

## Quickstart

```bash
npm install
npm run dev
```

This brings up Postgres, Redis, OpenSearch, MinIO, Prometheus, Grafana, the
gateway, the workers service (webhook delivery + log indexing), the
dashboard, and a small `mock-upstream` fixture service via Docker Compose,
running migrations automatically. Once healthy:

- Gateway: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- Dashboard: http://localhost:5173
- OpenSearch: http://localhost:9200
- Mock upstream: http://localhost:4000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3300 (admin/admin, or browse anonymously as a viewer)
- MinIO console: http://localhost:9001 (airlock-minio/airlock-minio-secret)

Stop everything with `npm run dev:down`.

### Try it end-to-end

```bash
# 1. Register a tenant + owner user
curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"tenantName":"acme-corp","email":"owner@acme.test","password":"hunter22222"}'
# => { accessToken, refreshToken, user }

# 2. Create a route pointing at the mock upstream
curl -s -X POST http://localhost:3000/admin/routes \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"pathPattern":"/v1/payments","upstreamUrl":"http://mock-upstream:4000","methods":["GET"]}'

# 3. Issue an API key
curl -s -X POST http://localhost:3000/admin/api-keys \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"scopes":["proxy:invoke"]}'
# => { rawKey: "gk_live_..." }

# 4. Call the proxied route
curl -s http://localhost:3000/proxy/acme-corp/v1/payments -H "X-API-Key: <rawKey>"

# 5. (Phase 2) Set a tight rate limit and watch it kick in
curl -s -X POST http://localhost:3000/admin/rate-limit-policies \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"routeId":"<routeId>","limitCount":3,"windowSeconds":10}'
# hammer /proxy/acme-corp/v1/payments a few times — the 4th within the window gets 429 + Retry-After

# 6. (Phase 2) Mark a route cacheable and see X-Cache flip from MISS to HIT
curl -s -i http://localhost:3000/proxy/acme-corp/v1/payments | grep -i x-cache

# 7. (Phase 4) Search the request you just made (indexing is async — give it a second)
curl -s "http://localhost:3000/logs/search?route=/v1/payments" -H "Authorization: Bearer <accessToken>"

# 8. (Phase 4) See it show up in the per-route aggregate too
curl -s "http://localhost:3000/logs/aggregate" -H "Authorization: Bearer <accessToken>"

# 9. (Phase 5) Watch the circuit breaker trip against a route pointed at
#    something that always fails, then curl /metrics and see it flip:
curl -s http://localhost:3000/metrics | grep airlock_circuit_breaker_state

# 10. (Phase 5) See your own mutations show up in the audit log
curl -s http://localhost:3000/admin/audit-log -H "Authorization: Bearer <accessToken>"

# 11. (Phase 6) Replay an archived request (indexing + archival are async — give it a second)
curl -s -X POST "http://localhost:3000/admin/replay/<requestId>" -H "Authorization: Bearer <accessToken>"

# 12. (Phase 6) Export matching logs and download via the presigned URL
curl -s -X POST http://localhost:3000/analytics/export \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"format":"csv"}'

# 13. (Phase 6) Watch live traffic over SSE (the dashboard's Live Traffic page does this too)
curl -N "http://localhost:3000/realtime/traffic?token=<accessToken>"
```

## Development

- `npm run build` — type-check every workspace (`tsc --noEmit`)
- `npm run lint` — ESLint across the monorepo
- `npm test` — runs each workspace's own suite; `gateway` and `workers` each spin
  up their own throwaway Postgres + Redis + OpenSearch containers via Docker
  (requires Docker to be running; OpenSearch is JVM-based and noticeably
  slower to boot than Postgres/Redis) — `workers`' harness runs gateway's
  migrations against its own container since gateway owns the schema
- `npm run migrate` — apply pending Postgres migrations to whatever
  `DATABASE_URL` currently points at
- `npm run test:load --workspace=@airlock/gateway` — best-effort k6 load test
  (blueprint §24.7) against the live docker-compose stack; not part of `npm
  test` or any CI gate — see `apps/gateway/test/load/rateLimit.k6.js`

## Layout

See blueprint §23 for the full rationale. Summary: `apps/*` are independently
deployable services (`gateway`, `workers` — BullMQ webhook delivery + log
indexing, `dashboard` — minimal Vite+React admin UI, `mock-upstream` — a
dev/test fixture, not a shipped product), `packages/*` is code shared between
apps (`shared-types`), and `infra/` holds Docker/monitoring config.
