import {
  orderDetailResponseDtoSchema,
  ordersResponseDtoSchema,
  type OrderDto,
  type OrdersResponseDto,
} from "@stockdesk/shared";
import type { Response } from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  createAccount,
  expectNoMonetaryNumbers,
  mainAccount,
  registerUser,
  type RegisteredUser,
} from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import { getAccountOrders, getOrder, getOrders } from "./orders-api.js";
import { createOrdersTestContext, postOrder, seedOrder, type OrdersTestContext } from "./orders-helpers.js";
import { seedOrderLadder, type SeededLadder } from "./orders-scenario.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const SYMBOL = "TSLA";
const OTHER_SYMBOL = "AAPL";
const LAST = "250.0000";
const BASE_MS = Date.UTC(2026, 8, 9, 18, 0, 0);
const MINUTE_MS = 60_000;

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

function at(minutes: number): Date {
  return new Date(BASE_MS + minutes * MINUTE_MS);
}

function pageOf(response: Response): OrdersResponseDto {
  expect(response.status).toBe(200);
  expectNoMonetaryNumbers(response.body);

  return ordersResponseDtoSchema.parse(response.body) as unknown as OrdersResponseDto;
}

async function seedLadder(target: string): Promise<SeededLadder> {
  return await seedOrderLadder(target, new Date(BASE_MS), {
    primary: SYMBOL,
    secondary: OTHER_SYMBOL,
  });
}

describe("order listing endpoints", () => {
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

  it("returns the active orders of one account newest first", async () => {
    const seeded = await seedLadder(accountId);
    const page = pageOf(await getAccountOrders(context.app, owner.accessToken, accountId));

    expect(page.orders.map((order) => order.id)).toEqual([seeded.triggered, seeded.open]);
    expect(page.orders.map((order) => order.status)).toEqual(["TRIGGERED", "OPEN"]);
    expect(page.nextCursor).toBeNull();
  });

  it("filters by the filled and the all status and by symbol", async () => {
    const seeded = await seedLadder(accountId);

    const filled = pageOf(
      await getAccountOrders(context.app, owner.accessToken, accountId, "?status=filled"),
    );

    expect(filled.orders.map((order) => order.id)).toEqual([seeded.filled]);

    const all = pageOf(
      await getAccountOrders(context.app, owner.accessToken, accountId, "?status=all"),
    );

    expect(all.orders.map((order) => order.id)).toEqual([
      seeded.expired,
      seeded.cancelled,
      seeded.filled,
      seeded.triggered,
      seeded.open,
    ]);

    const filtered = pageOf(
      await getAccountOrders(
        context.app,
        owner.accessToken,
        accountId,
        `?status=all&symbol=${OTHER_SYMBOL}`,
      ),
    );

    expect(filtered.orders.map((order) => order.id)).toEqual([seeded.expired, seeded.triggered]);
  });

  it("merges every account of the user and honours the account filter", async () => {
    const created = await createAccount(context.app, owner.accessToken, "Second");

    expect(created.status).toBe(201);

    const secondId = (created.body as { account: { id: string } }).account.id;
    const first = await seedLadder(accountId);
    const second = await seedOrder(secondId, {
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      status: "OPEN",
      quantity: "7",
      limitPrice: "150.0000",
      createdAt: at(6),
    });

    const merged = pageOf(await getOrders(context.app, owner.accessToken));

    expect(merged.orders.map((order) => order.id)).toEqual([
      second.id,
      first.triggered,
      first.open,
    ]);

    const scoped = pageOf(
      await getOrders(context.app, owner.accessToken, `?accountId=${secondId}`),
    );

    expect(scoped.orders.map((order) => order.id)).toEqual([second.id]);
  });

  it("walks every row exactly once with a keyset cursor", async () => {
    const seeded = await seedLadder(accountId);
    const seen: string[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 5; page += 1) {
      const query = cursor === null ? "?status=all&limit=2" : `?status=all&limit=2&cursor=${cursor}`;
      const body: OrdersResponseDto = pageOf(
        await getAccountOrders(context.app, owner.accessToken, accountId, query),
      );

      seen.push(...body.orders.map((order) => order.id));
      cursor = body.nextCursor;

      if (cursor === null) break;
    }

    expect(cursor).toBeNull();
    expect(seen).toEqual([
      seeded.expired,
      seeded.cancelled,
      seeded.filled,
      seeded.triggered,
      seeded.open,
    ]);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("returns a not found error for an account of another user", async () => {
    const stranger = await registerUser(context.app);

    const foreign = await getOrders(
      context.app,
      stranger.accessToken,
      `?accountId=${accountId}`,
    );

    expect(foreign.status).toBe(404);
    expect(foreign.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });

    const scoped = await getAccountOrders(context.app, stranger.accessToken, accountId);

    expect(scoped.status).toBe(404);
    expect(scoped.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("returns the children and the trades of a filled bracket entry", async () => {
    const placed = await postOrder(context.app, owner.accessToken, accountId, {
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      quantity: "10",
      limitPrice: "260.0000",
      stopLossPrice: "240.0000",
      takeProfitPrice: "280.0000",
    });

    expect(placed.status).toBe(201);

    const entry = (placed.body as { order: OrderDto }).order;

    expect(entry.status).toBe("FILLED");

    const response = await getOrder(context.app, owner.accessToken, accountId, entry.id);

    expect(response.status).toBe(200);
    expectNoMonetaryNumbers(response.body);

    const detail = orderDetailResponseDtoSchema.parse(response.body);

    expect(detail.order.id).toBe(entry.id);
    expect(detail.children.map((child) => child.role).sort()).toEqual([
      "STOP_LOSS",
      "TAKE_PROFIT",
    ]);
    expect(detail.children.every((child) => child.parentOrderId === entry.id)).toBe(true);
    expect(detail.trades).toHaveLength(1);
    expect(detail.trades[0]?.orderId).toBe(entry.id);
  });

  it("rejects an unknown order and an invalid cursor", async () => {
    const missing = await getOrder(context.app, owner.accessToken, accountId, "no-such-order");

    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ error: { code: "ORDER_NOT_FOUND" } });

    const broken = await getAccountOrders(
      context.app,
      owner.accessToken,
      accountId,
      "?cursor=not-a-cursor",
    );

    expect(broken.status).toBe(422);
    expect(broken.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    expect(await prisma.order.count({ where: { accountId } })).toBe(0);
  });
});
