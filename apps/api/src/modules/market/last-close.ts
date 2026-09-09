import { Decimal, type Timeframe } from "@stockdesk/shared";
import * as candlesRepository from "./candles-repository.js";
import { findActiveSymbolIds } from "./symbols-repository.js";
import { bucketStartMs } from "./timeframes.js";

const DAILY: Timeframe = "1D";
const MINUTE: Timeframe = "1m";
const FALLBACK_ORDER: Timeframe[] = [MINUTE, DAILY];

export function toDecimal(value: { toString: () => string }): Decimal {
  return new Decimal(value.toString());
}

export function dayStart(at: Date): Date {
  return new Date(bucketStartMs(at.getTime(), DAILY));
}

export async function cachedClose(symbolId: string): Promise<Decimal | null> {
  const minute = await candlesRepository.latestBar(symbolId, MINUTE);
  if (minute !== null) return toDecimal(minute.close);

  const daily = await candlesRepository.latestBar(symbolId, DAILY);

  return daily === null ? null : toDecimal(daily.close);
}

/**
 * The batched form of `cachedClose`: one symbol lookup and one candle query for the whole list,
 * with the same per-symbol fallback order (newest minute close, then newest daily close). Symbols
 * without a cached bar are absent from the result.
 */
export async function cachedCloses(symbols: string[]): Promise<Map<string, Decimal>> {
  const ids = await findActiveSymbolIds(symbols);
  const rows = await candlesRepository.latestClosesFor([...ids.values()], FALLBACK_ORDER);
  const bySeries = new Map(rows.map((row) => [`${row.symbolId}|${row.timeframe}`, row.close]));
  const closes = new Map<string, Decimal>();

  for (const [symbol, id] of ids) {
    const close = bySeries.get(`${id}|${MINUTE}`) ?? bySeries.get(`${id}|${DAILY}`);
    if (close !== undefined) closes.set(symbol, toDecimal(close));
  }

  return closes;
}

/**
 * The batched form of `prevCloseFor`: one symbol lookup and one candle query for the whole list.
 * Symbols without a final daily bar before the day start are absent from the result.
 */
export async function prevClosesForSymbols(
  symbols: string[],
  at: Date,
): Promise<Map<string, Decimal>> {
  const ids = await findActiveSymbolIds(symbols);
  const rows = await candlesRepository.latestFinalClosesBefore(
    [...ids.values()],
    DAILY,
    dayStart(at),
  );
  const byId = new Map(rows.map((row) => [row.symbolId, row.close]));
  const closes = new Map<string, Decimal>();

  for (const [symbol, id] of ids) {
    const close = byId.get(id);
    if (close !== undefined) closes.set(symbol, toDecimal(close));
  }

  return closes;
}

export async function prevCloseFor(symbolId: string, at: Date): Promise<Decimal | null> {
  const row = await candlesRepository.latestFinalBarBefore(symbolId, DAILY, dayStart(at));

  return row === null ? null : toDecimal(row.close);
}
