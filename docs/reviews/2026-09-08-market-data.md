# Review: market-data — 2026-09-08

## Verdict
BLOCKED — three defects reach production behaviour (dividend yield rendered 100× too small, `1M`/DST candles permanently dropped from the cache) and two acceptance criteria (6, 15) have no test that proves them at the level the spec states. Gate 1 results were taken as given; the reviewer did not re-run lint, unit or e2e suites.

Gate 1 (coordinator, repository root): `npm run lint` clean, `npm test -- --run` api 70 files / 518 tests, web 60 files / 368 tests, shared 13 files / 434 tests, `npm run e2e` 28 passed.

## Acceptance criteria coverage

| # | Criterion (short) | Test file:line | Status |
|---|---|---|---|
| 1 | No keys → simulated only, everything works | `apps/api/src/modules/market/providers/factory.test.ts:69` (+ every `apps/api/test/market.*` suite runs on simulated) | covered |
| 2 | `search?q=tsl` → TSLA first, prefix before name | `apps/api/test/market.search.test.ts:32`, `:54`, `:65` | covered |
| 3 | Detail shape all strings, unknown → 404 | `apps/api/test/market.detail.test.ts:45`, `:114` | covered |
| 4 | Bars ascending, cache hit without provider call, `end` page, `hasMore` | `apps/api/test/market.bars.test.ts:34`, `:50`, `:64`, `:83` | covered |
| 5 | Invalid timeframe → 422 `INVALID_TIMEFRAME` | `apps/api/test/market.bars.test.ts:96` | covered |
| 6 | Quotes deliver / unsubscribe stops / limit → `SUBSCRIPTION_LIMIT` | `apps/api/test/ws-quotes.test.ts:87`; limit only at `apps/api/src/ws/market-subscriptions.test.ts:40` | weak |
| 7 | Bars channel: non-final per trade, final at rollover | `apps/api/test/ws-bars.test.ts:79` | covered |
| 8 | Composite falls back, never mixes real and simulated ticks | `apps/api/test/market.provider-fallback.test.ts:60`, `:77`; `apps/api/src/modules/market/providers/composite.test.ts:203` | weak (stream path untested) |
| 9 | Alpaca Decimal parse, 30-symbol LRU | `apps/api/src/modules/market/providers/alpaca/stream.test.ts:185`, `.../alpaca/subscriptions.test.ts:126`, `.../providers/decimal-json.test.ts` | covered |
| 10 | Closed Saturday, open 10:00 NY | `apps/api/src/modules/market/calendar.test.ts:13`, `:21`; `apps/api/test/market.status.test.ts:47` | covered |
| 11 | Ticker search dropdown, Enter navigates, recents | `apps/web/src/features/shell/components/TickerSearch.test.tsx:57`, `:70`, `:128`; `apps/e2e/tests/market.spec.ts:85` | covered |
| 12 | Symbol page renders, interval switch reloads + resubscribes | `apps/web/src/features/market/components/PriceChart.test.tsx:202`; `apps/e2e/tests/market.spec.ts:125`, `:157` | covered |
| 13 | Buy opens order slot, back restores stats | `apps/web/src/features/market/components/SidePanel.test.tsx:65`; `apps/e2e/tests/market.spec.ts:192` | covered |
| 14 | Unknown symbol route → not-found state | `apps/e2e/tests/market.spec.ts:221`; `apps/web/src/features/market/components/SymbolNotFound.test.tsx:46` | covered |
| 15 | No monetary field is a JSON number in **any** market response | `apps/api/test/market.detail.test.ts:51` only | weak |

## Findings

### Blockers
- `apps/web/src/features/market/panel-mappers.ts:62` — `dividendYield` is serialized as a fraction (`apps/api/src/modules/market/symbol-detail.ts:10` `YIELD_PLACES = 4`, decision 14: "a fraction such as `0.0130`") but rendered with `formatChangePercent` → `formatPercent`, which only appends a percent sign. AVGO's 1.30 % yield renders as `0.01%`. Multiply by 100 in the mapper (or emit a percent value from the API and update decision 14), and drop the misleading fixture.
- `apps/web/src/features/market/panel-mappers.test.ts:36` — the fixture `dividendYield: "1.25"` is not a fraction, so the assertion at `:96` (`"1.25%"`) passes while the real pipeline is wrong. Use the value the API actually produces (`"0.0130"`) and assert `"1.30%"`.
- `apps/api/src/modules/market/candles.ts:100` — completeness is decided with the fixed `timeframeDurationMs` (`apps/api/src/modules/market/timeframes.ts:29`, `"1M": 31 * MS_PER_DAY`), while buckets step through the New York calendar. A finished February `1M` bar is filtered out as incomplete, yet `addCoverage` still marks its interval covered, so the bar is permanently missing from the cache; on a 25-hour fall-back day a still-forming `1D` bar is inserted as final and corrupts `getPrevClose`. Decide completeness with `nextBucketStartMs(bar.time, timeframe) <= now`.
- `apps/api/test/ws-quotes.test.ts` — no test drives a socket past 50 quote subscriptions and asserts `{"type":"error","code":"SUBSCRIPTION_LIMIT"}` on the wire; criterion 6 is proven only at the unit level (`apps/api/src/ws/market-subscriptions.test.ts:40`, which asserts an internal outcome value). Add the wire test next to `apps/api/test/ws-bars.test.ts:181`.

