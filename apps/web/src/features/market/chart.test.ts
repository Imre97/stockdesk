import { Decimal } from "@stockdesk/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rangeHandlers: [] as ((range: { from: number; to: number } | null) => void)[],
  charts: [] as unknown[],
}));

const lightweightCharts = vi.hoisted(() => {
  function makeSeries() {
    return { setData: vi.fn(), update: vi.fn(), applyOptions: vi.fn() };
  }

  return {
    CandlestickSeries: { seriesType: "Candlestick" },
    LineSeries: { seriesType: "Line" },
    HistogramSeries: { seriesType: "Histogram" },
    ColorType: { Solid: "solid" },
    createChart: vi.fn(() => {
      const chart = {
        definitions: [] as unknown[],
        series: [] as ReturnType<typeof makeSeries>[],
        addSeries: vi.fn((definition: unknown) => {
          const series = makeSeries();
          chart.definitions.push(definition);
          chart.series.push(series);
          return series;
        }),
        removeSeries: vi.fn(),
        applyOptions: vi.fn(),
        priceScale: vi.fn(() => ({ applyOptions: vi.fn() })),
        timeScale: vi.fn(() => ({
          subscribeVisibleLogicalRangeChange: vi.fn((handler: (range: unknown) => void) => {
            state.rangeHandlers.push(handler as (range: { from: number; to: number } | null) => void);
          }),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        })),
        remove: vi.fn(),
      };

      state.charts.push(chart);

      return chart;
    }),
  };
});

vi.mock("lightweight-charts", () => lightweightCharts);

import { readChartColors } from "../dashboard/chart-theme";
import { createPriceChart } from "./chart";
import type { ChartBar } from "./mappers";

interface ChartStub {
  definitions: unknown[];
  series: { setData: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }[];
  removeSeries: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

function bar(time: string, close: string): ChartBar {
  return {
    time: new Date(time),
    open: new Decimal("100"),
    high: new Decimal("110"),
    low: new Decimal("90"),
    close: new Decimal(close),
    volume: new Decimal("1000"),
    isFinal: false,
  };
}

function makeChart(type: "candle" | "line" = "candle") {
  const container = document.createElement("div");

  return createPriceChart(container, { type, colors: readChartColors(), width: 600, height: 300 });
}

function stub(): ChartStub {
  const chart = state.charts[state.charts.length - 1] as ChartStub | undefined;

  if (chart === undefined) throw new Error("no chart was created");

  return chart;
}

function fireRange(from: number): void {
  for (const handler of state.rangeHandlers) handler({ from, to: from + 100 });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.rangeHandlers.length = 0;
  state.charts.length = 0;
});

describe("createPriceChart", () => {
  it("draws the bars on the price and the volume series", () => {
    const chart = makeChart();

    chart.setBars([bar("2026-09-08T14:30:00.000Z", "105")]);

    expect(stub().series[0]?.setData).toHaveBeenCalledWith([
      { time: 1788877800, open: 100, high: 110, low: 90, close: 105 },
    ]);
    expect(stub().series[1]?.setData).toHaveBeenCalledTimes(1);
  });

  it("swaps the series when the chart type changes and redraws the bars", () => {
    const chart = makeChart();

    chart.setBars([bar("2026-09-08T14:30:00.000Z", "105")]);
    chart.setType("line");

    expect(stub().removeSeries).toHaveBeenCalledTimes(1);
    expect(stub().definitions).toContain(lightweightCharts.LineSeries);
    expect(stub().series[2]?.setData).toHaveBeenCalledWith([{ time: 1788877800, value: 105 }]);
  });

  it("updates the last bar in place", () => {
    const chart = makeChart();

    chart.setBars([bar("2026-09-08T14:30:00.000Z", "105")]);
    chart.updateLastBar(bar("2026-09-08T14:30:00.000Z", "108"));

    expect(stub().series[0]?.update).toHaveBeenCalledWith({
      time: 1788877800,
      open: 100,
      high: 110,
      low: 90,
      close: 108,
    });
  });

  it("merges a quote into the close, high and low of the last bar", () => {
    const chart = makeChart();

    chart.setBars([bar("2026-09-08T14:30:00.000Z", "105")]);
    chart.applyQuote(new Decimal("115"), new Date("2026-09-08T14:30:30.000Z"));

    expect(stub().series[0]?.update).toHaveBeenCalledWith({
      time: 1788877800,
      open: 100,
      high: 115,
      low: 90,
      close: 115,
    });
  });

  it("ignores a quote older than the last bar", () => {
    const chart = makeChart();

    chart.setBars([bar("2026-09-08T14:30:00.000Z", "105")]);
    chart.applyQuote(new Decimal("115"), new Date("2026-09-08T14:29:00.000Z"));

    expect(stub().series[0]?.update).not.toHaveBeenCalled();
  });

  it("asks for older bars once until new bars arrive", () => {
    const chart = makeChart();
    const loadOlder = vi.fn();

    chart.onVisibleRangeReachedStart(loadOlder);
    chart.setBars([bar("2026-09-08T14:30:00.000Z", "105")]);

    fireRange(2);
    fireRange(1);

    expect(loadOlder).toHaveBeenCalledTimes(1);

    chart.setBars([bar("2026-09-08T14:29:00.000Z", "104"), bar("2026-09-08T14:30:00.000Z", "105")]);
    fireRange(1);

    expect(loadOlder).toHaveBeenCalledTimes(2);
  });

  it("does not ask for older bars away from the left edge", () => {
    const chart = makeChart();
    const loadOlder = vi.fn();

    chart.onVisibleRangeReachedStart(loadOlder);
    chart.setBars([bar("2026-09-08T14:30:00.000Z", "105")]);

    fireRange(40);

    expect(loadOlder).not.toHaveBeenCalled();
  });

  it("removes the chart on destroy", () => {
    const chart = makeChart();

    chart.destroy();

    expect(stub().remove).toHaveBeenCalledTimes(1);
  });
});
