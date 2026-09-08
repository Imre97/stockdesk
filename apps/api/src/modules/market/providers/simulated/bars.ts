import { Decimal } from "@stockdesk/shared";

import type { Bar, BarsQuery } from "../types.js";
import {
  bucketStartAt,
  EPOCH_MS,
  historyStartMs,
  indexRange,
  MS_PER_DAY,
  MS_PER_MINUTE,
  minuteSpanOf,
  nextBucketStart,
  previousBucketStart,
  sourceOf,
} from "./buckets.js";
import type { SimulatedAsset } from "./universe.js";
import type { Ohlcv, PriceWalk } from "./walk.js";

export function buildBars(walk: PriceWalk, asset: SimulatedAsset, query: BarsQuery, now: Date): Bar[] {
  const { timeframe } = query;
  const endMs = Math.min(query.end.getTime(), now.getTime());
  const historyMs = historyStartMs(timeframe, now);
  const floorMs = query.start === undefined ? historyMs : Math.max(historyMs, query.start.getTime());
  if (endMs <= floorMs) return [];

  const starts: number[] = [];
  let cursor = previousBucketStart(bucketStartAt(endMs, timeframe), timeframe);
  while (starts.length < query.limit && cursor >= floorMs) {
    starts.push(cursor);
    cursor = previousBucketStart(cursor, timeframe);
  }
  starts.reverse();

  return starts.map((start) => ({
    symbol: asset.symbol,
    timeframe,
    time: new Date(start),
    ...aggregate(sourceSlices(walk, asset, start, query)),
  }));
}

function sourceSlices(walk: PriceWalk, asset: SimulatedAsset, start: number, query: BarsQuery): Ohlcv[] {
  const { timeframe } = query;
  if (sourceOf(timeframe) === "minute") {
    const span = minuteSpanOf(timeframe) ?? 1;
    const first = Math.floor((start - EPOCH_MS) / MS_PER_MINUTE);
    return indexRange(first, span).map((index) => walk.minuteBar(asset, index));
  }
  const first = Math.floor((start - EPOCH_MS) / MS_PER_DAY);
  const afterLast = Math.floor((nextBucketStart(start, timeframe) - EPOCH_MS) / MS_PER_DAY);
  return indexRange(first, afterLast - first).map((index) => walk.dayModel(asset, index));
}

export function aggregate(slices: Ohlcv[]): Ohlcv {
  const [head, ...rest] = slices;
  if (head === undefined) throw new Error("Cannot aggregate an empty candle bucket");

  return rest.reduce<Ohlcv>(
    (total, slice) => ({
      open: total.open,
      high: Decimal.max(total.high, slice.high),
      low: Decimal.min(total.low, slice.low),
      close: slice.close,
      volume: total.volume.plus(slice.volume),
    }),
    { open: head.open, high: head.high, low: head.low, close: head.close, volume: head.volume },
  );
}
