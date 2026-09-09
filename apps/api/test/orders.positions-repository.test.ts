import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import {
  listOpenPositions,
  listOpenPositionsByAccounts,
  sumReservedCashByAccounts,
} from "../src/modules/orders/positions-repository.js";
import { truncateAll } from "./db.js";
import { createAccount, firstOf, listAccounts, registerUser } from "./helpers.js";
import { expectReservationInvariant, seedOrder, seedPosition } from "./orders-helpers.js";

const app = createApp({ rateLimit: { enabled: false } });

async function twoAccounts(): Promise<{ main: string; savings: string }> {
  const registered = await registerUser(app);
  expect((await createAccount(app, registered.accessToken, "Savings")).status).toBe(201);

  const accounts = await listAccounts(app, registered.accessToken);

  return {
    main: firstOf(accounts, "account").id,
    savings: firstOf(
      accounts.filter((account) => account.name === "Savings"),
      "savings account",
    ).id,
  };
}

describe("positions repository", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("lists the open positions of one account with Decimal values", async () => {
    const { main } = await twoAccounts();

    await seedPosition(main, { symbol: "TSLA", quantity: "10", averageCost: "180.5" });
    await seedPosition(main, { symbol: "AAPL", quantity: "-5", averageCost: "50", realizedPnl: "12.34" });

    const rows = await listOpenPositions(main);

    expect(rows.map((row) => row.symbol)).toEqual(["AAPL", "TSLA"]);

    const short = firstOf(rows, "position");
    expect(short.quantity.toString()).toBe("-5");
    expect(short.averageCost.toString()).toBe("50");
    expect(short.realizedPnl.toString()).toBe("12.34");
  });

  it("skips closed and zero quantity positions", async () => {
    const { main } = await twoAccounts();

    await seedPosition(main, { symbol: "TSLA", quantity: "10", averageCost: "180" });
    await seedPosition(main, {
      symbol: "AAPL",
      quantity: "4",
      averageCost: "100",
      closedAt: new Date("2026-09-09T10:00:00.000Z"),
    });
    await seedPosition(main, { symbol: "MSFT", quantity: "0", averageCost: "300" });

    expect((await listOpenPositions(main)).map((row) => row.symbol)).toEqual(["TSLA"]);
  });

  it("groups the open positions of several accounts", async () => {
    const { main, savings } = await twoAccounts();

    await seedPosition(main, { symbol: "TSLA", quantity: "10", averageCost: "180" });
    await seedPosition(savings, { symbol: "AAPL", quantity: "-3", averageCost: "50" });
    await seedPosition(savings, { symbol: "MSFT", quantity: "0", averageCost: "300" });

    const grouped = await listOpenPositionsByAccounts([main, savings]);

    expect(grouped.get(main)?.map((row) => row.symbol)).toEqual(["TSLA"]);
    expect(grouped.get(savings)?.map((row) => row.symbol)).toEqual(["AAPL"]);
  });

  it("returns an empty map for no accounts", async () => {
    expect((await listOpenPositionsByAccounts([])).size).toBe(0);
    expect((await sumReservedCashByAccounts([])).size).toBe(0);
  });

  it("sums the reserved cash of resting orders only", async () => {
    const { main, savings } = await twoAccounts();

    await seedOrder(main, {
      symbol: "TSLA",
      side: "BUY",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "180",
      reservedCash: "1800.00",
    });
    await seedOrder(main, {
      symbol: "AAPL",
      side: "BUY",
      type: "STOP",
      status: "TRIGGERED",
      quantity: "2",
      stopPrice: "100",
      reservedCash: "200.00",
    });
    await seedOrder(main, {
      symbol: "MSFT",
      side: "BUY",
      type: "LIMIT",
      status: "FILLED",
      quantity: "1",
      limitPrice: "300",
      reservedCash: "300.00",
    });
    await seedOrder(main, {
      symbol: "MSFT",
      side: "BUY",
      type: "LIMIT",
      status: "CANCELLED",
      quantity: "1",
      limitPrice: "300",
      reservedCash: "300.00",
    });

    const sums = await sumReservedCashByAccounts([main, savings]);

    expect(sums.get(main)?.toString()).toBe("2000");
    expect(sums.get(savings)?.toString()).toBe("0");
    await expectReservationInvariant(main);
  });

  it("recomputes the short margin reservation of a resting sell", async () => {
    const { main } = await twoAccounts();

    await seedOrder(main, {
      symbol: "TSLA",
      side: "SELL",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "200",
      reservedCash: "1000.00",
    });

    expect((await sumReservedCashByAccounts([main])).get(main)?.toString()).toBe("1000");
    await expectReservationInvariant(main);
  });

  it("recomputes a second closing sell against the position netted by the first", async () => {
    const { main } = await twoAccounts();

    await seedPosition(main, { symbol: "TSLA", quantity: "10", averageCost: "150" });
    await seedOrder(main, {
      symbol: "TSLA",
      side: "SELL",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "210",
      reservedCash: "0",
      createdAt: new Date("2026-09-09T18:00:00.000Z"),
    });
    await seedOrder(main, {
      symbol: "TSLA",
      side: "SELL",
      type: "MARKET",
      status: "OPEN",
      quantity: "10",
      reservedCash: "1020.00",
      createdAt: new Date("2026-09-09T18:00:01.000Z"),
    });

    await expectReservationInvariant(main, new Map([["TSLA", "200.0000"]]));
  });
});
