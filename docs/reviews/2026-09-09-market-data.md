# Review: market-data — 2026-09-09 (fourth, delta review after commit 9c3242f)

## Verdict
PASS WITH SHOULD-FIX — TD-68, TD-69 and TD-70 are fixed and proven by new tests (the reviewer re-ran `market.cache-authority`, `market.history-depth`, `market.bars`, `market.cache-advance` in `apps/api`: 4 files / 17 tests green); no new blocker, but the upsert is intolerant of a repeated bucket inside one batch and the new depth floor is taken from the first bars-capable provider rather than the one that actually answered.

Verification method: read the diff of `9c3242f` and `0cab120` and the current sources; ran the four candle test files above; one throwaway probe (`apps/api/test/zz-probe.test.ts`, created, run, deleted) called `insertFinalBars` with two inputs at the same `(symbolId, timeframe, time)` and got `ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time` / `HINT: Ensure that no rows proposed for insertion within the same command have duplicate constrained values.` (Prisma code `21000`). Gate 1 (coordinator, 2026-09-09): `npm run lint` clean; `npm test -- --run` api 79 files / 544 tests, web 61 / 378, shared 13 / 436, all passing; `npm run e2e` 28 passed. Checks requested: SQL is fully parameterised (every interpolation is a `Prisma.sql` value; `Prisma.join` composes only `Prisma.sql` tuples); `::decimal` carries `toApiString(..., 8)` strings into `Decimal(20, 8)` columns, no JS number anywhere on the path; `::timestamp` matches the migration's `"time" TIMESTAMP(3)` (`20260908144958_market_data/migration.sql:43`) and the round trip is proven by `market.cache-authority.test.ts:131` finding the row at the exact instant with `count === 1`; the `Promise.all` concurrency test (`market.bars.test.ts:142`) still passes — both statements order rows identically, so no deadlock; `saveFormingBar`/`finalizeBar` are byte-identical; `hasMore` still derives from `fetched.length` (`candles.ts:131`, `:166`), not from the upsert's row count, and `insertFinalBars`'s return value has no other caller.

## Acceptance criteria coverage
| # | Criterion (short) | Test file:line | Status |
|---|---|---|---|
| 1 | No keys → simulated only | `apps/api/src/modules/market/providers/factory.test.ts:69` | covered (unchanged) |
| 2 | `search?q=tsl` ordering | `apps/api/test/market.search.test.ts:32` | covered (unchanged) |
| 3 | Detail shape, unknown → 404 | `apps/api/test/market.detail.test.ts:45`, `:114` | covered (unchanged) |
| 4 | Bars ascending, cache hit, `end` page, `hasMore` | `apps/api/test/market.bars.test.ts:42`, `:58`, `:72`, `:104`; `apps/api/test/market.history-depth.test.ts:90`, `:99` | covered |
| 5 | Invalid timeframe → 422 `INVALID_TIMEFRAME` | `apps/api/test/market.bars.test.ts:124` | covered (unchanged) |
| 6 | Quotes deliver / unsubscribe / `SUBSCRIPTION_LIMIT` | `apps/api/test/ws-quotes.test.ts:132`, `:210` | covered (unchanged) |
| 7 | Bars channel non-final per trade, final at rollover | `apps/api/test/ws-bars.test.ts:85`; `apps/api/src/modules/market/bar-aggregator-stop.test.ts:77` | covered (unchanged) |
| 8 | Composite fallback, no mixed ticks | `apps/api/test/market.provider-fallback.test.ts:60` | covered (unchanged) |
| 9 | Alpaca Decimal parse, 30-symbol LRU | `apps/api/src/modules/market/providers/alpaca/stream.test.ts:185` | covered (unchanged) |
| 10 | Closed Saturday, open 10:00 NY | `apps/api/src/modules/market/calendar.test.ts:13`; `apps/api/test/market.status.test.ts:47` | covered (unchanged) |
| 11 | Ticker search dropdown, Enter, recents | `apps/web/src/features/shell/components/TickerSearch.test.tsx:57` | covered (unchanged) |
| 12 | Symbol page, interval switch reloads | `apps/web/src/features/market/components/PriceChart.test.tsx:202` | covered (unchanged) |
| 13 | Buy opens order slot | `apps/web/src/features/market/components/SidePanel.test.tsx:65` | covered (unchanged) |
| 14 | Unknown symbol → not-found state | `apps/web/src/features/market/components/SymbolNotFound.test.tsx:46` | covered (unchanged) |
| 15 | No monetary JSON number | `apps/api/test/market.bars.test.ts:21` | covered (unchanged) |

