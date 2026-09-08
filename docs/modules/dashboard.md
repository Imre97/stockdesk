# Module 2: Dashboard Shell

Status: specified

## Scope

The authenticated application frame and the home dashboard, modeled on the Interactive Brokers desktop layout.

Included:

- App shell: header, secondary navigation bar with tabs, collapsible left sidebar, main content area, responsive behavior.
- Header: brand, ticker search input (UI only, behavior arrives with Module 3), profile menu with language switch, theme switch, settings link, logout.
- Navigation tabs under the header: Portfolio (the dashboard), Reports (placeholder page in this module), Deposit. Module 4 inserts an Orders tab between Portfolio and Reports.
- Simulated deposit: the user picks an account, enters an amount, confirms, and the cash appears on that account immediately. Mimics an external funding source without any real integration. Every cash movement is recorded in a `CashTransaction` ledger that later modules (transfers, fills, reports) reuse.
- Internationalization: English and Hungarian UI, JSON resource files under `apps/web/src/i18n/locales/`.
- Theme: light, dark, system, no flash on first paint.
- User settings: language, theme, default account. Persisted server-side, cached in `localStorage`.
- Accounts: a user owns one or more trading accounts. This module delivers the data model, list, create, rename, default account on registration, and the sidebar that shows each account's equity, unrealized P&L, and daily P&L.
- Equity chart: active account equity over time with range selector 1D, 5D, 1W, 1M, 1Y. Backed by periodic equity snapshots.
- Positions table: open positions of the active account with profit and daily change columns. Data contract defined here; rows stay empty until the Orders module exists.
- WebSocket channel `account_summary` for live sidebar updates. Message shape defined here; emitted on every snapshot tick.

Out of scope for this module (deferred to later modules): money transfer between accounts (Module 5), report content (Module 5), live price feed (Module 3), order entry (Module 4), real position P&L math (Module 4), ticker search behavior (Module 3), price chart (Module 3). Withdrawals and account deletion are backlog items.

## Changes to Module 1 (Auth)

- `User.cashBalance` is removed. Cash lives on `Account`.
- Registration creates one `Account` named `Main` with `cashBalance = 100000`, a `CashTransaction` of type `DEPOSIT` for that amount with note `initial funding`, and a `UserSettings` row with defaults.
- The `user` API shape drops `cashBalance`. Account balances come from `GET /api/v1/accounts`.

`docs/modules/auth.md` has been updated accordingly.

## Data model (Prisma)

```prisma
model Account {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  name        String
  cashBalance Decimal  @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  snapshots    AccountEquitySnapshot[]
  transactions CashTransaction[]

  @@unique([userId, name])
  @@index([userId])
}

enum CashTransactionType {
  DEPOSIT
  WITHDRAWAL
  TRANSFER_IN
  TRANSFER_OUT
  TRADE
}

model CashTransaction {
  id           String              @id @default(cuid())
  accountId    String
  account      Account             @relation(fields: [accountId], references: [id], onDelete: Cascade)
  type         CashTransactionType
  amount       Decimal
  balanceAfter Decimal
  note         String?
  referenceId  String?
  createdAt    DateTime            @default(now())

  @@index([accountId, createdAt])
}

model UserSettings {
  userId           String   @id
  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  language         String   @default("en")
  theme            String   @default("system")
  defaultAccountId String?
  updatedAt        DateTime @updatedAt
}

model AccountEquitySnapshot {
  id             String   @id @default(cuid())
  accountId      String
  account        Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  at             DateTime
  cash           Decimal  @db.Decimal(20, 2)
  positionsValue Decimal  @db.Decimal(20, 2)
  equity         Decimal  @db.Decimal(20, 2)

  @@unique([accountId, at])
}
```

Constraints:

- Maximum 10 accounts per user (`ACCOUNT_LIMIT_REACHED`). The limit is the shared constant `ACCOUNT_LIMIT = 10` in `packages/shared`, not an environment variable.
- `name` 1 to 40 characters, unique per user, trimmed. Uniqueness is case-sensitive, exactly as `@@unique([userId, name])` behaves, so `Main` and `main` may coexist. Renaming an account to its current name returns `200`.
- `language` in `en | hu`. `theme` in `light | dark | system`.
- `defaultAccountId` must reference an account of the same user; set to the `Main` account at registration. Falls back to the oldest account if the referenced one no longer exists. The fallback is computed at read time, in `GET /settings` and in the accounts bootstrap, and is never written back to the row. `PATCH /settings` rejects an explicit `null` for `defaultAccountId` with `422 VALIDATION_ERROR`.
- `CashTransaction.amount` is signed: positive for money entering the account, negative for money leaving. `balanceAfter` is the account cash right after the entry. Only `DEPOSIT` is produced in this module; the other types are reserved for later modules and listed now so the ledger schema does not change. `referenceId` links to an order, transfer, or other source record.
- Deposit amount: greater than 0, at most 2 decimal places, at most `1000000.00` per deposit (`DEPOSIT_LIMIT_EXCEEDED`). The ceiling is the shared constant `DEPOSIT_LIMIT = "1000000.00"` in `packages/shared`, not an environment variable, so `depositSchema` enforces it on both sides.
- `note` is trimmed and at most 200 characters, otherwise `422 VALIDATION_ERROR`.
- `AccountEquitySnapshot.at` is truncated to the second. `@@unique([accountId, at])` is the only index on those columns; it already provides the btree the equity queries need, so no separate `@@index([accountId, at])` is declared. `@@unique([accountId, at])` plus `skipDuplicates` on the write makes a tick idempotent, so the boot snapshot never collides with an interval tick or with a snapshot written by a cash operation in the same second.
- Cash update and ledger insert happen in one database transaction, as a single atomic conditional write (`UPDATE "Account" SET "cashBalance" = "cashBalance" + :amount ... RETURNING`, or `SELECT ... FOR UPDATE` inside the transaction). Never read-then-update.
- `Account.cashBalance` must always equal the latest `balanceAfter` of that account, where "latest" uses the same ordering as the transactions list, `(createdAt desc, id desc)`.

## Domain definitions

- **Equity** = `cash + positionsValue`. `positionsValue` = sum of signed `quantity * lastPrice` over open positions (short positions count negative). Zero until the Orders module exists. Module 4 refines the summary with `longValue`, `shortValue`, `shortMargin`, `reservedCash`, `buyingPower`, `marginDeficit`.
- **Unrealized P&L** = sum of `(lastPrice - averageCost) * quantity` over open positions with signed quantity. Zero until the Orders module exists.
- **Daily P&L** = `equity_now - equity_at_reference`. The reference is the last snapshot strictly before the most recent elapsed 09:30 `America/New_York` boundary, looked up without a lower bound on how far back it may lie. Before 09:30 on a weekday the reference boundary is yesterday's 09:30; on a weekend it is Friday's. With no prior snapshot, `dailyPnl` and `dailyPnlPct` are `"0.00"`. The DST transition days 2026-03-08 and 2026-11-01 are covered by tests.
- **Trading day** in this module = Monday to Friday in `America/New_York`, with no holiday calendar; Module 3's market status replaces this definition. `1D` covers the current New York trading day when today is a weekday, otherwise the last weekday; `5D` covers the last 5 weekdays. Range windows use this zone for day boundaries; the UI renders timestamps in the browser's local time.
- New York day and session boundaries are computed with `Intl.DateTimeFormat(..., { timeZone: "America/New_York" }).formatToParts`. No date library is added.

## Equity snapshots