### Should fix
- `packages/shared/src/ws.ts:17` — `symbols: z.array(symbolSchema).min(1).max(QUOTE_SUBSCRIPTION_LIMIT)` makes a single 51-symbol subscribe fail schema validation and be silently ignored, contradicting decision 20 ("add the ones that fit and send `SUBSCRIPTION_LIMIT` once"). Raise the array cap above the subscription limit and let `market-subscriptions.ts` enforce it.
- `apps/api/src/modules/market/bar-writer.ts:59` — `save` starts each write without ordering them per series, so a `finalizeBar` issued after a `saveFormingBar` for the same `(symbolId, timeframe, time)` can be applied first and leave a closed bucket with `isFinal = false`, breaking the invariant "a closed bucket is persisted final" and hiding the day from `latestFinalBarBefore`. Chain writes per series key.
- `apps/api/src/modules/market/providers/composite.test.ts:264` — nothing proves that `subscribeTrades` for a symbol already claimed by a real provider refuses to fall back to simulated (the `subscribeGroup(claimed, true)` branch of `composite.ts:140`). Criterion 8 names ticks; add that case.
- `apps/api/test/market.bars.test.ts:34` and `apps/api/test/ws-bars.test.ts:79` — neither validates the payload with `barsResponseDtoSchema` / `barMessageSchema` nor calls `expectNoMonetaryNumbers`, so criterion 15 is unproven for bars and for `bar` messages.
- `apps/web/src/features/market/store.ts:9` — `bars` is keyed by `symbol:timeframe` and only cleared by `clearBars`/`reset`, and `apps/web/src/features/market/hooks.ts:129` never calls `clearBars`. Every symbol and interval a user visits keeps ~300 bar objects for the whole session. Drop the series on unmount or cap the map.
- `apps/api/src/modules/market/symbols.ts:111` — `storeProfile` stamps `profileFetchedAt` and `metricsFetchedAt` with the same instant and always refetches both endpoints, so the 1-hour metrics TTL forces a full profile refetch every hour instead of the spec's "profile 24 hours, metrics 1 hour". Refresh the two independently.

### Nice to have
- `apps/api/src/modules/market/bar-writer.ts:39` — a `null` symbol id is cached forever, so a symbol first seen before the boot refresh created its row never gets live bars persisted until the process restarts. Cache only resolved ids.
- `apps/api/src/modules/market/price-service.ts:102` — `lastTrades` is never pruned on `releaseStreaming`, so `getLastPrice` keeps serving a price from a stream nobody listens to any more.
- `apps/web/src/features/market/components/PriceChart.tsx:50` — `MutationObserver` and `ResizeObserver` wiring is imperative DOM logic inside a `.tsx`; move it into a `use-chart-instance.ts` hook to keep the render-only rule literal.
- `apps/api/test/ws-quotes.test.ts:154` — the release assertion polls with real `setTimeout` for up to 2 s instead of a fake clock or an event hook.
- `apps/api/src/modules/market/providers/simulated/provider.ts:65` — trade size is built with `1 + Math.floor(stream.next() * MAX_TRADE_SIZE)`, native arithmetic on a quantity before it becomes a `Decimal`.
- `apps/api/src/modules/market/jobs.ts:70` — `schedule` uses the global `setInterval` rather than injectable timers, so the recurring thinning and refresh schedule has no fake-clock test.

## Optimization opportunities
- `apps/api/prisma/schema.prisma:132` — `@@index([symbolId, timeframe, time])` duplicates the index that `@@unique([symbolId, timeframe, time])` already creates; dropping it removes one B-tree write per candle insert and roughly halves candle index storage. Now (additive migration that only drops a redundant index).
- `apps/api/src/modules/market/symbols-repository.ts:203` — `"name" ILIKE '%q%'` cannot use `@@index([name])`; with the real Alpaca universe (~11k rows) every keystroke is a sequential scan. Add a `pg_trgm` GIN index on `name` when the Alpaca asset list is enabled. Next module.
- `apps/api/src/modules/market/symbols-repository.ts:146` — `notIn: symbols` sends the entire asset list as bind parameters in one statement; switch to a temporary table or a `NOT EXISTS` join against the freshly upserted set before the first real provider run. Later.
- `apps/api/src/modules/market/candles.ts:43` — `toApiString(row.open.toString(), 4)` reparses a `Prisma.Decimal` through a string into a new `Decimal` for five fields per bar, ~1500 allocations per 300-bar page; format from the `Prisma.Decimal` directly. Later.
- `apps/api/src/modules/accounts/summary.ts:56` — `valuePositions` awaits `getLastPrice` serially per position, and each miss is a symbol lookup plus a candle read; batch the lookups before Module 4 fills positions. Next module.
- `apps/api/src/ws/market-channels.ts:82` — `knownSymbols` issues one `findActiveSymbol` round trip per symbol, up to 50 per subscribe message; one `findMany` with `symbol: { in: [...] }` cuts it to one. Now.

## Tech debt candidates
- Candle bucket completeness and cache windows use fixed millisecond durations instead of the calendar stepper, diverging for `1M`, `1W` and DST days.
- Live bar persistence is unordered per series; a forming write can overwrite a finalized bucket.
- Quote subscribe messages larger than the per-socket limit are dropped by schema validation instead of partially honoured with one `SUBSCRIPTION_LIMIT`.
- Finnhub profile and metrics share one fetch and one timestamp pair, so the 1-hour metrics TTL doubles the profile call rate.
- Web market store retains every visited `symbol:timeframe` bar series for the whole session.
- `Candle` carries a redundant index identical to its unique constraint.
- Symbol name search has no trigram index and no rate limit on `/market/symbols/search`.
- `lastTrades` in the price service and `claimedByReal` in the composite are never pruned.
