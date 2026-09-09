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
- Available quantity: position-effect classification uses the position quantity net of the quantity of the account's open closing orders on the same symbol (`OPEN` and `TRIGGERED`, bracket children included). Long 10 with an open SELL 10 makes a second SELL 10 an `open_short`, so it needs `shortable`, whole shares, and a short margin reservation. The same rule applies to shorts and open covering BUYs.
- Every order type is evaluated once at placement against the last known price when the market is open (a marketable limit fills at once, a stop already past its trigger fires at once); otherwise it rests until the next trade tick. Orders are accepted while the market is closed and stay `OPEN` until the next trade tick. The UI labels such orders "waiting for market open". With no last price known while the market is open, the order rests until the first tick.
- A `STOP` triggers and fills on the same tick; a `STOP_LIMIT` evaluates its limit condition on the triggering tick as well. One `order_update` is emitted for the resulting state with `triggeredAt` set; `TRIGGERED` is persisted only when the limit condition does not hold yet.
- `DAY` orders expire at the close of the next regular session per the NYSE calendar (`calendar.ts` `sessionOf`, early closes at 13:00): an order placed during a session expires at that session's close; one placed after the close, on a weekend or on a holiday expires at the close of the next trading day. The calendar is used under every provider, the simulated one included. `GTC` orders never expire.
- Commission: `COMMISSION_PER_ORDER` (default `0.00`) charged on each fill as part of the cash movement.
- Rounding: cash movements (`Trade.amount`, `CashTransaction.amount`, commission) are rounded to cents with `ROUND_HALF_EVEN`; reservations are rounded up to cents (`ROUND_UP`); `averageCost` keeps 8 decimals. `Trade.amount` is the gross `price * quantity`, always positive; the side and the `CashTransaction` sign carry the direction.
- Buying power is equity based, so a fill can take `cash` below zero when the account holds long value. No automatic liquidation exists; the margin deficit flag is the only guard.

### Price validation on placement

- BUY `LIMIT`: `limitPrice` may be anything; a limit above the last price fills immediately and is allowed.
- Stop-loss and take-profit relative to the expected entry price (last price for market and stop orders, `stopPrice` for a stop order when no last price is known yet, limit price otherwise):
  - BUY entry: `stopLossPrice < entry < takeProfitPrice`.
  - SELL entry (opening or increasing a short): `takeProfitPrice < entry < stopLossPrice`.
  - Brackets are allowed only when the entry opens or increases a position in its own direction. An entry that reduces or closes an existing position, or crosses zero, returns `BRACKET_NOT_ALLOWED`.
- `STOP_LIMIT`: BUY requires `limitPrice >= stopPrice`; SELL requires `limitPrice <= stopPrice`.
- Prices have at most 4 decimal places and are positive (`VALIDATION_ERROR`).
- An order carries exactly the prices its type needs: a non-null `limitPrice` on a `MARKET` or `STOP` order, or a non-null `stopPrice` on a `MARKET` or `LIMIT` order, is a `VALIDATION_ERROR`. The web form sends `null` for the fields the chosen type does not use. Cross-field zod issues carry the error code in `params.code` (`VALIDATION_ERROR` or `INVALID_STOP_LIMIT_PRICES`); the API maps that, not the message text.
- A `MARKET` order (placement and preview) needs a known last price for its reservation; with none, the request fails with `422 PRICE_UNAVAILABLE`. `LIMIT`, `STOP` and `STOP_LIMIT` orders reserve from their own prices and rest until the first tick.

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
- Modifying an order recomputes its reservation and re-checks buying power. A reservation is otherwise frozen at placement or modification: fills of neighbouring orders or price moves do not recompute it. Tests recompute a `MARKET` reservation from the last price they emitted before placement.
- On fill the reservation is released and cash moves by `fillPrice * quantity` (debit for BUY, credit for SELL) minus commission. On cancel, reject, or expiry the reservation is released.
- Margin deficit: when `shortValue > 0` and `equity < shortValue * MAINTENANCE_MARGIN_RATE` (default `0.3`) the account is flagged `marginDeficit = true` in the account summary. New position-increasing orders are rejected with `422 MARGIN_DEFICIT`; closing orders remain allowed. No automatic liquidation. Position-increasing means every effect except `reduce_*` and `close_*`; a flip opens a position and is subject to both the margin deficit and the buying power check.

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

