# Module 3: Market Data and Symbol Page

Status: specified

## Scope

Everything needed to find a stock, open its page, see its live price and chart, and read its key facts. Order entry itself is Module 4; this module reserves its place in the layout.

Included:

- Market data provider layer with capability-based routing: Alpaca (real-time IEX trade stream, historical bars, asset list), Finnhub (company profile, market cap, key metrics), simulated (every capability, offline).
- Symbol master table seeded from the provider, powering fast local search.
- Candle cache in PostgreSQL, filled from the provider on demand, live-updated from the trade stream, capped at 5000 rows per symbol and timeframe by the daily thinning job.
- Price service used by other modules: last price, previous close, market status.
- WebSocket channels: `quotes` (live trades per symbol), `bars` (live candle updates), `market_status`.
- REST: symbol search, symbol detail, bars, market status, per-symbol trade history contract.
- Header ticker search becomes functional: type, pick from dropdown, navigate to the symbol page.
- Symbol page: header with live price, candlestick/line chart with interval selector, positions and trade history for the active account filtered to this symbol, right side panel with Buy/Sell buttons and key statistics. The Buy/Sell buttons open the side panel's order slot, which Module 4 fills.
- Dashboard integration: `positionsValue` and daily P&L in Module 2 start using real prices from the price service (no positions yet, so values remain zero until Module 4).

Out of scope: order entry, order engine, fills, real positions and trades (Module 4), options, crypto, forex, news, level 2 data, extended-hours simulation of real symbols.

## Providers

### Interface

```ts
type Capability = "stream" | "bars" | "search" | "profile" | "quote";

interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: ReadonlySet<Capability>;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeTrades(symbols: string[]): Promise<void>;
  unsubscribeTrades(symbols: string[]): Promise<void>;
  onTrade(handler: (trade: Trade) => void): () => void;
  getBars(query: BarsQuery): Promise<Bar[]>;
  listAssets(): Promise<AssetRecord[]>;
  getProfile(symbol: string): Promise<SymbolProfile | null>;
  getQuote(symbol: string): Promise<Quote | null>;
}
```

`Trade`: `{ symbol, price: Decimal, size: Decimal, at: Date }`. `Bar`: `{ symbol, timeframe, time: Date, open, high, low, close, volume }` with Decimal prices. `Quote`: `{ symbol, last, prevClose, open, high, low, volume, at }`.

### Composite routing

`CompositeMarketDataProvider` holds the configured providers in the order given by `MARKET_DATA_PROVIDERS` (default `alpaca,finnhub,simulated`). For each capability it uses the first provider that declares it and is healthy. A provider that is not configured (missing API key) is skipped at startup with a logged warning. A provider call that fails is retried once, then the next capable provider is used and the failure is logged. The simulated provider is always last and always available.

The same symbol never mixes real and simulated prices within one server run: once a symbol's stream comes from a real provider, the simulated provider is not used for its ticks. When the real market is closed the stream is simply quiet and the UI shows the market status badge.

### Alpaca

- REST base `https://data.alpaca.markets`, auth headers `APCA-API-KEY-ID`, `APCA-API-SECRET-KEY`.
- Bars: `GET /v2/stocks/bars?symbols=AAPL&timeframe=1Min&start=...&end=...&limit=...&feed=iex&adjustment=split&sort=asc`, paginated with `page_token`.
- Assets: `GET https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity`, filtered to `tradable = true`. Maps `shortable` and `fractionable` onto `Symbol`. Refreshed once per day.
- Stream: `wss://stream.data.alpaca.markets/v2/iex`. Flow: connect, receive `[{"T":"success","msg":"connected"}]`, send `{"action":"auth","key":"...","secret":"..."}`, receive `authenticated`, then `{"action":"subscribe","trades":["AAPL"]}`. Trade messages `{"T":"t","S":"AAPL","p":182.1,"s":100,"t":"..."}`. Prices are parsed from the raw JSON text into `Decimal` without passing through a JavaScript `number` (custom JSON reviver over the string source or a string-preserving parser).
- Free plan limits honored by the subscription manager: one connection, at most 30 symbols on the trades channel. Above 30 the least recently requested symbols are dropped from the stream and served by polling `GET /v2/stocks/{symbol}/trades/latest` every 5 seconds.
- Reconnect with exponential backoff 1 s to 60 s, resubscribe the current set after reconnect.

