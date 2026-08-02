# Airlock

A self-hosted, multi-tenant API Gateway & Developer Platform. See
[`docs/AIRLOCK_PROJECT_BLUEPRINT.md`](docs/AIRLOCK_PROJECT_BLUEPRINT.md) for the
full design doc, architecture, and phase-by-phase roadmap.

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

Everything else (Prometheus/Grafana, circuit breaker, MinIO archival/replay)
is future work per the phase plan.

**A note on the dashboard.** Airlock is intentionally backend-first: each
backend phase gets only the bare-minimum UI needed to verify/manage what it
built (no styling, no UX polish) until a dedicated later phase expands the
whole thing into a proper developer-experience UI. `apps/dashboard` today has
exactly two pages — login and Log Explorer — and nothing more.

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

This brings up Postgres, Redis, OpenSearch, the gateway, the workers service
(webhook delivery + log indexing), the dashboard, and a small `mock-upstream`
fixture service via Docker Compose, running migrations automatically. Once
healthy:

- Gateway: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
- Dashboard: http://localhost:5173
- OpenSearch: http://localhost:9200
- Mock upstream: http://localhost:4000

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

## Layout

See blueprint §23 for the full rationale. Summary: `apps/*` are independently
deployable services (`gateway`, `workers` — BullMQ webhook delivery + log
indexing, `dashboard` — minimal Vite+React admin UI, `mock-upstream` — a
dev/test fixture, not a shipped product), `packages/*` is code shared between
apps (`shared-types`), and `infra/` holds Docker/monitoring config.