- `PENDING` exists only inside the placement transaction; clients see `OPEN` or `FILLED` in the placement response. Placement-time validation failures are `422` errors and persist nothing.
- `REJECTED` is an engine-time outcome only: the fill transaction could not execute an order that was valid at placement (the symbol lost `shortable` or `fractionable`, no price for the fill, a database conflict that cannot be retried). `rejectReason` holds a short code; the reservation is released and an `order_update` is pushed.
- `TRIGGERED` marks a stop that has become a market or limit order and is waiting for its fill condition.
- Modify is allowed in `OPEN` and `TRIGGERED` (for `STOP_LIMIT` the limit price only once triggered). Cancel is allowed in `OPEN` and `TRIGGERED`. Setting a bracket price to `null` on an unfilled entry removes that bracket. A bracket child's quantity cannot be raised above the absolute position quantity (`VALIDATION_ERROR`).
- Optimistic concurrency: every order carries a `version`; modify and cancel require the client's `version`, mismatch returns `409 ORDER_VERSION_CONFLICT`. Every state write increments `version`.
- `cancelReason` is one of `USER`, `OCO_SIBLING_FILLED`, `POSITION_CLOSED` (`CancelReason` enum).

### Write ownership (L-18)

Three writers touch the order tables. The rule per row:

- `Order`: the user path (place, modify, cancel) writes with `WHERE id = ? AND version = ?`; the engine path (trigger, fill, child creation, child quantity adjustment, OCO cancel) and the expiry job write with `WHERE id = ? AND status IN ('OPEN', 'TRIGGERED')`. `updateMany` with `count === 0` means the other writer won and the caller re-reads or skips. The engine re-reads the row inside the fill transaction; the in-memory index is a hint, never the source of truth.
- `Position`: written only by the engine inside a fill transaction, serialized per symbol by the engine queue. Nothing else writes a position row.
- `Account.cashBalance`: written by deposits (Module 2), fills (this module) and transfers (Module 5), all through one atomic SQL increment (`SET "cashBalance" = "cashBalance" + delta`) inside the writer's transaction, with the `CashTransaction.balanceAfter` taken from the `RETURNING` value. Reserved cash is never stored on the account; it is recomputed from `OPEN` and `TRIGGERED` orders on every read.
- `Trade` and `CashTransaction` rows are evidence (L-9): never updated or deleted by a user action.

## Data model (Prisma)

```prisma
enum OrderSide { BUY SELL }
enum OrderType { MARKET LIMIT STOP STOP_LIMIT }
enum TimeInForce { GTC DAY }
enum OrderStatus { PENDING OPEN TRIGGERED FILLED CANCELLED REJECTED EXPIRED }
enum OrderRole { ENTRY STOP_LOSS TAKE_PROFIT }
enum CancelReason { USER OCO_SIBLING_FILLED POSITION_CLOSED }

model Order {
  id              String        @id @default(cuid())
  accountId       String
  account         Account       @relation(fields: [accountId], references: [id], onDelete: Cascade)
  clientOrderId   String?
  symbol          String
  side            OrderSide
  type            OrderType
  role            OrderRole     @default(ENTRY)
  status          OrderStatus
  timeInForce     TimeInForce   @default(GTC)
  quantity        Decimal       @db.Decimal(20, 8)
  limitPrice      Decimal?      @db.Decimal(20, 8)
  stopPrice       Decimal?      @db.Decimal(20, 8)
  stopLossPrice   Decimal?      @db.Decimal(20, 8)
  takeProfitPrice Decimal?      @db.Decimal(20, 8)
  reservedCash    Decimal       @default(0) @db.Decimal(20, 2)
  avgFillPrice    Decimal?      @db.Decimal(20, 8)
  commission      Decimal       @default(0) @db.Decimal(20, 2)
  parentOrderId   String?
  parent          Order?        @relation("Bracket", fields: [parentOrderId], references: [id])
  children        Order[]       @relation("Bracket")
  ocoGroupId      String?
  cancelReason    CancelReason?
  rejectReason    String?
  version         Int           @default(1)
  expiresAt       DateTime?
  triggeredAt     DateTime?
  filledAt        DateTime?
  cancelledAt     DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  trades          Trade[]

  @@unique([accountId, clientOrderId])
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
  quantity    Decimal  @db.Decimal(20, 8)
  price       Decimal  @db.Decimal(20, 8)
  amount      Decimal  @db.Decimal(20, 2)
  commission  Decimal  @db.Decimal(20, 2)
  realizedPnl Decimal? @db.Decimal(20, 2)
  executedAt  DateTime @default(now())

  @@index([accountId, executedAt, id])
  @@index([accountId, symbol, executedAt, id])
}

model Position {
  id          String    @id @default(cuid())
  accountId   String
  account     Account   @relation(fields: [accountId], references: [id], onDelete: Cascade)
  symbol      String
  quantity    Decimal   @db.Decimal(20, 8)
  averageCost Decimal   @db.Decimal(20, 8)
  realizedPnl Decimal   @default(0) @db.Decimal(20, 2)
  openedAt    DateTime  @default(now())
  closedAt    DateTime?
  updatedAt   DateTime  @updatedAt

  @@unique([accountId, symbol])
  @@index([accountId])
}
```

