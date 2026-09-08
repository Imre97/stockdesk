# Review: market-data — 2026-09-08 (third, delta review after commit abcc629)

## Verdict
BLOCKED — all four fix items from `docs/reviews/2026-09-08-market-data-2.md` landed and are proven by new tests, but a throwaway probe against `stockdesk_test` showed the newly reachable refetch path silently discards the provider's bar for any bucket the live aggregator already wrote, so a closed daily bucket for a watched symbol is permanently stored as a partial live aggregate marked `isFinal = false`.

Verification method: the reviewer read the diff of `abcc629` and the current sources; ran the market suite in `apps/api` (40 files / 256 tests, all passing); one throwaway probe test (`apps/api/test/zz-probe.test.ts`, created, run, deleted) reproduced the blocker — after seeding a non-final `1D` candle at `2026-09-08T04:00:00.000Z` and requesting bars a day later, the response contained `{"time":"2026-09-08T04:00:00.000Z","open":"1.0000","high":"1.0000","low":"1.0000","close":"1.0000","volume":"1"}` with `isFinal=false` instead of the provider bar. Gate 1 for lint / web / shared / e2e taken as given (`npm run lint` clean; api 77 files / 538 tests, web 61 files / 378 tests, shared 13 files / 436 tests; `npm run e2e` 28 passed).

Item-by-item on the four requested checks: (1) `candles.ts:141` clips to `bucketStartMs(min(until, now), timeframe)` and feeds the same instant to the hit rule, `missingRange` and therefore `addCoverage`; repeated in-bucket request stays a hit (`market.cache-advance.test.ts:62`, `:100`), `hasMore` inputs unchanged (`fetchAndStore` still returns `fetched.length`, not the insert count), concurrency test unchanged and green (`market.bars.test.ts:142`), forming bar still returned by `listBarsBefore` (no `isFinal` filter, confirmed by the probe) — but untested. (2) `bar-aggregator.ts:267`/`:275` detach then flush then clear; `composite.onTrade` (`providers/composite.ts:154`) returns a real unsubscribe, so the detach works in production. (3) `historyFloorMs` shared, `historyStartMs` reduced to a passthrough, partition `calendar` vs `minute` is byte-identical to the old `sourceOf` split, so no provider history changed. (4) `market.price-service.test.ts:57` stops every runtime.

## Acceptance criteria coverage

| # | Criterion (short) | Test file:line | Status |
|---|---|---|---|
| 1 | No keys → simulated only | `apps/api/src/modules/market/providers/factory.test.ts:69` | covered (unchanged) |
| 2 | `search?q=tsl` ordering | `apps/api/test/market.search.test.ts:32` | covered (unchanged) |
| 3 | Detail shape, unknown → 404 | `apps/api/test/market.detail.test.ts:45`, `:114` | covered (unchanged) |
| 4 | Bars ascending, cache hit, `end` page, `hasMore` | `apps/api/test/market.bars.test.ts:42`, `:58`, `:72`; `apps/api/test/market.cache-advance.test.ts:55`, `:76`, `:84` | covered |
| 5 | Invalid timeframe → 422 `INVALID_TIMEFRAME` | `apps/api/test/market.bars.test.ts:124` | covered (unchanged) |
| 6 | Quotes deliver / unsubscribe / `SUBSCRIPTION_LIMIT` | `apps/api/test/ws-quotes.test.ts:132`, `:210` | covered (unchanged) |
| 7 | Bars channel non-final per trade, final at rollover | `apps/api/test/ws-bars.test.ts:85`; `apps/api/src/modules/market/bar-aggregator-stop.test.ts:77` | covered |
| 8 | Composite fallback, no mixed ticks | `apps/api/test/market.provider-fallback.test.ts:60` | covered (unchanged) |
| 9 | Alpaca Decimal parse, 30-symbol LRU | `apps/api/src/modules/market/providers/alpaca/stream.test.ts:185` | covered (unchanged) |
| 10 | Closed Saturday, open 10:00 NY | `apps/api/src/modules/market/calendar.test.ts:13`; `apps/api/test/market.status.test.ts:47` | covered (unchanged) |
| 11 | Ticker search dropdown, Enter, recents | `apps/web/src/features/shell/components/TickerSearch.test.tsx:57` | covered (unchanged) |
| 12 | Symbol page, interval switch reloads | `apps/web/src/features/market/components/PriceChart.test.tsx:202` | covered (unchanged) |
| 13 | Buy opens order slot | `apps/web/src/features/market/components/SidePanel.test.tsx:65` | covered (unchanged) |
| 14 | Unknown symbol → not-found state | `apps/web/src/features/market/components/SymbolNotFound.test.tsx:46` | covered (unchanged) |
| 15 | No monetary JSON number | `apps/api/test/market.bars.test.ts:21` | covered (unchanged) |

