import { useEffect, useRef } from "react";
import type { EquityRange } from "@stockdesk/shared";
import { AreaSeries, createChart, type IChartApi, type ISeriesApi } from "lightweight-charts";
import { useTranslation } from "react-i18next";

import { readChartColors, toChartOptions, toSeriesOptions } from "../chart-theme";
import { useEquityChartData } from "../hooks";

export interface EquityChartProps {
  range: EquityRange;
}

const CHART_HEIGHT = 260;

export function EquityChart({ range }: EquityChartProps) {
  const { t } = useTranslation("dashboard");
  const { series, isEmpty } = useEquityChartData(range);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) return;

    const colors = readChartColors();
    const chart = createChart(container, { ...toChartOptions(colors, container.clientWidth), height: CHART_HEIGHT });
    const area = chart.addSeries(AreaSeries, toSeriesOptions(colors));

    chartRef.current = chart;
    seriesRef.current = area;

    const restyle = (): void => {
      const next = readChartColors();
      chart.applyOptions(toChartOptions(next, container.clientWidth));
      area.applyOptions(toSeriesOptions(next));
    };

    const themeObserver = new MutationObserver(restyle);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const sizeObserver = new ResizeObserver(() => chart.applyOptions({ width: container.clientWidth }));
    sizeObserver.observe(container);

    return () => {
      themeObserver.disconnect();
      sizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    seriesRef.current?.setData(series);
    chartRef.current?.timeScale().fitContent();
  }, [series]);

  return (
    <div className="relative w-full" style={{ height: CHART_HEIGHT }}>
      <div className="absolute inset-0" ref={containerRef} />
      {isEmpty && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          {t("equityChart.empty")}
        </p>
      )}
    </div>
  );
}
