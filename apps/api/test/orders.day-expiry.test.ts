import { orderDtoSchema, type OrderDto } from "@stockdesk/shared";
import { afterEach, describe, expect, it } from "vitest";
import { truncateAll } from "./db.js";
import { expectNoMonetaryNumbers, mainAccount, registerUser } from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import { createOrdersTestContext, postOrder, type OrdersTestContext } from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const FRIDAY_17_00_NY = new Date("2026-09-11T21:00:00.000Z");
const EARLY_CLOSE_DAY_10_00_NY = new Date("2026-11-27T15:00:00.000Z");
const SYMBOL = "TSLA";

let context: OrdersTestContext | undefined;

const DAY_LIMIT_BUY = {
  symbol: SYMBOL,
  side: "BUY",
  type: "LIMIT",
  quantity: "10",
  limitPrice: "180.0000",
  timeInForce: "DAY",
};

async function placeDayOrder(now: Date): Promise<OrderDto> {
  await truncateAll();
  context = await createOrdersTestContext({ now });
  await seedSymbols({ provider: context.simulated });

  const owner = await registerUser(context.app);
  const account = await mainAccount(context.app, owner.accessToken);
  const response = await postOrder(context.app, owner.accessToken, account.id, DAY_LIMIT_BUY);

  expect(response.status).toBe(201);
  expectNoMonetaryNumbers(response.body);

  return orderDtoSchema.parse((response.body as { order: unknown }).order) as unknown as OrderDto;
}

describe("DAY order expiry", () => {
  afterEach(async () => {
    await context?.close();
    context = undefined;
  });

  it("expires an order placed mid-session at that session close", async () => {
    const order = await placeDayOrder(WEDNESDAY_15_00_NY);

    expect(order.timeInForce).toBe("DAY");
    expect(order.expiresAt).toBe("2026-09-09T20:00:00.000Z");
  });

  it("expires an order placed after the Friday close at the Monday close", async () => {
    const order = await placeDayOrder(FRIDAY_17_00_NY);

    expect(order.expiresAt).toBe("2026-09-14T20:00:00.000Z");
  });

  it("expires an order placed on an early-close day at 13:00 New York", async () => {
    const order = await placeDayOrder(EARLY_CLOSE_DAY_10_00_NY);

    expect(order.expiresAt).toBe("2026-11-27T18:00:00.000Z");
  });
});
