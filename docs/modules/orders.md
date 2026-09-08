# Module 4: Orders

Status: specified

## Scope

Order entry, a paper execution engine driven by the live price stream, positions, trades, bracket orders (stop-loss and take-profit), and order management on the dashboard.

Included:

- Order types: `MARKET`, `LIMIT`, `STOP`, `STOP_LIMIT`. Sides `BUY`, `SELL`. Time in force `GTC`, `DAY`.
- Long and short positions. Selling without a long position opens a short on shortable symbols.
- Fractional shares on fractionable symbols, up to 6 decimal places; shorts in whole shares only.
- Optional stop-loss and take-profit on an entry order. On fill, two child orders are created as a one-cancels-other pair. Children are modifiable and cancellable.
- Buying power per account from equity, open-order reservations, and short margin.
- Positions with signed quantity and average cost, unrealized and realized P&L. Trades ledger. Cash ledger entries of type `TRADE`.
- Order panel in the symbol page side slot (replaces the Module 3 placeholder).
- Orders tab in the dashboard navigation: active and filled orders across accounts, modify and cancel.
- Orders tab on the symbol page filtered to the symbol.
- WebSocket push: `order_update`, `trade`, `position_update`, plus `account_summary` after each fill.
- Module 2 account summaries and Module 3 position and trade panels now show real data.

Out of scope: partial fills, margin interest and borrow fees, automatic liquidation on margin deficit, options, trailing stops, OCO on entry orders, commissions other than a flat configurable fee, multi-currency.

## Rules

### Order semantics

| Type | Required prices | Trigger | Fill price |
|------|-----------------|---------|------------|
| `MARKET` | none | immediately on the next trade tick | last trade price |
| `LIMIT` | `limitPrice` | BUY when `last <= limitPrice`; SELL when `last >= limitPrice` | `limitPrice`, or `last` when it is better for the client |
| `STOP` | `stopPrice` | BUY when `last >= stopPrice`; SELL when `last <= stopPrice` | becomes `MARKET`, fills at the triggering trade price |
| `STOP_LIMIT` | `stopPrice`, `limitPrice` | same as `STOP` | becomes `LIMIT` at `limitPrice` after the trigger |

- Quantity: positive `Decimal` with at most 6 decimal places (`QUANTITY_DECIMALS`), minimum `0.000001`. Whole shares required when the symbol is not `fractionable` (`FRACTIONAL_NOT_ALLOWED`). The UI offers a USD amount mode and converts to shares before submitting; the API accepts shares only.
- Direction: an order that moves the signed position away from zero opens or increases a position; one that moves it toward zero reduces or closes it. An order may cross zero (long 10, sell 15 gives short 5); the engine books it as a close of 10 and an open of 5.
- Short selling: a SELL that would make the position negative requires `Symbol.shortable = true` (`SYMBOL_NOT_SHORTABLE`) and a whole-share quantity for the part that opens the short (`FRACTIONAL_SHORT_NOT_ALLOWED`). Short sale proceeds are credited to cash; the short's market value counts against equity.
- Fills are whole: an order fills its full quantity in one trade or not at all.
- Orders are accepted while the market is closed and stay `OPEN` until the next trade tick. The UI labels such orders "waiting for market open".
- `DAY` orders expire at the next 16:00 America/New_York after creation, also under the simulated provider. `GTC` orders never expire.
- Commission: `COMMISSION_PER_ORDER` (default `0.00`) charged on each fill as part of the cash movement.

### Price validation on placement

- BUY `LIMIT`: `limitPrice` may be anything; a limit above the last price fills immediately and is allowed.
- Stop-loss and take-profit relative to the expected entry price (last price for market and stop orders, limit price otherwise):
  - BUY entry: `stopLossPrice < entry < takeProfitPrice`.
  - SELL entry (opening or increasing a short): `takeProfitPrice < entry < stopLossPrice`.
  - Brackets are allowed only when the entry opens or increases a position in its own direction. An entry that reduces or closes an existing position, or crosses zero, returns `BRACKET_NOT_ALLOWED`.