- A scheduler in the API takes a snapshot of every account every `SNAPSHOT_INTERVAL_SECONDS` (default 60) while the server runs, plus one snapshot immediately after any cash-changing operation (registration, deposit, later transfers and fills).
- Snapshot job: `apps/api/src/modules/accounts/snapshot-job.ts`. The snapshot job and the thinning job are both started from `runBootTasks()` in `apps/api/src/boot.ts`, never directly from `server.ts`. A single `stop()` clears every timer, and each timer is `unref()`'d so it never holds the process open.
- Tests drive the jobs with an injected `now: () => Date` and direct `runSnapshotTick()` / `runThinning()` calls. No fake timers.
- Retention: fine-grained points kept `SNAPSHOT_FINE_RETENTION_DAYS` days, then thinned to one point per hour and kept `SNAPSHOT_COARSE_RETENTION_DAYS` days. Thinning runs once at boot and then every `SNAPSHOT_THINNING_INTERVAL_HOURS`. All four values are documented in `.env.example`.
- `POST /accounts` writes one snapshot and broadcasts `account_summary` after the transaction commits; registration writes one snapshot after commit through the same path deposits use. A failing snapshot is logged and never fails the parent operation.
- Every `account_summary` broadcast goes through the snapshot writer: the interval tick and each cash-changing operation both reach it, the latter after the transaction commits. No other code path emits the message.
- Sleep tolerance (free hosting suspends the process when idle): the job takes one snapshot for every account immediately at boot, then continues on its interval. Gaps in the series are expected; the equity endpoint returns only existing points and the chart draws them without interpolation. No backfill is attempted, because the equity during the gap is unknown.

## API

Base path: `/api/v1`

### Accounts

| Method | Path | Body | Success | Notes |
|--------|------|------|---------|-------|
| GET | `/accounts` | none | `200 { accounts: AccountSummary[] }` | Ordered by `createdAt`. |
| POST | `/accounts` | `{ name }` | `201 { account: AccountSummary }` | New account starts with `cashBalance = 0`. Writes one snapshot and broadcasts `account_summary` after commit. `409 ACCOUNT_NAME_TAKEN`, `422 ACCOUNT_LIMIT_REACHED`. |
| PATCH | `/accounts/:id` | `{ name }` | `200 { account: AccountSummary }` | `404 ACCOUNT_NOT_FOUND` for unknown ids and for accounts of other users. Renaming to the current name returns `200`. |
| GET | `/accounts/:id/equity?range=1D` | none | `200 { range, points: EquityPoint[] }` | `range` in `1D, 5D, 1W, 1M, 1Y`, defaults to `1D` when omitted. `404 ACCOUNT_NOT_FOUND` for an unknown or foreign id, `422 VALIDATION_ERROR` for an invalid `range`. |
| GET | `/accounts/:id/positions` | none | `200 { positions: Position[] }` | Returns `[]` until the Orders module. Shape is final. `404 ACCOUNT_NOT_FOUND` for an unknown or foreign id. |
| POST | `/accounts/:id/deposits` | `{ amount, note? }` | `201 { account: AccountSummary, transaction: CashTransaction }` | Simulated external funding. Atomic cash update + ledger row, then snapshot + `account_summary` broadcast. `422 VALIDATION_ERROR`, `422 DEPOSIT_LIMIT_EXCEEDED`, `404 ACCOUNT_NOT_FOUND`. |
| GET | `/accounts/:id/transactions?limit=50&cursor=` | none | `200 { transactions: CashTransaction[], nextCursor }` | Newest first, ordered by `(createdAt desc, id desc)`. `limit` defaults to 50 and is capped at 100; `cursor` is an opaque base64url keyset cursor over `(createdAt, id)`; `nextCursor` is `null` once the list is exhausted. `404 ACCOUNT_NOT_FOUND` for an unknown or foreign id, `422 VALIDATION_ERROR` for an invalid `limit` or `cursor`. Used by the deposit page history list; the Reports module builds on it later. |

`CashTransaction`:

```json
{
  "id": "clx...",
  "accountId": "clx...",
  "type": "DEPOSIT",
  "amount": "5000.00",
  "balanceAfter": "105000.00",
  "note": "initial funding",
  "referenceId": null,
  "createdAt": "2026-09-08T10:05:00.000Z"
}
```

`AccountSummary`:

```json
{
  "id": "clx...",
  "name": "Main",
  "cash": "100000.00",
  "positionsValue": "0.00",
  "equity": "100000.00",
  "unrealizedPnl": "0.00",
  "unrealizedPnlPct": "0.00",
  "dailyPnl": "0.00",
  "dailyPnlPct": "0.00",
  "createdAt": "2026-09-08T10:00:00.000Z"
}
```

Every money and P&L field of `AccountSummary` carries exactly 2 decimal places. `unrealizedPnlPct` = `unrealizedPnl` divided by the cost basis of the open positions; `dailyPnlPct` = `dailyPnl` divided by the previous-close equity. Both are percentages with 2 decimal places, and both are `"0.00"` when the denominator is zero.

`EquityPoint`: `{ "at": "2026-09-08T14:30:00.000Z", "equity": "100000.00" }`. `at` is the timestamp of the last snapshot inside the bucket, a real observation; points are never interpolated and never moved to the bucket boundary.

`Position`:

```json
{
  "symbol": "AAPL",
  "quantity": "10",
  "averageCost": "180.2500",
  "lastPrice": "182.1000",
  "marketValue": "1821.00",
  "unrealizedPnl": "18.50",
  "unrealizedPnlPct": "1.03",
  "dailyChange": "-4.20",
  "dailyChangePct": "-0.23"
}
```

Range to bucket mapping, server-side downsampling (last value in bucket):

| Range | Window | Bucket |
|-------|--------|--------|
| 1D | current trading day, or the last one if closed | 1 minute |
| 5D | last 5 trading days | 5 minutes |
| 1W | last 7 calendar days | 15 minutes |
| 1M | last 30 calendar days | 1 hour |
| 1Y | last 365 calendar days | 1 day |

Downsampling runs in SQL over `"at" AT TIME ZONE 'America/New_York'`, always with `DISTINCT ON` per bucket ordered by `at DESC` so the last value in each bucket wins. The 1-minute, 1-hour and 1-day buckets use `date_trunc`; the 5-minute and 15-minute buckets have no `date_trunc` unit and use `date_bin('5 minutes' | '15 minutes', "at" AT TIME ZONE 'America/New_York', origin)` instead (PostgreSQL 14+). No explicit cap on the number of returned points is applied; retention bounds the row count.

Ranges with no snapshots return an empty `points` array; the UI renders an empty state.

### Settings

| Method | Path | Body | Success | Notes |
|--------|------|------|---------|-------|
| GET | `/settings` | none | `200 { settings }` | |
| PATCH | `/settings` | `{ language?, theme?, defaultAccountId? }` | `200 { settings }` | `422 VALIDATION_ERROR` on unknown values, `404 ACCOUNT_NOT_FOUND` for foreign account id. |

`settings`: `{ "language": "en", "theme": "system", "defaultAccountId": "clx..." }`

### Error codes

Account codes live in `ACCOUNT_ERROR_CODES` in `packages/shared/src/accounts.ts`:

| Code | Status |
|------|--------|
| `ACCOUNT_NOT_FOUND` | 404 |
| `ACCOUNT_NAME_TAKEN` | 409 |
| `ACCOUNT_LIMIT_REACHED` | 422 |
| `DEPOSIT_LIMIT_EXCEEDED` | 422 |

`VALIDATION_ERROR` (422) and `UNAUTHORIZED` (401) are raised by every module, so they move out of `AUTH_ERROR_CODES` into `API_ERROR_CODES` in `packages/shared/src/api-error.ts`, next to `NOT_FOUND` (404), `PAYLOAD_TOO_LARGE` (413) and `INTERNAL_ERROR` (500). `docs/modules/auth.md` records the same split. The `ErrorCode` union becomes auth codes | account codes | app-wide codes. No code or status emitted by an existing endpoint changes.

## WebSocket

Channel messages after the auth handshake defined in Module 1.

Server to client, sent to every socket of the owning user on each snapshot tick and after any cash-changing operation:

```json
{ "type": "account_summary", "accounts": [AccountSummary] }
```

No client subscription needed; every authenticated socket receives its own user's accounts. This module defines no `subscribe` or `unsubscribe` verb: after the auth handshake the server ignores unknown client messages and keeps the socket open rather than closing it. Subscriptions arrive with Module 3, and `docs/01-architecture.md` says the same.

The WebSocket server keeps a per-server registry `Map<userId, Set<WebSocket>>` and exposes `broadcastToUser(userId, message)`. The `account_summary` message carries the user's full account list, produced by the same serializer as `GET /accounts` and ordered by `createdAt`.

## Shared package

- `packages/shared/src/accounts.ts`: `accountSummarySchema`, `createAccountSchema`, `renameAccountSchema`, `equityRangeSchema`, `equityPointSchema`, `positionSchema`, inferred types, `ACCOUNT_ERROR_CODES` with its `AccountErrorCode` union, and the constant `ACCOUNT_LIMIT = 10`.
- `packages/shared/src/funding.ts`: `depositSchema` (amount as `decimalString`, positive, 2 dp max, at most `DEPOSIT_LIMIT`), the constant `DEPOSIT_LIMIT = "1000000.00"`, `cashTransactionSchema`, `cashTransactionTypeSchema`, `transactionsPageSchema`.
- `packages/shared/src/settings.ts`: `languageSchema`, `themeSchema`, `settingsSchema`, `updateSettingsSchema`.
- `packages/shared/src/ws.ts`: `accountSummaryMessageSchema` and a discriminated union `serverMessageSchema` that later modules extend.
- `packages/shared/src/format.ts`: `formatMoney(value: Decimal, locale: string, currency = "USD")`, `formatPercent(value: Decimal, locale: string)`, `formatSignedMoney`. String-based grouping and separators derived from `Intl.NumberFormat.formatToParts` on a probe value; the `Decimal` itself is never converted to `number`.

## Frontend

### Styling and components

- Tailwind CSS with shadcn/ui components installed through the shadcn CLI into `apps/web/src/components/ui/`. Component list for this module: `button`, `input`, `label`, `select`, `dialog`, `dropdown-menu`, `table`, `tabs`, `card`, `tooltip`, `switch`, `separator`, `skeleton`, `sonner`.
- Tailwind v4: dark mode is declared with `@custom-variant dark (&:is(.dark *))`. The finance tokens are declared inside `@theme` as `--color-gain`, `--color-loss`, `--color-neutral`, with light and `.dark` values, so the utilities `text-gain`, `text-loss` and `text-neutral` exist. The token names `--gain`, `--loss`, `--neutral` in `docs/02-conventions.md` are realized as exactly these `@theme` colors.
- Theme via CSS variables on `:root` and `.dark`. Dense spacing scale for tables and sidebar rows.
- Theme application: `<html class="dark">` toggled by the theme store. The pre-mount bootstrap is a separate static asset, `apps/web/public/theme.js`, referenced from `index.html`; no inline script, so the helmet CSP stays at `script-src 'self'`. It reads the persisted settings before React mounts so the first paint has the right theme, and tolerates a missing or corrupt value. `system` follows `prefers-color-scheme` and reacts to changes.
- `localStorage` holds one JSON blob under `stockdesk.settings` (`{ language, theme, defaultAccountId }`) plus `stockdesk.sidebarCollapsed`.

### i18n

- `i18next` + `react-i18next`.
- Files: `apps/web/src/i18n/index.ts` (setup), `apps/web/src/i18n/locales/en/*.json`, `apps/web/src/i18n/locales/hu/*.json`.
- Namespaces per feature: `common`, `auth`, `shell`, `dashboard`, `accounts`, `funding`, `settings`. `funding` is new in this module and carries the deposit page. Same key set in every language; a unit test asserts key parity between `en` and `hu`.
- Keys are English, dotted, camelCase and are not prefixed with their namespace: the key is `equityChart.range.oneDay` inside the `dashboard` namespace.
- Catalogs are loaded with an eager `import.meta.glob` over `locales/*/*.json` instead of a hand-maintained import list, which closes TD-5.
- Language resolution order: server settings, `localStorage.language`, browser language, `en`.
- Dates and numbers use the active locale via `Intl` and the shared `format.ts` helpers.
- Hungarian text is allowed only inside `apps/web/src/i18n/locales/hu/`. Nowhere else in the repository.

