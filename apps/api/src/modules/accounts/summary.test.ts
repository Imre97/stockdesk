import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import {
  accountEquity,
  toAccountSummary,
  valuePositions,
  type MarginRates,
  type PriceLookup,
} from "./summary.js";

const RATES: MarginRates = {
  shortMarginRate: new Decimal("0.5"),
  maintenanceMarginRate: new Decimal("0.3"),
};

const account = {
  id: "acc-1",
  name: "Main",
  cashBalance: new Decimal("100000"),
  createdAt: new Date("2026-09-08T10:00:00.000Z"),
};

describe("accountEquity", () => {
  it("adds the positions value to the cash balance", () => {
    const values = accountEquity(account);

    expect(values.cash.equals("100000")).toBe(true);
    expect(values.positionsValue.isZero()).toBe(true);
    expect(values.equity.equals(values.cash.plus(values.positionsValue))).toBe(true);
  });
});

describe("toAccountSummary", () => {
  it("serializes every monetary field with two decimal places", () => {
    expect(toAccountSummary(account, { rates: RATES })).toEqual({
      id: "acc-1",
      name: "Main",
      cash: "100000.00",
      positionsValue: "0.00",
      equity: "100000.00",
      unrealizedPnl: "0.00",
      unrealizedPnlPct: "0.00",
      dailyPnl: "0.00",
      dailyPnlPct: "0.00",
      longValue: "0.00",
      shortValue: "0.00",
      shortMargin: "0.00",
      reservedCash: "0.00",
      buyingPower: "100000.00",
      marginDeficit: false,
      createdAt: "2026-09-08T10:00:00.000Z",
    });
  });

  it("computes the daily profit against the reference equity", () => {
    const summary = toAccountSummary(account, {
      referenceEquity: new Decimal("90000"),
      rates: RATES,
    });

    expect(summary.dailyPnl).toBe("10000.00");
    expect(summary.dailyPnlPct).toBe("11.11");
  });

  it("computes a negative daily profit", () => {
    const summary = toAccountSummary(account, {
      referenceEquity: new Decimal("125000"),
      rates: RATES,
    });

    expect(summary.dailyPnl).toBe("-25000.00");
    expect(summary.dailyPnlPct).toBe("-20.00");
  });

  it("falls back to zero when the reference equity is zero", () => {
    const summary = toAccountSummary(account, { referenceEquity: new Decimal("0"), rates: RATES });

    expect(summary.dailyPnl).toBe("100000.00");
    expect(summary.dailyPnlPct).toBe("0.00");
  });

  it("rounds cash to two decimal places", () => {
    const summary = toAccountSummary(
      { ...account, cashBalance: new Decimal("1.005") },
      { rates: RATES },
    );

    expect(summary.cash).toBe("1.00");
    expect(summary.equity).toBe("1.00");
  });

  it("splits the long and short value and derives the buying power", () => {
    const summary = toAccountSummary(account, {
      values: {
        longValue: new Decimal("1820"),
        shortValue: new Decimal("240"),
        positionsValue: new Decimal("1580"),
        unrealizedPnl: new Decimal("30"),
      },
      reservedCash: new Decimal("1000"),
      rates: RATES,
    });

    expect(summary.longValue).toBe("1820.00");
    expect(summary.shortValue).toBe("240.00");
    expect(summary.shortMargin).toBe("120.00");
    expect(summary.reservedCash).toBe("1000.00");
    expect(summary.positionsValue).toBe("1580.00");
    expect(summary.equity).toBe("101580.00");
    expect(summary.buyingPower).toBe("100460.00");
    expect(summary.marginDeficit).toBe(false);
  });

  it("flags a margin deficit when the equity falls below the maintenance requirement", () => {
    const summary = toAccountSummary(
      { ...account, cashBalance: new Decimal("0") },
      {
        values: {
          longValue: new Decimal("0"),
          shortValue: new Decimal("5000"),
          positionsValue: new Decimal("-5000"),
          unrealizedPnl: new Decimal("-4750"),
        },
        rates: RATES,
      },
    );

    expect(summary.equity).toBe("-5000.00");
    expect(summary.shortValue).toBe("5000.00");
    expect(summary.marginDeficit).toBe(true);
  });

  it("does not flag a long-only account whose equity turned negative", () => {
    const summary = toAccountSummary(
      { ...account, cashBalance: new Decimal("-500") },
      { rates: RATES },
    );

    expect(summary.equity).toBe("-500.00");
    expect(summary.marginDeficit).toBe(false);
  });
});