- `STOP_LIMIT`: BUY requires `limitPrice >= stopPrice`; SELL requires `limitPrice <= stopPrice`.
- Prices have at most 4 decimal places and are positive (`VALIDATION_ERROR`).

### Buying power, margin, and reservations

Definitions per account, all `Decimal`:

- `longValue = sum(quantity * last)` over positions with `quantity > 0`.
- `shortValue = sum(|quantity| * last)` over positions with `quantity < 0`.
- `equity = cash + longValue - shortValue` (this replaces the Module 2 formula, where `positionsValue = longValue - shortValue`).
- `shortMargin = shortValue * SHORT_MARGIN_RATE` (default `0.5`).
- `reservedCash = sum(reservedCash of OPEN and TRIGGERED orders)`.
- `buyingPower = equity - shortMargin - reservedCash`.

Reservation per order, commission added:

| Order | Reservation |
|-------|-------------|
| BUY (any effect on position) | reference price × quantity |
| SELL reducing or closing a long | `0` |
| SELL opening or increasing a short | reference price × short-opening quantity × `SHORT_MARGIN_RATE` |

Reference price: `limitPrice` for `LIMIT` and `STOP_LIMIT`, `stopPrice` for `STOP`, `last * (1 + MARKET_ORDER_BUFFER)` for `MARKET` (default buffer `0.02`). A sell that crosses zero reserves only for the short-opening part.

- Placement fails with `422 INSUFFICIENT_BUYING_POWER` including `{ "required", "available" }` in `details` when the reservation exceeds buying power. Orders that reduce or close a position are always accepted regardless of buying power.
- Modifying an order recomputes its reservation and re-checks buying power.
- On fill the reservation is released and cash moves by `fillPrice * quantity` (debit for BUY, credit for SELL) minus commission. On cancel, reject, or expiry the reservation is released.
- Margin deficit: when `equity < shortValue * MAINTENANCE_MARGIN_RATE` (default `0.3`) the account is flagged `marginDeficit = true` in the account summary. New position-increasing orders are rejected with `422 MARGIN_DEFICIT`; closing orders remain allowed. No automatic liquidation.

### Brackets

- An entry order may carry `stopLossPrice` and/or `takeProfitPrice`.
- When the entry fills, the engine creates children in the same transaction, on the opposite side of the entry: `STOP_LOSS` role as a `STOP` at `stopLossPrice`, `TAKE_PROFIT` role as a `LIMIT` at `takeProfitPrice`, both for the filled quantity, `GTC`, sharing one `ocoGroupId` and referencing `parentOrderId`. For a long entry the children are SELLs; for a short entry they are BUYs.
- When one child fills, the sibling is cancelled with reason `OCO_SIBLING_FILLED`.
- Children are closing orders and never reserve cash or margin. They are never allowed to flip the position: their quantity is capped at the absolute position quantity.
- If the absolute position quantity drops below a child's quantity through another order, the child's quantity is reduced to the remaining absolute position; at zero the child is cancelled with reason `POSITION_CLOSED`.
- Before the entry fills, its bracket prices can be edited on the entry. After the fill, edits go to the child orders directly.

### Positions and P&L

- One `Position` row per account and symbol with a signed `quantity`: positive long, negative short. Average cost method in both directions.
- Increasing fill (same direction as the position, or opening from zero): `averageCost = (averageCost * |quantity| + fillPrice * fillQuantity) / (|quantity| + fillQuantity)`, commission spread into the average for buys and deducted from proceeds for shorts.
- Reducing fill (opposite direction): `realizedPnl += direction * (fillPrice - averageCost) * fillQuantity - commission`, where `direction` is `+1` for a long being sold and `-1` for a short being covered; `|quantity|` decreases; `averageCost` unchanged.
- Crossing zero: the fill is split into a reducing part down to zero and an increasing part that opens the new position at `fillPrice`; one `Trade` row records the whole fill, the position ends with the new sign and `averageCost = fillPrice`.
- At zero quantity the position is marked closed (`closedAt`) and hidden from the open positions list; a later fill on the symbol reopens it.
- Unrealized P&L = `(lastPrice - averageCost) * quantity` (sign follows the signed quantity, so a short gains when price falls). Daily change = `(lastPrice - prevClose) * quantity`. Both computed by the accounts summary service using the Module 3 price service.
- `marketValue = quantity * lastPrice` is signed; the positions table shows short rows with a `SHORT` badge and negative quantity.
- Every fill writes one `Trade`, one `CashTransaction` of type `TRADE` (`amount` negative for buys, positive for sells, `referenceId` = trade id), one equity snapshot, and broadcasts `trade`, `order_update`, `position_update`, `account_summary`.

