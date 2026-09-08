# Module 5: Transfers and Reports

Status: specified

## Scope

Included:

- Internal transfer between the user's own accounts, presented on the Deposit page as a funding source option ("From another account") next to the simulated external source.
- Reports tab content: a per-account statement for a selected period, modeled on a broker account statement: summary, performance chart against net deposits, realized P&L by symbol, trade statistics, executions list, cash activity, open positions, CSV export.
- Date filters on the existing trades endpoint.

Out of scope: withdrawals, account deletion or archiving, PDF statements, tax lots, time-weighted return, benchmark comparison. These have no module yet and sit in the backlog section of `00-overview.md`.

## Transfers

### Rules

- Source and target must belong to the same user and differ (`SAME_ACCOUNT`).
- Amount: positive, at most 2 decimals, at most `TRANSFER_LIMIT` per transfer (default `1000000.00`).
- Amount must not exceed the source account's `buyingPower` (Module 4 definition), so a transfer can never push an account into margin deficit or under its open-order reservations (`INSUFFICIENT_BUYING_POWER` with `required` and `available`).
- One database transaction: debit source cash, credit target cash, two `CashTransaction` rows (`TRANSFER_OUT` on the source with negative amount, `TRANSFER_IN` on the target with positive amount) sharing one `referenceId` (the transfer id) and pointing at each other through `counterpartyAccountId`. Then one equity snapshot for both accounts and an `account_summary` broadcast.
- Ledger invariant from Module 2 holds on both accounts.

### Data model

`CashTransaction` (Module 2) gains `counterpartyAccountId String?`. No new table.

### API

| Method | Path | Body | Success | Notes |
|--------|------|------|---------|-------|
| POST | `/transfers` | `{ fromAccountId, toAccountId, amount, note? }` | `201 { transfer: { id, from: AccountSummary, to: AccountSummary, transactions: [CashTransaction, CashTransaction] } }` | `404 ACCOUNT_NOT_FOUND` for foreign or unknown accounts, `422 SAME_ACCOUNT`, `422 INSUFFICIENT_BUYING_POWER`, `422 TRANSFER_LIMIT_EXCEEDED`, `422 VALIDATION_ERROR`. |

### Frontend

Deposit page (Module 2) gains a source selector above the form:

```
| Source    ( ) External (simulated)   (o) From another account   |
| From      [ Savings  (BP 42,000.00)              v ]            |
| To        [ Main     (100,000.00)                v ]            |
| Amount    [ 5,000.00                             ] USD          |
| Note      [ optional                             ]              |
|                                            [ Transfer ]         |
```

- `From` lists accounts other than `To`, showing buying power; `To` defaults to the active account. Swapping either side removes it from the other list.
- Validation and hint use the source buying power from the accounts store; the server remains authoritative.
- After success both sidebar rows update from the response; the transactions list below shows the `TRANSFER_IN` row with the counterparty account name.
- `features/funding` gains `TransferForm.tsx`, `useTransfer()` in `hooks.ts`, `transfer()` in `api.ts`. `DepositForm` becomes the external-source branch; a small `FundingSourceSwitch` component toggles between the two.

## Reports

### Period

- Presets: `MTD`, `30D`, `YTD`, `1Y`, `ALL`, and a custom `from` and `to` date pair. Day boundaries in `America/New_York` to match trading days; displayed in the browser locale.
- `from` defaults to the account creation date for `ALL`; `to` defaults to now.

### Definitions

All values `Decimal`, per account, for the selected period:

- `startEquity`: equity from the first `AccountEquitySnapshot` at or after `from` (or `0` if the account was created inside the period and has no earlier snapshot).
- `endEquity`: equity from the latest snapshot at or before `to`; when `to` is now, the live summary equity.
- `deposits`, `transfersIn`, `transfersOut`: sums from the ledger by type. `netDeposits = deposits + transfersIn - transfersOut`.
- `realizedPnl`: sum of `Trade.realizedPnl` in the period. `commissions`: sum of `Trade.commission`.
- `unrealizedChange`: unrealized P&L at `to` minus unrealized P&L at `from` (from snapshot components: `equity - cash` at each end, minus average-cost basis change is not tracked, so this is reported as `positionsValueChange`).
- `netPnl = endEquity - startEquity - netDeposits`.
- `returnPct = netPnl / (startEquity + netDeposits)` when the denominator is positive, otherwise `null`. Documented in the UI as a simple return, not time-weighted.
- Trade statistics are computed over reducing trades (those with non-null `realizedPnl`): `tradeCount`, `winCount`, `lossCount`, `winRate`, `averageWin`, `averageLoss`, `profitFactor = grossWins / |grossLosses|` (null when no losses), `largestWin`, `largestLoss`, `averageHoldingDays` (from the position `openedAt` of the round trip to the trade `executedAt`, averaged over trades that closed a position).

