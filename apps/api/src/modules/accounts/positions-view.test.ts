import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import type { PositionRow } from "../orders/positions-repository.js";
import { toPositionViews } from "./positions-view.js";
import type { PriceLookup } from "./summary.js";

const AT = new Date("2026-09-09T19:00:00.000Z");

function row(overrides: Partial<PositionRow> & Pick<PositionRow, "symbol">): PositionRow {
  return {
    id: `position-${overrides.symbol}`,
    accountId: "acc-1",
    quantity: new Decimal("10"),
    averageCost: new Decimal("180"),
    realizedPnl: new Decimal("0"),
    openedAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

function lookup(last: Record<string, string | null>, prevClose: Record<string, string>): PriceLookup {
  return {
    getLastPrices: async (symbols: string[]): Promise<Map<string, Decimal | null>> =>
      new Map(
        symbols.map((symbol) => {
          const value = last[symbol];

          return [symbol, value === undefined || value === null ? null : new Decimal(value)];
        }),
      ),
    getPrevClose: async (symbol: string): Promise<Decimal | null> => {
      const value = prevClose[symbol];

      return value === undefined ? null : new Decimal(value);
    },
  };
}

describe("toPositionViews", () => {
  it("values a long position and serializes every field as a string", async () => {
    const views = await toPositionViews(
      [row({ symbol: "TSLA", realizedPnl: new Decimal("12.34") })],
      lookup({ TSLA: "182" }, { TSLA: "181" }),
      AT,
    );

    expect(views).toEqual([
      {
        symbol: "TSLA",
        quantity: "10.000000",
        averageCost: "180.0000",
        lastPrice: "182.0000",
        marketValue: "1820.00",
        unrealizedPnl: "20.00",
        unrealizedPnlPct: "1.11",
        dailyChange: "10.00",
        dailyChangePct: "0.55",
        realizedPnl: "12.34",
      },
    ]);
  });

  it("values a short position with a signed market value and a gain when the price falls", async () => {
    const views = await toPositionViews(
      [row({ symbol: "AAPL", quantity: new Decimal("-5"), averageCost: new Decimal("50") })],
      lookup({ AAPL: "48" }, { AAPL: "49" }),
      AT,
    );

    expect(views).toEqual([
      {
        symbol: "AAPL",
        quantity: "-5.000000",
        averageCost: "50.0000",
        lastPrice: "48.0000",
        marketValue: "-240.00",
        unrealizedPnl: "10.00",
        unrealizedPnlPct: "4.00",
        dailyChange: "5.00",
        dailyChangePct: "2.04",
        realizedPnl: "0.00",
      },
    ]);
  });

  it("falls back to the average cost when no price is known", async () => {
    const views = await toPositionViews([row({ symbol: "MSFT" })], lookup({}, {}), AT);
    const [view] = views;

    expect(view?.lastPrice).toBe("180.0000");
    expect(view?.unrealizedPnl).toBe("0.00");
    expect(view?.unrealizedPnlPct).toBe("0.00");
  });

  it("reports a zero daily change without a previous close", async () => {
    const views = await toPositionViews([row({ symbol: "TSLA" })], lookup({ TSLA: "182" }, {}), AT);
    const [view] = views;

    expect(view?.dailyChange).toBe("0.00");
    expect(view?.dailyChangePct).toBe("0.00");
  });

  it("reports a zero percentage on a zero cost basis", async () => {
    const views = await toPositionViews(
      [row({ symbol: "TSLA", averageCost: new Decimal("0") })],
      lookup({ TSLA: "182" }, { TSLA: "0" }),
      AT,
    );
    const [view] = views;

    expect(view?.unrealizedPnlPct).toBe("0.00");
    expect(view?.dailyChangePct).toBe("0.00");
  });

  it("keeps a fractional quantity at six places", async () => {
    const views = await toPositionViews(
      [row({ symbol: "TSLA", quantity: new Decimal("0.5") })],
      lookup({ TSLA: "182" }, {}),
      AT,
    );
    const [view] = views;

    expect(view?.quantity).toBe("0.500000");
    expect(view?.marketValue).toBe("91.00");
  });

  it("returns an empty list without positions", async () => {
    expect(await toPositionViews([], lookup({}, {}), AT)).toEqual([]);
  });

  it("prices without a lookup from the average cost only", async () => {
    const views = await toPositionViews([row({ symbol: "TSLA" })], undefined, AT);
    const [view] = views;

    expect(view?.lastPrice).toBe("180.0000");
    expect(view?.marketValue).toBe("1800.00");
    expect(view?.dailyChange).toBe("0.00");
  });
});