### Order lifecycle

```
PENDING -> OPEN -> FILLED
                -> CANCELLED
                -> EXPIRED
        -> REJECTED
OPEN -> TRIGGERED -> FILLED | CANCELLED | EXPIRED      (STOP and STOP_LIMIT only)
```

- `PENDING` exists only inside the placement transaction; clients see `OPEN`, `FILLED`, or `REJECTED` in the placement response.
- `TRIGGERED` marks a stop that has become a market or limit order and is waiting for its fill condition.
- Modify is allowed in `OPEN` and `TRIGGERED` (for `STOP_LIMIT` the limit price only once triggered). Cancel is allowed in `OPEN` and `TRIGGERED`.
- Optimistic concurrency: every order carries a `version`; modify and cancel require the client's `version`, mismatch returns `409 ORDER_VERSION_CONFLICT`.

## Data model (Prisma)

```prisma
enum OrderSide { BUY SELL }
enum OrderType { MARKET LIMIT STOP STOP_LIMIT }
enum TimeInForce { GTC DAY }
enum OrderStatus { PENDING OPEN TRIGGERED FILLED CANCELLED REJECTED EXPIRED }
enum OrderRole { ENTRY STOP_LOSS TAKE_PROFIT }

model Order {
  id              String      @id @default(cuid())
  accountId       String
  account         Account     @relation(fields: [accountId], references: [id], onDelete: Cascade)
  symbol          String
  side            OrderSide
  type            OrderType
  role            OrderRole   @default(ENTRY)
  status          OrderStatus
  timeInForce     TimeInForce @default(GTC)
  quantity        Decimal
  limitPrice      Decimal?
  stopPrice       Decimal?
  stopLossPrice   Decimal?
  takeProfitPrice Decimal?
  reservedCash    Decimal     @default(0)
  avgFillPrice    Decimal?
  commission      Decimal     @default(0)
  parentOrderId   String?
  parent          Order?      @relation("Bracket", fields: [parentOrderId], references: [id])
  children        Order[]     @relation("Bracket")
  ocoGroupId      String?
  cancelReason    String?
  rejectReason    String?
  version         Int         @default(1)
  expiresAt       DateTime?
  triggeredAt     DateTime?
  filledAt        DateTime?
  cancelledAt     DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  trades          Trade[]

  @@index([accountId, status])
  @@index([symbol, status])
  @@index([ocoGroupId])
}

model Trade {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id])
  accountId   String
  account     Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  symbol      String
  side        OrderSide
  quantity    Decimal
  price       Decimal
  amount      Decimal
  commission  Decimal
  realizedPnl Decimal?
  executedAt  DateTime @default(now())

  @@index([accountId, executedAt])
  @@index([accountId, symbol, executedAt])
}

model Position {
  id          String    @id @default(cuid())
  accountId   String
  account     Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  symbol      String
  quantity    Decimal
  averageCost Decimal
  realizedPnl Decimal   @default(0)
  openedAt    DateTime  @default(now())
  closedAt    DateTime?
  updatedAt   DateTime  @updatedAt

  @@unique([accountId, symbol])
  @@index([accountId])
}
```

`Account` gains relations `orders Order[]`, `trades Trade[]`, `positions Position[]`. `Symbol` (Module 3) gains `shortable Boolean @default(true)` and `fractionable Boolean @default(true)`, filled from the Alpaca asset attributes `shortable` and `fractionable`; the simulated universe sets both per ticker.