### Finnhub

- REST base `https://finnhub.io/api/v1`, `X-Finnhub-Token` header.
- Profile: `GET /stock/profile2?symbol=` gives name, exchange, industry, market cap (in millions), share count, logo, web URL, IPO date.
- Metrics: `GET /stock/metric?symbol=&metric=all` gives P/E, 52-week high and low, beta, dividend yield.
- Cache: profile 24 hours, metrics 1 hour, both in the `SymbolProfile` table. Stays within 60 calls per minute by caching and by fetching only on symbol page open.
- Finnhub also declares `stream` and `search` but sits after Alpaca in the default order, so those are used only when Alpaca is not configured.

### Simulated

- Universe: 40 well-known US tickers with static profile data, seeded base prices, and `shortable` / `fractionable` flags (a few tickers set to `false` so both restrictions are testable) in `apps/api/src/modules/market/providers/simulated/universe.ts`.
- Ticks: geometric Brownian motion per subscribed symbol every second, annualized volatility per symbol, seeded PRNG so a given server run is deterministic under test.
- Bars: generated from the same seeded walk so repeated requests for the same range return identical candles. Generated back to 2 years of daily data and 30 days of minute data.
- Market status: always `open` while the simulated provider is the active stream provider (see Price service).

## Data model (Prisma)

```prisma
model Symbol {
  id        String   @id @default(cuid())
  symbol    String   @unique
  name      String
  exchange  String
  assetType String   @default("us_equity")
  currency  String   @default("USD")
  isActive  Boolean  @default(true)
  shortable    Boolean @default(true)
  fractionable Boolean @default(true)
  source    String
  updatedAt DateTime @updatedAt
  profile   SymbolProfile?
  candles   Candle[]
  coverage  CandleCoverage[]

  @@index([name])
}

model SymbolProfile {
  symbolId       String   @id
  symbol         Symbol   @relation(fields: [symbolId], references: [id], onDelete: Cascade)
  industry       String?
  marketCap      Decimal?
  sharesOutstanding Decimal?
  peRatio        Decimal?
  week52High     Decimal?
  week52Low      Decimal?
  beta           Decimal?
  dividendYield  Decimal?
  logoUrl        String?
  websiteUrl     String?
  ipoDate        DateTime?
  profileFetchedAt DateTime?
  metricsFetchedAt DateTime?
}

model Candle {
  id        String   @id @default(cuid())
  symbolId  String
  symbol    Symbol   @relation(fields: [symbolId], references: [id], onDelete: Cascade)
  timeframe String
  time      DateTime
  open      Decimal
  high      Decimal
  low       Decimal
  close     Decimal
  volume    Decimal
  isFinal   Boolean  @default(true)

  @@unique([symbolId, timeframe, time])
  @@index([symbolId, timeframe, time])
}

model CandleCoverage {
  id        String   @id @default(cuid())
  symbolId  String
  symbol    Symbol   @relation(fields: [symbolId], references: [id], onDelete: Cascade)
  timeframe String
  from      DateTime
  to        DateTime

  @@index([symbolId, timeframe, from])
}
```

