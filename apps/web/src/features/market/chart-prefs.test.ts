import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CHART_PREFS_STORAGE_KEY,
  DEFAULT_CHART_PREFS,
  readChartPrefs,
  writeChartPrefs,
} from "./chart-prefs";

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("readChartPrefs", () => {
  it("falls back to the daily candle defaults when nothing was stored", () => {
    expect(readChartPrefs()).toEqual({ interval: "1D", chartType: "candle" });
    expect(DEFAULT_CHART_PREFS).toEqual({ interval: "1D", chartType: "candle" });
  });

  it("falls back to the defaults for a corrupt value", () => {
    window.localStorage.setItem(CHART_PREFS_STORAGE_KEY, "{not json");

    expect(readChartPrefs()).toEqual(DEFAULT_CHART_PREFS);
  });

  it("keeps the valid half of a partially unknown value", () => {
    window.localStorage.setItem(
      CHART_PREFS_STORAGE_KEY,
      JSON.stringify({ interval: "3y", chartType: "line" }),
    );

    expect(readChartPrefs()).toEqual({ interval: "1D", chartType: "line" });
  });

  it("returns the stored preference", () => {
    window.localStorage.setItem(
      CHART_PREFS_STORAGE_KEY,
      JSON.stringify({ interval: "5m", chartType: "line" }),
    );

    expect(readChartPrefs()).toEqual({ interval: "5m", chartType: "line" });
  });

  it("survives a localStorage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readChartPrefs()).toEqual(DEFAULT_CHART_PREFS);
  });
});

describe("writeChartPrefs", () => {
  it("stores the preference so the next read returns it", () => {
    writeChartPrefs({ interval: "1h", chartType: "line" });

    expect(readChartPrefs()).toEqual({ interval: "1h", chartType: "line" });
  });

  it("survives a localStorage that throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => writeChartPrefs({ interval: "1h", chartType: "line" })).not.toThrow();
  });
});