Decision 23 (`docs/modules/market-data.md`) is proven by `market.cache-authority.test.ts:119` (non-final row replaced), `:138` (wrong final row replaced), `:157` (forming bucket survives), `:176` (forming bar last on the REST page).

## Findings

### Blockers
- none.

### Should fix
- `apps/api/src/modules/market/candles-repository.ts:110` — one `VALUES` list that repeats a `(symbolId, timeframe, time)` aborts the whole statement with `ERROR: ON CONFLICT DO UPDATE command cannot affect row a second time` (probe-confirmed), turning a duplicated provider bar into a 500 on `GET /bars`; `createMany({ skipDuplicates: true })` used to swallow it. Deduplicate by bucket time (last wins) in `insertFinalBars`, or on `complete` at `candles.ts:104`.
- `apps/api/src/modules/market/providers/composite.ts:121` — `barsHistoryDepth` returns the depth of the *first* bars-capable provider, but `route` (`:93`) falls through to the next one after two failures, so an Alpaca outage makes the cache request a 10-year / 5-year window that only the simulated provider answers, and `addCoverage` (`candles.ts:125`) then marks the whole window covered from `range.start`; `missingRange` only ever extends the head afterwards, so that multi-year gap is never refetched even after Alpaca recovers. Floor with the depth of the provider that actually served, or add coverage only for the range that was served.
- `apps/api/src/modules/market/bar-aggregator.ts:133` — `close()` writes `finalizeBar` for a bucket that closed up to `SWEEP_INTERVAL_MS = 60_000` earlier (`:8`, when trades stop before the rollover); if a REST fetch upserted the provider's authoritative bar in that gap, the aggregator's partial live aggregate overwrites it as `isFinal = true` and coverage prevents any refetch — the residual half of TD-68, now silent because the row is final. Guard the finalize update with `WHERE "isFinal" = false`.

### Nice to have
- `apps/api/src/modules/market/timeframes.ts:126` — the `BUCKET_EPOCH_MS` clamp moved out of `historyFloorMs` into the simulated provider only (`providers/simulated/buckets.ts:77`), so the cache floor and the simulated generator floor are no longer the same value; unreachable while `now − 730 d > 2024-01-01`, but the invariant "the cache never asks for a range the simulated provider cannot generate" is no longer enforced by construction.
- `apps/api/src/modules/market/candles-repository.ts:100` — `gen_random_uuid()::text` gives provider-written candles a different id shape than the aggregator's `@default(cuid())` rows in the same table.
- `apps/api/test/market.history-depth.test.ts:99` — the simulated-only case asserts an empty page, which would also pass if the fetch failed for an unrelated reason; assert the provider was called with a `start` at the 30-day floor, or that it was not called.

## Optimization opportunities
- `apps/api/src/modules/market/candles-repository.ts:111` — `DO UPDATE` fires for every row of every refetched page, rewriting identical values; combined with the per-bucket refetch after each rollover this produces one dead tuple per bar per request on the largest table. Add `WHERE "Candle" IS DISTINCT FROM EXCLUDED` to the conflict action; gain is less WAL and autovacuum pressure on Neon free. Later.
- `apps/api/src/modules/market/candles.ts:142` — `barsHistoryDepth` walks and filters the provider list on every bars request; trivial cost, but it is recomputed per call while the answer only changes when a symbol is claimed. Memoise per symbol if the route ever gets hot. Later.

## Tech debt candidates
- A provider page that repeats a bucket makes the batched upsert abort the whole `GET /bars` request instead of skipping the duplicate.
- The history floor uses the first bars-capable provider's depth, so a fallback to the simulated provider marks years of unserved range as covered, permanently.
- `bar-aggregator.close()` can overwrite a provider-written final bar with its partial live aggregate for a bucket that closed before the sweep.
- The epoch clamp of the request floor now lives only in the simulated provider, not in `historyFloorMs`.
- Provider-inserted candles get `gen_random_uuid()::text` ids while aggregator rows get cuid.
- The simulated-only history-depth test asserts only an empty page, not the floored provider query.