### API

Base path `/api/v1/accounts/:id/reports`, all protected, all accept `from` and `to` ISO date-times (or `preset`).

| Method | Path | Success | Notes |
|--------|------|---------|-------|
| GET | `/summary` | `200 { period, startEquity, endEquity, deposits, transfersIn, transfersOut, netDeposits, realizedPnl, commissions, positionsValueChange, netPnl, returnPct }` | |
| GET | `/equity-curve` | `200 { points: [{ at, equity, netDeposits }] }` | Bucketed like Module 2 ranges by period length; `netDeposits` is cumulative from `from`. |
| GET | `/realized-by-symbol` | `200 { rows: [{ symbol, tradeCount, boughtQuantity, soldQuantity, realizedPnl, commissions }] }` | Sorted by `realizedPnl` descending. |
| GET | `/trade-stats` | `200 { tradeCount, winCount, lossCount, winRate, averageWin, averageLoss, profitFactor, largestWin, largestLoss, averageHoldingDays }` | |
| GET | `/cash-activity` | `200 { totalsByType: { DEPOSIT, TRANSFER_IN, TRANSFER_OUT, TRADE }, transactions: CashTransaction[], nextCursor }` | `TRADE` total is the net cash effect of fills. Paginated list. |
| GET | `/export/trades.csv` | `200 text/csv` | Columns: executedAt, symbol, side, quantity, price, amount, commission, realizedPnl, orderId, orderType. |
| GET | `/export/cash-activity.csv` | `200 text/csv` | Columns: createdAt, type, amount, balanceAfter, counterpartyAccount, note, referenceId. |

`GET /accounts/:id/trades` (Module 3) gains `from` and `to` filters. Open positions come from the existing positions endpoint.

CSV: UTF-8 with BOM, comma separated, RFC 4180 quoting, numbers as plain decimal strings with a dot, timestamps ISO 8601 UTC. Filename header `Content-Disposition: attachment; filename="stockdesk-<account>-trades-<from>-<to>.csv"`.

### Error codes

`ACCOUNT_NOT_FOUND`, `INVALID_PERIOD` (`from` after `to`, or range over 5 years), `VALIDATION_ERROR`, `SAME_ACCOUNT`, `TRANSFER_LIMIT_EXCEEDED`, `INSUFFICIENT_BUYING_POWER`.

### Frontend

Route `apps/web/src/routes/_authenticated/reports.tsx` replaces the Module 2 placeholder.

```
+---------------------------------------------------------------------------------+
| Reports    Account [ Main  v ]    Period [MTD][30D][YTD][1Y][ALL][custom: from - to]
|                                                            [Export trades CSV] [Export cash CSV]
|---------------------------------------------------------------------------------|
| Summary                                                                         |
| Start equity 100,000.00   End equity 104,250.00   Net deposits 5,000.00         |
| Realized P&L 1,820.00     Commissions 0.00        Net P&L -750.00  Return -0.71%|
|---------------------------------------------------------------------------------|
| Performance: equity vs net deposits (two lines, Lightweight Charts)             |
|---------------------------------------------------------------------------------|
| Trade statistics                                                                |
| Trades 14  Win rate 57%  Avg win 310.00  Avg loss -190.00  Profit factor 1.9    |
| Largest win 900.00  Largest loss -420.00  Avg holding 3.2 days                  |
|---------------------------------------------------------------------------------|
| Realized P&L by symbol          | Open positions (now)                          |
| Symbol Trades Bought Sold P&L   | Symbol Qty AvgCost Last MktValue UnrlPnl      |
|---------------------------------------------------------------------------------|
| Executions (period)   Date Symbol Side Qty Price Amount Commission Realized P&L |
|---------------------------------------------------------------------------------|
| Cash activity (period)  Totals: Deposits / Transfers in / Transfers out / Trades|
|                        Date Type Amount Balance after Counterparty Note         |
+---------------------------------------------------------------------------------+
```

