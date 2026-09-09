import { orderPreviewDtoSchema, type OrderPreviewDto } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { expectNoMonetaryNumbers, mainAccount, registerUser } from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import {
  createOrdersTestContext,
  postOrder,
  postOrderPreview,
  type OrdersTestContext,
} from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const WEDNESDAY_20_00_NY = new Date("2026-09-10T00:00:00.000Z");
const SYMBOL = "TSLA";
const LAST = "251.3400";
const SPEC_QUANTITY = "3.978674";

let context: OrdersTestContext;
let token: string;
let accountId: string;

async function openContext(now: Date): Promise<void> {
  await truncateAll();
  context = await createOrdersTestContext({ now });
  await seedSymbols({ provider: context.simulated });
  await context.ensureStreaming([SYMBOL]);
  context.provider.emit({ symbol: SYMBOL, price: LAST });

  const owner = await registerUser(context.app);
  token = owner.accessToken;
  accountId = (await mainAccount(context.app, token)).id;
}

function previewOf(body: unknown): OrderPreviewDto {
  expectNoMonetaryNumbers(body);

  return orderPreviewDtoSchema.parse(
    (body as { preview: unknown }).preview,
  ) as unknown as OrderPreviewDto;
}

async function preview(body: Record<string, unknown>): ReturnType<typeof postOrderPreview> {
  return await postOrderPreview(context.app, token, accountId, body);
}

describe("order preview while the market is open", () => {
  beforeEach(async () => {
    await openContext(WEDNESDAY_15_00_NY);
  });

  afterEach(async () => {
    await context.close();
  });

  it("reports the cost, the reservation and the buying power of a market buy", async () => {
    const response = await preview({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: SPEC_QUANTITY,
    });

    expect(response.status).toBe(200);

    const body = previewOf(response.body);

    expect(body.quantity).toBe("3.978674");
    expect(body.estimatedPrice).toBe("251.3400");
    expect(body.estimatedCost).toBe("1000.00");
    expect(body.reservedCash).toBe("1020.00");
    expect(body.commission).toBe("0.00");
    expect(body.positionEffect).toBe("open_long");
    expect(body.positionAfter).toBe("3.978674");
    expect(body.buyingPowerBefore).toBe("100000.00");
    expect(body.buyingPowerAfter).toBe("98980.00");
    expect(body.expectedExecution).toBe("immediate");
    expect(body.warnings).toEqual([]);
    expect(await prisma.order.count({ where: { accountId } })).toBe(0);
  });

  it("warns that a sell without a position opens a short", async () => {
    const response = await preview({
      symbol: SYMBOL,
      side: "SELL",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(200);

    const body = previewOf(response.body);

    expect(body.positionEffect).toBe("open_short");
    expect(body.positionAfter).toBe("-10.000000");
    expect(body.reservedCash).toBe("1281.84");
    expect(body.warnings).toEqual(["OPENS_SHORT"]);
  });

  it("warns that a marketable limit order fills at once", async () => {
    const response = await preview({
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      quantity: "10",
      limitPrice: "260.0000",
    });

    expect(response.status).toBe(200);

    const body = previewOf(response.body);

    expect(body.estimatedPrice).toBe("260.0000");
    expect(body.reservedCash).toBe("2600.00");
    expect(body.expectedExecution).toBe("immediate");
    expect(body.warnings).toEqual(["IMMEDIATE_FILL"]);
  });

  it("reports the same buying power failure as placement without persisting", async () => {
    const response = await preview({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "1000",
    });

    expect(response.status).toBe(422);
    expectNoMonetaryNumbers(response.body);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      "INSUFFICIENT_BUYING_POWER",
    );
    expect(await prisma.order.count({ where: { accountId } })).toBe(0);
  });
});

describe("order preview while the market is closed", () => {
  beforeEach(async () => {
    await openContext(WEDNESDAY_20_00_NY);
  });

  afterEach(async () => {
    await context.close();
  });

  it("reports a market order as waiting for the market to open", async () => {
    const response = await preview({
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(200);

    const body = previewOf(response.body);

    expect(body.expectedExecution).toBe("waiting_for_market_open");
    expect(body.warnings).toContain("MARKET_CLOSED");
  });

  it("rests a market order placed while the market is closed", async () => {
    const response = await postOrder(context.app, token, accountId, {
      symbol: SYMBOL,
      side: "BUY",
      type: "MARKET",
      quantity: "10",
    });

    expect(response.status).toBe(201);
    expectNoMonetaryNumbers(response.body);
    expect((response.body as { order: { status: string } }).order.status).toBe("OPEN");
  });
});
