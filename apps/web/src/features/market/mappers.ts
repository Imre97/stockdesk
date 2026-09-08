import type { CandlestickData, HistogramData, LineData, UTCTimestamp } from "lightweight-charts";
import {
  Decimal,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatSignedMoney,
  type Bar,
  type BarDto,
  type DecimalValue,
  type MarketStatus,
  type QuoteMessage,
} from "@stockdesk/shared";

const MILLISECONDS_PER_SECOND = 1000;
const PERCENT_DECIMAL_PLACES = 2;
const PERCENT_FACTOR = 100;
const COMPACT_FRACTION_DIGITS = 2;

export interface QuoteTick {
  symbol: string;
  price: DecimalValue;
  size: DecimalValue;
  at: Date;
  prevClose: DecimalValue | null;
}

export interface ChartBar {
  time: Date;
  open: DecimalValue;
  high: DecimalValue;
  low: DecimalValue;
  close: DecimalValue;
  volume: DecimalValue;
  isFinal: boolean;
}

export interface PriceChange {
  change: DecimalValue;
  changePct: DecimalValue;
}

export type ChartBarInput = BarDto | Bar;

function toDecimal(value: string | DecimalValue): DecimalValue {
  return value instanceof Decimal ? value : new Decimal(value);
}

function toNullableDecimal(value: string | DecimalValue | null): DecimalValue | null {
  return value === null ? null : toDecimal(value);
}

export function toQuoteTick(message: QuoteMessage): QuoteTick {
  return {
    symbol: message.symbol,
    price: toDecimal(message.price),
    size: toDecimal(message.size),
    at: new Date(message.at),
    prevClose: toNullableDecimal(message.prevClose),
  };
}

export function toChartBar(bar: ChartBarInput, isFinal = true): ChartBar {
  return {
    time: new Date(bar.time),
    open: toDecimal(bar.open),
    high: toDecimal(bar.high),
    low: toDecimal(bar.low),
    close: toDecimal(bar.close),
    volume: toDecimal(bar.volume),
    isFinal,
  };
}

/**
 * The chart series mappers below hold the only sanctioned Decimal to number conversion of
 * this feature: Lightweight Charts accepts plain numbers and unix seconds, and no money
 * math happens on the produced values.
 */
function toUtcSeconds(time: Date): UTCTimestamp {
  return Math.trunc(time.getTime() / MILLISECONDS_PER_SECOND) as UTCTimestamp;
}

export function toCandlestickData(bars: ChartBar[]): CandlestickData<UTCTimestamp>[] {
  return bars.map((bar) => ({
    time: toUtcSeconds(bar.time),
    open: bar.open.toNumber(),
    high: bar.high.toNumber(),
    low: bar.low.toNumber(),
    close: bar.close.toNumber(),
  }));
}

export function toLineData(bars: ChartBar[]): LineData<UTCTimestamp>[] {
  return bars.map((bar) => ({ time: toUtcSeconds(bar.time), value: bar.close.toNumber() }));
}

export function toVolumeData(
  bars: ChartBar[],
  gainColor: string,
  lossColor: string,
): HistogramData<UTCTimestamp>[] {
  return bars.map((bar) => ({
    time: toUtcSeconds(bar.time),
    value: bar.volume.toNumber(),
    color: bar.close.lessThan(bar.open) ? lossColor : gainColor,
  }));
}

export function changeFrom(last: DecimalValue, prevClose: DecimalValue | null): PriceChange | null {
  if (prevClose === null || prevClose.isZero()) return null;

  const change = last.minus(prevClose);

  return {
    change,
    changePct: change
      .div(prevClose)
      .times(PERCENT_FACTOR)
      .toDecimalPlaces(PERCENT_DECIMAL_PLACES, Decimal.ROUND_HALF_EVEN),
  };
}

export function formatPrice(value: DecimalValue, locale: string): string {
  return formatMoney(value, locale);
}

export function formatChange(value: DecimalValue, locale: string): string {
  return formatSignedMoney(value, locale);
}

export function formatChangePercent(value: DecimalValue, locale: string): string {
  return formatPercent(value, locale);
}

export function formatYield(value: DecimalValue, locale: string): string {
  return formatPercent(value.times(PERCENT_FACTOR), locale);
}

export function formatSessionTime(at: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(at));
}

export function formatTimestamp(at: string | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(at));
}

export function formatRatio(value: DecimalValue, locale: string): string {
  return formatQuantity(value, locale);
}

/**
 * Compact notation is fed the decimal string rather than a converted value, so a market cap
 * of several hundred billion never passes through a native number.
 */
export function formatCompactNumber(value: DecimalValue, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: COMPACT_FRACTION_DIGITS,
  }).format(value.toString() as Intl.StringNumericLiteral);
}

export function mergeQuoteIntoBar(bar: ChartBar, price: DecimalValue): ChartBar {
  return {
    ...bar,
    high: Decimal.max(bar.high, price),
    low: Decimal.min(bar.low, price),
    close: price,
  };
}

export interface MarketStatusBadgeView {
  statusKey: string;
  isOpen: boolean;
  nextKey: string | null;
  nextTime: string | null;
}

export function toMarketStatusBadge(status: MarketStatus, locale: string): MarketStatusBadgeView {
  const isOpen = status.status === "open";
  const nextAt = isOpen ? status.nextCloseAt : status.nextOpenAt;

  return {
    statusKey: `status.${status.status}`,
    isOpen,
    nextKey: nextAt === null ? null : isOpen ? "status.closesAt" : "status.opensAt",
    nextTime: nextAt === null ? null : formatSessionTime(nextAt, locale),
  };
}