`AccountSummary` (Module 2) gains `longValue`, `shortValue`, `shortMargin`, `reservedCash`, `buyingPower`, `marginDeficit`.

## Execution engine

`apps/api/src/modules/orders/engine.ts`

- Subscribes to the price service trade events. For every trade tick it loads open and triggered orders for that symbol (in-memory index by symbol, rebuilt from the database at startup and kept in sync by the service) and evaluates them in creation order.
- Processing is serialized per symbol with an async queue so two ticks never race on the same orders. Each fill runs in one Prisma transaction: order status, trade, position, cash transaction, account cash, bracket children creation, OCO sibling cancel, child quantity adjustment. The equity snapshot and WebSocket broadcasts happen after commit.
- A newly placed `MARKET` order is evaluated immediately against the last known price if the market is open; otherwise it waits for the next tick.
- `ensureStreaming` from the price service is called for every symbol that has open orders or open positions, so ticks keep flowing for them even without a symbol page open.
- `expiry-job.ts` runs at boot and then every minute, expiring `DAY` orders whose `expiresAt` has passed and releasing reservations. Running at boot covers the case where the process was suspended by the hosting platform over the expiry time.
- Demo limitation, documented in the UI help text: resting orders fill only while the server process is awake. After a suspension the engine evaluates all open orders against the first tick after wake; it does not reconstruct fills that would have happened during the gap.
- The engine exposes `processTick(trade)` and `placeOrder(command)` as pure service methods so tests drive it without timers or sockets.

## API

Base path `/api/v1`, all protected. Account scoping: an account of another user returns `404 ACCOUNT_NOT_FOUND`.

| Method | Path | Body or query | Success | Notes |
|--------|------|---------------|---------|-------|
| POST | `/accounts/:id/orders/preview` | `PlaceOrderRequest` | `200 { preview }` | Validation without persisting: estimated cost, reservation, buying power before and after, fill expectation, warnings. |
| POST | `/accounts/:id/orders` | `PlaceOrderRequest` | `201 { order, trade?, position?, account }` | `trade` and `position` present when filled immediately. `422 INSUFFICIENT_BUYING_POWER`, `422 MARGIN_DEFICIT`, `422 SYMBOL_NOT_SHORTABLE`, `422 FRACTIONAL_NOT_ALLOWED`, `422 FRACTIONAL_SHORT_NOT_ALLOWED`, `422 BRACKET_NOT_ALLOWED`, `422 INVALID_BRACKET_PRICE`, `422 VALIDATION_ERROR`, `404 SYMBOL_NOT_FOUND`. |
| GET | `/accounts/:id/orders` | `status=active|filled|all`, `symbol?`, `limit`, `cursor` | `200 { orders: Order[], nextCursor }` | `active` = `OPEN` + `TRIGGERED`; `filled` = `FILLED`; `all` includes cancelled, rejected, expired. Newest first. |
| GET | `/orders` | same filters plus `accountId?` | `200 { orders, nextCursor }` | Across all accounts of the user, for the dashboard Orders tab. |
| GET | `/accounts/:id/orders/:orderId` | none | `200 { order, children: Order[], trades: Trade[] }` | |
| PATCH | `/accounts/:id/orders/:orderId` | `ModifyOrderRequest` | `200 { order }` | Fields: `quantity?`, `limitPrice?`, `stopPrice?`, `stopLossPrice?`, `takeProfitPrice?`, `timeInForce?`, `version`. `409 ORDER_VERSION_CONFLICT`, `422 ORDER_NOT_MODIFIABLE`. |
| DELETE | `/accounts/:id/orders/:orderId` | `{ version }` | `200 { order }` | Cancel. `422 ORDER_NOT_CANCELLABLE` for final states. |
| GET | `/accounts/:id/positions` | none | `200 { positions: Position[] }` | Real data now; shape from Module 2. Only open positions. |
| GET | `/accounts/:id/trades` | `symbol?`, `limit`, `cursor` | `200 { trades, nextCursor }` | Real data now; shape from Module 3. |

