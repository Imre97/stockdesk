import type { DecimalValue } from "@stockdesk/shared";
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type LogicalRange,
  type SeriesType,
  createChart,
} from "lightweight-charts";

import { toChartOptions, type ChartColors } from "../dashboard/chart-theme";
import type { ChartType } from "./chart-prefs";
import {
  mergeQuoteIntoBar,
  toCandlestickData,
  toLineData,
  toVolumeData,
  type ChartBar,
} from "./mappers";

const VOLUME_PRICE_SCALE_ID = "volume";
const VOLUME_TOP_MARGIN = 0.8;
const LEFT_EDGE_BARS = 10;

export interface PriceChartOptions {
  type: ChartType;
  colors: ChartColors;
  width: number;
  height: number;
}

export interface PriceChartHandle {
  setBars: (bars: ChartBar[]) => void;
  updateLastBar: (bar: ChartBar) => void;
  applyQuote: (price: DecimalValue, at: Date) => void;
  setType: (type: ChartType) => void;
  applyColors: (colors: ChartColors) => void;
  resize: (width: number) => void;
  onVisibleRangeReachedStart: (callback: () => void) => void;
  destroy: () => void;
}

function priceSeriesOptions(type: ChartType, colors: ChartColors) {
  return type === "candle"
    ? {
        upColor: colors.gain,
        downColor: colors.loss,
        borderUpColor: colors.gain,
        borderDownColor: colors.loss,
        wickUpColor: colors.gain,
        wickDownColor: colors.loss,
      }
    : { color: colors.gain, lineWidth: 2 as const };
}

/**
 * Owns the imperative Lightweight Charts objects behind a small interface: the React component
 * only feeds it bars, quotes and size changes, and every Decimal to number conversion stays in
 * the mappers this module calls.
 */
export function createPriceChart(container: HTMLElement, options: PriceChartOptions): PriceChartHandle {
  const chart: IChartApi = createChart(container, {
    ...toChartOptions(options.colors, options.width),
    height: options.height,
  });

  let colors = options.colors;
  let type = options.type;
  let bars: ChartBar[] = [];
  let atStart = false;
  let reachedStart: (() => void) | null = null;

  let price: ISeriesApi<SeriesType> = addPriceSeries(type);
  const volume = chart.addSeries(HistogramSeries, {
    priceScaleId: VOLUME_PRICE_SCALE_ID,
    priceLineVisible: false,
    lastValueVisible: false,
  });

  chart.priceScale(VOLUME_PRICE_SCALE_ID).applyOptions({
    scaleMargins: { top: VOLUME_TOP_MARGIN, bottom: 0 },
  });

  function addPriceSeries(next: ChartType): ISeriesApi<SeriesType> {
    return next === "candle"
      ? chart.addSeries(CandlestickSeries, priceSeriesOptions("candle", colors))
      : chart.addSeries(LineSeries, priceSeriesOptions("line", colors));
  }

  function drawPrice(): void {
    if (type === "candle") price.setData(toCandlestickData(bars));
    else price.setData(toLineData(bars));
  }

  function drawVolume(): void {
    volume.setData(toVolumeData(bars, colors.gain, colors.loss));
  }

  function onLogicalRange(range: LogicalRange | null): void {
    if (range === null || bars.length === 0) return;

    if (range.from >= LEFT_EDGE_BARS) {
      atStart = false;
      return;
    }

    if (atStart) return;

    atStart = true;
    reachedStart?.();
  }

  chart.timeScale().subscribeVisibleLogicalRangeChange(onLogicalRange);

  return {
    setBars: (next) => {
      bars = next;
      atStart = false;
      drawPrice();
      drawVolume();
    },

    updateLastBar: (bar) => {
      const last = bars[bars.length - 1];

      bars = last !== undefined && last.time.getTime() === bar.time.getTime() ? [...bars.slice(0, -1), bar] : [...bars, bar];

      if (type === "candle") {
        const [candle] = toCandlestickData([bar]);

        if (candle !== undefined) price.update(candle);
      } else {
        const [point] = toLineData([bar]);

        if (point !== undefined) price.update(point);
      }

      const [histogram] = toVolumeData([bar], colors.gain, colors.loss);

      if (histogram !== undefined) volume.update(histogram);
    },

    applyQuote: (value, at) => {
      const last = bars[bars.length - 1];

      if (last === undefined || at.getTime() < last.time.getTime()) return;

      const merged = mergeQuoteIntoBar(last, value);

      bars = [...bars.slice(0, -1), merged];

      if (type === "candle") {
        const [candle] = toCandlestickData([merged]);

        if (candle !== undefined) price.update(candle);
      } else {
        const [point] = toLineData([merged]);

        if (point !== undefined) price.update(point);
      }
    },

    setType: (next) => {
      if (next === type) return;

      chart.removeSeries(price);
      type = next;
      price = addPriceSeries(next);
      drawPrice();
    },

    applyColors: (next) => {
      colors = next;
      chart.applyOptions(toChartOptions(next, container.clientWidth));
      price.applyOptions(priceSeriesOptions(type, next));
      drawVolume();
    },

    resize: (width) => chart.applyOptions({ width }),

    onVisibleRangeReachedStart: (callback) => {
      reachedStart = callback;
    },

    destroy: () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onLogicalRange);
      reachedStart = null;
      chart.remove();
    },
  };
}