`Account` gains relations `orders Order[]`, `trades Trade[]`, `positions Position[]`. `Symbol.shortable` and `Symbol.fractionable` already exist since Module 3 (filled from the Alpaca asset attributes; the simulated universe sets both per ticker); no schema change for them.

`AccountSummary` (Module 2) gains `longValue`, `shortValue`, `shortMargin`, `reservedCash`, `buyingPower` (all decimal strings, 2 places) and `marginDeficit` (boolean). `positionsValue` stays and equals `longValue - shortValue`. Equity snapshots (`AccountEquitySnapshot`) keep their three columns; the snapshot writer now loads the open positions of every account it snapshots and values them through the batched price lookup (TD-56), so `positionsValue` and `equity` in snapshots become real. Two fills of one account inside the same second share one snapshot row (`skipDuplicates`); the `account_summary` broadcast still happens for each.

Serialization places (L-14): quantities 6 (`"10.000000"`), prices and `averageCost` and `avgFillPrice` 4, money (`reservedCash`, `commission`, `amount`, `realizedPnl`, summary fields) 2. The JSON examples below follow these places.

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
  "quantity": "10.000000",
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
  "clientOrderId": null,
  "symbol": "TSLA",
  "side": "BUY",
  "type": "LIMIT",
  "role": "ENTRY",
  "status": "OPEN",
  "timeInForce": "GTC",
  "quantity": "10.000000",
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
  "triggeredAt": null,
  "filledAt": null,
  "cancelledAt": null,
  "createdAt": "2026-09-08T14:31:00.000Z",
  "updatedAt": "2026-09-08T14:31:00.000Z"
}
```

`preview`:

```json
{
  "quantity": "3.978674",
  "estimatedPrice": "251.3400",
  "estimatedCost": "1000.00",
  "reservedCash": "1020.00",
  "commission": "0.00",
  "positionEffect": "open_long",
  "positionAfter": "3.978674",
  "buyingPowerBefore": "100000.00",
  "buyingPowerAfter": "98980.00",
  "expectedExecution": "immediate",
  "warnings": ["MARKET_CLOSED"]
}
```

`expectedExecution` in `immediate | waiting_for_market_open | resting`. `positionEffect` in `open_long | increase_long | reduce_long | close_long | open_short | increase_short | reduce_short | close_short | flip_to_short | flip_to_long`.

`clientOrderId`: optional idempotency key unique per account; a repeated placement with the same key returns the existing order with `200`.

### Error codes

New in `ORDER_ERROR_CODES` (`packages/shared/src/orders.ts`), each with its only HTTP status:

| Code | Status |
|------|--------|
| `INSUFFICIENT_BUYING_POWER` | 422, `details: { required, available }` |
| `MARGIN_DEFICIT` | 422 |
| `SYMBOL_NOT_SHORTABLE` | 422 |
| `FRACTIONAL_NOT_ALLOWED` | 422 |
| `FRACTIONAL_SHORT_NOT_ALLOWED` | 422 |
| `BRACKET_NOT_ALLOWED` | 422 |
| `INVALID_BRACKET_PRICE` | 422 |
| `INVALID_STOP_LIMIT_PRICES` | 422 |
| `ORDER_NOT_FOUND` | 404 |
| `ORDER_NOT_MODIFIABLE` | 422 |
| `ORDER_NOT_CANCELLABLE` | 422 |
| `ORDER_VERSION_CONFLICT` | 409 |
| `PRICE_UNAVAILABLE` | 422 |

Reused from existing arrays, not duplicated: `SYMBOL_NOT_FOUND` (404, market), `ACCOUNT_NOT_FOUND` (404, accounts), `VALIDATION_ERROR` (422, api). The preview endpoint throws the same errors as placement; its `warnings` array carries only non-blocking codes: `MARKET_CLOSED`, `IMMEDIATE_FILL`, `OPENS_SHORT`.

## WebSocket

Pushed to every socket of the owning user, no subscription required:

```json
{ "type": "order_update", "order": Order }
{ "type": "trade", "trade": Trade }
{ "type": "position_update", "position": Position }
```

`account_summary` (Module 2) follows every fill. Order of emission after a fill: `trade`, `order_update` for the filled order, `order_update` for each created or cancelled child, `position_update`, `account_summary`.

## Shared package

- `packages/shared/src/orders.ts`: enums as zod enums, `ORDER_ERROR_CODES`, `QUANTITY_DECIMALS = 6` and `PRICE_DECIMALS = 4` constants, `placeOrderSchema` with cross-field refinements (required prices per type, stop-limit relation, bracket direction), `modifyOrderSchema`, `cancelOrderSchema`, `orderDtoSchema` / `orderSchema`, `orderPreviewSchema`, `ordersQuerySchema`, `positionRecordDtoSchema` / `positionRecordSchema` (the raw row: `id`, `accountId`, `symbol`, `quantity`, `averageCost`, `realizedPnl`, `openedAt`, `closedAt`, `updatedAt`; carried by `position_update`), `insufficientBuyingPowerDetailsSchema`.
- `packages/shared/src/accounts.ts`: `positionSchema` (the valued view returned by `GET /accounts/:id/positions`) stays where it is and gains `realizedPnl`. `packages/shared/src/market.ts`: `tradeSchema` stays and gains `accountId` and `commission`. `accountSummarySchema` gains the six summary fields.
- `packages/shared/src/order-math.ts`: pure Decimal functions used by both API and web: `sharesFromAmount(amount, price, fractionable)` (round down to 6 decimals, or to a whole share), `estimateCost`, `positionEffect(currentQty, side, qty)`, `reservationFor({ side, effect, quantity, openingQuantity, referencePrice, shortMarginRate, commission, role })` (any role other than `ENTRY` reserves `0`), `buyingPower(inputs)`, `nextAverageCost`, `realizedPnlFor`, `splitCrossingFill`, `validateBracketPrices(side, entry, sl, tp)`. Unit tested once, imported everywhere.
- `packages/shared/src/ws.ts`: extend the server message union (`order_update`, `trade`, `position_update`). The web client drops any frame that fails the union parse, so this lands before any web work.

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

- Account select lists the user's accounts with buying power. It is bound to the global active account (`useSelectAccount`): choosing an account in the panel changes the sidebar's active account, so the position, trade and orders panels under the chart always show the account the order goes to. Seam invariant (L-13): at any moment the panel's account id equals `activeAccountId`; one test crosses the seam.
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
- Live updates from `order_update`, `trade` messages through the orders store; no polling. A `trade` message also invalidates the symbol trades query so the Module 3 trade history panel refetches. The web derives the sign of a trade row from `side` (`amount` is unsigned on the wire).

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
ORDER_EXPIRY_CHECK_SECONDS=60
```