`PlaceOrderRequest`:

```json
{
  "symbol": "TSLA",
  "side": "BUY",
  "type": "LIMIT",
  "quantity": "10",
  "limitPrice": "250.0000",
  "stopPrice": null,
  "timeInForce": "GTC",
  "stopLossPrice": "240.0000",
  "takeProfitPrice": "275.0000",
  "clientOrderId": "optional-uuid-for-idempotency"
}
```

`Order` response:

```json
{
  "id": "clx...",
  "accountId": "clx...",
  "symbol": "TSLA",
  "side": "BUY",
  "type": "LIMIT",
  "role": "ENTRY",
  "status": "OPEN",
  "timeInForce": "GTC",
  "quantity": "10",
  "limitPrice": "250.0000",
  "stopPrice": null,
  "stopLossPrice": "240.0000",
  "takeProfitPrice": "275.0000",
  "reservedCash": "2500.00",
  "avgFillPrice": null,
  "commission": "0.00",
  "parentOrderId": null,
  "ocoGroupId": null,
  "cancelReason": null,
  "rejectReason": null,
  "version": 1,
  "expiresAt": null,
  "filledAt": null,
  "createdAt": "2026-09-08T14:31:00.000Z",
  "updatedAt": "2026-09-08T14:31:00.000Z"
}
```

`preview`:

```json
{
  "quantity": "3.978912",
  "estimatedPrice": "251.3400",
  "estimatedCost": "1000.00",
  "reservedCash": "1020.00",
  "commission": "0.00",
  "positionEffect": "open_long",
  "positionAfter": "3.978912",
  "buyingPowerBefore": "100000.00",
  "buyingPowerAfter": "98980.00",
  "expectedExecution": "immediate",
  "warnings": ["MARKET_CLOSED"]
}
```

`expectedExecution` in `immediate | waiting_for_market_open | resting`. `positionEffect` in `open_long | increase_long | reduce_long | close_long | open_short | increase_short | reduce_short | close_short | flip_to_short | flip_to_long`.

`clientOrderId`: optional idempotency key unique per account; a repeated placement with the same key returns the existing order with `200`.

### Error codes

`INSUFFICIENT_BUYING_POWER`, `MARGIN_DEFICIT`, `SYMBOL_NOT_SHORTABLE`, `FRACTIONAL_NOT_ALLOWED`, `FRACTIONAL_SHORT_NOT_ALLOWED`, `BRACKET_NOT_ALLOWED`, `INVALID_BRACKET_PRICE`, `INVALID_STOP_LIMIT_PRICES`, `ORDER_NOT_FOUND`, `ORDER_NOT_MODIFIABLE`, `ORDER_NOT_CANCELLABLE`, `ORDER_VERSION_CONFLICT`, `SYMBOL_NOT_FOUND`, `ACCOUNT_NOT_FOUND`, `VALIDATION_ERROR`.

## WebSocket

Pushed to every socket of the owning user, no subscription required:

```json
{ "type": "order_update", "order": Order }
{ "type": "trade", "trade": Trade }
{ "type": "position_update", "position": Position }
```

`account_summary` (Module 2) follows every fill. Order of emission after a fill: `trade`, `order_update` for the filled order, `order_update` for each created or cancelled child, `position_update`, `account_summary`.

## Shared package

- `packages/shared/src/orders.ts`: enums as zod enums, `placeOrderSchema` with cross-field refinements (required prices per type, stop-limit relation, bracket direction), `modifyOrderSchema`, `cancelOrderSchema`, `orderSchema`, `orderPreviewSchema`, `positionSchema` (moved here from accounts, re-exported), `tradeSchema` (moved here from market, re-exported).
- `packages/shared/src/order-math.ts`: pure Decimal functions used by both API and web: `sharesFromAmount(amount, price, fractionable)` (round down to 6 decimals, or to a whole share), `estimateCost`, `positionEffect(currentQty, side, qty)`, `reservationFor(order, positionEffect, referencePrice, shortMarginRate, commission)`, `buyingPower(inputs)`, `nextAverageCost`, `realizedPnlFor`, `splitCrossingFill`, `validateBracketPrices(side, entry, sl, tp)`. Unit tested once, imported everywhere.
- `packages/shared/src/ws.ts`: extend the server message union.

