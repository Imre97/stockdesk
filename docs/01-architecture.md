# Architecture

## Decisions

| Area | Decision | Rationale |
|------|----------|-----------|
| Frontend | React 19 + Vite + TypeScript (strict) | Requested stack, fast dev loop |
| Routing | TanStack Router, file-based via `@tanstack/router-plugin` | Type-safe links and loaders, routes discoverable from folder tree |
| Client state | Zustand, one store per domain | Small API, no boilerplate, works outside React for tests |
| Server cache | TanStack Query for request/response data where caching helps | Standard fetching layer; live WS data goes to Zustand instead |
| Backend | Express 5 + TypeScript | Requested, widely known, WebSocket integration straightforward |
| Database | SQLite via Prisma | Zero infrastructure for a demo; schema portable to PostgreSQL later |
| Realtime | `ws` on server, native `WebSocket` on client | Minimal dependency, full control over protocol |
| Market data | Capability-based provider layer: Alpaca free plan (IEX real-time trade stream, historical bars, asset list), Finnhub free tier (company profile, market cap, metrics), simulated (all capabilities, offline). Composite router picks the first healthy provider per capability | Finnhub free tier has no stock candles; Alpaca covers stream and history; demo always runs without keys |
| Orders | Market, limit, stop, stop-limit; optional stop-loss and take-profit brackets as OCO children | Matches common broker order tickets |
| Charts | TradingView Lightweight Charts for both the equity curve and price charts | One library, purpose-built for finance, real-time update API, small bundle |
| UI kit | Tailwind CSS + shadcn/ui components copied into the repo | Industry standard, full control, dense trading layout, theme via CSS variables |
| Theme | light / dark / system, `.dark` class on `<html>`, pre-mount script prevents flash | Standard shadcn pattern |
| i18n | i18next + react-i18next, JSON per locale and namespace under `apps/web/src/i18n/locales/` | English and Hungarian UI; key parity enforced by test |
| Settings | Server-side `UserSettings` (language, theme, default account) with `localStorage` cache | Follows the user across devices, cache avoids first-paint flash |
| Accounts | One user owns up to 10 trading accounts; cash lives on `Account`, not `User` | Multi-account model like real brokers, enables transfers later |
| Equity history | `AccountEquitySnapshot` written every 60 s by an API job, server-side downsampling per range | Cheap, no external time-series store, drives the dashboard chart |
| Auth | JWT access token (15 min, in memory) + opaque refresh token (7 days, httpOnly cookie, rotated) | Production-style pattern, resistant to token theft via XSS |
| Validation | zod schemas in `packages/shared`, consumed by API and web | Single source of truth for request/response shapes |
| Numbers | `decimal.js` for every monetary, price, and quantity value | Native `number` rounding is unacceptable for money |
| Testing | Vitest (unit, API integration with supertest), Playwright (e2e, later) | Fast, TypeScript-native |

## Repository layout

```
stockdesk/
├── apps/
│   ├── web/                  # React app
│   │   └── src/
│   │       ├── routes/       # file-based routes, compose features, no logic
│   │       ├── components/   # pure presentational, reusable; components/ui = shadcn
│   │       ├── features/     # <domain>/{store,api,hooks,mappers}.ts + components/
│   │       ├── i18n/         # i18next setup + locales/<lang>/<namespace>.json
│   │       └── lib/          # http client, ws client, decimal helpers, router context
│   └── api/                  # Express app
│       ├── prisma/           # schema.prisma, migrations
│       └── src/
│           ├── modules/      # <domain>/{router,service,repository}.ts (+ jobs)
│           ├── middleware/
│           ├── ws/           # WebSocket server, auth handshake, channels
│           └── lib/          # config, errors, logger
├── packages/
│   └── shared/               # zod schemas, types, Decimal setup
└── docs/
```

## Runtime topology (development)

```
Browser -- http://localhost:5173 -- Vite dev server (apps/web)
   |                                    | proxy /api and /ws
   +-- WebSocket ---------------------> Express + ws (apps/api, :3000)
                                            |
                                            +-- SQLite (dev.db)
                                            +-- Market data providers (composite)
                                                 +-- Alpaca wss://stream.data.alpaca.markets/v2/iex, https://data.alpaca.markets
                                                 +-- Finnhub https://finnhub.io/api/v1 (profile, metrics)
                                                 +-- Simulated random walk
```

## Cross-cutting protocols

### HTTP API

Base path `/api/v1`. JSON only. Error envelope:

```json
{ "error": { "code": "STRING_CODE", "message": "Human readable", "details": {} } }
```

### WebSocket

Single endpoint `/ws`. First client message must be `{ "type": "auth", "token": "<accessToken>" }` within 5 seconds, otherwise the server closes with code `4001`. After auth, messages are `{ "type": string, ...payload }`. Client subscriptions use `{ "type": "subscribe" | "unsubscribe", "channel": string, ... }`. Channels so far: `account_summary` (push, Module 2), `quotes`, `bars`, `market_status` (Module 3).

### Numbers on the wire

Every monetary, price, or quantity field is a decimal string (`"100000.00"`). Never a JSON number. Parsed to `Decimal` at the boundary on both sides.
