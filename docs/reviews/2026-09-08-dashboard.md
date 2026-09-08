# Review: dashboard — 2026-09-08

Commits reviewed: `5df5bac`, `8af9d47`, `61c0ce9`, `f8524ee` on top of `acfe04c`.

## Gate 1

- `npm run lint` → exit 0 (eslint + English guard)
- `npm test -- --run` → exit 0: api 189, web 174, shared 279
- `npm run typecheck` 0, `npm run build` 0, `npm run e2e` 18 passed

## Verdict

BLOCKED — 2 blockers, 5 should-fix, 7 nice-to-have: AC11's "changes the chart data" half has no test anywhere (`features/dashboard/hooks.ts` is completely untested, contrary to the spec's own test plan), and the deposit page renders the ledger of the sidebar-active account while the form deposits into the form-selected account, so AC16 fails for any account other than the active one. Gate results were taken as reported; the reviewer re-verified the SQL time-zone finding directly against `stockdesk_test` in the running container.

## Acceptance criteria coverage

| # | Criterion (short) | Test file:line | Status |
|---|---|---|---|
| 1 | Registration creates funded `Main` + default settings | `apps/api/test/accounts.list.test.ts:31`, `:53` | covered |
| 2 | `GET /accounts` caller-only, strings, equity == cash | `apps/api/test/accounts.list.test.ts:90`, `:102`, `:31` | covered |
| 3 | Duplicate name 409, eleventh account 422 | `apps/api/test/accounts.create-rename.test.ts:39`, `:58`, race `:72` | covered |
| 4 | `PATCH /accounts/:id` foreign → 404 | `apps/api/test/accounts.create-rename.test.ts:149` | covered |
| 5 | `equity?range=1D` bucketed + ordered, invalid range 422 | `apps/api/test/accounts.equity.test.ts:51`, `:134` | covered (1Y day bucket untested, see S1) |
| 6 | Snapshot tick: one row/account, owner-only broadcast | `apps/api/test/snapshot-job.test.ts:50`, `apps/api/test/ws-account-summary.test.ts:91` | covered |
| 7 | `PATCH /settings` persists language+theme, no flash on reload | `apps/api/test/settings.test.ts:74`, `apps/e2e/tests/settings.spec.ts:52`, `apps/web/src/theme-bootstrap.test.ts:33` | covered |
| 8 | Language switch re-renders; `en`/`hu` key parity | `apps/e2e/tests/settings.spec.ts:23`, `apps/web/src/i18n/locales.test.ts:49` | covered |
| 9 | Sidebar rail + persistence + drawer < 1024 px | `apps/e2e/tests/dashboard.spec.ts:47`, `:66`, `apps/web/src/features/shell/store.test.ts:29` | covered |
| 10 | Sidebar selection switches chart and positions | `apps/e2e/tests/dashboard.spec.ts:84`, `apps/web/src/features/accounts/store.test.ts:84` | weak (positions/header asserted; chart-to-account binding untested) |
| 11 | Range selector changes chart data + highlights range | `apps/e2e/tests/dashboard.spec.ts:105` (highlight only) | missing (data half) |
| 12 | Positions empty state and full column set | `apps/web/src/features/dashboard/components/PositionsTable.test.tsx:46`, `:53` | covered |
| 13 | No Hungarian outside `locales/hu` | `scripts/check-language.mjs:10`, `apps/api/test/check-language.test.ts` | covered |
| 14 | Deposit credits cash + ledger + broadcast; 422 cases | `apps/api/test/deposits.test.ts:40`, `:96`, `:107`, `:117`, `:140`, `:151` | covered |
| 15 | Registration writes exactly one 100000.00 DEPOSIT | `apps/api/test/accounts.list.test.ts:65` | covered |
| 16 | Deposit page shows new balance + top ledger row, no reload | `apps/e2e/tests/deposit.spec.ts:30`, `apps/web/src/features/funding/hooks.test.tsx:67` | weak (only when the chosen account is the active one) |
| 17 | Nav tabs switch routes, active highlight, sidebar stays | `apps/e2e/tests/dashboard.spec.ts:30`, `apps/web/src/features/shell/components/NavTabs.test.tsx:33` | covered |