- `timeframe` values: `1m`, `5m`, `15m`, `1h`, `1D`, `1W`, `1M`. Mapping to provider names lives in each provider.
- Decimal columns: prices, quantities and volume `@db.Decimal(20, 8)`; `marketCap` `@db.Decimal(20, 2)`; `sharesOutstanding` `@db.Decimal(20, 8)`.
- The Prisma model keeps the name `Symbol`; code never imports the bare `Symbol` type from `@prisma/client` (it would shadow the global), it uses its own record types or `Prisma.SymbolGetPayload`.
- Candle cache policy: a bars request reads the cache for `limit` bars before `end`. `CandleCoverage` rows record every half-open interval `[from, to)` that has been fetched from a provider for a symbol and timeframe (merged when they touch or overlap). The request is a cache hit when the cache holds `limit` bars and the coverage contains the interval from the oldest returned bar to `end`; otherwise the missing sub-range is fetched from the provider, upserted (`skipDuplicates` on the unique key, final bars never overwritten by a provider fetch), the coverage is extended by the fetched interval even when the provider returned no bars (a real gap such as a weekend), and the cache is read again. `hasMore` is true when a cached bar older than the page exists or the provider page was full. The current, still-forming candle is stored with `isFinal = false` and overwritten on every live update.
- Candle cap: at most `CANDLE_MAX_ROWS_PER_SERIES = 5000` rows per symbol and timeframe (code constant). A thinning job started from `runBootTasks()` deletes the oldest rows above the cap and trims the coverage to the oldest remaining bar, once at boot and then every `CANDLE_THINNING_INTERVAL_HOURS`.
- Market cap stored in full USD, not millions.
- Symbol master refresh: `runBootTasks()` starts it in the background after the server listens; it runs only when the newest `Symbol.updatedAt` is older than `SYMBOL_REFRESH_HOURS` (or the table is empty). Assets that disappear from the provider list are set `isActive = false`, never deleted. Search and detail only return active symbols.

## Price service

`apps/api/src/modules/market/price-service.ts`, consumed by the accounts module for equity and daily P&L and by Module 4 for fills.

- `getLastPrice(symbol): Decimal | null` from the in-memory last-trade map, falling back to the latest cached candle close.
- `getPrevClose(symbol): Decimal | null` from the latest final `1D` candle before the current trading day.
- `getMarketStatus(): { status: "open" | "closed" | "pre" | "after", nextOpenAt, nextCloseAt }` follows the active `stream` provider. Simulated stream: always `open` (`nextCloseAt` null). Real stream: computed from the NYSE calendar in `apps/api/src/modules/market/calendar.ts`: regular hours 09:30 to 16:00 America/New_York, `pre` 04:00 to 09:30, `after` 16:00 to 20:00, `closed` otherwise and on weekends, a fixed holiday list and early-close days (13:00) in code for 2026 and 2027. The calendar's `isTradingDay` replaces the Monday-to-Friday rule in `apps/api/src/modules/accounts/ny-time.ts` (closes TD-24), so the daily P&L reference skips holidays regardless of the provider.
- Status changes are detected by a one-minute check in the price service and pushed as `market_status`.
- Quote for a symbol (`SymbolDetail.quote`, `prevClose` on `quote` messages) is derived, not fetched: `last` from the last-trade map or the latest cached candle close, `open`, `high`, `low`, `volume` from the current non-final `1D` candle, `prevClose` from the latest final `1D` candle before the current trading day. Opening a symbol page warms the `1D` cache (`limit` 5). When no candle exists at all `quote` is `null`.
- `ensureStreaming(symbols)`: reference-counted subscription requests from WebSocket clients and from the accounts module for symbols with open positions.
- The accounts module receives the price service through its dependencies (`getLastPrice`, `getPrevClose`) and uses it in the summary math; with no positions before Module 4 every value stays zero.
- Bar aggregation: every streamed symbol always aggregates `1m` and `1D` from trades; other timeframes only while a `bars` subscription exists for them. A bucket closes (`isFinal = true`, persisted) on the first trade of the next bucket or by a rollover sweep that runs at each bucket boundary with an injected clock, so a quiet symbol still gets its final bar.

## WebSocket

Client to server, after the auth handshake from Module 1:

```json
{ "type": "subscribe", "channel": "quotes", "symbols": ["TSLA", "AAPL"] }
{ "type": "unsubscribe", "channel": "quotes", "symbols": ["AAPL"] }
{ "type": "subscribe", "channel": "bars", "symbol": "TSLA", "timeframe": "1m" }
{ "type": "unsubscribe", "channel": "bars", "symbol": "TSLA", "timeframe": "1m" }
```

Server to client:

```json
{ "type": "quote", "symbol": "TSLA", "price": "251.3400", "size": "100", "at": "2026-09-08T14:30:01.123Z", "prevClose": "248.9000" }
{ "type": "bar", "symbol": "TSLA", "timeframe": "1m", "bar": { "time": "2026-09-08T14:30:00.000Z", "open": "251.10", "high": "251.40", "low": "251.05", "close": "251.34", "volume": "1200" }, "isFinal": false }
{ "type": "market_status", "status": "open", "nextOpenAt": null, "nextCloseAt": "2026-09-08T20:00:00.000Z" }
```

- `quote` messages are throttled to at most 4 per second per symbol per socket; the latest trade wins.
- A socket may hold at most 50 quote subscriptions and 5 bar subscriptions (`SUBSCRIPTION_LIMIT` error message `{ "type": "error", "code": "SUBSCRIPTION_LIMIT" }`).
- Unknown symbol: `{ "type": "error", "code": "SYMBOL_NOT_FOUND", "symbol": "XXXX" }`.
- `market_status` is sent on connect and whenever the status changes.

## API

Base path `/api/v1`, all endpoints protected.

| Method | Path | Query | Success | Notes |
|--------|------|-------|---------|-------|
| GET | `/market/symbols/search` | `q` (1 to 20 chars), `limit` (default 10, max 25) | `200 { results: SymbolSearchResult[] }` | Local search over `Symbol`: symbol prefix matches first, then name contains, case-insensitive. |
| GET | `/market/symbols/:symbol` | none | `200 { symbol: SymbolDetail }` | Profile plus latest quote. Triggers profile and metrics refresh when stale. `404 SYMBOL_NOT_FOUND`. |
| GET | `/market/symbols/:symbol/bars` | `timeframe`, `limit` (default 300, max 1000), `end` (ISO, optional) | `200 { symbol, timeframe, bars: Bar[], hasMore }` | Ordered by time ascending. `end` enables loading older pages. |
| GET | `/market/status` | none | `200 { status, nextOpenAt, nextCloseAt }` | |
| GET | `/accounts/:id/trades` | `symbol?`, `limit`, `cursor` | `200 { trades: Trade[], nextCursor }` | Filled trades of the account. Returns `[]` until Module 4. Shape is final. |

`SymbolSearchResult`: `{ "symbol": "TSLA", "name": "Tesla, Inc.", "exchange": "NASDAQ" }`

`SymbolDetail` also carries `"shortable": true, "fractionable": true` at the top level.

`SymbolDetail`:

```json
{
  "symbol": "TSLA",
  "name": "Tesla, Inc.",
  "exchange": "NASDAQ",
  "currency": "USD",
  "industry": "Automobiles",
  "logoUrl": "https://...",
  "websiteUrl": "https://tesla.com",
  "quote": {
    "last": "251.3400",
    "prevClose": "248.9000",
    "open": "249.5000",
    "high": "252.0000",
    "low": "248.1000",
    "volume": "51234000",
    "change": "2.4400",
    "changePct": "0.98",
    "at": "2026-09-08T14:30:01.123Z"
  },
  "stats": {
    "marketCap": "800000000000.00",
    "sharesOutstanding": "3180000000",
    "peRatio": "65.20",
    "week52High": "299.2900",
    "week52Low": "138.8000",
    "beta": "2.05",
    "dividendYield": null
  }
}
```

`Trade` (account trade history, produced by Module 4):

```json
{
  "id": "clx...",
  "orderId": "clx...",
  "symbol": "TSLA",
  "side": "BUY",
  "quantity": "10",
  "price": "250.0000",
  "amount": "-2500.00",
  "realizedPnl": null,
  "executedAt": "2026-09-08T14:31:00.000Z"
}
```

