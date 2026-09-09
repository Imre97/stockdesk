import { Decimal, type OrderDto } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  expectLedgerInvariant,
  mainAccount,
  registerUser,
  type RegisteredUser,
} from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import { deleteOrder } from "./orders-api.js";
import { createOrdersTestContext, expectReservationInvariant, type OrdersTestContext } from "./orders-helpers.js";
import { orderOf, orderUpdatesFor, placeAccepted } from "./orders-scenario.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const SYMBOL = "TSLA";
const LAST = "250.0000";

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

async function place(body: Record<string, unknown>): Promise<OrderDto> {
  return await placeAccepted(context.app, owner.accessToken, accountId, body);
}

async function cancel(orderId: string, version: number): Promise<OrderDto> {
  const response = await deleteOrder(context.app, owner.accessToken, accountId, orderId, {
    version,
  });

  expect(response.status).toBe(200);

  return orderOf(response.body);
}

function summaryCount(): number {
  return context.broadcasts.filter((record) => record.message.type === "account_summary").length;
}

const RESTING_LIMIT_BUY = {
  symbol: SYMBOL,
  side: "BUY",
  type: "LIMIT",
  quantity: "10",
  limitPrice: "180.0000",
};

describe("DELETE /api/v1/accounts/:id/orders/:orderId", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
    await seedSymbols({ provider: context.simulated });
    await context.ensureStreaming([SYMBOL]);
    context.provider.emit({ symbol: SYMBOL, price: LAST });

    owner = await registerUser(context.app);
    accountId = (await mainAccount(context.app, owner.accessToken)).id;
    context.broadcasts.length = 0;
  });

  afterEach(async () => {
    await context.close();
  });

  it("cancels an open order, releases the reservation and pushes the update", async () => {
    const order = await place(RESTING_LIMIT_BUY);

    expect(order.reservedCash).toBe("1800.00");
    context.broadcasts.length = 0;

    const cancelled = await cancel(order.id, order.version);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("USER");
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(cancelled.reservedCash).toBe("0.00");
    expect(cancelled.version).toBe(2);

    expect(orderUpdatesFor(context, order.id).map((update) => update.status)).toEqual(["CANCELLED"]);
    expect(summaryCount()).toBeGreaterThan(0);

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("cancels a triggered stop-limit order", async () => {
    const order = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "STOP_LIMIT",
      quantity: "10",
      stopPrice: "260.0000",
      limitPrice: "260.0000",
    });

    context.provider.emit({ symbol: SYMBOL, price: "265.0000" });
    await context.engine.flush();

    const triggered = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(triggered.status).toBe("TRIGGERED");

    const cancelled = await cancel(order.id, triggered.version);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("USER");
    expect(cancelled.reservedCash).toBe("0.00");

    await expectReservationInvariant(accountId);
  });

  it("refuses to cancel a filled or an already cancelled order", async () => {
    const filled = await place({ symbol: SYMBOL, side: "BUY", type: "MARKET", quantity: "1" });

    expect(filled.status).toBe("FILLED");

    const onFilled = await deleteOrder(context.app, owner.accessToken, accountId, filled.id, {
      version: filled.version,
    });

    expect(onFilled.status).toBe(422);
    expect(onFilled.body).toMatchObject({ error: { code: "ORDER_NOT_CANCELLABLE" } });

    const resting = await place(RESTING_LIMIT_BUY);
    const cancelled = await cancel(resting.id, resting.version);

    const again = await deleteOrder(context.app, owner.accessToken, accountId, resting.id, {
      version: cancelled.version,
    });

    expect(again.status).toBe(422);
    expect(again.body).toMatchObject({ error: { code: "ORDER_NOT_CANCELLABLE" } });
  });

  it("rejects a stale version with a conflict", async () => {
    const order = await place(RESTING_LIMIT_BUY);

    const response = await deleteOrder(context.app, owner.accessToken, accountId, order.id, {
      version: order.version + 1,
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "ORDER_VERSION_CONFLICT" } });

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(row.status).toBe("OPEN");
    expect(row.reservedCash.toString()).toBe("1800");
  });

  it("leaves the OCO sibling alone when a bracket child is cancelled", async () => {
    const entry = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      quantity: "10",
      limitPrice: "260.0000",
      stopLossPrice: "240.0000",
      takeProfitPrice: "280.0000",
    });

    expect(entry.status).toBe("FILLED");

    const stopLoss = await prisma.order.findFirstOrThrow({
      where: { parentOrderId: entry.id, role: "STOP_LOSS" },
    });
    const takeProfit = await prisma.order.findFirstOrThrow({
      where: { parentOrderId: entry.id, role: "TAKE_PROFIT" },
    });

    const cancelled = await cancel(stopLoss.id, stopLoss.version);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancelReason).toBe("USER");

    const sibling = await prisma.order.findUniqueOrThrow({ where: { id: takeProfit.id } });

    expect(sibling.status).toBe("OPEN");
    expect(sibling.cancelReason).toBeNull();
    expect(sibling.version).toBe(takeProfit.version);
    expect(sibling.ocoGroupId).toBe(stopLoss.ocoGroupId);

    await expectReservationInvariant(accountId);
  });

  it("cancels an unfilled entry without touching any child", async () => {
    const entry = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      quantity: "10",
      limitPrice: "180.0000",
      stopLossPrice: "170.0000",
      takeProfitPrice: "200.0000",
    });

    expect(entry.status).toBe("OPEN");
    expect(await prisma.order.count({ where: { parentOrderId: entry.id } })).toBe(0);

    const cancelled = await cancel(entry.id, entry.version);

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.stopLossPrice).toBe("170.0000");
    expect(await prisma.order.count({ where: { parentOrderId: entry.id } })).toBe(0);
  });

  it("lets exactly one of two concurrent cancels win", async () => {
    const order = await place(RESTING_LIMIT_BUY);

    const responses = await Promise.all([
      deleteOrder(context.app, owner.accessToken, accountId, order.id, {
        version: order.version,
      }),
      deleteOrder(context.app, owner.accessToken, accountId, order.id, {
        version: order.version,
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(row.status).toBe("CANCELLED");
    expect(row.version).toBe(2);
  });

  it("lets either the fill or the cancel win when both race on one order", async () => {
    const order = await place(RESTING_LIMIT_BUY);
    const tick = { symbol: SYMBOL, price: new Decimal("179.0000"), at: context.now() };

    const [, cancelResponse] = await Promise.all([
      context.engine.processTick(tick),
      deleteOrder(context.app, owner.accessToken, accountId, order.id, {
        version: order.version,
      }),
    ]);
    await context.engine.flush();

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const trades = await prisma.trade.count({ where: { accountId } });

    if (cancelResponse.status === 200) {
      expect(row.status).toBe("CANCELLED");
      expect(trades).toBe(0);
    } else {
      expect([409, 422]).toContain(cancelResponse.status);
      expect(row.status).toBe("FILLED");
      expect(trades).toBe(1);
    }

    expect(row.reservedCash.toString()).toBe("0");
    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });
});
