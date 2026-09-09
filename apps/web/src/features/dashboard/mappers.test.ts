import { equityPointSchema, positionSchema, type PositionDto } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { positionDto } from "../../test/fixtures";
import { toEquitySeries, toPositionViewModel } from "./mappers";

function position(overrides: Partial<PositionDto> = {}): PositionDto {
  return positionDto(overrides);
}

describe("toEquitySeries", () => {
  it("maps equity points to unix second chart points", () => {
    const points = [
      equityPointSchema.parse({ at: "2026-09-08T14:30:00.000Z", equity: "100000.00" }),
      equityPointSchema.parse({ at: "2026-09-08T14:31:00.000Z", equity: "100250.50" }),
    ];

    expect(toEquitySeries(points)).toEqual([
      { time: 1788877800, value: 100000 },
      { time: 1788877860, value: 100250.5 },
    ]);
  });

  it("returns an empty series for an empty range", () => {
    expect(toEquitySeries([])).toEqual([]);
  });
});

describe("toPositionViewModel", () => {
  it("formats every column and tones the profit and loss cells", () => {
    const view = toPositionViewModel(positionSchema.parse(position()), "en-US");

    expect(view.symbol).toBe("AAPL");
    expect(view.quantity).toBe("10");
    expect(view.averageCost).toBe("$180.25");
    expect(view.lastPrice).toBe("$182.10");
    expect(view.marketValue).toBe("$1,821.00");
    expect(view.unrealizedPnl).toBe("+$18.50");
    expect(view.unrealizedPnlPct).toBe("1.03%");
    expect(view.unrealizedTone).toBe("gain");
    expect(view.dailyChange).toBe("-$4.20");
    expect(view.dailyChangePct).toBe("-0.23%");
    expect(view.dailyTone).toBe("loss");
    expect(view.short).toBe(false);
    expect(view.realizedPnl).toBe("$0.00");
  });

  it("flags a negative quantity as a short and keeps the sign on the quantity", () => {
    const view = toPositionViewModel(
      positionSchema.parse(position({ quantity: "-10.000000", realizedPnl: "-25.00" })),
      "en-US",
    );

    expect(view.short).toBe(true);
    expect(view.quantity).toBe("-10");
    expect(view.realizedPnl).toBe("-$25.00");
  });

  it("marks a flat position as neutral", () => {
    const view = toPositionViewModel(
      positionSchema.parse(position({ unrealizedPnl: "0.00", unrealizedPnlPct: "0.00" })),
      "en-US",
    );

    expect(view.unrealizedTone).toBe("neutral");
  });
});
