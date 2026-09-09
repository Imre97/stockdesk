import { tradesResponseDtoSchema, type TradesResponseDto } from "@stockdesk/shared";
import request, { type Response } from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import {
  authHeader,
  expectNoMonetaryNumbers,
  mainAccount,
  registerUser,
} from "./helpers.js";
import { createTestMarket, seedSymbols } from "./market-helpers.js";

const market = createTestMarket();
const app = market.app;

const SYMBOL = "TSLA";
const OTHER_SYMBOL = "AAPL";
const BASE_MS = Date.UTC(2026, 8, 9, 14, 0, 0);
const MINUTE_MS = 60_000;

interface SeededTrades {
  accountId: string;
  token: string;
  first: string;
  second: string;
  third: string;
}

function at(minutes: number): Date {
  return new Date(BASE_MS + minutes * MINUTE_MS);
}

function pageOf(response: Response): TradesResponseDto {
  expect(response.status).toBe(200);
  expectNoMonetaryNumbers(response.body);

  return tradesResponseDtoSchema.parse(response.body) as unknown as TradesResponseDto;
}

async function fetchTrades(
  token: string,
  accountId: string,
  query = "",
): Promise<Response> {
  return await request(app)
    .get(`/api/v1/accounts/${accountId}/trades${query}`)
    .set(authHeader(token));
}

async function seedTrade(
  accountId: string,
  symbol: string,
  executedAt: Date,
  price: string,
): Promise<string> {
  const order = await prisma.order.create({
    data: {
      accountId,
      symbol,
      side: "BUY",
      type: "MARKET",
      status: "FILLED",
      quantity: "2",
      reservedCash: "0",
      commission: "0",
      avgFillPrice: price,
      filledAt: executedAt,
      createdAt: executedAt,
    },
  });

  const trade = await prisma.trade.create({
    data: {
      orderId: order.id,
      accountId,
      symbol,
      side: "BUY",
      quantity: "2",
      price,
      amount: "1.00",
      commission: "0.00",
      realizedPnl: null,
      executedAt,
    },
  });

  return trade.id;
}

async function seedLedger(): Promise<SeededTrades> {
  const registered = await registerUser(app);
  const account = await mainAccount(app, registered.accessToken);

  const first = await seedTrade(account.id, SYMBOL, at(0), "250.0000");
  const second = await seedTrade(account.id, OTHER_SYMBOL, at(1), "180.0000");
  const third = await seedTrade(account.id, SYMBOL, at(2), "260.5000");

  return { accountId: account.id, token: registered.accessToken, first, second, third };
}

describe("GET /api/v1/accounts/:id/trades", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(market);
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(app).get("/api/v1/accounts/any-account/trades");

    expect(response.status).toBe(401);
  });

  it("returns an empty page for an account without trades", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const response = await fetchTrades(registered.accessToken, account.id);

    expect(response.body).toEqual({ trades: [], nextCursor: null });
  });

  it("returns the trades of the account newest first as decimal strings", async () => {
    const seeded = await seedLedger();
    const page = pageOf(await fetchTrades(seeded.token, seeded.accountId));

    expect(page.trades.map((trade) => trade.id)).toEqual([
      seeded.third,
      seeded.second,
      seeded.first,
    ]);
    expect(page.nextCursor).toBeNull();

    const newest = page.trades[0];

    expect(newest?.symbol).toBe(SYMBOL);
    expect(newest?.quantity).toBe("2.000000");
    expect(newest?.price).toBe("260.5000");
    expect(newest?.amount).toBe("1.00");
    expect(newest?.commission).toBe("0.00");
    expect(newest?.realizedPnl).toBeNull();
    expect(newest?.accountId).toBe(seeded.accountId);
  });

  it("applies the symbol filter", async () => {
    const seeded = await seedLedger();
    const page = pageOf(
      await fetchTrades(seeded.token, seeded.accountId, `?symbol=${OTHER_SYMBOL}`),
    );

    expect(page.trades.map((trade) => trade.id)).toEqual([seeded.second]);
  });

  it("walks every trade exactly once with a keyset cursor", async () => {
    const seeded = await seedLedger();
    const first = pageOf(await fetchTrades(seeded.token, seeded.accountId, "?limit=2"));

    expect(first.trades.map((trade) => trade.id)).toEqual([seeded.third, seeded.second]);
    expect(first.nextCursor).not.toBeNull();

    const second = pageOf(
      await fetchTrades(seeded.token, seeded.accountId, `?limit=2&cursor=${first.nextCursor}`),
    );

    expect(second.trades.map((trade) => trade.id)).toEqual([seeded.first]);
    expect(second.nextCursor).toBeNull();
  });

  it("returns 404 for an account of another user", async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);

    const response = await fetchTrades(stranger.accessToken, account.id);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("rejects a limit above the maximum and an invalid cursor", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);

    const tooMany = await fetchTrades(registered.accessToken, account.id, "?limit=201");

    expect(tooMany.status).toBe(422);
    expect(tooMany.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });

    const broken = await fetchTrades(registered.accessToken, account.id, "?cursor=not-a-cursor");

    expect(broken.status).toBe(422);
    expect(broken.body).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});