Spec decision 22 (`docs/modules/market-data.md`) records the clipping rule and the history cap.

## Findings

### Blockers
- `apps/api/src/modules/market/candles-repository.ts:107` — `createMany({ ..., skipDuplicates: true })` makes the aggregator's row win over the provider's: the clip fix now refetches the just-closed bucket, but for every symbol that had a live subscriber the row at that bucket already exists (`saveFormingBar`/`finalizeBar` at `:113`/`:125`, written for `1m` and `1D` on every streamed symbol per `bar-aggregator.ts:6`), so the authoritative bar is dropped, the partial session aggregate is kept, coverage marks the bucket done and it is never fetched again; after a shutdown (`bar-aggregator.ts:275` clears `forming` without closing it) the row also stays `isFinal = false` forever, hiding it from `latestFinalBarBefore` (`price-service.ts:143`) while `listBarsBefore` still serves it. Replace the skip with an upsert for provider bars, or delete non-final rows inside the fetched range before inserting, and add an integration test that a non-final aggregator row at the closed bucket is replaced by the provider values.

### Should fix
- `apps/api/src/modules/market/timeframes.ts:124` — `historyFloorMs` hard-codes the simulated provider's depth (730 / 30 days) and `candles.ts:143` applies it to every provider, so a real Alpaca `1m` chart cannot page past 30 days and `1D`/`1W`/`1M` cannot page past two years even though the provider serves more, silently returning an empty page with `hasMore: false`. Move the depth onto `MarketDataProvider.capabilities`/a provider field and floor against the routed provider.
- `apps/api/test/` — no test asserts that the REST bars response contains the aggregator's `isFinal = false` bar for the current bucket; that behaviour is only documented in the comment at `candles-repository.ts:62` and is exactly what the blocker interacts with. Add one.

### Nice to have
- `apps/api/src/modules/market/runtime.test.ts:56` — asserts `clearInterval` before `clearTimeout`, but `priceService.stop()` (`price-service.ts:285`) only clears the status poll; trades keep flowing from `composite` until `composite.stop()` at `runtime.ts:105`, so the test name "stops the price feed before the aggregator flushes" overstates what it proves. The real invariant is already proven at `bar-aggregator-stop.test.ts:77`; rename or assert no write after stop.
- `apps/api/src/modules/market/candles.ts:151` — when `end` predates the history floor, `lowerBound > settled` and `contains(coverage, lowerBound, settled)` is evaluated with an inverted interval, which any row ending after `settled` satisfies; harmless today because the guard at `:160` blocks the fetch, but the "satisfied" branch is then reached for a reason that is not coverage.
- `apps/api/test/market.bars.test.ts:112` — only a lower bound on `query.start` is asserted, so a start of "now" would also pass; assert it is close to the floor.
- `apps/api/src/modules/market/bar-aggregator-stop.test.ts:34` — duplicates the harness of `bar-aggregator.test.ts` instead of sharing a fixture module.

## Optimization opportunities
- `apps/api/src/modules/market/candles.ts:161` — with the clip, a watched `1m` series now issues one provider `getBars` per minute per symbol on the first request after each rollover; with a real provider that is 60 HTTP calls per hour per symbol whose rows are then dropped by the blocker's `skipDuplicates`. Serve the just-closed bucket from the aggregator's own row, or throttle per bucket. Next module.
- `apps/api/src/modules/market/candles.ts:146` and `:168` — a miss runs `listBarsBefore` twice; one extra round trip per bucket rollover per series. Reuse the first result when the fetch inserted nothing. Later.

## Tech debt candidates
- `insertFinalBars` uses `skipDuplicates`, so a provider bar never replaces the live aggregator's row for the same bucket, and a shutdown leaves that row `isFinal = false` permanently.
- The candle read path is not tested for returning the aggregator's non-final bar of the current bucket.
- The request-window cap in `historyFloorMs` uses the simulated provider's history depth for every provider, capping real `1m` history at 30 days.
- `runtime.test.ts` proves shutdown order through timer teardown calls rather than through the invariant that no write follows `stop()`.
- `contains` is called with an inverted interval when `end` predates the history floor.
- `bar-aggregator-stop.test.ts` duplicates the aggregator test harness.
