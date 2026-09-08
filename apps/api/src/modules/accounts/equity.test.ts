import { describe, expect, it } from "vitest";
import { rangeBucket, rangeWindow } from "./equity.js";

const NOW = new Date("2026-09-08T18:00:00.000Z");

describe("rangeBucket", () => {
  it("truncates the intraday, monthly and yearly ranges", () => {
    expect(rangeBucket("1D")).toEqual({ kind: "trunc", unit: "minute" });
    expect(rangeBucket("1M")).toEqual({ kind: "trunc", unit: "hour" });
    expect(rangeBucket("1Y")).toEqual({ kind: "trunc", unit: "day" });
  });

  it("bins the ranges without a matching truncation unit", () => {
    expect(rangeBucket("5D")).toEqual({ kind: "bin", interval: "5 minutes" });
    expect(rangeBucket("1W")).toEqual({ kind: "bin", interval: "15 minutes" });
  });
});

describe("rangeWindow", () => {
  it("covers the current New York trading day for 1D", () => {
    const window = rangeWindow("1D", NOW);

    expect(window.from.toISOString()).toBe("2026-09-08T04:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-09T04:00:00.000Z");
  });

  it("covers the last five weekdays for 5D", () => {
    const window = rangeWindow("5D", NOW);

    expect(window.from.toISOString()).toBe("2026-09-02T04:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-09T04:00:00.000Z");
  });

  it("covers the last seven calendar days for 1W", () => {
    const window = rangeWindow("1W", NOW);

    expect(window.from.toISOString()).toBe("2026-09-01T18:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-08T18:00:00.000Z");
  });

  it("covers the last thirty calendar days for 1M", () => {
    const window = rangeWindow("1M", NOW);

    expect(window.from.toISOString()).toBe("2026-08-09T18:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-08T18:00:00.000Z");
  });

  it("covers the last 365 calendar days for 1Y", () => {
    const window = rangeWindow("1Y", NOW);

    expect(window.from.toISOString()).toBe("2025-09-08T18:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-08T18:00:00.000Z");
  });
});
