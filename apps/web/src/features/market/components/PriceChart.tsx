import { useEffect, useRef } from "react";
import type { Timeframe } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { readChartColors } from "../../dashboard/chart-theme";
import { createPriceChart, type PriceChartHandle } from "../chart";
import type { ChartType } from "../chart-prefs";
import { useBars, useQuote } from "../hooks";

export interface PriceChartProps {
  symbol: string;
  interval: Timeframe;
  chartType: ChartType;
}

const CHART_HEIGHT = 360;

export function PriceChart({ symbol, interval, chartType }: PriceChartProps) {
  const { t } = useTranslation("market");
  const { bars, loadOlder, isLoading } = useBars(symbol, interval);
  const quote = useQuote(symbol);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<PriceChartHandle | null>(null);
  const loadOlderRef = useRef(loadOlder);
  const chartTypeRef = useRef(chartType);

  useEffect(() => {
    loadOlderRef.current = loadOlder;
  }, [loadOlder]);

  useEffect(() => {
    chartTypeRef.current = chartType;
  }, [chartType]);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) return;

    const chart = createPriceChart(container, {
      type: chartTypeRef.current,
      colors: readChartColors(),
      width: container.clientWidth,
      height: CHART_HEIGHT,
    });

    chart.onVisibleRangeReachedStart(() => loadOlderRef.current());
    chartRef.current = chart;

    const themeObserver = new MutationObserver(() => chart.applyColors(readChartColors()));
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const sizeObserver = new ResizeObserver(() => chart.resize(container.clientWidth));
    sizeObserver.observe(container);

    return () => {
      themeObserver.disconnect();
      sizeObserver.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setType(chartType);
  }, [chartType]);

  useEffect(() => {
    chartRef.current?.setBars(bars);
  }, [bars]);

  useEffect(() => {
    if (quote === null || bars.length === 0) return;

    chartRef.current?.applyQuote(quote.price, quote.at);
  }, [bars, quote]);

  return (
    <div className="relative w-full" style={{ height: CHART_HEIGHT }}>
      <div className="absolute inset-0" ref={containerRef} />
      {isLoading && bars.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("chart.loading")}
        </p>
      )}
      {!isLoading && bars.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("chart.empty")}
        </p>
      )}
    </div>
  );
}
