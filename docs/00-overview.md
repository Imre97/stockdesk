# StockDesk Overview

## Goal

Demo paper-trading platform. A registered user gets a virtual USD balance, watches live stock prices, places market and limit orders, and follows portfolio value over time. Educational scope: no real money, no broker connection.

## Modules

Specified and implemented one at a time. Each module has its own document under `docs/modules/`.

| # | Module | Doc | Status | Depends on |
|---|--------|-----|--------|------------|
| 1 | Auth (register, login, JWT access + refresh) | `modules/auth.md` | specified | none |
| 2 | Dashboard shell (layout, nav tabs, i18n, theme, settings, accounts, simulated deposits, equity chart, positions table) | `modules/dashboard.md` | specified | 1 |
| 3 | Market data and symbol page (provider layer, ticker search, live quotes, candlestick chart, key stats, per-symbol position and history panels) | `modules/market-data.md` | specified | 2 |
| 4 | Orders (market, limit, stop, stop-limit, long and short, fractional shares, stop-loss and take-profit brackets, order panel, execution engine, positions and trades, Orders tab) | `modules/orders.md` | specified | 3 |
| 5 | Transfers and reports (transfer between own accounts as a funding source, per-account statement with summary, performance vs net deposits, realized P&L by symbol, trade statistics, executions, cash activity, CSV export) | `modules/portfolio.md` | specified | 4 |

Status values: `planned`, `specified`, `implemented`.

## Users

Single role. Every registered user is a trader who owns one or more isolated trading accounts. UI available in English and Hungarian.

## Backlog (no module yet)

Withdrawals (simulated cash out), account deletion or archiving, PDF statements, allocation charts by sector, watchlists, price alerts, yahoo provider adapter, custom domain, uptime monitoring, keep-alive ping for the free hosting tier.

## Out of scope

Real brokerage, real money, options, margin interest and borrow fees, automatic liquidation, multi-currency, admin UI, mobile app, tax lots, time-weighted return.