## Frontend

### Nav tabs (Module 2 update)

`[Portfolio] [Orders] [Reports] [Deposit]`. New route `apps/web/src/routes/_authenticated/orders.tsx`.

### Order panel (symbol page side slot)

Replaces `OrderSlotPlaceholder` from Module 3. Opens with the side chosen by the Buy or Sell button.

```
+--------------------------------+
| [ BUY ] [ SELL ]        [back] |
| Account   [ Main (BP 97,436) v]|
| Quantity  [ 10        ][Shares v]  <- unit: Shares | USD
|   ~ 2,513.40 USD at 251.34      |  <- hint (or "~ 39 shares" in USD mode)
| Order type[ Limit           v ] |
| Limit price [ 250.0000        ] |
| Stop price  [ ...             ] |  <- shown for Stop / Stop-Limit
| Time in force [ GTC        v ] |
| [ ] Stop loss   [ 240.0000    ] |
| [ ] Take profit [ 275.0000    ] |
|--------------------------------|
| Est. cost        2,500.00      |
| Buying power after 97,436.33   |
| Market: OPEN                   |
| [        Buy 10 TSLA         ] |
+--------------------------------+
```

- Account select lists the user's accounts with buying power; defaults to the active account.
- Unit dropdown `Shares | USD`. In USD mode the hint shows the resulting share count (fractional to 6 decimals on fractionable symbols, whole otherwise) and submit sends that share count. In Shares mode the hint shows the estimated cost. Both use `sharesFromAmount` and `estimateCost` from shared order math. Quantity input accepts decimals only when the symbol is fractionable.
- Position effect line under the quantity, from the preview: `Opens long`, `Adds to long`, `Reduces long`, `Closes long`, `Opens short`, `Covers short`, `Flips to short`, and so on. When the SELL would open a short the submit button reads `Sell short 10 TSLA` and a `SHORT` badge with the margin requirement appears; non-shortable symbols show the explanation and disable that path.
- Order type dropdown reveals the price inputs it needs; price inputs prefill with the last price.
- Stop loss and take profit checkboxes default unchecked; checking one reveals its price input prefilled at 5 percent adverse and 5 percent favorable to the entry direction (below and above for longs, above and below for shorts). Disabled with an explanation when the order reduces, closes, or flips a position.
- The summary block calls `POST /orders/preview` (debounced 300 ms) and shows cost, buying power after, expected execution, and warnings such as market closed.
- Submit button label: `Buy 10 TSLA` or `Sell 10 TSLA`. Disabled while invalid or pending.
- Success dialog: status (`Filled at 251.34` or `Order placed, waiting for ...`), quantity, cost, created bracket children if any, buttons "View orders" and "Close".
- Failure: inline error mapped from the error code; `INSUFFICIENT_BUYING_POWER` shows required versus available; `MARGIN_DEFICIT` links to the positions table.
- Sidebar account rows (Module 2) gain a buying power line and a margin deficit warning badge.
- After success the panel resets to key stats, and the position, trades, and orders panels under the chart update from WebSocket messages.

### Orders tab (dashboard)

- Filters: status segmented control `Active | Filled | All`, account select `All accounts | ...`, symbol text filter.
- Table columns: created, account, symbol, side, type, quantity, limit price, stop price, status, filled price, filled at, time in force, actions.
- Bracket display: entry rows expandable to show their children; child rows carry a role badge (`SL`, `TP`) and a link to the parent. Active bracket children of a filled entry appear in the `Active` filter as their own rows as well.
- Actions on active rows: `Modify` opens a dialog with the editable fields for that order state (quantity, limit price, stop price, time in force, and bracket prices on an unfilled entry); `Cancel` asks for confirmation. Both send the current `version`; a `409` prompts to reload the row.
- Filled, cancelled, rejected, expired rows: `Details` opens a drawer with the order, its trades, and its children.
- Live updates from `order_update`, `trade` messages through the orders store; no polling.

