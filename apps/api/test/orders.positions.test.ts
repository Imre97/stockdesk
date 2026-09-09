import { placeOrderResponseDtoSchema, type PlaceOrderResponseDto } from "@stockdesk/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  authHeader,
  createAccount,
  deposit,
  expectLedgerInvariant,
  expectNoMonetaryNumbers,
  firstOf,
  listAccounts,
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
  seedPosition,
  type OrdersTestContext,
} from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const SYMBOL = "TSLA";
const LAST = "250.0000";
const LAST_PRICES = new Map([[SYMBOL, LAST]]);

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

function placedOf(body: unknown): PlaceOrderResponseDto {
  expectNoMonetaryNumbers(body);

  return placeOrderResponseDtoSchema.parse(body) as unknown as PlaceOrderResponseDto;
}

async function placeOn(account: string, body: Record<string, unknown>): Promise<PlaceOrderResponseDto> {
  const response = await postOrder(context.app, owner.accessToken, account, body);

  expect(response.status).toBe(201);

  return placedOf(response.body);
}

async function place(body: Record<string, unknown>): Promise<PlaceOrderResponseDto> {
  return await placeOn(accountId, body);
}

async function tick(price: string): Promise<void> {
  context.provider.emit({ symbol: SYMBOL, price });
  await context.engine.flush();
}

async function summaryOf(account: string): Promise<AccountSummaryBody> {
  return firstOf(
    (await listAccounts(context.app, owner.accessToken)).filter((entry) => entry.id === account),
    "account summary",
  );
}

async function openPositions(): Promise<unknown[]> {
  const response = await request(context.app)
    .get(`/api/v1/accounts/${accountId}/positions`)
    .set(authHeader(owner.accessToken));

  expect(response.status).toBe(200);

  return (response.body as { positions: unknown[] }).positions;
}

describe("positions and realized profit", () => {
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

  it("opens a short from a market sell and charges the short margin", async () => {
    const placed = await place({ symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "10" });

    expect(placed.order.status).toBe("FILLED");
    expect(placed.order.reservedCash).toBe("0.00");
    expect(placed.position?.quantity).toBe("-10.000000");
    expect(placed.position?.averageCost).toBe("250.0000");
    expect(placed.account.cash).toBe("102500.00");
    expect(placed.account.shortValue).toBe("2500.00");
    expect(placed.account.shortMargin).toBe("1250.00");
    expect(placed.account.buyingPower).toBe("98750.00");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId, LAST_PRICES);
  });

  it("keeps the average cost and accrues realized profit when part of a long is sold", async () => {
    await place({ symbol: SYMBOL, side: "BUY", type: "MARKET", quantity: "10" });
    await tick("260.0000");

    const placed = await place({ symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "4" });

    expect(placed.trade?.realizedPnl).toBe("40.00");
    expect(placed.position?.quantity).toBe("6.000000");
    expect(placed.position?.averageCost).toBe("250.0000");
    expect(placed.position?.realizedPnl).toBe("40.00");

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId, LAST_PRICES);
  });

  it("closes the position and hides it once the whole long is sold", async () => {
    await place({ symbol: SYMBOL, side: "BUY", type: "MARKET", quantity: "10" });
    await tick("260.0000");

    const placed = await place({ symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "10" });

    expect(placed.position?.quantity).toBe("0.000000");
    expect(placed.position?.closedAt).not.toBeNull();
    expect(placed.position?.realizedPnl).toBe("100.00");
    expect(await openPositions()).toEqual([]);

    await expectLedgerInvariant(accountId);
  });

  it("realizes the gain of a covered short", async () => {
    await place({ symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "10" });
    await tick("240.0000");

    const placed = await place({ symbol: SYMBOL, side: "BUY", type: "MARKET", quantity: "10" });

    expect(placed.trade?.realizedPnl).toBe("100.00");
    expect(placed.position?.quantity).toBe("0.000000");
    expect(await openPositions()).toEqual([]);

    await expectLedgerInvariant(accountId);
  });

  it("books a crossing sell as one trade and flips the position at the fill price", async () => {
    await place({ symbol: SYMBOL, side: "BUY", type: "MARKET", quantity: "10" });
    await tick("240.0000");

    const placed = await place({ symbol: SYMBOL, side: "SELL", type: "MARKET", quantity: "15" });

    expect(placed.trade?.quantity).toBe("15.000000");
    expect(placed.trade?.realizedPnl).toBe("-100.00");
    expect(placed.position?.quantity).toBe("-5.000000");
    expect(placed.position?.averageCost).toBe("240.0000");
    expect(await prisma.trade.count({ where: { accountId } })).toBe(2);

    await expectLedgerInvariant(accountId);
    await expectReservationInvariant(accountId, new Map([[SYMBOL, "240.0000"]]));
  });

  it("flags a margin deficit after an adverse move and still accepts a covering buy", async () => {
    expect((await createAccount(context.app, owner.accessToken, "Savings")).status).toBe(201);

    const savings = firstOf(
      (await listAccounts(context.app, owner.accessToken)).filter(
        (entry) => entry.name === "Savings",
      ),
      "savings account",
    ).id;

    expect((await deposit(context.app, owner.accessToken, savings, "3000.00")).status).toBe(201);
    await seedPosition(savings, { symbol: SYMBOL, quantity: "-10", averageCost: "200" });

    await tick("200.0000");
    expect((await summaryOf(savings)).marginDeficit).toBe(false);

    await tick("250.0000");
    expect((await summaryOf(savings)).marginDeficit).toBe(true);

    const increasing = await postOrder(context.app, owner.accessToken, savings, {
      symbol: SYMBOL,
      side: "SELL",
      type: "MARKET",
      quantity: "1",
    });

    expect(increasing.status).toBe(422);
    expect((increasing.body as { error: { code: string } }).error.code).toBe("MARGIN_DEFICIT");

    const covering = await placeOn(savings, {
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    expect(covering.order.status).toBe("FILLED");
    expect(covering.position?.quantity).toBe("0.000000");
    expect(covering.account.cash).toBe("500.00");

    await expectLedgerInvariant(savings);
    await expectReservationInvariant(savings, new Map([[SYMBOL, "250.0000"]]));
  });
});
