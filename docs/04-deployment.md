# Deployment

## Target

| Piece | Where | Plan | Why |
|-------|-------|------|-----|
| API + web build | Render, one Web Service | Free | WebSocket supported, deploys from GitHub on push, zero ops |
| Database | Neon PostgreSQL | Free | Persistent, not deleted after 30 days (Render's free Postgres is), wakes in about half a second |
| Static frontend | Served by the API process (`express.static` + SPA fallback) | included | One origin: cookies with `sameSite=strict`, WebSocket, and API share the host, no CORS in production |

Production URL shape: `https://stockdesk.onrender.com` serves `/` (web), `/api/v1/*`, and `/ws`.

## Free-tier constraints and how the code copes

| Constraint | Effect | Mitigation in the spec |
|------------|--------|------------------------|
| Render free service sleeps after 15 minutes without HTTP traffic | Cold start 30 to 60 s on the next request; WebSocket connections drop; background jobs stop while asleep | Web client reconnects with backoff (Module 2). Snapshot job writes one snapshot immediately at boot and the equity chart tolerates gaps (Module 2). Order expiry job runs at boot and expires anything past due (Module 4). Resting orders cannot fill while asleep; documented as a demo limitation. |
| Ephemeral disk on Render | Anything written to disk is lost on restart | No file storage anywhere. Database is external. |
| 512 MB RAM, shared CPU | Memory-heavy work fails | Candle cache in Postgres, not memory. Quote throttling. In-memory maps bounded by subscription limits. |
| Neon compute autosuspends after 5 minutes idle | First query after idle takes about 500 ms | Acceptable. Use the pooled connection string for the app, the direct string for migrations. |
| Neon free storage 0.5 GB | Snapshots and candles grow | Retention policies in Module 2 (snapshots) and a candle cap per symbol and timeframe (Module 3, 5000 rows) enforced by the daily thinning job. |
| Render free build minutes are limited | Long builds burn the quota | Single `npm ci` at the root, build only `packages/shared`, `apps/web`, `apps/api`. |

## Environments

| Name | Database | How it runs |
|------|----------|-------------|
| `development` | Postgres 16 in Docker Compose, database `stockdesk` | `docker compose up -d`, `npm run dev` |
| `test` | Same container, database `stockdesk_test` | Vitest, each run migrates and truncates |
| `e2e` | Same container, database `stockdesk_e2e` | Playwright (`npm run e2e`), the global setup migrates and truncates, the config starts the API and the Vite dev server |
| `production` | Neon | Render Web Service |

`docker-compose.yml` at the repository root starts Postgres with all three databases (see `infra/postgres/init.sql`). Named volume, no bind mount, so nothing lands in the repository.

## Environment variables

Read once and validated with zod in `apps/api/src/lib/config.ts`. Documented by name in `.env.example`, values only in `.env` locally and in the Render dashboard in production. Never in git.

```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://stockdesk:stockdesk@localhost:5432/stockdesk
DIRECT_URL=postgresql://stockdesk:stockdesk@localhost:5432/stockdesk
DATABASE_URL_TEST=postgresql://stockdesk:stockdesk@localhost:5432/stockdesk_test
DATABASE_URL_E2E=postgresql://stockdesk:stockdesk@localhost:5432/stockdesk_e2e
JWT_ACCESS_SECRET=
JWT_ACCESS_TTL=15m
REFRESH_TOKEN_TTL_DAYS=7
REFRESH_TOKEN_PRUNE_INTERVAL_MINUTES=60
CORS_ORIGIN=http://localhost:5173
WEB_DIST_DIR=../web/dist
TRUST_PROXY_HOPS=0
SNAPSHOT_INTERVAL_SECONDS=60
SNAPSHOT_FINE_RETENTION_DAYS=7
MARKET_DATA_PROVIDERS=alpaca,finnhub,simulated
ALPACA_API_KEY=
ALPACA_API_SECRET=
ALPACA_DATA_FEED=iex
FINNHUB_API_KEY=
COMMISSION_PER_ORDER=0.00
MARKET_ORDER_BUFFER=0.02
SHORT_MARGIN_RATE=0.5
MAINTENANCE_MARGIN_RATE=0.3
QUANTITY_DECIMALS=6
TRANSFER_LIMIT=1000000.00
```

In production `DATABASE_URL` is the Neon pooled string (`-pooler` host) and `DIRECT_URL` the direct one; Prisma uses `directUrl` for migrations. The local development values above are for the Docker container only and are not secrets. `CORS_ORIGIN` is unused in production because web and API share an origin. `TRUST_PROXY_HOPS` defaults to 1 in production and 0 elsewhere, so the auth rate limit keys on the client address behind Render's single proxy hop; `render.yaml` sets it explicitly to 1.

## Render service

Defined in `render.yaml` at the repository root (Render Blueprint), created with the Module 1 scaffold:

- Type: Web Service, runtime Node 20, plan free, region Frankfurt.
- Build command: `npm ci && npm run build`
  (root script builds `packages/shared`, then `apps/web`, then `apps/api`, and runs `prisma generate`).
- Pre-deploy command: `npm run db:migrate:deploy` (`prisma migrate deploy` with `DIRECT_URL`).
- Start command: `npm run start --workspace @stockdesk/api` (`node apps/api/dist/server.js`).
- Health check path: `/api/v1/health` (returns `200 { "status": "ok", "database": "ok", "marketData": ["simulated"] }`; `503` when the database is unreachable).
- Environment variables set in the Render dashboard; `render.yaml` lists them with `sync: false` so values never enter git.
- Auto-deploy on push to `main`.

## Web build served by the API

- `apps/web` builds to `apps/web/dist`. In production the API mounts it with `express.static` and serves `index.html` for any non-`/api`, non-`/ws` route (SPA fallback), with `Cache-Control: immutable` for hashed assets and `no-cache` for `index.html`.
- In development Vite runs on 5173 and proxies `/api` and `/ws` to 3000 (same-origin from the browser's point of view).
- The web app uses relative URLs (`/api/v1`, `/ws`) in both environments, so no runtime configuration is needed.

## Release checklist

1. `npm run lint && npm test -- --run` green locally.
2. `/module-review <module>` PASS for every module marked `implemented`.
3. Migration reviewed: `prisma migrate diff` shows only the intended change; no destructive statement without a written note in the pull request.
4. Push to `main`; Render builds, runs `prisma migrate deploy`, starts, health check passes.
5. Smoke test on the production URL: register, deposit, open a symbol page, place a simulated order.

## Not covered

Custom domain, CDN in front of the API, log aggregation, uptime monitoring, backups beyond Neon's built-in point-in-time restore. Each is a backlog item.