## Findings

### Blockers

- `apps/web/src/features/dashboard/hooks.ts:29` — no test file exists for this module's hooks; `EquityChart.test.tsx:33` mocks `../hooks` wholesale, so nothing proves that a range change produces different chart data, nor that `useEquityChartData` forwards `range`/`useActiveAccountId()` into `equityQueryKey`. AC11's data half and AC10's chart binding are unproven, and the spec's test plan explicitly demands `useEquityChartData` coverage. Add `features/dashboard/hooks.test.ts`: mock `accounts/api.getEquity`, assert the series changes when `range` goes `1D` → `1W` and when the active account changes.
- `apps/web/src/routes/_authenticated/deposit.tsx:11` — the ledger list is bound to `useActiveAccountId()`, while `useDepositForm` keeps its own `selectedId` (`apps/web/src/features/funding/hooks.ts:105`) and `useDeposit` caches the new row under `variables.accountId` (`:67`). Depositing into a non-active account credits it correctly but the list keeps showing the active account, so the new transaction is never rendered — AC16 and the spec's "Recent transactions (selected account)" both fail. Drive the list from the form's selected account (expose it from the hook or move the selection into the accounts store) and add an e2e case that deposits into `Savings` while `Main` is active.

### Should fix

- `apps/api/src/modules/accounts/equity.ts:44` — `"at" AT TIME ZONE 'America/New_York'` is applied to a `timestamp(3)` column (`migration.sql`, `at TIMESTAMP(3)`), so it adds the offset instead of subtracting it. Verified in `stockdesk_test`: `2026-09-08 21:00` (17:00 NY) yields `date_trunc('day', …)` = `2026-09-09`, so the last observation of a NY day lands in the next day's bucket and two points of the same NY day can be returned for `1Y`. Use `("at" AT TIME ZONE 'UTC') AT TIME ZONE 'America/New_York'` and add a `1Y` test with points straddling 20:00 UTC; same expression in `apps/api/src/modules/accounts/snapshot-repository.ts:61` (harmless while offsets are whole hours, fix for consistency).
- `apps/api/src/modules/accounts/snapshot-repository.ts:44` — `referenceEquities` has no test, and no test seeds snapshots around a 09:30 New York boundary to assert `dailyPnl`/`dailyPnlPct`; `summary.test.ts:38` only checks the arithmetic with an injected reference. The spec's Tests section requires the daily P&L reference to be tested across the DST days 2026-03-08 and 2026-11-01. Add an integration test that seeds snapshots before/after the boundary on both DST days and asserts the `GET /accounts` `dailyPnl`.
- `apps/api/src/ws/user-registry.ts:42` — registry lifecycle is untested: nothing asserts that `apps/api/src/ws/auth-handshake.ts:79` removes a closed socket (`socketCount(userId) === 0`) or that `broadcastToUser` skips non-`OPEN` sockets. That cleanup is the only guard against unbounded in-memory growth in a long-running Render process, and `socketCount` currently has zero consumers. Add a `user-registry.test.ts` plus one handshake test that closes the socket and asserts the count drops.
- `apps/web/src/features/funding/hooks.ts:123` — `depositAmountSchema.safeParse(toApiString(parsed, 2))` rounds before validating, so typing `1000.005` silently submits `1000.00` instead of showing `errors.amountInvalid`. Validate `parsed.decimalPlaces() <= 2` on the parsed `Decimal` first, then serialize.
- `apps/web/src/features/accounts/components/CreateAccountDialog.tsx:32` — validation and mutation orchestration live in a `.tsx` submit handler (also `RenameAccountDialog.tsx:27`, `ProfileMenu.tsx:41` and `:52` calling `languageSchema.parse` / `themeSchema.parse`), against CLAUDE.md rule 4; `DepositForm.tsx` shows the correct pattern. Move them into `features/accounts/form.ts` / `useProfileMenu`.

