import { orderDtoSchema, type OrderDto } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { expectNoMonetaryNumbers, mainAccount, registerUser } from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import {
  createOrdersTestContext,
  postOrder,
  seedOrder,
  seedPosition,
  type OrdersTestContext,
} from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const SYMBOL = "TSLA";
const NOT_SHORTABLE = "MU";
const LAST = "200.0000";

let context: OrdersTestContext;
let token: string;
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

function marketSell(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "10", ...overrides };
}

function orderOf(body: unknown): OrderDto {
  expectNoMonetaryNumbers(body);

  return orderDtoSchema.parse((body as { order: unknown }).order) as unknown as OrderDto;
}

function codeOf(body: unknown): string {
  expectNoMonetaryNumbers(body);

  return (body as { error: { code: string } }).error.code;
}

async function place(body: Record<string, unknown>): ReturnType<typeof postOrder> {
  return await postOrder(context.app, token, accountId, body);
}

describe("order bracket and available quantity validation", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
    await seedSymbols({ provider: context.simulated });
    await context.ensureStreaming([SYMBOL, NOT_SHORTABLE]);
    context.provider.emit({ symbol: SYMBOL, price: LAST });
    context.provider.emit({ symbol: NOT_SHORTABLE, price: LAST });

    const owner = await registerUser(context.app);
    token = owner.accessToken;
    accountId = (await mainAccount(context.app, token)).id;
  });

  afterEach(async () => {
    await context.close();
  });

  it("refuses a long bracket whose stop loss is at or above the entry", async () => {
    const response = await place(limitBuy({ stopLossPrice: "190.0000" }));

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("INVALID_BRACKET_PRICE");
  });

  it("refuses a long bracket whose take profit is at or below the entry", async () => {
    const response = await place(limitBuy({ takeProfitPrice: "170.0000" }));

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("INVALID_BRACKET_PRICE");
  });

  it("accepts a long bracket that straddles the limit price", async () => {
    const response = await place(
      limitBuy({ stopLossPrice: "170.0000", takeProfitPrice: "190.0000" }),
    );

    expect(response.status).toBe(201);

    const order = orderOf(response.body);

    expect(order.stopLossPrice).toBe("170.0000");
    expect(order.takeProfitPrice).toBe("190.0000");
  });

  it("refuses a short bracket whose stop loss is at or below the entry", async () => {
    const response = await place(marketSell({ stopLossPrice: "190.0000" }));

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("INVALID_BRACKET_PRICE");
  });

  it("refuses a short bracket whose take profit is at or above the entry", async () => {
    const response = await place(marketSell({ takeProfitPrice: "210.0000" }));

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("INVALID_BRACKET_PRICE");
  });

  it("accepts a short bracket that straddles the last price", async () => {
    const response = await place(
      marketSell({ stopLossPrice: "210.0000", takeProfitPrice: "190.0000" }),
    );

    expect(response.status).toBe(201);
    expect(orderOf(response.body).stopLossPrice).toBe("210.0000");
  });

  it("refuses a bracket on an order that closes a position", async () => {
    await seedPosition(accountId, { symbol: SYMBOL, quantity: "10", averageCost: "150" });

    const response = await place(marketSell({ stopLossPrice: "210.0000" }));

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("BRACKET_NOT_ALLOWED");
  });

  it("refuses a bracket on an order that flips a position", async () => {
    await seedPosition(accountId, { symbol: SYMBOL, quantity: "10", averageCost: "150" });

    const response = await place(marketSell({ quantity: "15", stopLossPrice: "210.0000" }));

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("BRACKET_NOT_ALLOWED");
  });

  it("treats a second closing sell as a short once an open sell covers the long", async () => {
    await seedPosition(accountId, { symbol: NOT_SHORTABLE, quantity: "10", averageCost: "150" });
    await seedOrder(accountId, {
      symbol: NOT_SHORTABLE,
      side: "SELL",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "210.0000",
    });

    const response = await place({
      symbol: NOT_SHORTABLE,
      side: "SELL",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("SYMBOL_NOT_SHORTABLE");
  });

  it("reserves the short margin for a second closing sell on a shortable symbol", async () => {
    await seedPosition(accountId, { symbol: SYMBOL, quantity: "10", averageCost: "150" });
    await seedOrder(accountId, {
      symbol: SYMBOL,
      side: "SELL",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "210.0000",
    });

    const response = await place(marketSell());

    expect(response.status).toBe(201);
    expect(orderOf(response.body).reservedCash).toBe("1020.00");
    expect(await prisma.order.count({ where: { accountId, status: "OPEN" } })).toBe(2);
  });

  it("refuses a buy stop-limit whose limit price is below the stop price", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "STOP_LIMIT",
      quantity: "10",
      stopPrice: "180.0000",
      limitPrice: "179.0000",
    });

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("INVALID_STOP_LIMIT_PRICES");
  });

  it("refuses a market order that carries a limit price", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
      limitPrice: "180.0000",
    });

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("VALIDATION_ERROR");
  });
});