All five are parsed in `apps/api/src/lib/config.ts` with the defaults above (`zod` decimal strings for the rates, integer for the interval). `QUANTITY_DECIMALS` is a shared constant, not an environment variable, because the shared zod schema needs it at build time.

## Decisions (pre-review 2026-09-09)

Answers from the spec pre-review (L-1). Everything above already reflects them.

1. Tech debt in scope as Phase 0: TD-77, TD-78, TD-79 (candle cache seam) and TD-56 (batched `getLastPrices`, needed by the snapshot writer once positions exist). TD-67 is fixed inside the module when the WebSocket subscribe path is touched. TD-75 and TD-28 move to Module 5.
2. Available quantity for position-effect classification is net of the account's open closing orders on the same symbol (see Order semantics). Prevents a second "closing" sell from flipping into an unmargined short.
3. The order panel's account select is bound to the global active account (see Order panel).
4. Positions on the web are a client store (`features/positions/store.ts`) fed by `GET /accounts/:id/positions` on load and `position_update` afterwards; unrealized and daily P&L are computed in `features/positions/mappers.ts` from the market store's quote (`lastPrice`, `prevClose`), so rows move with every tick. `usePositionsQuoteSubscription(accountId)` subscribes the quotes of every open position of the active account (bounded by `QUOTE_SUBSCRIPTION_LIMIT`). `usePositionRows` (dashboard) and `useSymbolPosition` (market page) read from this store; the Module 2 query hook `usePositions` becomes the store's loader.
5. `DAY` orders expire at the next regular session close per the NYSE calendar, under every provider.
6. `REJECTED` is an engine-time outcome only; placement validation is a `422` that persists nothing.
7. Test layers: shared unit tests, api integration and engine unit tests, web store, reducer and render tests, plus one Playwright spec `orders.spec.ts` (market BUY on the symbol page, fill dialog, position row on the portfolio page, row in the Orders tab). Seven implementation phases: 0 debt, A shared, B1 placement and validation, B2 engine, fills and brackets, B3 modify, cancel, expiry, listing and summary, C1 web positions and order panel, C2 Orders tab and dialogs; api and web phases run in parallel by workspace with one api test run at a time.
8. Serialization, rounding, enums, `clientOrderId` uniqueness, `@db.Decimal` scales, the write ownership rule, immediate evaluation of every order type at placement, same-tick stop fills, negative cash after equity-based fills, `QUANTITY_DECIMALS` as a shared constant: recorded in the sections above.
9. Test seam for market hours and scripted prices: integration tests build the market runtime with a fake `alpaca` stream provider from `apps/api/test/market-fakes.ts` extended with `emit(trade)`, so the calendar drives `getMarketStatus` and tests dictate the tick price and time (`now` injected). The simulated provider stays for symbol seeding (`seedSymbols`). Engine and expiry job receive `now: () => Date` like the snapshot job; no fake timers for order logic.
10. `useOrderForm` is a thin hook over a pure reducer in `features/orders/order-form.ts` (state, transitions, unit conversion, field visibility, validation), tested without React. Missing shadcn primitives added: `checkbox`, `badge`, `sheet`; the status segmented control is hand-rolled like `RangeSelector` (`role="group"`, `aria-pressed`).
12. Shared math rounding (Phase A): `buyingPower` rounds `equity`, `shortMargin` and `buyingPower` half-even to cents; `nextAverageCost` rounds half-even to 8 places; `estimateCost` and `realizedPnlFor` round half-even to cents; `sharesFromAmount` rounds down. The spec's USD-mode example was corrected from `3.978912` to `3.978674` (`1000 / 251.34` rounded down to 6 places; the cost and reservation figures in the same example already matched the corrected value).
11. The order panel keeps `role="region"` with the `market:orderSlot.title` label and the "Back to key stats" button so the Module 3 e2e assertions hold; `orderSlot.placeholder` is removed. Nav tabs become `[Portfolio] [Orders] [Reports] [Deposit]`; the e2e `TABS` list and the i18n `EXPECTED_NAMESPACES` list are updated with the new `orders` namespace.

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
19. Order panel: USD mode with `1000` at last price `251.34` shows `3.978674 shares` on a fractionable symbol and `3 shares` on a non-fractionable one, and submits that quantity; switching order type reveals the right price fields; unchecked brackets send `null`; a SELL with no position shows `Sell short` and the margin requirement.
20. Order panel success dialog shows fill details; `INSUFFICIENT_BUYING_POWER` renders required versus available inline.
21. Orders tab lists active orders across accounts, live-updates on fill, expands bracket children, and Modify plus Cancel work with version handling.
22. Symbol page Orders, Position, and Trade history tabs show real data for the active account and update without reload.
23. Every monetary, price, and quantity field in order, trade, and position responses is a JSON string.

