import type { BarDto, Timeframe } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { acquireBars } from "./bars-consumers";
import { toChartBar } from "./mappers";
import { barsKey, useMarketStore } from "./store";

const BAR: BarDto = {
  time: "2026-09-08T14:30:00.000Z",
  open: "251.10",
  high: "251.40",
  low: "251.05",
  close: "251.34",
  volume: "1200",
};

const SERIES = barsKey("TSLA", "1m");

let held: (() => void)[] = [];

function acquire(symbol: string, timeframe: Timeframe): () => void {
  const release = acquireBars(symbol, timeframe);

  held.push(release);

  return release;
}

function storeSeries(symbol: string, timeframe: Timeframe) {
  useMarketStore.getState().setBars(symbol, timeframe, [toChartBar(BAR)]);
}

function seriesOf(symbol: string, timeframe: Timeframe) {
  return useMarketStore.getState().bars[barsKey(symbol, timeframe)];
}

beforeEach(() => {
  held = [];
  useMarketStore.getState().reset();
});

afterEach(() => {
  held.forEach((release) => release());
});

describe("acquireBars", () => {
  it("keeps the series while a second consumer still holds it", () => {
    const releaseFirst = acquire("TSLA", "1m");
    acquire("TSLA", "1m");
    storeSeries("TSLA", "1m");

    releaseFirst();

    expect(useMarketStore.getState().bars[SERIES]).toHaveLength(1);
  });

  it("clears the series when the last consumer releases it", () => {
    const releaseFirst = acquire("TSLA", "1m");
    const releaseSecond = acquire("TSLA", "1m");
    storeSeries("TSLA", "1m");

    releaseFirst();
    releaseSecond();

    expect(useMarketStore.getState().bars[SERIES]).toBeUndefined();
  });

  it("clears only the released series and leaves another timeframe alone", () => {
    const release = acquire("TSLA", "1m");
    acquire("TSLA", "5m");
    storeSeries("TSLA", "1m");
    storeSeries("TSLA", "5m");

    release();

    expect(seriesOf("TSLA", "1m")).toBeUndefined();
    expect(seriesOf("TSLA", "5m")).toHaveLength(1);
  });

  it("ignores a release that runs twice for one acquisition", () => {
    const release = acquire("TSLA", "1m");
    acquire("TSLA", "1m");
    storeSeries("TSLA", "1m");

    release();
    release();

    expect(useMarketStore.getState().bars[SERIES]).toHaveLength(1);
  });
});