### Error codes

| Code | HTTP | WebSocket | Meaning |
|------|------|-----------|---------|
| `SYMBOL_NOT_FOUND` | 404 | `{ "type": "error", "code": "SYMBOL_NOT_FOUND", "symbol" }` | Unknown or inactive symbol. |
| `INVALID_TIMEFRAME` | 422 | none: a `bars` subscribe with an unknown timeframe fails schema validation and is ignored like every malformed post-auth message (Module 2 rule) | `timeframe` not in the list. |
| `PROVIDER_UNAVAILABLE` | 503 | none | Every capable provider failed (after one retry each) for a request that needs fresh data. |
| `SUBSCRIPTION_LIMIT` | none | `{ "type": "error", "code": "SUBSCRIPTION_LIMIT" }` | More than 50 quote or 5 bar subscriptions on one socket. |
| `VALIDATION_ERROR` | 422 | none | Invalid query: `q` empty or over 20 characters, `limit` over the maximum (no clamping), malformed `end`, symbol with characters outside `[A-Z0-9.-]` after upper-casing. |
| `ACCOUNT_NOT_FOUND` | 404 | none | `GET /accounts/:id/trades` for an account the caller does not own. |
| `UNAUTHORIZED` | 401 | close `4001` | Existing. |

Market error codes live in `MARKET_ERROR_CODES` in `packages/shared/src/market.ts` and join the `ErrorCode` union. `GET /accounts/:id/trades` returns `{ trades: [], nextCursor: null }` until Module 4.

## Shared package

- `packages/shared/src/market.ts`: `timeframeSchema`, `symbolSearchResultSchema`, `symbolDetailSchema`, `quoteSchema`, `barSchema`, `barsResponseSchema`, `marketStatusSchema`, `tradeSchema`.
- `packages/shared/src/ws.ts`: extend `clientMessageSchema` and `serverMessageSchema` unions with the messages above.

## Frontend

### Route

```
apps/web/src/routes/_authenticated/symbols/$symbol.tsx    # /symbols/TSLA
```

Route loader validates the symbol exists via `GET /market/symbols/:symbol`; unknown symbol renders a not-found state with a search box.

### Layout

```
+----------------------------------------------------------------------------------+
| Header: [Brand] [Ticker search: tsla  v]  [Market: OPEN 14:30 ET] [Profile menu] |
|                                  | TSLA  Tesla, Inc.  NASDAQ                     |
|                                  | Tesla, Inc.                                   |
+----------------------------------------------------------------------------------+
| Nav tabs: [Portfolio] [Reports] [Deposit]                                        |
+------------------+----------------------------------------------+----------------+
| Sidebar          | TSLA  Tesla, Inc.   251.34  +2.44 (+0.98%)   | [ BUY ][SELL ] |
| (accounts, as    | [1m][5m][15m][1h][1D][1W][1M]  [candle|line] |----------------|
|  in Module 2)    |                                              | Key stats      |
|                  |   Candlestick chart + volume                 | Prev close     |
|                  |   (Lightweight Charts)                       | Open           |
|                  |                                              | Day range      |
|                  |----------------------------------------------| Volume         |
|                  | [Position] [Trade history]  (active account) | Market cap     |
|                  | Qty AvgCost Last MktValue UnrlPnl Day        | P/E            |
|                  | (empty until Module 4)                       | 52w range      |
|                  |                                              | Beta           |
|                  |                                              | Dividend yield |
+------------------+----------------------------------------------+----------------+
```

- Right panel default content: Buy and Sell buttons on top, key statistics below.
- Clicking Buy or Sell switches the panel to the order slot with the chosen side preselected and a back control returning to key stats. In this module the slot renders a placeholder card that says the order form arrives with the Orders module; Module 4 replaces the placeholder component only (`OrderPanel`, see `orders.md`).
- Tabs under the chart in this module: Position and Trade history. Module 4 adds an Orders tab.
- Right panel width 320 px; below 1280 px it moves under the chart as a full-width section; below 1024 px the sidebar becomes a drawer as in Module 2.