## Tests

- Shared `order-math` unit tests first: share conversion (fractional and whole), position effect classification, reservations per type and effect, buying power with shorts, average cost in both directions, realized P&L for longs and shorts, crossing-zero split, bracket validation per side, with Decimal edge cases (repeating decimals, 6-decimal quantities, large quantities).
- API integration for criteria 1 to 18 and 23 with a fake stream provider that emits scripted trades and an injected `now` (decision 9); each fill asserts the ledger invariant `cashBalance == latest balanceAfter` (`expectLedgerInvariant`) and the reservation invariant `sum(reservedCash of OPEN and TRIGGERED orders) == recomputed from order-math` (new `expectReservationInvariant`). Every conditional write has a two-writer `Promise.all` test (L-6): concurrent fill and cancel, concurrent modify and modify, concurrent placement with one `clientOrderId`.
- Existing stub tests `accounts.positions.test.ts` and `market.trades.test.ts` are rewritten for real data.
- Engine unit tests: per-symbol queue serialization, startup index rebuild, OCO handling, child quantity adjustment.
- Web: `order-form.ts` reducer tests without React (unit conversion, field visibility, validation, preview debounce), orders and positions store tests (apply updates, indexes, reset registration), a seam test that the panel's account equals the active account, render tests for `OrderPanel`, `OrdersTable` with bracket fixtures, `ModifyOrderDialog` version conflict path. Fixtures for mappers are copied from the API's serialized output (L-14).
- e2e: `apps/e2e/tests/orders.spec.ts` per decision 7.
