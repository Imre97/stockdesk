import { orderDtoSchema, type OrderDto } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
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
  seedPosition,
  type OrdersTestContext,
} from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const WEDNESDAY_20_00_NY = new Date("2026-09-10T00:00:00.000Z");
const SYMBOL = "TSLA";
const NOT_SHORTABLE = "MU";
const NOT_FRACTIONABLE = "AVGO";
const LAST = "200.0000";

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

function orderOf(body: unknown): OrderDto {
  expectNoMonetaryNumbers(body);

  return orderDtoSchema.parse((body as { order: unknown }).order) as unknown as OrderDto;
}

function codeOf(body: unknown): string {
  expectNoMonetaryNumbers(body);

  return (body as { error: { code: string } }).error.code;
}

async function place(body: Record<string, unknown>): ReturnType<typeof postOrder> {
  return await postOrder(context.app, owner.accessToken, accountId, body);
}

describe("short, fractional and margin placement rules", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
    await seedSymbols({ provider: context.simulated });
    await context.ensureStreaming([SYMBOL, NOT_SHORTABLE, NOT_FRACTIONABLE]);
    context.provider.emit({ symbol: SYMBOL, price: LAST });
    context.provider.emit({ symbol: NOT_SHORTABLE, price: LAST });
    context.provider.emit({ symbol: NOT_FRACTIONABLE, price: LAST });

    owner = await registerUser(context.app);
    accountId = (await mainAccount(context.app, owner.accessToken)).id;
  });

  afterEach(async () => {
    await context.close();
  });

  it("refuses to open a short on a symbol that is not shortable", async () => {
    const response = await place({
      symbol: NOT_SHORTABLE,
      side: "SELL",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("SYMBOL_NOT_SHORTABLE");
    expect(await prisma.order.count({ where: { accountId } })).toBe(0);
  });

  it("refuses to open a short with a fractional quantity", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "SELL",
      type: "MARKET",
      quantity: "1.5",
    });

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("FRACTIONAL_SHORT_NOT_ALLOWED");
    expect(await prisma.order.count({ where: { accountId } })).toBe(0);
  });

  it("rests a short sale placed after the close with its buffered margin reservation", async () => {
    context.setNow(WEDNESDAY_20_00_NY);

    const response = await place({
      symbol: SYMBOL,
      side: "SELL",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(201);

    const order = orderOf(response.body);

    expect(order.status).toBe("OPEN");
    expect(order.reservedCash).toBe("1020.00");
    await expectReservationInvariant(accountId, new Map([[SYMBOL, LAST]]));
  });

  it("refuses a fractional quantity on a symbol that trades in whole shares", async () => {
    const response = await place({
      symbol: NOT_FRACTIONABLE,
      side: "BUY",
      type: "MARKET",
      quantity: "0.5",
    });

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("FRACTIONAL_NOT_ALLOWED");
  });

  it("refuses a quantity with more than six decimal places", async () => {
    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "0.1234567",
    });

    expect(response.status).toBe(422);
    expect(codeOf(response.body)).toBe("VALIDATION_ERROR");
  });

  it("rests a fractional buy placed after the close on a fractionable symbol", async () => {
    context.setNow(WEDNESDAY_20_00_NY);

    const response = await place({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "0.5",
    });

    expect(response.status).toBe(201);

    const order = orderOf(response.body);

    expect(order.status).toBe("OPEN");
    expect(order.quantity).toBe("0.500000");
    expect(order.reservedCash).toBe("102.00");
  });

  it("blocks a position-increasing order while the account is in a margin deficit", async () => {
    const savings = await prisma.account.create({
      data: { userId: owner.user.id, name: "Savings", cashBalance: "0" },
    });

    await seedPosition(savings.id, { symbol: SYMBOL, quantity: "-10", averageCost: "100" });
    context.provider.emit({ symbol: SYMBOL, price: "500.0000" });

    const increasing = await postOrder(context.app, owner.accessToken, savings.id, {
      symbol: SYMBOL,
      side: "SELL",
      type: "MARKET",
      quantity: "1",
    });

    expect(increasing.status).toBe(422);
    expect(codeOf(increasing.body)).toBe("MARGIN_DEFICIT");

    const covering = await postOrder(context.app, owner.accessToken, savings.id, {
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    expect(covering.status).toBe(201);
    expect(orderOf(covering.body).status).toBe("FILLED");
    expect(await prisma.order.count({ where: { accountId: savings.id } })).toBe(1);
  });
});
