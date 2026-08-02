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

Everything else (OpenSearch log search, Prometheus/Grafana, circuit breaker,
MinIO archival/replay) is future work per the phase plan.

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

This brings up Postgres, Redis, the gateway, the webhook delivery worker, and a
small `mock-upstream` fixture service via Docker Compose, running migrations
automatically. Once healthy:

- Gateway: http://localhost:3000
- Swagger UI: http://localhost:3000/docs
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
```

## Development

- `npm run build` — type-check every workspace (`tsc --noEmit`)
- `npm run lint` — ESLint across the monorepo
- `npm test` — runs each workspace's own suite; `gateway` and `workers` each spin
  up their own throwaway Postgres + Redis containers via Docker (requires Docker
  to be running) — `workers`' harness runs gateway's migrations against its own
  container since gateway owns the schema
- `npm run migrate` — apply pending Postgres migrations to whatever
  `DATABASE_URL` currently points at

## Layout

See blueprint §23 for the full rationale. Summary: `apps/*` are independently
deployable services (`gateway`, `workers` — the BullMQ webhook delivery
consumer, `mock-upstream` — a dev/test fixture, not a shipped product),
`packages/*` is code shared between apps (`shared-types`), and `infra/` holds
Docker/monitoring config.