### Symbol page additions

- Third tab under the chart: `Orders`, showing this symbol's orders for the active account with the same row component and actions.
- Position tab and Trade history tab now show real data.

### Feature files

```
apps/web/src/features/orders/
├── store.ts            # orders by id, indexes by account and symbol, applyOrderUpdate, applyTrade
├── api.ts              # preview, place, list (account and global), get, modify, cancel
├── hooks.ts            # useOrderForm(symbol, side) (state machine + preview), usePlaceOrder, useOrders(filters), useModifyOrder, useCancelOrder
├── mappers.ts          # form state -> PlaceOrderRequest, DTO -> view models, status and role labels
└── components/         # OrderPanel, OrderTypeFields, BracketFields, QuantityInput, OrderSummary, OrderSuccessDialog, OrdersTable, OrderRow, ModifyOrderDialog, CancelOrderDialog, OrderDetailsDrawer, OrdersFilters
apps/web/src/features/positions/
├── store.ts            # positions by account, applyPositionUpdate
├── hooks.ts            # usePositions(accountId), usePosition(accountId, symbol)
└── mappers.ts          # Position DTO + quote -> row with unrealized and daily P&L
```

- `useOrderForm` holds all form logic (unit conversion, visibility of fields, validation with the shared zod schema, preview requests). Components render its output only.
- `OrderPanel` and `OrdersTable` stay under the 300-line soft limit by splitting into the listed subcomponents.

## Environment

Additions to `.env.example`:

```
COMMISSION_PER_ORDER=0.00
MARKET_ORDER_BUFFER=0.02
SHORT_MARGIN_RATE=0.5
MAINTENANCE_MARGIN_RATE=0.3
QUANTITY_DECIMALS=6
ORDER_EXPIRY_CHECK_SECONDS=60
```

## Acceptance criteria

