# Review: market-data — 2026-09-08 (confirming review after the fix round, commit 14a19ae)

## Verdict
BLOCKED — all four blockers and all six should-fix items from `docs/reviews/2026-09-08-market-data.md` are verified fixed, but a new defect of the same class is confirmed: the candle cache marks the trailing, still-forming bucket as covered while refusing to store it, so that bucket is permanently lost once it closes and a `1D` series stops advancing altogether.

Verification method: the reviewer read the diff of `14a19ae` and the current sources; Gate 1 taken as given (`npm run lint` clean; api 74 files / 531+ tests, web 61 files / 378 tests, shared 13 files / 436 tests; `npm run e2e` 28 passed). One throwaway probe integration test against `stockdesk_test` (created, run, deleted) confirmed the blocker: three sequential daily requests for `TSLA` `1D` returned the identical five bars `2026-09-03 … 2026-09-07` while coverage grew to `2026-09-03T04:00:00.000Z .. 2026-09-10T18:00:00.000Z`.

## Acceptance criteria coverage

| # | Criterion (short) | Test file:line | Status |
|---|---|---|---|
| 1 | No keys → simulated only, everything works | `apps/api/src/modules/market/providers/factory.test.ts:69` | covered |
| 2 | `search?q=tsl` → TSLA first, prefix before name | `apps/api/test/market.search.test.ts:32`, `:54`, `:65` | covered |
| 3 | Detail shape all strings, unknown → 404 | `apps/api/test/market.detail.test.ts:45`, `:114` | covered |
| 4 | Bars ascending, cache hit without provider call, `end` page, `hasMore` | `apps/api/test/market.bars.test.ts:41`, `:57`, `:71`, `:90` | weak — the cache hit is only proven at a frozen instant; no test advances the clock across a bucket boundary, which is where the cache loses bars (blocker 1) |
| 5 | Invalid timeframe → 422 `INVALID_TIMEFRAME` | `apps/api/test/market.bars.test.ts:103` | covered |
| 6 | Quotes deliver / unsubscribe stops / limit → `SUBSCRIPTION_LIMIT` | `apps/api/test/ws-quotes.test.ts:132`, `:210` | covered |
| 7 | Bars channel: non-final per trade, final at rollover | `apps/api/test/ws-bars.test.ts:85` | covered |
| 8 | Composite falls back, never mixes real and simulated ticks | `apps/api/test/market.provider-fallback.test.ts:60`; `apps/api/src/modules/market/providers/composite.test.ts:280` | covered |
| 9 | Alpaca Decimal parse, 30-symbol LRU | `apps/api/src/modules/market/providers/alpaca/stream.test.ts:185`, `.../alpaca/subscriptions.test.ts:126` | covered |
| 10 | Closed Saturday, open 10:00 NY | `apps/api/src/modules/market/calendar.test.ts:13`, `:21`; `apps/api/test/market.status.test.ts:47` | covered |
| 11 | Ticker search dropdown, Enter navigates, recents | `apps/web/src/features/shell/components/TickerSearch.test.tsx:57`, `:70`, `:128` | covered |
| 12 | Symbol page renders, interval switch reloads + resubscribes | `apps/web/src/features/market/components/PriceChart.test.tsx:202`; `apps/e2e/tests/market.spec.ts:125` | covered |
| 13 | Buy opens order slot, back restores stats | `apps/web/src/features/market/components/SidePanel.test.tsx:65` | covered |
| 14 | Unknown symbol route → not-found state | `apps/web/src/features/market/components/SymbolNotFound.test.tsx:46` | covered |
| 15 | No monetary field is a JSON number in any market response | `apps/api/test/market.detail.test.ts:51`; `apps/api/test/market.bars.test.ts:19`; `apps/api/test/ws-bars.test.ts:35` | covered |

Bucket regression tests added by the fix round: `apps/api/test/market.bar-buckets.test.ts:49`, `:64`, `apps/api/src/modules/market/timeframes.test.ts:98`, `:104`. Bar-write ordering: `apps/api/src/modules/market/bar-writer.test.ts:38`, `:67`. Profile/metrics split: `apps/api/test/market.profile-refresh.test.ts:99`, `:117`. Batched lookup: `apps/api/src/ws/market-channels.test.ts:79`.

## Findings