- Account selector defaults to the active account; changing it does not change the global active account.
- Period and account are reflected in the URL search params (TanStack Router `validateSearch`), so a report view is shareable and reload-safe.
- Sections load independently with skeletons; a failed section shows an inline retry.
- CSV export: fetch with the Bearer token, receive a blob, trigger a download with an object URL. Not a plain link, because the access token is not in a cookie.
- Below 1024 px sections stack in one column.

### Feature files

```
apps/web/src/features/reports/
├── api.ts              # summary, equityCurve, realizedBySymbol, tradeStats, cashActivity, exportTradesCsv, exportCashCsv
├── hooks.ts            # useReportPeriod (search params <-> preset/from/to), useReportSummary, useEquityCurve, useRealizedBySymbol, useTradeStats, useCashActivity, useCsvExport
├── mappers.ts          # DTO -> Decimal view models, period presets -> from/to in America/New_York, curve -> two Lightweight Charts line series
└── components/         # ReportsHeader, PeriodSelector, SummaryCards, PerformanceChart, TradeStatsCards, RealizedBySymbolTable, OpenPositionsTable (reuses PositionsTable), ExecutionsTable, CashActivityTable, ExportButtons
```

## Environment

Additions to `.env.example`:

```
TRANSFER_LIMIT=1000000.00
REPORT_MAX_RANGE_YEARS=5
```

## Acceptance criteria

1. `POST /transfers` moves `5000.00` from `Savings` to `Main`: source cash down, target cash up, two ledger rows with the same `referenceId`, opposite signs, and `counterpartyAccountId` set; ledger invariant holds on both; `account_summary` broadcast includes both accounts.
2. Transfer above the source buying power (source has open buy reservations or a short) returns `422 INSUFFICIENT_BUYING_POWER` and changes nothing.
3. Transfer to the same account returns `422 SAME_ACCOUNT`; to another user's account `404 ACCOUNT_NOT_FOUND`.
4. Summary for a period with a `100000` start, a `5000` deposit, and trades realizing `1820` while positions moved to give `104250` end equity returns `netDeposits "5000.00"`, `netPnl "-750.00"`, `returnPct "-0.71"` (2 decimals, half-even).
5. Summary for an account created inside the period uses `startEquity "0.00"` and counts the initial funding as a deposit.
6. `equity-curve` returns cumulative `netDeposits` that step up at each deposit and transfer in, and down at each transfer out.
7. `realized-by-symbol` aggregates trades per symbol in the period only; a trade one second before `from` is excluded.
8. `trade-stats` on a fixture of 3 winning and 2 losing closing trades returns `winRate "60.00"`, correct averages, `profitFactor`, largest win and loss, and `averageHoldingDays`; with no losing trades `profitFactor` is `null`.
9. `cash-activity` totals by type equal the sum of the listed rows across all pages.
10. CSV exports produce a BOM, a header row, RFC 4180 quoting of a note containing a comma and a quote, and decimal strings unchanged.
11. `from` after `to`, or a range over 5 years, returns `422 INVALID_PERIOD`.
12. Deposit page: choosing "From another account" shows source and target selects excluding each other, submits a transfer, and both sidebar rows update without reload.
13. Reports page: account and period live in the URL; reloading restores them; switching preset refetches every section; export downloads a file.
14. Every monetary and quantity field in report responses is a JSON string; percentages are decimal strings with 2 decimals.

## Tests

- Shared: period preset resolution in `America/New_York` around DST changes and year boundaries; report math helpers (`netPnl`, `returnPct`, trade statistics) as pure Decimal functions in `packages/shared/src/report-math.ts`, tested first.
- API integration: criteria 1 to 11 and 14 with seeded fixtures (accounts, ledger, trades, snapshots) and a fake clock.
- Web: `useReportPeriod` search-param round trip, mappers (curve series, preset dates), `TransferForm` account exclusion logic in its hook, render tests for `SummaryCards`, `TradeStatsCards`, `CashActivityTable`, `ExportButtons` with a mocked blob download.