### Routes

```
apps/web/src/routes/
├── _authenticated.tsx            # AppShell layout, loads settings + accounts once
└── _authenticated/
    ├── index.tsx                 # Portfolio tab: EquityChart + PositionsTable
    ├── reports.tsx               # Reports tab: placeholder page, content in the Portfolio module
    ├── deposit.tsx               # Deposit tab: DepositForm + recent transactions
    └── settings.tsx              # settings form (reached from the profile menu)
```

### Layout

```
+----------------------------------------------------------------------------------+
| Header: [Brand] [Ticker search ..........................] [Profile menu]        |
+----------------------------------------------------------------------------------+
| Nav tabs: [Portfolio] [Reports] [Deposit]                                        |
+------------------+---------------------------------------------------------------+
| Sidebar          | Main (Portfolio tab)                                          |
| [<] collapse     | Active account: Main       Equity 100,000.00  Day +0.00       |
| Accounts         | [1D][5D][1W][1M][1Y]                                          |
|  v Main  (active)|  Equity chart (Lightweight Charts, area series)               |
|     Equity       |                                                               |
|     Unrealized   |---------------------------------------------------------------|
|     Daily        | Positions                                                     |
|  > Savings       | Symbol Qty AvgCost Last MktValue UnrlPnl UnrlPnl% Day Day%    |
|  [+ New account] | (empty state until Orders module)                             |
+------------------+---------------------------------------------------------------+
```

Deposit tab main area:

```
+---------------------------------------------------------------+
| Deposit funds                                                 |
| Account   [ Main  (100,000.00)          v ]                   |
| Amount    [ 5,000.00                      ] USD               |
| Note      [ optional                      ]                   |
|                                   [ Deposit ]                 |
|---------------------------------------------------------------|
| Recent transactions (selected account)                        |
| Date            Type      Amount        Balance after         |
| 2026-09-08 ...  DEPOSIT   +5,000.00     105,000.00            |
+---------------------------------------------------------------+
```

- Nav tabs are TanStack `Link`s with active styling; the sidebar stays visible on every tab.
- Deposit form: account select defaults to the active account; amount input accepts locale-formatted input and is parsed to `Decimal` in the funding mapper; submit disabled while pending; success toast and the sidebar row updates from the response before the WebSocket message arrives.
- Reports tab shows a titled empty state with a short explanation; Module 5 fills it.
- Module 5 adds a funding source switch to this page ("External" or "From another account") and the transfer form; `CashTransaction` gains `counterpartyAccountId` there.

- Sidebar widths: 280 px expanded, 56 px collapsed (icon rail with account initials). Collapsed state persisted in `localStorage` under `stockdesk.sidebarCollapsed` (UI-only preference).
- Below 1024 px the sidebar becomes an overlay drawer toggled from the header.
- Account rows expand and collapse individually; the active account is highlighted and selected by clicking the row header. Active account id lives in the accounts store, initialized from `settings.defaultAccountId`.
- P&L values are colored positive/negative through the semantic finance tokens (`text-gain`, `text-loss`), not hard-coded colors.
- Ticker search input renders with placeholder text and is disabled with a tooltip until Module 3 replaces it with the live combobox.

### Feature files