### Ticker search (header)

- Combobox: input debounced 200 ms, `GET /market/symbols/search`, dropdown with symbol, name, exchange, keyboard navigation, Enter or click navigates to `/symbols/$symbol`, Escape closes.
- Minimum 1 character; shows "no results" state; recent selections (last 5) shown when the input is empty and focused, stored in `localStorage.recentSymbols`.
- Replaces the disabled stub from Module 2.

### Chart

- Lightweight Charts candlestick series with a volume histogram pane, or line series when the line toggle is active. Toggle and last interval persisted in `localStorage.chartPrefs`.
- Interval selector: `1m 5m 15m 1h 1D 1W 1M`. Changing interval resubscribes the `bars` channel and reloads bars.
- Initial load 300 bars; scrolling to the left edge loads the previous page using `end`.
- Live: `bar` messages update or append the last candle; `quote` messages update the header price and the last candle's close between bar messages.
- Colors from CSS variables (`--gain`, `--loss`, grid and text tokens) so theme switches restyle the chart.

### Symbol positions and history

- Tabs under the chart: Position (this symbol on the active account) and Trade history (this symbol on the active account, newest first, paginated).
- Data from `GET /accounts/:id/positions` filtered client-side to the symbol and `GET /accounts/:id/trades?symbol=`.
- Both render empty states until Module 4 produces data; the column set is final.

### Feature files

```
apps/web/src/features/market/
├── store.ts            # quotes by symbol, marketStatus, subscription ref counts, applyQuote, applyBar
├── api.ts              # search, getSymbol, getBars, getStatus, getTrades
├── hooks.ts            # useSymbolSearch(q), useSymbolDetail(symbol), useQuote(symbol), useBars(symbol, timeframe), useMarketStatus, useSymbolTrades(accountId, symbol)
├── mappers.ts          # DTO -> Decimal view models, Bar -> Lightweight Charts candlestick/line/volume data
└── components/         # SymbolHeader, PriceChart, IntervalSelector, ChartTypeToggle, KeyStats, SidePanel, OrderSlotPlaceholder, SymbolPositionPanel, SymbolTradesPanel, MarketStatusBadge
apps/web/src/features/shell/components/TickerSearch.tsx     # replaces TickerSearchInput stub
apps/web/src/lib/ws.ts                                       # extended: subscribe/unsubscribe helpers with ref counting, dispatch quote/bar/market_status to the market store
```

- `useQuote(symbol)` subscribes on mount and unsubscribes on unmount through the ref-counted helper, so several components on one page share one subscription.
- All Decimal math and chart data shaping happen in `mappers.ts` and `hooks.ts`; components render only.

## Environment

Additions to `.env.example`:

```
MARKET_DATA_PROVIDERS=alpaca,finnhub,simulated
ALPACA_API_KEY=
ALPACA_API_SECRET=
ALPACA_DATA_FEED=iex
FINNHUB_API_KEY=
SYMBOL_REFRESH_HOURS=24
QUOTE_THROTTLE_PER_SECOND=4
CANDLE_THINNING_INTERVAL_HOURS=24
```

With empty keys the server runs on the simulated provider alone and logs which providers are active. The API test suite sets `MARKET_DATA_PROVIDERS=simulated` in the vitest environment; the Alpaca and Finnhub adapters receive their `fetch` and WebSocket constructors by injection, so no test opens a network connection.

Runtime: Node 22 (`engines`, `render.yaml` `NODE_VERSION`, CI `node-version`, `docs/04-deployment.md`). The Alpaca adapter parses prices with the `JSON.parse` reviver's `context.source` (available from Node 21), which yields the raw digit string for `new Decimal(...)`.

## Decisions (pre-review 2026-09-08)