### Nice to have

- `packages/shared/src/funding.ts:6` — `DEPOSIT_LIMIT` is exported as a `Decimal`, the spec says `DEPOSIT_LIMIT = "1000000.00"`. The code is better; update `docs/modules/dashboard.md:102`.
- `apps/api/test/snapshot-job.test.ts:147` — uses `vi.useFakeTimers()` while the spec states "No fake timers" for the jobs. The test is worth keeping; amend `docs/modules/dashboard.md:120` to allow fake timers for the `start`/`stop` scheduling test only.
- `apps/api/src/ws/auth-handshake.ts:18` — `wsAuthenticatedUserId` has no consumer; `apps/e2e/tests/helpers.ts:98` `depositViaApi` is unused. Remove both.
- `apps/web/src/features/shell/components/ProfileMenu.tsx:20` — the `defaultOpen` prop exists only to let tests open the menu; production code carries a test-only API.
- `apps/web/src/features/settings/sync.ts:15` — the settings query has no `staleTime`, so a window refocus after a failed `PATCH` refetches and overwrites the locally applied value that `usePersistSetting` deliberately kept.
- `apps/api/src/modules/accounts/router.ts:28` — the `Array.isArray(request.params.id)` branch is unreachable for Express route params; dead defensive code.
- `apps/api/src/modules/accounts/service.ts:80` — `create` snapshots every account of the user, while the spec says `POST /accounts` "writes one snapshot"; harmless with `skipDuplicates`, but state it in the spec or scope the write to the new account.

## Optimization opportunities

- `apps/api/src/modules/accounts/deposits.ts:55` — `afterCashChange` already builds the summaries, then `summarizeAccounts` runs again for the response: one redundant `referenceEquities` round trip per deposit. Return the summary from the writer. Now.
- `apps/api/src/modules/accounts/snapshot-writer.ts:63` — the interval tick issues one `referenceEquities` query per user and broadcasts to users with no sockets. Batch the reference query across all accounts and skip users with `socketCount === 0`. Next module.
- `apps/api/src/modules/accounts/repository.ts:66` — `listAllAccounts()` loads every account of every user each tick; grows linearly with signups. Page it or snapshot only accounts touched since the last tick. Later.
- `apps/api/src/ws/user-registry.ts:12` — no ping/pong heartbeat, so half-open sockets stay registered until restart. Add a 30 s ping sweep. Next module.
- `apps/web/src/features/accounts/hooks.ts:67` — `useEquity`/`usePositions` have no `staleTime`, so every switch and refocus refetches. Set `staleTime` to the snapshot interval. Now.
- `apps/api/prisma/schema.prisma:70` — `@@index([accountId, createdAt])` does not include `id`, while the keyset page orders by `(createdAt desc, id desc)`. Revisit when the Reports module pages the ledger. Later.

## Tech debt candidates

- WebSocket registry has no ping/pong sweep for half-open sockets.
- Dead code: `wsAuthenticatedUserId`, `depositViaApi` e2e helper, `ProfileMenu` test-only `defaultOpen` prop, unreachable `Array.isArray` branch in the accounts router.
- `POST /accounts` snapshots all of the user's accounts (spec says one).
- Per-tick reference query per user and broadcast to socketless users; `listAllAccounts()` unbounded.
- Deposit response recomputes summaries already built by the writer.
- `useEquity`/`usePositions` without `staleTime`.
- Keyset index does not include `id`.

TD items this module closes: TD-1 (AC9 non-vacuous at `apps/api/test/accounts.list.test.ts:102`), TD-3 (`AuthLayout.tsx` centers login/register in a card). TD-5 stays open per the tech-debt auditor: the eager glob removes the hand-maintained import list but still bundles every catalog.
