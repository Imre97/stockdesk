import { positionRecordSchema, quoteMessageSchema, type PositionRecordDto } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { positionRecordDto } from "../../test/fixtures";
import { toQuoteTick } from "../market/mappers";
import { toPositionEntry, toPositionRow } from "./mappers";

const LOCALE = "en-US";

function entry(overrides: Partial<PositionRecordDto> = {}) {
  return toPositionEntry(positionRecordSchema.parse(positionRecordDto(overrides)));
}

function quote(symbol: string, price: string, prevClose: string | null) {
  return toQuoteTick(
    quoteMessageSchema.parse({
      type: "quote",
      symbol,
      price,
      size: "100",
      at: "2026-09-08T14:30:01.123Z",
      prevClose,
    }),
  );
}

describe("toPositionRow", () => {
  it("values a long position from the live quote", () => {
    const row = toPositionRow(
      entry({ symbol: "AAPL", quantity: "10.000000", averageCost: "180.2500", realizedPnl: "12.34" }),
      quote("AAPL", "182.1000", "182.5200"),
      LOCALE,
    );

    expect(row.symbol).toBe("AAPL");
    expect(row.short).toBe(false);
    expect(row.quantity).toBe("10");
    expect(row.averageCost).toBe("$180.25");
    expect(row.lastPrice).toBe("$182.10");
    expect(row.marketValue).toBe("$1,821.00");
    expect(row.unrealizedPnl).toBe("+$18.50");
    expect(row.unrealizedPnlPct).toBe("1.03%");
    expect(row.unrealizedTone).toBe("gain");
    expect(row.dailyChange).toBe("-$4.20");
    expect(row.dailyChangePct).toBe("-0.23%");
    expect(row.dailyTone).toBe("loss");
    expect(row.realizedPnl).toBe("+$12.34");
  });

  it("values a short position with a signed quantity and a gain when the price falls", () => {
    const row = toPositionRow(
      entry({ symbol: "TSLA", quantity: "-10.000000", averageCost: "250.0000", realizedPnl: "0.00" }),
      quote("TSLA", "240.0000", "245.0000"),
      LOCALE,
    );

    expect(row.short).toBe(true);
    expect(row.quantity).toBe("-10");
    expect(row.marketValue).toBe("-$2,400.00");
    expect(row.unrealizedPnl).toBe("+$100.00");
    expect(row.unrealizedPnlPct).toBe("4.00%");
    expect(row.unrealizedTone).toBe("gain");
    expect(row.dailyChange).toBe("+$50.00");
    expect(row.dailyChangePct).toBe("2.04%");
    expect(row.realizedPnl).toBe("$0.00");
  });

  it("falls back to the average cost when no quote arrived yet", () => {
    const row = toPositionRow(
      entry({ symbol: "AAPL", quantity: "10.000000", averageCost: "180.2500" }),
      null,
      LOCALE,
    );

    expect(row.lastPrice).toBe("$180.25");
    expect(row.marketValue).toBe("$1,802.50");
    expect(row.unrealizedPnl).toBe("$0.00");
    expect(row.unrealizedPnlPct).toBe("0.00%");
    expect(row.unrealizedTone).toBe("neutral");
    expect(row.dailyChange).toBe("$0.00");
    expect(row.dailyChangePct).toBe("0.00%");
  });

  it("reports no daily change while the quote carries no previous close", () => {
    const row = toPositionRow(
      entry({ symbol: "AAPL", quantity: "10.000000", averageCost: "180.2500" }),
      quote("AAPL", "182.1000", null),
      LOCALE,
    );

    expect(row.unrealizedPnl).toBe("+$18.50");
    expect(row.dailyChange).toBe("$0.00");
    expect(row.dailyChangePct).toBe("0.00%");
    expect(row.dailyTone).toBe("neutral");
  });
});
