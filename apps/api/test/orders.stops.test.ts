import { orderDtoSchema, type OrderDto } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  expectLedgerInvariant,
  expectNoMonetaryNumbers,
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

function orderOf(body: unknown): OrderDto {
  expectNoMonetaryNumbers(body);

  return orderDtoSchema.parse((body as { order: unknown }).order) as unknown as OrderDto;
}

async function place(body: Record<string, unknown>): Promise<OrderDto> {
  const response = await postOrder(context.app, owner.accessToken, accountId, body);

  expect(response.status).toBe(201);

  return orderOf(response.body);
}

async function tick(price: string): Promise<void> {
  context.provider.emit({ symbol: SYMBOL, price });
  await context.engine.flush();
}

function updatesFor(orderId: string): OrderDto[] {
  return context.broadcasts
    .filter((record) => record.message.type === "order_update")
    .map((record) => (record.message as { order: OrderDto }).order)
    .filter((order) => order.id === orderId);
}

describe("stop and stop-limit orders", () => {
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

  it("rests a stop buy above the last price and reserves from its stop price", async () => {
    const order = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "STOP",
      quantity: "10",
      stopPrice: "260.0000",
    });

    expect(order.status).toBe("OPEN");
    expect(order.triggeredAt).toBeNull();
    expect(order.reservedCash).toBe("2600.00");

    await expectReservationInvariant(accountId);
  });

  it("triggers and fills a stop buy on the same tick without persisting TRIGGERED", async () => {
    const order = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "STOP",
      quantity: "10",
      stopPrice: "260.0000",
    });

    context.broadcasts.length = 0;
    await tick("261.0000");

    const filled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(filled.status).toBe("FILLED");
    expect(filled.avgFillPrice?.toString()).toBe("261");
    expect(filled.triggeredAt).not.toBeNull();
    expect(filled.reservedCash.toString()).toBe("0");

    const updates = updatesFor(order.id);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.status).toBe("FILLED");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("holds a triggered stop-limit until the limit condition holds", async () => {
    const order = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "STOP_LIMIT",
      quantity: "10",
      stopPrice: "260.0000",
      limitPrice: "260.0000",
    });

    expect(order.reservedCash).toBe("2600.00");

    context.broadcasts.length = 0;
    await tick("265.0000");

    const triggered = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(triggered.status).toBe("TRIGGERED");
    expect(triggered.triggeredAt).not.toBeNull();
    expect(updatesFor(order.id)).toHaveLength(1);
    expect(updatesFor(order.id)[0]?.status).toBe("TRIGGERED");
    await expectReservationInvariant(accountId);

    await tick("260.0000");

    const filled = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(filled.status).toBe("FILLED");
    expect(filled.avgFillPrice?.toString()).toBe("260");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId);
  });

  it("rejects a resting short sale whose symbol lost its shortable flag", async () => {
    context.setNow(WEDNESDAY_20_00_NY);

    const order = await place({
      symbol: SYMBOL,
      side: "SELL",
      type: "MARKET",
      quantity: "10",
    });

    expect(order.status).toBe("OPEN");
    expect(order.reservedCash).toBe("1275.00");

    await prisma.symbol.update({ where: { symbol: SYMBOL }, data: { shortable: false } });
    context.setNow(THURSDAY_10_00_NY);
    context.broadcasts.length = 0;

    await tick("251.0000");

    const rejected = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectReason).toBe("SYMBOL_NOT_SHORTABLE");
    expect(rejected.reservedCash.toString()).toBe("0");
    expect(await prisma.trade.count({ where: { accountId } })).toBe(0);
    expect(updatesFor(order.id)).toHaveLength(1);

    await expectReservationInvariant(accountId);
  });
});