describe("valuePositions", () => {
  function countingPrices(): { lookup: PriceLookup; calls: () => number } {
    let calls = 0;

    return {
      lookup: {
        getLastPrices: async (symbols: string[]): Promise<Map<string, Decimal | null>> => {
          calls += 1;

          return new Map(
            symbols.map((symbol) => [symbol, symbol === "TSLA" ? new Decimal("251.30") : null]),
          );
        },
        getPrevClose: async (): Promise<Decimal | null> => new Decimal("248.90"),
      },
      calls: () => calls,
    };
  }

  const prices = countingPrices().lookup;

  it("looks the prices up in one call for every position", async () => {
    const counting = countingPrices();

    const values = await valuePositions(
      [
        { symbol: "TSLA", quantity: new Decimal("10"), averageCost: new Decimal("200") },
        { symbol: "AAPL", quantity: new Decimal("4"), averageCost: new Decimal("100") },
        { symbol: "MSFT", quantity: new Decimal("2"), averageCost: new Decimal("300") },
      ],
      counting.lookup,
    );

    expect(counting.calls()).toBe(1);
    expect(values.positionsValue.toString()).toBe("3513");
    expect(values.unrealizedPnl.toString()).toBe("513");
  });

  it("values a position with the price service", async () => {
    const values = await valuePositions(
      [{ symbol: "TSLA", quantity: new Decimal("10"), averageCost: new Decimal("200") }],
      prices,
    );

    expect(values.positionsValue.toString()).toBe("2513");
    expect(values.unrealizedPnl.toString()).toBe("513");
  });

  it("splits long and short value and nets them into the positions value", async () => {
    const values = await valuePositions(
      [
        { symbol: "TSLA", quantity: new Decimal("10"), averageCost: new Decimal("200") },
        { symbol: "AAPL", quantity: new Decimal("-5"), averageCost: new Decimal("100") },
      ],
      prices,
    );

    expect(values.longValue.toString()).toBe("2513");
    expect(values.shortValue.toString()).toBe("500");
    expect(values.positionsValue.toString()).toBe("2013");
  });

  it("gains on a short position when the price falls below the average cost", async () => {
    const values = await valuePositions(
      [{ symbol: "TSLA", quantity: new Decimal("-10"), averageCost: new Decimal("300") }],
      prices,
    );

    expect(values.shortValue.toString()).toBe("2513");
    expect(values.positionsValue.toString()).toBe("-2513");
    expect(values.unrealizedPnl.toString()).toBe("487");
  });

  it("carries the valued position into the account summary", async () => {
    const values = await valuePositions(
      [{ symbol: "TSLA", quantity: new Decimal("10"), averageCost: new Decimal("200") }],
      prices,
    );
    const summary = toAccountSummary(account, { values, rates: RATES });

    expect(summary.positionsValue).toBe("2513.00");
    expect(summary.equity).toBe("102513.00");
    expect(summary.unrealizedPnl).toBe("513.00");
    expect(summary.unrealizedPnlPct).toBe("25.65");
  });

  it("falls back to the cost basis when no price is known", async () => {
    const values = await valuePositions(
      [{ symbol: "AAPL", quantity: new Decimal("4"), averageCost: new Decimal("100") }],
      prices,
    );

    expect(values.positionsValue.toString()).toBe("400");
    expect(values.unrealizedPnl.isZero()).toBe(true);
  });

  it("returns zero without positions", async () => {
    const values = await valuePositions([], prices);

    expect(values.positionsValue.isZero()).toBe(true);
    expect(values.longValue.isZero()).toBe(true);
    expect(values.shortValue.isZero()).toBe(true);
    expect(values.unrealizedPnl.isZero()).toBe(true);
  });
});