```
apps/web/src/features/
├── shell/
│   ├── store.ts                  # sidebar collapsed, drawer open
│   └── components/               # AppShell, Header, NavTabs, Sidebar, ProfileMenu, TickerSearchInput
├── funding/
│   ├── api.ts                    # deposit, listTransactions
│   ├── hooks.ts                  # useDeposit (mutation, updates accounts store), useTransactions(accountId)
│   ├── mappers.ts                # amount input string -> Decimal, CashTransaction DTO -> view model
│   └── components/               # DepositForm, TransactionsList
├── accounts/
│   ├── store.ts                  # accounts list, activeAccountId, applyAccountSummary(ws)
│   ├── api.ts                    # list, create, rename, equity, positions
│   ├── hooks.ts                  # useAccounts, useActiveAccount, useEquity(range), usePositions
│   ├── mappers.ts                # DTO strings -> Decimal view models
│   └── components/               # AccountList, AccountRow, CreateAccountDialog, RenameAccountDialog
├── dashboard/
│   ├── hooks.ts                  # useEquityChartData(range) -> Lightweight Charts series data
│   ├── mappers.ts                # EquityPoint[] -> { time, value }[]
│   └── components/               # EquityChart, RangeSelector, PositionsTable, AccountHeader
└── settings/
    ├── store.ts                  # language, theme, defaultAccountId, apply side effects
    ├── api.ts
    ├── hooks.ts                  # useSettings, useTheme, useLanguage
    └── components/               # SettingsForm, LanguageSwitch, ThemeSwitch
apps/web/src/lib/ws.ts             # WebSocket client: connect with access token, auth handshake, reconnect with backoff, dispatch messages to stores
```

- `lib/ws.ts` reconnects with exponential backoff (1 s to 30 s), re-authenticates with the current access token, and dispatches `account_summary` into the accounts store.
- `EquityChart` wraps `lightweight-charts@^5` in a `useEffect`; series data comes from `useEquityChartData`. Chart colors read the CSS variables so theme switches re-style the chart.
- The only sanctioned `Decimal` to `number` conversion in the web app is `Decimal.prototype.toNumber()` inside `features/dashboard/mappers.ts`, needed for the chart series data. No other web file may hold a price or money value as a `number`.
- All `.tsx` files stay render-only; Decimal math and formatting happen in mappers and hooks.

## Environment

Additions to `.env.example`:

```
SNAPSHOT_INTERVAL_SECONDS=60
SNAPSHOT_FINE_RETENTION_DAYS=7
SNAPSHOT_COARSE_RETENTION_DAYS=400
SNAPSHOT_THINNING_INTERVAL_HOURS=24
```

All four are positive integers, validated in `apps/api/src/lib/config.ts` with the defaults shown above, and listed in `render.yaml` as `sync: false` entries like the other tunables.

## Decisions (2026-09-08)

Answers given by the user in the spec pre-review. Everything above already reflects them; this list records the ones that are about sequencing and tooling rather than behavior.

1. Implementation phases: Phase 0 records these decisions, adds the `AccountEquitySnapshot` model with migration `account_equity_snapshot`, and adds the four snapshot environment variables. Phase A moves `VALIDATION_ERROR` and `UNAUTHORIZED` into `API_ERROR_CODES` and introduces `ACCOUNT_ERROR_CODES`. Phase B implements the API, and its `GET /accounts` coverage closes TD-1. Phase C implements the frontend and closes TD-3 (login and register centered in a card, design tokens instead of raw palette classes).
2. TD-5 closes in this module: locale catalogs are loaded with an eager `import.meta.glob` instead of a hand-maintained import list.
3. Chart library: `lightweight-charts@^5`.
4. The single sanctioned `Decimal` to `number` conversion in the web app is `Decimal.prototype.toNumber()` in `features/dashboard/mappers.ts`, for chart series data only.
5. The e2e suite runs the snapshot job at the default 60 s interval against `stockdesk_e2e`; accepted as is.
6. No holiday calendar in this module. Module 3's market status replaces the Monday-to-Friday trading-day rule.

## Acceptance criteria

