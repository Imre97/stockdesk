import { TIMEFRAMES, type Timeframe } from "@stockdesk/shared";

export const CHART_PREFS_STORAGE_KEY = "chartPrefs";

export const CHART_TYPES = ["candle", "line"] as const;

export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartPrefs {
  interval: Timeframe;
  chartType: ChartType;
}

export const DEFAULT_CHART_PREFS: ChartPrefs = { interval: "1D", chartType: "candle" };

function readInterval(value: unknown): Timeframe {
  return TIMEFRAMES.find((timeframe) => timeframe === value) ?? DEFAULT_CHART_PREFS.interval;
}

function readChartType(value: unknown): ChartType {
  return CHART_TYPES.find((type) => type === value) ?? DEFAULT_CHART_PREFS.chartType;
}

export function readChartPrefs(): ChartPrefs {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(CHART_PREFS_STORAGE_KEY);
  } catch {
    return DEFAULT_CHART_PREFS;
  }

  if (raw === null) return DEFAULT_CHART_PREFS;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_CHART_PREFS;
  }

  if (parsed === null || typeof parsed !== "object") return DEFAULT_CHART_PREFS;

  const { interval, chartType } = parsed as Record<string, unknown>;

  return { interval: readInterval(interval), chartType: readChartType(chartType) };
}

export function writeChartPrefs(prefs: ChartPrefs): void {
  try {
    window.localStorage.setItem(CHART_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    return;
  }
}
