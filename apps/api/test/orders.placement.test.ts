import { Decimal, orderDtoSchema, type OrderDto } from "@stockdesk/shared";
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  expectLedgerInvariant,
  expectNoMonetaryNumbers,
  firstOf,
  mainAccount,
  registerUser,
  type AccountSummaryBody,
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
const LAST = "200.0000";
const UNPRICED = "AAPL";

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

function limitBuy(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    symbol: SYMBOL,
    side: "BUY",
    type: "LIMIT",
    quantity: "10",
    limitPrice: "180.0000",
    ...overrides,
  };
}

function orderOf(body: unknown): OrderDto {
  expectNoMonetaryNumbers(body);

  return orderDtoSchema.parse((body as { order: unknown }).order) as unknown as OrderDto;
}

function summaryOf(body: unknown): AccountSummaryBody {
  return (body as { account: AccountSummaryBody }).account;
}

function errorOf(body: unknown): { code: string; details?: unknown } {
  expectNoMonetaryNumbers(body);

  return (body as { error: { code: string; details?: unknown } }).error;
}

async function place(body: Record<string, unknown>): ReturnType<typeof postOrder> {
  return await postOrder(context.app, owner.accessToken, accountId, body);
}

async function orderCount(): Promise<number> {
  return await prisma.order.count({ where: { accountId } });
}

describe("order placement", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
    await seedSymbols({ provider: context.simulated });
    await context.ensureStreaming([SYMBOL]);
    context.provider.emit({ symbol: SYMBOL, price: LAST });

    owner = await registerUser(context.app);
    accountId = (await mainAccount(context.app, owner.accessToken)).id;
  });

  afterEach(async () => {
    await context.close();
  });

  it("rejects a market buy whose reservation exceeds the buying power", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "1000",
    });

    expect(response.status).toBe(422);
    expect(errorOf(response.body).code).toBe("INSUFFICIENT_BUYING_POWER");
    expect(errorOf(response.body).details).toEqual({
      required: "204000.00",
      available: "100000.00",
    });
    expect(await orderCount()).toBe(0);
  });

  it("rests a limit buy below the last price and reserves its own price", async () => {
    context.broadcasts.length = 0;

    const response = await place(limitBuy());

    expect(response.status).toBe(201);

    const order = orderOf(response.body);

    expect(order.status).toBe("OPEN");
    expect(order.quantity).toBe("10.000000");
    expect(order.reservedCash).toBe("1800.00");
    expect(order.commission).toBe("0.00");
    expect(order.expiresAt).toBeNull();
    expect(order.version).toBe(1);
    expect(summaryOf(response.body).buyingPower).toBe("98200.00");

    await expectReservationInvariant(accountId);
    await expectLedgerInvariant(accountId);

    const broadcast = firstOf(
      context.broadcasts.filter((entry) => entry.message.type === "account_summary"),
      "account_summary broadcast",
    );

    expect(broadcast.userId).toBe(owner.user.id);
    expect(
      firstOf(
        (broadcast.message as { accounts: AccountSummaryBody[] }).accounts.filter(
          (entry) => entry.id === accountId,
        ),
        "Main summary",
      ).buyingPower,
    ).toBe("98200.00");
  });

  it("returns the stored order when a client order id is replayed", async () => {
    const clientOrderId = `replay-${randomBytes(6).toString("hex")}`;

    const first = await place(limitBuy({ clientOrderId }));
    const second = await place(limitBuy({ clientOrderId }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(orderOf(second.body).id).toBe(orderOf(first.body).id);
    expect(await orderCount()).toBe(1);
  });

  it("creates one row when two placements race with the same client order id", async () => {
    const clientOrderId = `race-${randomBytes(6).toString("hex")}`;
    const body = limitBuy({ clientOrderId });

    const [left, right] = await Promise.all([place(body), place(body)]);

    expect([left.status, right.status].sort()).toEqual([200, 201]);
    expect(orderOf(left.body).id).toBe(orderOf(right.body).id);
    expect(await orderCount()).toBe(1);
    expect(new Decimal(orderOf(left.body).reservedCash).toString()).toBe("1800");
  });

  it("refuses a market order for a symbol without a known price", async () => {
    const response = await place({
      symbol: UNPRICED,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(422);
    expect(errorOf(response.body).code).toBe("PRICE_UNAVAILABLE");
  });

  it("hides an account of another user behind ACCOUNT_NOT_FOUND", async () => {
    const other = await registerUser(context.app);

    const response = await postOrder(context.app, other.accessToken, accountId, limitBuy());

    expect(response.status).toBe(404);
    expect(errorOf(response.body).code).toBe("ACCOUNT_NOT_FOUND");
    expect(await orderCount()).toBe(0);
  });

  it("refuses an order for a symbol that is not listed", async () => {
    const response = await place(limitBuy({ symbol: "ZZZZ" }));

    expect(response.status).toBe(404);
    expect(errorOf(response.body).code).toBe("SYMBOL_NOT_FOUND");
  });
});
