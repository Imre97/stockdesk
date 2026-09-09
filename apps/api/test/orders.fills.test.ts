import { placeOrderResponseDtoSchema, type PlaceOrderResponseDto } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  expectLedgerInvariant,
  expectNoMonetaryNumbers,
  firstOf,
  mainAccount,
  registerUser,
  type RegisteredUser,
} from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import {
  createOrdersTestContext,
  expectReservationInvariant,
  postOrder,
  type OrdersTestContext,
} from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const WEDNESDAY_20_00_NY = new Date("2026-09-10T00:00:00.000Z");
const THURSDAY_10_00_NY = new Date("2026-09-10T14:00:00.000Z");
const SYMBOL = "TSLA";
const LAST = "250.0000";

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

function placedOf(body: unknown): PlaceOrderResponseDto {
  expectNoMonetaryNumbers(body);

  return placeOrderResponseDtoSchema.parse(body) as unknown as PlaceOrderResponseDto;
}

async function place(body: Record<string, unknown>): ReturnType<typeof postOrder> {
  return await postOrder(context.app, owner.accessToken, accountId, body);
}

async function tick(price: string): Promise<void> {
  context.provider.emit({ symbol: SYMBOL, price });
  await context.engine.flush();
}

async function orderStatus(orderId: string): Promise<string> {
  const row = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  return row.status;
}

describe("order fills", () => {
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

  it("fills a market buy at the last price and books the trade, position and cash", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(201);

    const placed = placedOf(response.body);

    expect(placed.order.status).toBe("FILLED");
    expect(placed.order.avgFillPrice).toBe("250.0000");
    expect(placed.order.reservedCash).toBe("0.00");
    expect(placed.trade?.price).toBe("250.0000");
    expect(placed.trade?.amount).toBe("2500.00");
    expect(placed.trade?.quantity).toBe("10.000000");
    expect(placed.trade?.realizedPnl).toBeNull();
    expect(placed.position?.quantity).toBe("10.000000");
    expect(placed.position?.averageCost).toBe("250.0000");
    expect(placed.account.cash).toBe("97500.00");

    const entry = firstOf(
      await prisma.cashTransaction.findMany({ where: { accountId, type: "TRADE" } }),
      "TRADE cash transaction",
    );

    expect(entry.amount.toString()).toBe("-2500");
    expect(entry.balanceAfter.toString()).toBe("97500");
    expect(entry.referenceId).toBe(placed.trade?.id);
    expect(entry.note).toBe("TRADE BUY 10 TSLA");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("fills a resting limit buy at the better tick price and releases the reservation", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      quantity: "10",
      limitPrice: "240.0000",
    });

    const placed = placedOf(response.body);

    expect(placed.order.status).toBe("OPEN");
    expect(placed.order.reservedCash).toBe("2400.00");

    await tick("239.0000");

    const filled = await prisma.order.findUniqueOrThrow({ where: { id: placed.order.id } });

    expect(filled.status).toBe("FILLED");
    expect(filled.avgFillPrice?.toString()).toBe("239");
    expect(filled.reservedCash.toString()).toBe("0");

    const trade = firstOf(await prisma.trade.findMany({ where: { accountId } }), "trade");

    expect(trade.price.toString()).toBe("239");
    expect(trade.amount.toString()).toBe("2390");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("leaves a resting limit buy open on a tick above its limit price", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      quantity: "10",
      limitPrice: "240.0000",
    });

    const placed = placedOf(response.body);

    await tick("241.0000");

    expect(await orderStatus(placed.order.id)).toBe("OPEN");
    expect(await prisma.trade.count({ where: { accountId } })).toBe(0);
    await expectReservationInvariant(accountId);
  });

  it("fills a fractional market buy for half a share", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "0.5",
    });

    const placed = placedOf(response.body);

    expect(placed.order.status).toBe("FILLED");
    expect(placed.trade?.quantity).toBe("0.500000");
    expect(placed.trade?.amount).toBe("125.00");
    expect(placed.position?.quantity).toBe("0.500000");
    expect(placed.account.cash).toBe("99875.00");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("fills an order placed while the market was closed on the first tick after open", async () => {
    context.setNow(WEDNESDAY_20_00_NY);

    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    const placed = placedOf(response.body);

    expect(placed.order.status).toBe("OPEN");
    expect(placed.order.reservedCash).toBe("2550.00");
    expect(placed.trade).toBeUndefined();

    context.setNow(THURSDAY_10_00_NY);
    await tick("251.0000");

    const filled = await prisma.order.findUniqueOrThrow({ where: { id: placed.order.id } });

    expect(filled.status).toBe("FILLED");
    expect(filled.avgFillPrice?.toString()).toBe("251");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("pushes the fill messages in the specified order to the owner only", async () => {
    const other = await registerUser(context.app);
    context.broadcasts.length = 0;

    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(201);

    const mine = context.broadcasts.filter((record) => record.userId === owner.user.id);

    expect(mine.map((record) => record.message.type)).toEqual([
      "trade",
      "order_update",
      "position_update",
      "account_summary",
    ]);

    const summary = firstOf(
      (mine[3]?.message as { accounts: { id: string; positionsValue: string }[] }).accounts.filter(
        (account) => account.id === accountId,
      ),
      "Main summary",
    );

    expect(summary.positionsValue).toBe("2500.00");
    expect(context.broadcasts.filter((record) => record.userId === other.user.id)).toEqual([]);
  });
});