1. Tech debt in scope: TD-30, TD-31, TD-32, TD-33 as Phase 0 before any module code; TD-24 (holiday calendar) and TD-26 (WebSocket ping/pong heartbeat sweep) inside the module; TD-5 (lazy locale loading, triggered by the new `market` namespace), TD-34 (user-scoped query keys), TD-35 (e2e for a second user in the same tab). TD-28 deferred to Module 4.
2. Market status follows the stream provider (simulated always `open`, real providers the NYSE calendar). See Price service.
3. Candle cache tracks fetched intervals in `CandleCoverage`. See Data model.
4. Node 22 with the native `JSON.parse` source reviver for Alpaca prices.
5. Composite routing: the "never mix real and simulated" rule covers `stream`, `bars` and `quote`. Once a real provider served price data for a symbol in this server run, the simulated provider is not used for that symbol; when the real chain is exhausted the request fails with `503 PROVIDER_UNAVAILABLE`. Profile falls back to `null` fields, never to simulated profile data for a real symbol.
6. `market_status` needs no subscription: it is pushed to every authenticated socket right after `auth_ok` and on every change, like `account_summary`.
7. Symbol master seeding runs in the background from `runBootTasks()` with the staleness check above; the test suite seeds the simulated universe with a `seedSymbols()` helper after each truncate.
8. Alpaca polling fallback above 30 streamed symbols uses the multi-symbol endpoint `GET /v2/stocks/trades/latest?symbols=A,B,C` once per 5 seconds (one call, not one per symbol, to stay under 200 requests per minute).
9. Finnhub profile and metrics: fetched synchronously with a 3 second timeout when the symbol has never been profiled; when present but stale the cached values are returned and the refresh runs in the background. Without a Finnhub key the `stats` and `industry` fields are `null`.
10. Simulated provider exposes `emitTick()` so integration tests drive ticks without timers; `start()` installs the one-second interval only in `server.ts`. The default seed is a code constant; tests pass an explicit seed.
11. Web WebSocket client becomes a module singleton in `apps/web/src/lib/ws.ts` (connect once per session, `subscribe`/`unsubscribe` helpers with reference counts, resubscribe after reconnect, `disconnect` called from `resetClientState`, which closes TD-32). The market store registers in `resetClientState`; `localStorage.recentSymbols` is cleared on reset, `localStorage.chartPrefs` survives as a device preference. `disconnect` also drops every message listener, so listeners are registered in component effects (re-added on mount) and every reset path ends in a navigation to `/login` that unmounts the authenticated layout. The access-token source is injected through `configureWsSession` from the auth store, mirroring `configureHttp`, so `lib/` never imports from `features/`. For the same reason the reference-counted `subscribe`/`unsubscribe` helpers (and the resend of every active subscription after `auth_ok`) live in `lib/ws-session.ts`, while the dispatch of `quote`, `bar` and `market_status` messages into the market store lives in `features/market/stream.ts`, registered by a hook in the authenticated layout next to the account-summary listener.
13. The only sanctioned `Decimal` to `number` conversions in the web app are inside `features/dashboard/mappers.ts` and `features/market/mappers.ts`, both feeding Lightweight Charts series data.
14. Serialization places: prices 4, `volume` and `sharesOutstanding` 0, `marketCap` 2, `peRatio` and `beta` 2, `dividendYield` 4 (a fraction such as `0.0130`), `changePct` 2.
15. Cache-hit rule (implementation detail of the policy above): a request is served from the cache when the coverage contains `[end - duration(timeframe) * limit, end)`, or when `limit` bars are held and the coverage contains `[oldestReturned.time, end)`. The first clause keeps series with real gaps (weekends on `1D`) from re-asking the provider for a window it has already answered.
16. Early-close days: regular session 09:30 to 13:00 New York, `after` 13:00 to 17:00.
17. `Symbol.source` is the name of the first search-capable provider in the configured chain. `upsertSymbols` stamps `updatedAt` on unchanged rows too, so the `SYMBOL_REFRESH_HOURS` staleness check is honest across boots.
18. Bucket alignment (one definition in `apps/api/src/modules/market/timeframes.ts`, used by the simulated provider, the candle cache and the live aggregator): `1m`, `5m`, `15m`, `1h` align to UTC; `1D` starts at America/New_York midnight, `1W` at the Monday New York midnight, `1M` at the first of the month New York midnight, for every provider. This matches Alpaca's daily bar timestamps, so a provider daily bar and the live forming daily bar share one row, and the price service reads today's forming bar and the previous close from the same New York day boundary.
19. Playwright harness: the API `webServer` command prepares the `stockdesk_e2e` database (`prisma migrate deploy` and truncate) before it starts the server, so the boot-time symbol seed survives; `GET /api/v1/health` carries `ready: boolean` (true once the boot tasks including the symbol refresh finished) and the e2e global setup polls it before the first test (closes TD-22).
20. WebSocket subscribe messages that refuse some symbols add the ones that fit and send `SUBSCRIPTION_LIMIT` once; unknown symbols get one `SYMBOL_NOT_FOUND` each. Message handling is serialized per socket.
12. Route param `/symbols/:symbol` is upper-cased on both sides before lookup.