### Blockers
- `apps/api/src/modules/market/candles.ts:120` — `addCoverage(..., from, range.end)` marks the whole fetched window covered although `:99` dropped the bucket that was still forming at `range.end`, so that bucket is never fetched again after it closes; with `range.start` mid-bucket on the next request the provider returns nothing (`buildBars` at `providers/simulated/bars.ts:23` starts at `previousBucketStart(bucketStartAt(endMs))`), so a `1D` series requested once per day intraday stays frozen — reproduced: three requests on 2026-09-08/09/10 all returned `2026-09-03 … 2026-09-07` with coverage `… .. 2026-09-10T18:00:00.000Z`. Clip the coverage upper bound to `bucketStartMs(min(range.end, now), timeframe)` and compare the hit rule at `:142` against the same clipped instant so a repeated same-bucket request stays a hit; record the clipping rule in the spec next to decision 21.

### Should fix
- `apps/api/src/modules/market/bar-aggregator.ts:226` — the unsubscribe returned by `priceService.onTrade` is discarded and `stop()` (`:265`) neither detaches the handler nor clears `forming`, so a trade that arrives after `await writer.flush()` enqueues a write nobody awaits; `runtime.ts:103` also flushes the aggregator before `priceService.stop()` at `:104`. Detach in `stop()` and stop the feed first.
- `apps/api/src/modules/market/candles.ts:135` — `windowStartMs(until, "1M", 300)` with the default limit steps 300 calendar months back, so a bare `?timeframe=1M` request asks the provider for a 25-year range and covers it in one row. Cap the window at the provider's history.

### Nice to have
- `apps/web/src/features/market/bars-consumers.ts:5` — `counts` is module state outside the zustand store and is not cleared by `resetClientState`, so a reset that does not unmount the consumers leaves a series pinned for the next session.
- `apps/api/src/ws/market-channels.ts:87` — one 100-symbol subscribe of unknown symbols produces 100 `SYMBOL_NOT_FOUND` frames; the raised `QUOTE_MESSAGE_SYMBOL_CAP` doubled the amplification factor with no per-socket message budget.
- `apps/api/test/ws-quotes.test.ts:227` — the new limit test settles with real-time waits (`SETTLE_MS = 300`, `TICK_WINDOW_MS = 400`) instead of a fake clock or an event hook.
- `apps/api/src/modules/market/bar-aggregator.test.ts:305` — `await new Promise((resolve) => setTimeout(resolve, 0))` measures "not settled yet" with a real macrotask; `vi.waitFor` on the write side would be deterministic.
- `apps/api/src/server.ts:60` — no `SIGTERM` handler, so `market.stop()` never runs in production and the flush added to `stop()` only protects the tests.

## Optimization opportunities
- `apps/api/src/modules/market/bar-writer.ts:37` — `symbolIds` grows with every streamed symbol and caches `null` forever (TD-46); bounding it also removes the permanent "never persists" state after the boot refresh. Later.
- `apps/api/src/ws/quote-feed.ts:41` — `prevCloses` keeps one entry per symbol ever quoted for the process lifetime; prune together with `lastTrades` (TD-47). Later.
- `apps/api/src/ws/market-channels.ts:105` — snapshots are sent with one `await` per added symbol, up to 50 per subscribe; each is cheap today but becomes a serial chain of `getPrevClose` reads once positions exist. Next module.
- `apps/api/src/modules/market/candles.ts:46` — `toApiString(row.open.toString(), 4)` still reparses each `Prisma.Decimal` through a string, five per bar (TD-55). Later.

## Tech debt candidates
- Candle coverage is extended to the request instant even though the trailing incomplete bucket is not stored, so that bucket is permanently lost from the cache.
- `GET /market/symbols/:symbol/bars` cache behaviour is untested across a bucket boundary; every cache test uses a frozen clock.
- The bar aggregator never detaches its trade handler and `runtime.stop()` flushes before the price feed is stopped.
- A `1M` bars request with the default limit builds a 25-year provider window and coverage row.
- Web bar reference counts live in module state outside the zustand store and outside `resetClientState`.
- A single subscribe message can trigger up to 100 `SYMBOL_NOT_FOUND` frames; WebSocket messages have no per-socket budget.
- The API has no `SIGTERM` handler, so `MarketRuntime.stop()` is production-dead code.
