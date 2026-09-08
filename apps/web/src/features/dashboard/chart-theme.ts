import { ColorType, type AreaSeriesPartialOptions, type DeepPartial, type ChartOptions } from "lightweight-charts";

export interface ChartColors {
  line: string;
  fill: string;
  text: string;
  grid: string;
  background: string;
  gain: string;
  loss: string;
}

const FALLBACK_COLORS: ChartColors = {
  line: "rgb(22, 128, 82)",
  fill: "rgba(22, 128, 82, 0.2)",
  text: "rgb(113, 113, 122)",
  grid: "rgba(113, 113, 122, 0.2)",
  background: "transparent",
  gain: "rgb(22, 128, 82)",
  loss: "rgb(185, 43, 43)",
};

function readVariable(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();

  return value === "" ? fallback : value;
}

export function readChartColors(): ChartColors {
  if (typeof document === "undefined") return FALLBACK_COLORS;

  const styles = getComputedStyle(document.documentElement);
  const gain = readVariable(styles, "--gain", FALLBACK_COLORS.gain);

  return {
    line: gain,
    fill: gain,
    text: readVariable(styles, "--neutral", FALLBACK_COLORS.text),
    grid: readVariable(styles, "--border", FALLBACK_COLORS.grid),
    background: FALLBACK_COLORS.background,
    gain,
    loss: readVariable(styles, "--loss", FALLBACK_COLORS.loss),
  };
}

export function toChartOptions(colors: ChartColors, width: number): DeepPartial<ChartOptions> {
  return {
    width,
    layout: {
      background: { type: ColorType.Solid, color: colors.background },
      textColor: colors.text,
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: colors.grid },
      horzLines: { color: colors.grid },
    },
    rightPriceScale: { borderColor: colors.grid },
    timeScale: { borderColor: colors.grid, timeVisible: true },
    crosshair: { vertLine: { color: colors.text }, horzLine: { color: colors.text } },
  };
}

export function toSeriesOptions(colors: ChartColors): AreaSeriesPartialOptions {
  return {
    lineColor: colors.line,
    topColor: colors.fill,
    bottomColor: "transparent",
    lineWidth: 2,
  };
}