1. Market BUY with sufficient buying power while the market is open returns `201` with `status FILLED`, a trade at the last price, a position with the right quantity and average cost, a `TRADE` cash transaction, and account cash reduced by `price * quantity + commission`.
2. Market BUY whose reservation exceeds buying power returns `422 INSUFFICIENT_BUYING_POWER` with `required` and `available` in details; nothing is persisted.
3. Limit BUY below the last price rests as `OPEN` with `reservedCash = limitPrice * quantity`; a later tick at or below the limit fills it at the limit price (or better) and releases the reservation.
4. Stop BUY above the last price rests; a tick at or above the stop moves it to `TRIGGERED` and fills at that tick's price. Stop-limit follows the same path and then fills only when the limit condition holds.
5. Market SELL of 10 whole shares with no position on a shortable symbol fills, credits cash by the proceeds, creates a position with `quantity "-10"`, reserves nothing after fill, and the account summary shows `shortValue`, `shortMargin`, and a reduced `buyingPower`. The same on a non-shortable symbol returns `422 SYMBOL_NOT_SHORTABLE`; a fractional short quantity returns `422 FRACTIONAL_SHORT_NOT_ALLOWED`.
6. An entry with `stopLossPrice` and `takeProfitPrice` creates two child orders on fill, sharing an `ocoGroupId`, each with `parentOrderId` set, quantity equal to the filled quantity, on the opposite side of the entry (SELL children for a long entry, BUY children for a short entry).
7. When the take-profit child fills, the stop-loss sibling is cancelled with reason `OCO_SIBLING_FILLED`, realized P&L is recorded on the trade and the position closes; the mirror case for stop-loss, and both again for a short entry where the stop is above and the target below the entry.
8. Bracket price validation: BUY with `stopLossPrice >= entry` or `takeProfitPrice <= entry`, and short SELL with `stopLossPrice <= entry` or `takeProfitPrice >= entry`, return `422 INVALID_BRACKET_PRICE`; brackets on an order that reduces, closes, or flips a position return `422 BRACKET_NOT_ALLOWED`.
9. `PATCH` on an `OPEN` limit order changes the limit price and reservation, increments `version`, re-checks buying power; a stale `version` returns `409 ORDER_VERSION_CONFLICT`; `PATCH` on a `FILLED` order returns `422 ORDER_NOT_MODIFIABLE`.
10. `PATCH` on an unfilled entry updates its bracket prices; after the fill the same fields are changed on the child orders and the entry's bracket fields are read-only.
11. `DELETE` cancels an `OPEN` or `TRIGGERED` order and releases its reservation; final states return `422 ORDER_NOT_CANCELLABLE`.
12. `DAY` orders expire at 16:00 America/New_York with status `EXPIRED` (fake clock), releasing reservations; `GTC` orders survive.
13. A market order placed while the market is closed stays `OPEN` and fills on the first tick after open; preview reports `waiting_for_market_open`.
14. Selling part of a long leaves `averageCost` unchanged and accrues `realizedPnl`; selling all marks the position closed and removes it from `GET /positions`; covering a short realizes `(averageCost - fillPrice) * quantity`.
15. Another order that shrinks the absolute position below an active bracket child's quantity reduces the child; at zero the child is cancelled with reason `POSITION_CLOSED`.
15a. Long 10, market SELL 15 on a shortable symbol: one trade of 15, realized P&L on 10, position `"-5"` with `averageCost` equal to the fill price, `positionEffect flip_to_short` in preview, and a bracket request on that order returns `BRACKET_NOT_ALLOWED`.
15b. Fractional: market BUY `"0.5"` on a fractionable symbol fills with `quantity "0.5"` and cost `price * 0.5`; the same on a non-fractionable symbol returns `422 FRACTIONAL_NOT_ALLOWED`; a quantity with 7 decimals returns `422 VALIDATION_ERROR`.
15c. Margin deficit: with a short position and a price move that drives `equity` below `shortValue * MAINTENANCE_MARGIN_RATE` (scripted ticks), the account summary shows `marginDeficit true`, a position-increasing order returns `422 MARGIN_DEFICIT`, and a covering BUY is accepted.
16. Repeating a placement with the same `clientOrderId` returns the existing order with `200` and creates nothing new.
17. Two ticks for the same symbol processed concurrently never double-fill an order (engine queue test).
18. After a fill the account summary reflects `positionsValue`, unrealized and daily P&L from the price service, and `account_summary`, `trade`, `order_update`, `position_update` arrive on the owner's sockets only.
19. Order panel: USD mode with `1000` at last price `251.34` shows `3.978912 shares` on a fractionable symbol and `3 shares` on a non-fractionable one, and submits that quantity; switching order type reveals the right price fields; unchecked brackets send `null`; a SELL with no position shows `Sell short` and the margin requirement.
20. Order panel success dialog shows fill details; `INSUFFICIENT_BUYING_POWER` renders required versus available inline.
21. Orders tab lists active orders across accounts, live-updates on fill, expands bracket children, and Modify plus Cancel work with version handling.
22. Symbol page Orders, Position, and Trade history tabs show real data for the active account and update without reload.
23. Every monetary, price, and quantity field in order, trade, and position responses is a JSON string.

## Tests

- Shared `order-math` unit tests first: share conversion (fractional and whole), position effect classification, reservations per type and effect, buying power with shorts, average cost in both directions, realized P&L for longs and shorts, crossing-zero split, bracket validation per side, with Decimal edge cases (repeating decimals, 6-decimal quantities, large quantities).
- API integration for criteria 1 to 18 and 23 with the simulated provider replaced by a scripted tick source and a fake clock; each fill asserts the ledger invariant `cashBalance == latest balanceAfter` and the reservation invariant `sum(reservedCash of open buys) == recomputed`.
- Engine unit tests: per-symbol queue serialization, startup index rebuild, OCO handling, child quantity adjustment.
- Web: `useOrderForm` state machine tests without React (unit conversion, field visibility, validation, preview debounce), orders store tests (apply updates, indexes), render tests for `OrderPanel`, `OrdersTable` with bracket fixtures, `ModifyOrderDialog` version conflict path.
