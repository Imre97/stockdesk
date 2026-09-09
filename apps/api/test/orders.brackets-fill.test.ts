import { placeOrderResponseDtoSchema, type PlaceOrderResponseDto } from "@stockdesk/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  authHeader,
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
const SYMBOL = "TSLA";
const LAST = "250.0000";

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

interface ChildRow {
  id: string;
  side: string;
  type: string;
  role: string;
  status: string;
  quantity: { toString: () => string };
  limitPrice: { toString: () => string } | null;
  stopPrice: { toString: () => string } | null;
  ocoGroupId: string | null;
  parentOrderId: string | null;
  cancelReason: string | null;
  version: number;
}

function placedOf(body: unknown): PlaceOrderResponseDto {
  expectNoMonetaryNumbers(body);

  return placeOrderResponseDtoSchema.parse(body) as unknown as PlaceOrderResponseDto;
}

async function place(body: Record<string, unknown>): Promise<PlaceOrderResponseDto> {
  const response = await postOrder(context.app, owner.accessToken, accountId, body);

  expect(response.status).toBe(201);

  return placedOf(response.body);
}

async function tick(price: string): Promise<void> {
  context.provider.emit({ symbol: SYMBOL, price });
  await context.engine.flush();
}

async function childrenOf(entryId: string): Promise<ChildRow[]> {
  return await prisma.order.findMany({
    where: { parentOrderId: entryId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

function byRole(children: ChildRow[], role: string): ChildRow {
  return firstOf(
    children.filter((child) => child.role === role),
    `${role} child`,
  );
}

async function tradeOf(orderId: string): Promise<{ realizedPnl: { toString: () => string } | null }> {
  return firstOf(await prisma.trade.findMany({ where: { orderId } }), `trade of order ${orderId}`);
}

async function openPositionCount(): Promise<number> {
  const response = await request(context.app)
    .get(`/api/v1/accounts/${accountId}/positions`)
    .set(authHeader(owner.accessToken));

  expect(response.status).toBe(200);

  return (response.body as { positions: unknown[] }).positions.length;
}

describe("bracket children on a fill", () => {
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

  async function longEntry(): Promise<PlaceOrderResponseDto> {
    return await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
      stopLossPrice: "240.0000",
      takeProfitPrice: "260.0000",
    });
  }

  async function shortEntry(): Promise<PlaceOrderResponseDto> {
    return await place({
      symbol: SYMBOL,
      side: "SELL",
      type: "MARKET",
      quantity: "10",
      stopLossPrice: "260.0000",
      takeProfitPrice: "240.0000",
    });
  }

  it("creates an opposite-side OCO pair when a long entry fills", async () => {
    const placed = await longEntry();
    const children = await childrenOf(placed.order.id);

    expect(children).toHaveLength(2);

    const stopLoss = byRole(children, "STOP_LOSS");
    const takeProfit = byRole(children, "TAKE_PROFIT");

    expect(stopLoss.side).toBe("SELL");
    expect(stopLoss.type).toBe("STOP");
    expect(stopLoss.stopPrice?.toString()).toBe("240");
    expect(takeProfit.side).toBe("SELL");
    expect(takeProfit.type).toBe("LIMIT");
    expect(takeProfit.limitPrice?.toString()).toBe("260");
    expect(stopLoss.quantity.toString()).toBe("10");
    expect(takeProfit.quantity.toString()).toBe("10");
    expect(stopLoss.ocoGroupId).toBe(takeProfit.ocoGroupId);
    expect(stopLoss.ocoGroupId).not.toBeNull();
    expect(stopLoss.parentOrderId).toBe(placed.order.id);
    expect(takeProfit.parentOrderId).toBe(placed.order.id);

    await expectReservationInvariant(accountId);
    await expectLedgerInvariant(accountId);
  });

  it("cancels the stop-loss sibling when the long take profit fills", async () => {
    const placed = await longEntry();

    await tick("260.0000");

    const children = await childrenOf(placed.order.id);

    expect(byRole(children, "TAKE_PROFIT").status).toBe("FILLED");
    expect(byRole(children, "STOP_LOSS").status).toBe("CANCELLED");
    expect(byRole(children, "STOP_LOSS").cancelReason).toBe("OCO_SIBLING_FILLED");

    const closing = await tradeOf(byRole(children, "TAKE_PROFIT").id);

    expect(closing.realizedPnl?.toString()).toBe("100");
    expect(await openPositionCount()).toBe(0);

    await expectReservationInvariant(accountId);
    await expectLedgerInvariant(accountId);
  });

  it("cancels the take-profit sibling when the long stop loss fills", async () => {
    const placed = await longEntry();

    await tick("240.0000");

    const children = await childrenOf(placed.order.id);

    expect(byRole(children, "STOP_LOSS").status).toBe("FILLED");
    expect(byRole(children, "TAKE_PROFIT").status).toBe("CANCELLED");
    expect(byRole(children, "TAKE_PROFIT").cancelReason).toBe("OCO_SIBLING_FILLED");

    const closing = await tradeOf(byRole(children, "STOP_LOSS").id);

    expect(closing.realizedPnl?.toString()).toBe("-100");
    expect(await openPositionCount()).toBe(0);

    await expectReservationInvariant(accountId);
    await expectLedgerInvariant(accountId);
  });

  it("creates buy children above and below a short entry", async () => {
    const placed = await shortEntry();
    const children = await childrenOf(placed.order.id);

    expect(placed.position?.quantity).toBe("-10.000000");

    const stopLoss = byRole(children, "STOP_LOSS");
    const takeProfit = byRole(children, "TAKE_PROFIT");

    expect(stopLoss.side).toBe("BUY");
    expect(stopLoss.stopPrice?.toString()).toBe("260");
    expect(takeProfit.side).toBe("BUY");
    expect(takeProfit.limitPrice?.toString()).toBe("240");
    expect(stopLoss.ocoGroupId).toBe(takeProfit.ocoGroupId);

    await expectReservationInvariant(accountId);
  });

  it("follows the position down and cancels the children once it closes", async () => {
    const placed = await longEntry();
    const reduce = await place({ symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "4" });

    expect(reduce.position?.quantity).toBe("6.000000");

    const reduced = await childrenOf(placed.order.id);

    expect(byRole(reduced, "STOP_LOSS").quantity.toString()).toBe("6");
    expect(byRole(reduced, "TAKE_PROFIT").quantity.toString()).toBe("6");
    expect(byRole(reduced, "STOP_LOSS").version).toBe(2);
    await expectReservationInvariant(accountId);

    const close = await place({ symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "6" });

    expect(close.position?.quantity).toBe("0.000000");

    const closed = await childrenOf(placed.order.id);

    expect(byRole(closed, "STOP_LOSS").status).toBe("CANCELLED");
    expect(byRole(closed, "STOP_LOSS").cancelReason).toBe("POSITION_CLOSED");
    expect(byRole(closed, "TAKE_PROFIT").cancelReason).toBe("POSITION_CLOSED");
    expect(await openPositionCount()).toBe(0);

    await expectReservationInvariant(accountId);
    await expectLedgerInvariant(accountId);
  });

  it("cancels the stop-loss sibling when the short take profit fills", async () => {
    const placed = await shortEntry();

    await tick("240.0000");

    const children = await childrenOf(placed.order.id);

    expect(byRole(children, "TAKE_PROFIT").status).toBe("FILLED");
    expect(byRole(children, "STOP_LOSS").cancelReason).toBe("OCO_SIBLING_FILLED");

    const closing = await tradeOf(byRole(children, "TAKE_PROFIT").id);

    expect(closing.realizedPnl?.toString()).toBe("100");
    expect(await openPositionCount()).toBe(0);

    await expectLedgerInvariant(accountId);
  });

  it("cancels the take-profit sibling when the short stop loss fills", async () => {
    const placed = await shortEntry();

    await tick("260.0000");

    const children = await childrenOf(placed.order.id);

    expect(byRole(children, "STOP_LOSS").status).toBe("FILLED");
    expect(byRole(children, "TAKE_PROFIT").cancelReason).toBe("OCO_SIBLING_FILLED");

    const closing = await tradeOf(byRole(children, "STOP_LOSS").id);

    expect(closing.realizedPnl?.toString()).toBe("-100");
    expect(await openPositionCount()).toBe(0);

    await expectLedgerInvariant(accountId);
  });
});