## Acceptance criteria

1. With no API keys configured the server starts, logs `simulated` as the only active provider, and every endpoint and channel works with simulated data.
2. `GET /market/symbols/search?q=tsl` returns `TSLA` first; results are limited and ordered symbol-prefix first, then name matches.
3. `GET /market/symbols/TSLA` returns the detail shape with every numeric field as a string; unknown symbol returns `404 SYMBOL_NOT_FOUND`.
4. `GET /market/symbols/TSLA/bars?timeframe=1m` returns ascending bars; a second identical request is served from the candle cache without a provider call (asserted with a provider spy); `end` returns the previous page and `hasMore` is correct.
5. Invalid timeframe returns `422 INVALID_TIMEFRAME`.
6. Subscribing to `quotes` for a symbol delivers `quote` messages with `Decimal`-string prices; unsubscribing stops them; exceeding the per-socket limit returns `SUBSCRIPTION_LIMIT`.
7. Subscribing to `bars` for `1m` delivers a non-final bar update on each trade and a final bar at minute rollover (fake clock test with the simulated provider).
8. The composite provider falls back to the next provider when the first throws, and never mixes real and simulated ticks for one symbol.
9. Alpaca adapter parses trade prices to `Decimal` without a `number` intermediate and honors the 30-symbol limit with least-recently-used eviction (unit tests against recorded fixtures, no network).
10. Market status is `closed` on a Saturday and `open` at 10:00 America/New_York on a regular weekday (fake clock).
11. Header ticker search: typing `tsl` shows a dropdown containing `TSLA`, Enter navigates to `/symbols/TSLA`, recent symbols appear when the input is empty.
12. Symbol page renders header price, chart with the selected interval, key stats, empty position and trade history states; switching interval reloads bars and resubscribes.
13. Clicking Buy shows the order slot placeholder with side `BUY`; the back control restores key stats.
14. Unknown symbol route renders the not-found state.
15. No monetary or price field in any market response is a JSON number.

## Tests

- API integration: criteria 1 to 8, 10, 15 with the simulated provider and a fake clock; WebSocket tests with a real `ws` client against the test server.
- Provider unit tests: Alpaca and Finnhub adapters against recorded JSON fixtures (message parsing, pagination, cache TTL, LRU eviction), composite routing and fallback, simulated determinism (same seed, same bars).
- Shared: schema tests, timeframe validation.
- Web: market store (ref counting, applyQuote throttle handling, applyBar append versus update), mappers (bars to chart data, change percentage), `TickerSearch` combobox behavior with mocked API, `PriceChart` mount and interval switching with a mocked Lightweight Charts module, `SidePanel` Buy/Sell toggle.
