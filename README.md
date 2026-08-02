# Airlock

A self-hosted, multi-tenant API Gateway & Developer Platform. See
[`docs/AIRLOCK_PROJECT_BLUEPRINT.md`](docs/AIRLOCK_PROJECT_BLUEPRINT.md) for the
full design doc, architecture, and phase-by-phase roadmap.

## Status

**Phase 1 — Foundation** (blueprint §24.2) is implemented: reverse proxy routing,
tenant/user model, JWT admin auth with refresh rotation, API-key issuance, route
CRUD, and OpenAPI/Swagger docs.

Everything else (Redis caching/rate limiting, BullMQ workers/webhooks, OpenSearch
log search, Prometheus/Grafana, circuit breaker, MinIO archival/replay) is future
work per the phase plan.

## Quickstart

```bash
npm install
npm run dev
```

This brings up Postgres, the gateway, and a small `mock-upstream` fixture service
via Docker Compose, running migrations automatically. Once healthy:

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
```

## Development

- `npm run build` — type-check every workspace (`tsc --noEmit`)
- `npm run lint` — ESLint across the monorepo
- `npm test` — unit + integration tests (spins up a throwaway Postgres container
  via Docker; requires Docker to be running)
- `npm run migrate` — apply pending Postgres migrations to whatever
  `DATABASE_URL` currently points at

## Layout

See blueprint §23 for the full rationale. Summary: `apps/*` are independently
deployable services (`gateway`, `mock-upstream` — a dev/test fixture, not a
shipped product), `packages/*` is code shared between apps (currently just
`shared-types`), and `infra/` holds Docker/monitoring config.