1. Registration creates a `Main` account with `cash = "100000.00"` and default settings `{ language: "en", theme: "system", defaultAccountId: <Main id> }`.
2. `GET /accounts` returns only the caller's accounts with every monetary field as a string; `equity` equals `cash` while no positions exist.
3. `POST /accounts` with a duplicate name returns `409 ACCOUNT_NAME_TAKEN`; the eleventh account returns `422 ACCOUNT_LIMIT_REACHED`.
4. `PATCH /accounts/:id` on another user's account returns `404 ACCOUNT_NOT_FOUND`.
5. `GET /accounts/:id/equity?range=1D` returns bucketed points ordered by `at`; an invalid range returns `422 VALIDATION_ERROR`.
6. The snapshot job writes one row per account per interval and broadcasts `account_summary` to the owner's sockets only.
7. `PATCH /settings` persists language and theme; reloading the app applies both without a visible flash.
8. Switching language re-renders all visible strings; `en` and `hu` resource files have identical key sets.
9. Sidebar collapses to the icon rail and remembers the state after reload; below 1024 px it renders as a drawer.
10. Selecting an account in the sidebar switches the equity chart and positions table to that account.
11. Range selector changes the chart data and highlights the active range.
12. Positions table renders the empty state when `positions` is empty and the full column set when given fixture rows.
13. No Hungarian text exists outside `apps/web/src/i18n/locales/hu/`.
14. `POST /accounts/:id/deposits` with `"5000.00"` raises `cash` by exactly that amount, writes one `DEPOSIT` ledger row whose `balanceAfter` equals the new cash, and broadcasts `account_summary`. Amount `0`, negative, more than 2 decimals, or above the limit returns `422`.
15. Registration produces exactly one `DEPOSIT` transaction of `100000.00` on the `Main` account.
16. Deposit page: choosing an account and submitting an amount shows the new balance in the sidebar row and the transaction at the top of the list without a reload.
17. Nav tabs switch between Portfolio, Reports, and Deposit routes; the active tab is highlighted; the sidebar remains visible.

## Tests

- Test environment: every API suite builds the app with `createApp({ rateLimit: { enabled: false } })` as in Module 1, and `apps/api/vitest.config.ts` sets `TZ: "UTC"` so the New York boundary math is machine-independent.
- API integration: criteria 1 to 6, 14, 15. The jobs are driven by direct `runSnapshotTick()` / `runThinning()` calls with an injected `now: () => Date`, never with fake timers. The ledger invariant `cashBalance == latest balanceAfter` (ordering `(createdAt desc, id desc)`) is asserted after each cash operation. The daily P&L reference is tested across the DST days 2026-03-08 and 2026-11-01.
- AC9 of `auth.md` (no monetary field travels as a JSON number) is re-verified here against `GET /accounts`, which closes TD-1. `MONETARY_KEY_PATTERN` in `apps/api/test/helpers.ts` also matches `positionsValue`, `unrealizedPnl`, `dailyPnl`, `averageCost`, `marketValue` and `dailyChange`.
- Shared: schema tests including `depositSchema` boundaries, `formatMoney` and `formatPercent` for `en-US` and `hu-HU` locales, key parity test for i18n resources.
- Web: accounts store (apply `account_summary`, active account switching, apply deposit response), funding mapper (locale input parsing to `Decimal`), dashboard mappers (shape mapping only), `lib/ws.ts` reconnect and handshake with a mocked WebSocket, `AccountRow`, `PositionsTable`, `DepositForm`, `NavTabs` render tests with fixtures, theme store applying the `dark` class.
- Charts: jsdom cannot render `lightweight-charts`, so unit tests cover `features/dashboard/mappers.ts` and `useEquityChartData` only. Any `EquityChart` render test mocks the library. The chart container and the range-button state are asserted end to end instead.
- End to end (`apps/e2e`): `dashboard.spec.ts` (shell navigation, sidebar collapse persistence, account switch), `deposit.spec.ts` (a deposit shows the new balance and the ledger row without a reload), `settings.spec.ts` (language switch, theme survives a reload). `auth.spec.ts` keeps passing with a selector update only: the header shows the display name and logout moves into the profile menu. The snapshot job runs with its default 60 s interval against `stockdesk_e2e`.
