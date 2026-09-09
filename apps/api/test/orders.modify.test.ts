import type { OrderDto } from "@stockdesk/shared";
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
import { patchOrder } from "./orders-api.js";
import { createOrdersTestContext, expectReservationInvariant, type OrdersTestContext } from "./orders-helpers.js";
import { lastAccountSummary, orderOf, placeAccepted } from "./orders-scenario.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const SYMBOL = "TSLA";
const LAST = "250.0000";
const UNKNOWN_ORDER_ID = "unknown-order-id";

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

async function place(body: Record<string, unknown>): Promise<OrderDto> {
  return await placeAccepted(context.app, owner.accessToken, accountId, body);
}

async function modify(orderId: string, body: Record<string, unknown>): Promise<OrderDto> {
  const response = await patchOrder(context.app, owner.accessToken, accountId, orderId, body);

  expect(response.status).toBe(200);

  return orderOf(response.body);
}

const RESTING_LIMIT_BUY = {
  symbol: SYMBOL,
  side: "BUY",
  type: "LIMIT",
  quantity: "10",
  limitPrice: "180.0000",
};

const BRACKETED_LIMIT_BUY = {
  symbol: SYMBOL,
  side: "BUY",
  type: "LIMIT",
  quantity: "10",
  limitPrice: "180.0000",
  stopLossPrice: "170.0000",
  takeProfitPrice: "200.0000",
};

describe("PATCH /api/v1/accounts/:id/orders/:orderId", () => {
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

  it("changes the limit price, the reservation and the version of an open order", async () => {
    const order = await place(RESTING_LIMIT_BUY);

    expect(order.reservedCash).toBe("1800.00");

    context.broadcasts.length = 0;
    const modified = await modify(order.id, { limitPrice: "200.0000", version: order.version });

    expect(modified.limitPrice).toBe("200.0000");
    expect(modified.reservedCash).toBe("2000.00");
    expect(modified.version).toBe(2);
    expect(modified.status).toBe("OPEN");

    expect(lastAccountSummary(context, accountId).reservedCash).toBe("2000.00");
    expect(lastAccountSummary(context, accountId).buyingPower).toBe("98000.00");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("rejects a modify beyond the buying power and leaves the row untouched", async () => {
    const order = await place({ ...RESTING_LIMIT_BUY, quantity: "500" });

    expect(order.reservedCash).toBe("90000.00");

    const response = await patchOrder(context.app, owner.accessToken, accountId, order.id, {
      limitPrice: "220.0000",
      version: order.version,
    });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: {
        code: "INSUFFICIENT_BUYING_POWER",
        details: { required: "110000.00", available: "100000.00" },
      },
    });

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(row.limitPrice?.toString()).toBe("180");
    expect(row.reservedCash.toString()).toBe("90000");
    expect(row.version).toBe(1);

    await expectReservationInvariant(accountId);
  });

  it("rejects a stale version with a conflict", async () => {
    const order = await place(RESTING_LIMIT_BUY);
    const response = await patchOrder(context.app, owner.accessToken, accountId, order.id, {
      limitPrice: "190.0000",
      version: order.version + 1,
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({ error: { code: "ORDER_VERSION_CONFLICT" } });
  });

  it("refuses to modify a filled order", async () => {
    const order = await place({ symbol: SYMBOL, side: "BUY", type: "MARKET", quantity: "1" });

    expect(order.status).toBe("FILLED");

    const response = await patchOrder(context.app, owner.accessToken, accountId, order.id, {
      quantity: "2",
      version: order.version,
    });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "ORDER_NOT_MODIFIABLE" } });
  });

  it("fills a modified limit that becomes marketable while the market is open", async () => {
    const order = await place(RESTING_LIMIT_BUY);

    expect(order.status).toBe("OPEN");

    const modified = await modify(order.id, { limitPrice: "260.0000", version: order.version });

    expect(modified.status).toBe("FILLED");
    expect(modified.avgFillPrice).toBe("250.0000");
    expect(modified.reservedCash).toBe("0.00");
    expect(await prisma.trade.count({ where: { accountId } })).toBe(1);

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("returns a not found error for an unknown order and for another user's account", async () => {
    const stranger = await registerUser(context.app);
    const order = await place(RESTING_LIMIT_BUY);

    const missing = await patchOrder(
      context.app,
      owner.accessToken,
      accountId,
      UNKNOWN_ORDER_ID,
      { quantity: "5", version: 1 },
    );

    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: "ORDER_NOT_FOUND" } });

    const foreign = await patchOrder(context.app, stranger.accessToken, accountId, order.id, {
      quantity: "5",
      version: order.version,
    });

    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("lets exactly one of two concurrent modifies with the same version win", async () => {
    const order = await place(RESTING_LIMIT_BUY);

    const responses = await Promise.all([
      patchOrder(context.app, owner.accessToken, accountId, order.id, {
        limitPrice: "190.0000",
        version: order.version,
      }),
      patchOrder(context.app, owner.accessToken, accountId, order.id, {
        limitPrice: "185.0000",
        version: order.version,
      }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const row = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(row.version).toBe(2);
    await expectReservationInvariant(accountId);
  });

  it("edits the bracket prices of an unfilled entry", async () => {
    const order = await place(BRACKETED_LIMIT_BUY);

    const modified = await modify(order.id, {
      stopLossPrice: "175.0000",
      takeProfitPrice: "210.0000",
      version: order.version,
    });

    expect(modified.stopLossPrice).toBe("175.0000");
    expect(modified.takeProfitPrice).toBe("210.0000");
    expect(modified.version).toBe(2);

    const removed = await modify(order.id, {
      stopLossPrice: null,
      version: modified.version,
    });

    expect(removed.stopLossPrice).toBeNull();
    expect(removed.takeProfitPrice).toBe("210.0000");
  });

  it("moves bracket edits to the children once the entry is filled", async () => {
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

    const onEntry = await patchOrder(context.app, owner.accessToken, accountId, entry.id, {
      stopLossPrice: "235.0000",
      version: entry.version,
    });

    expect(onEntry.status).toBe(422);
    expect(onEntry.body).toMatchObject({ error: { code: "ORDER_NOT_MODIFIABLE" } });

    const child = await prisma.order.findFirstOrThrow({
      where: { parentOrderId: entry.id, role: "STOP_LOSS" },
    });

    const modified = await modify(child.id, { stopPrice: "235.0000", version: child.version });

    expect(modified.stopPrice).toBe("235.0000");
    expect(modified.version).toBe(child.version + 1);
    expect(modified.reservedCash).toBe("0.00");

    await expectReservationInvariant(accountId);
  });

  it("refuses a child quantity above the absolute position quantity", async () => {
    const entry = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      quantity: "10",
      limitPrice: "260.0000",
      stopLossPrice: "240.0000",
    });

    expect(entry.status).toBe("FILLED");

    const child = await prisma.order.findFirstOrThrow({
      where: { parentOrderId: entry.id, role: "STOP_LOSS" },
    });

    const response = await patchOrder(context.app, owner.accessToken, accountId, child.id, {
      quantity: "20",
      version: child.version,
    });

    expect(response.status).toBe(422);
    expect(response.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const reduced = await modify(child.id, { quantity: "4", version: child.version });

    expect(reduced.quantity).toBe("4.000000");
  });
});
