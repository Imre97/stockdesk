import type { ReactNode } from "react";
import { barsResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface SeriesStub {
  setData: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
}

interface ChartStub {
  definitions: unknown[];
  series: SeriesStub[];
  addSeries: ReturnType<typeof vi.fn>;
  removeSeries: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
  priceScale: ReturnType<typeof vi.fn>;
  timeScale: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

const charts = vi.hoisted(() => ({ created: [] as unknown[] }));

const lightweightCharts = vi.hoisted(() => {
  const created = charts.created;

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
          fitContent: vi.fn(),
          subscribeVisibleLogicalRangeChange: vi.fn(),
          unsubscribeVisibleLogicalRangeChange: vi.fn(),
        })),
        remove: vi.fn(),
      };

      created.push(chart);

      return chart;
    }),
  };
});

const api = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

const subscriptions = vi.hoisted(() => ({
  subscribeQuote: vi.fn(() => () => undefined),
  subscribeBars: vi.fn(() => () => undefined),
}));

vi.mock("lightweight-charts", () => lightweightCharts);
vi.mock("../api", () => api);
vi.mock("../subscriptions", () => subscriptions);

import { i18n } from "../../../i18n";
import { useAuthStore } from "../../auth/store";
import { useMarketStore } from "../store";
import { PriceChart } from "./PriceChart";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const MINUTE_PAGE = barsResponseSchema.parse({
  symbol: "TSLA",
  timeframe: "1m",
  bars: [
    {
      time: "2026-09-08T14:31:00.000Z",
      open: "251.10",
      high: "251.40",
      low: "251.05",
      close: "251.34",
      volume: "1200",
    },
  ],
  hasMore: true,
});

const HOUR_PAGE = barsResponseSchema.parse({
  symbol: "TSLA",
  timeframe: "1h",
  bars: [
    {
      time: "2026-09-08T14:00:00.000Z",
      open: "248.00",
      high: "252.00",
      low: "247.00",
      close: "251.00",
      volume: "98000",
    },
  ],
  hasMore: false,
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

async function waitForBars(): Promise<void> {
  await waitFor(() => {
    expect(lastChart().series[0]?.setData).toHaveBeenCalledWith([
      expect.objectContaining({ time: expect.any(Number) as number }),
    ]);
  });
}

function lastChart(): ChartStub {
  const chart = charts.created[charts.created.length - 1] as ChartStub | undefined;

  if (chart === undefined) throw new Error("no chart was created");

  return chart;
}

beforeEach(() => {
  vi.clearAllMocks();
  charts.created.length = 0;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useMarketStore.getState().reset();
  api.getBars.mockImplementation((_symbol: string, timeframe: string) =>
    Promise.resolve(timeframe === "1h" ? HOUR_PAGE : MINUTE_PAGE),
  );
});

describe("PriceChart", () => {
  it("mounts one chart with a candlestick and a volume series", () => {
    render(<PriceChart chartType="candle" interval="1m" symbol="TSLA" />, { wrapper });

    expect(lightweightCharts.createChart).toHaveBeenCalledTimes(1);
    expect(lastChart().definitions).toEqual([
      lightweightCharts.CandlestickSeries,
      lightweightCharts.HistogramSeries,
    ]);
  });

  it("feeds the loaded bars into the price and the volume series", async () => {
    render(<PriceChart chartType="candle" interval="1m" symbol="TSLA" />, { wrapper });

    await waitFor(() => {
      expect(lastChart().series[0]?.setData).toHaveBeenCalledWith([
        { time: 1788877860, open: 251.1, high: 251.4, low: 251.05, close: 251.34 },
      ]);
    });

    expect(lastChart().series[1]?.setData).toHaveBeenCalled();
  });

  it("swaps the candlestick series for a line series when the type toggles", async () => {
    const view = render(<PriceChart chartType="candle" interval="1m" symbol="TSLA" />, { wrapper });

    await waitForBars();

    view.rerender(<PriceChart chartType="line" interval="1m" symbol="TSLA" />);

    await waitFor(() => {
      expect(lastChart().definitions).toContain(lightweightCharts.LineSeries);
    });

    expect(lightweightCharts.createChart).toHaveBeenCalledTimes(1);
  });

  it("reloads the bars and resubscribes when the interval changes", async () => {
    const view = render(<PriceChart chartType="candle" interval="1m" symbol="TSLA" />, { wrapper });

    await waitForBars();

    const before = lastChart().series[0]?.setData.mock.calls.length ?? 0;

    view.rerender(<PriceChart chartType="candle" interval="1h" symbol="TSLA" />);

    await waitFor(() => {
      expect(lastChart().series[0]?.setData.mock.calls.length ?? 0).toBeGreaterThan(before);
    });

    expect(subscriptions.subscribeBars).toHaveBeenCalledWith("TSLA", "1h");
  });

  it("merges a live quote into the last candle", async () => {
    render(<PriceChart chartType="candle" interval="1m" symbol="TSLA" />, { wrapper });

    await waitForBars();

    act(() => {
      useMarketStore.getState().applyQuote({
        type: "quote",
        symbol: "TSLA",
        price: "252.5000",
        size: "10",
        at: "2026-09-08T14:31:30.000Z",
        prevClose: "248.9000",
      });
    });

    await waitFor(() => {
      expect(lastChart().series[0]?.update).toHaveBeenCalledWith({
        time: 1788877860,
        open: 251.1,
        high: 252.5,
        low: 251.05,
        close: 252.5,
      });
    });
  });

  it("destroys the chart on unmount", () => {
    const view = render(<PriceChart chartType="candle" interval="1m" symbol="TSLA" />, { wrapper });
    const chart = lastChart();

    view.unmount();

    expect(chart.remove).toHaveBeenCalledTimes(1);
  });
});
