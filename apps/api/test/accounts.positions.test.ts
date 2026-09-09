import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./db.js";
import {
  authHeader,
  expectNoMonetaryNumbers,
  mainAccount,
  registerUser,
  type AccountSummaryBody,
} from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import { createOrdersTestContext, seedPosition, type OrdersTestContext } from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");

interface PositionBody {
  symbol: string;
  quantity: string;
  averageCost: string;
  lastPrice: string;
  marketValue: string;
  unrealizedPnl: string;
  unrealizedPnlPct: string;
  dailyChange: string;
  dailyChangePct: string;
  realizedPnl: string;
}

let context: OrdersTestContext;

async function positionsOf(token: string, accountId: string): Promise<PositionBody[]> {
  const response = await request(context.app)
    .get(`/api/v1/accounts/${accountId}/positions`)
    .set(authHeader(token));

  expect(response.status).toBe(200);
  expectNoMonetaryNumbers(response.body);

  return (response.body as { positions: PositionBody[] }).positions;
}

describe("GET /api/v1/accounts/:id/positions", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
    await seedSymbols({ provider: context.simulated });
  });

  afterEach(async () => {
    await context.close();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await request(context.app).get("/api/v1/accounts/any/positions");

    expect(response.status).toBe(401);
  });

  it("returns an empty list for an account without positions", async () => {
    const registered = await registerUser(context.app);
    const account = await mainAccount(context.app, registered.accessToken);

    const response = await request(context.app)
      .get(`/api/v1/accounts/${account.id}/positions`)
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ positions: [] });
  });

  it("values a long and a short position from the streamed prices", async () => {
    const registered = await registerUser(context.app);
    const account: AccountSummaryBody = await mainAccount(context.app, registered.accessToken);

    await seedPosition(account.id, { symbol: "TSLA", quantity: "10", averageCost: "180" });
    await seedPosition(account.id, { symbol: "AAPL", quantity: "-5", averageCost: "50" });

    await context.ensureStreaming(["TSLA", "AAPL"]);
    context.provider.emit({ symbol: "TSLA", price: "182" });
    context.provider.emit({ symbol: "AAPL", price: "48" });

    const positions = await positionsOf(registered.accessToken, account.id);

    expect(positions).toEqual([
      {
        symbol: "AAPL",
        quantity: "-5.000000",
        averageCost: "50.0000",
        lastPrice: "48.0000",
        marketValue: "-240.00",
        unrealizedPnl: "10.00",
        unrealizedPnlPct: "4.00",
        dailyChange: "0.00",
        dailyChangePct: "0.00",
        realizedPnl: "0.00",
      },
      {
        symbol: "TSLA",
        quantity: "10.000000",
        averageCost: "180.0000",
        lastPrice: "182.0000",
        marketValue: "1820.00",
        unrealizedPnl: "20.00",
        unrealizedPnlPct: "1.11",
        dailyChange: "0.00",
        dailyChangePct: "0.00",
        realizedPnl: "0.00",
      },
    ]);
  });

  it("hides closed and zero quantity positions", async () => {
    const registered = await registerUser(context.app);
    const account = await mainAccount(context.app, registered.accessToken);

    await seedPosition(account.id, { symbol: "TSLA", quantity: "10", averageCost: "180" });
    await seedPosition(account.id, {
      symbol: "AAPL",
      quantity: "4",
      averageCost: "100",
      closedAt: WEDNESDAY_15_00_NY,
    });
    await seedPosition(account.id, { symbol: "MSFT", quantity: "0", averageCost: "300" });

    const positions = await positionsOf(registered.accessToken, account.id);

    expect(positions.map((position) => position.symbol)).toEqual(["TSLA"]);
  });

  it("reports the realized profit stored on the position", async () => {
    const registered = await registerUser(context.app);
    const account = await mainAccount(context.app, registered.accessToken);

    await seedPosition(account.id, {
      symbol: "TSLA",
      quantity: "4",
      averageCost: "180",
      realizedPnl: "123.45",
    });

    const positions = await positionsOf(registered.accessToken, account.id);

    expect(positions.map((position) => position.realizedPnl)).toEqual(["123.45"]);
  });

  it("returns 404 for an unknown account", async () => {
    const registered = await registerUser(context.app);

    const response = await request(context.app)
      .get("/api/v1/accounts/cl-unknown-account/positions")
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });

  it("returns 404 for an account of another user", async () => {
    const owner = await registerUser(context.app);
    const intruder = await registerUser(context.app);
    const account = await mainAccount(context.app, owner.accessToken);

    const response = await request(context.app)
      .get(`/api/v1/accounts/${account.id}/positions`)
      .set(authHeader(intruder.accessToken));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: "ACCOUNT_NOT_FOUND" } });
  });
});
