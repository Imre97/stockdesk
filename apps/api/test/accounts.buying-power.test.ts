import { accountSummaryMessageSchema } from "@stockdesk/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { truncateAll } from "./db.js";
import {
  authHeader,
  createAccount,
  deposit,
  expectNoMonetaryNumbers,
  firstOf,
  registerUser,
  type AccountSummaryBody,
} from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import {
  createOrdersTestContext,
  expectReservationInvariant,
  seedOrder,
  seedPosition,
  type OrdersTestContext,
} from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const MINUTE_MS = 60_000;

let context: OrdersTestContext;

async function summaries(token: string): Promise<AccountSummaryBody[]> {
  const response = await request(context.app).get("/api/v1/accounts").set(authHeader(token));

  expect(response.status).toBe(200);
  expectNoMonetaryNumbers(response.body);

  return (response.body as { accounts: AccountSummaryBody[] }).accounts;
}

function named(accounts: AccountSummaryBody[], name: string): AccountSummaryBody {
  return firstOf(
    accounts.filter((account) => account.name === name),
    `${name} account`,
  );
}

describe("account summary buying power", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
    await seedSymbols({ provider: context.simulated });
  });

  afterEach(async () => {
    await context.close();
  });

  it("reports the long and short exposure, the reservation and the buying power", async () => {
    const registered = await registerUser(context.app);
    const account = named(await summaries(registered.accessToken), "Main");

    await seedPosition(account.id, { symbol: "TSLA", quantity: "10", averageCost: "180" });
    await seedPosition(account.id, { symbol: "AAPL", quantity: "-5", averageCost: "50" });
    await seedOrder(account.id, {
      symbol: "TSLA",
      side: "BUY",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "100",
      reservedCash: "1000.00",
    });

    await context.ensureStreaming(["TSLA", "AAPL"]);
    context.provider.emit({ symbol: "TSLA", price: "182" });
    context.provider.emit({ symbol: "AAPL", price: "48" });

    const summary = named(await summaries(registered.accessToken), "Main");

    expect(summary.cash).toBe("100000.00");
    expect(summary.longValue).toBe("1820.00");
    expect(summary.shortValue).toBe("240.00");
    expect(summary.shortMargin).toBe("120.00");
    expect(summary.reservedCash).toBe("1000.00");
    expect(summary.positionsValue).toBe("1580.00");
    expect(summary.equity).toBe("101580.00");
    expect(summary.buyingPower).toBe("100460.00");
    expect(summary.marginDeficit).toBe(false);
    await expectReservationInvariant(account.id);
  });

  it("flags a margin deficit when the short value overwhelms the equity", async () => {
    const registered = await registerUser(context.app);
    expect((await createAccount(context.app, registered.accessToken, "Savings")).status).toBe(201);
    const savings = named(await summaries(registered.accessToken), "Savings");

    await seedPosition(savings.id, { symbol: "AAPL", quantity: "-5", averageCost: "50" });

    await context.ensureStreaming(["AAPL"]);
    context.provider.emit({ symbol: "AAPL", price: "1000" });

    const summary = named(await summaries(registered.accessToken), "Savings");

    expect(summary.cash).toBe("0.00");
    expect(summary.shortValue).toBe("5000.00");
    expect(summary.equity).toBe("-5000.00");
    expect(summary.marginDeficit).toBe(true);
  });

  it("carries the same fields in the account_summary broadcast", async () => {
    const registered = await registerUser(context.app);
    const account = named(await summaries(registered.accessToken), "Main");

    await seedPosition(account.id, { symbol: "TSLA", quantity: "10", averageCost: "180" });
    await seedPosition(account.id, { symbol: "AAPL", quantity: "-5", averageCost: "50" });
    await seedOrder(account.id, {
      symbol: "TSLA",
      side: "BUY",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "100",
      reservedCash: "1000.00",
    });

    await context.ensureStreaming(["TSLA", "AAPL"]);
    context.provider.emit({ symbol: "TSLA", price: "182" });
    context.provider.emit({ symbol: "AAPL", price: "48" });

    context.broadcasts.length = 0;
    expect((await deposit(context.app, registered.accessToken, account.id, "0.01")).status).toBe(201);

    const record = firstOf(
      context.broadcasts.filter((entry) => entry.message.type === "account_summary"),
      "account_summary broadcast",
    );
    const parsed = accountSummaryMessageSchema.parse(record.message);
    const broadcast = firstOf(
      parsed.accounts.filter((entry) => entry.name === "Main"),
      "Main summary",
    );

    expect(record.userId).toBe(registered.user.id);
    expect(broadcast.longValue).toBe("1820.00");
    expect(broadcast.shortValue).toBe("240.00");
    expect(broadcast.shortMargin).toBe("120.00");
    expect(broadcast.reservedCash).toBe("1000.00");
    expect(broadcast.positionsValue).toBe("1580.00");
    expect(broadcast.equity).toBe("101580.01");
    expect(broadcast.buyingPower).toBe("100460.01");
    expect(broadcast.marginDeficit).toBe(false);
  });

  it("writes the real positions value into the equity snapshot", async () => {
    const registered = await registerUser(context.app);
    const account = named(await summaries(registered.accessToken), "Main");

    await seedPosition(account.id, { symbol: "TSLA", quantity: "10", averageCost: "180" });

    await context.ensureStreaming(["TSLA"]);
    context.provider.emit({ symbol: "TSLA", price: "182" });
    context.setNow(new Date(WEDNESDAY_15_00_NY.getTime() + MINUTE_MS));

    expect((await deposit(context.app, registered.accessToken, account.id, "0.01")).status).toBe(201);

    const response = await request(context.app)
      .get(`/api/v1/accounts/${account.id}/equity?range=1D`)
      .set(authHeader(registered.accessToken));

    expect(response.status).toBe(200);

    const points = (response.body as { points: { equity: string }[] }).points;

    expect(points.map((point) => point.equity)).toContain("101820.01");
  });
});
