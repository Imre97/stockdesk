import { Decimal } from "@stockdesk/shared";

import { DAYS_PER_YEAR, MINUTES_PER_DAY } from "./buckets.js";
import { createStream } from "./prng.js";
import type { SimulatedAsset } from "./universe.js";

const PRICE_DECIMALS = 4;
const DAILY_TURNOVER = "0.004";
const WICK_BASE = 0.2;
const WICK_SPAN = 0.8;
const VOLUME_BASE = 0.25;
const VOLUME_SPAN = 1.5;
const DAY_MODEL_CACHE_LIMIT = 2048;
const MINUTE_PATH_CACHE_LIMIT = 16;
const UNBOUNDED = Number.POSITIVE_INFINITY;

const ZERO = new Decimal(0);
const ONE = new Decimal(1);

export interface Ohlcv {
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

export interface DayModel extends Ohlcv {
  highMinute: number;
  lowMinute: number;
}

export interface PriceWalkOptions {
  seed: number;
}

export interface PriceWalk {
  dayClose(asset: SimulatedAsset, dayIndex: number): Decimal;
  dayModel(asset: SimulatedAsset, dayIndex: number): DayModel;
  minuteBar(asset: SimulatedAsset, minuteIndex: number): Ohlcv;
  minutePrice(asset: SimulatedAsset, minuteIndex: number): Decimal;
  tickPrice(asset: SimulatedAsset, minuteIndex: number, draw: number): Decimal;
}

/**
 * Three nested layers, each seeded by its own stream so any range is computable on its own:
 * a driftless geometric Brownian motion over whole days since the epoch gives every daily close,
 * a Brownian bridge over the 1440 minutes of a day joins that day's open to its close, and a
 * per-minute stream adds the wick and the volume. Minute prices are clamped into the day's own
 * high and low band, and the day's extremes are pinned to one minute each, so a full day of
 * minute candles aggregates back to exactly that day's candle.
 */
export function createPriceWalk({ seed }: PriceWalkOptions): PriceWalk {
  const logSums = new Map<string, Decimal[]>();
  const dayModels = new Map<string, DayModel>();
  const minutePaths = new Map<string, Decimal[]>();
  const dailySigmas = new Map<string, Decimal>();
  const minuteSigmas = new Map<string, Decimal>();

  function dailySigma(asset: SimulatedAsset): Decimal {
    return remember(dailySigmas, asset.symbol, UNBOUNDED, () =>
      asset.annualVolatility.times(ONE.div(DAYS_PER_YEAR).sqrt()),
    );
  }

  function minuteSigma(asset: SimulatedAsset): Decimal {
    return remember(minuteSigmas, asset.symbol, UNBOUNDED, () =>
      asset.annualVolatility.times(ONE.div(DAYS_PER_YEAR * MINUTES_PER_DAY).sqrt()),
    );
  }

  function cumulativeLogReturn(asset: SimulatedAsset, dayIndex: number): Decimal {
    let sums = logSums.get(asset.symbol);
    if (sums === undefined) {
      sums = [];
      logSums.set(asset.symbol, sums);
    }
    const sigma = dailySigma(asset);
    const halfVariance = sigma.times(sigma).div(2);
    while (sums.length <= dayIndex) {
      const day = sums.length;
      const draw = createStream(seed, asset.symbol, "day-return", day).nextNormal();
      const step = sigma.times(new Decimal(draw)).minus(halfVariance);
      sums.push(elementAt(sums, day - 1, ZERO).plus(step));
    }
    return elementAt(sums, dayIndex, ZERO);
  }

  function dayClose(asset: SimulatedAsset, dayIndex: number): Decimal {
    if (dayIndex < 0) return roundPrice(asset.basePrice);
    return roundPrice(asset.basePrice.times(Decimal.exp(cumulativeLogReturn(asset, dayIndex))));
  }

  function dayModel(asset: SimulatedAsset, dayIndex: number): DayModel {
    return remember(dayModels, `${asset.symbol}:${dayIndex}`, DAY_MODEL_CACHE_LIMIT, () => {
      const open = dayClose(asset, dayIndex - 1);
      const close = dayClose(asset, dayIndex);
      const stream = createStream(seed, asset.symbol, "day-shape", dayIndex);
      const sigma = dailySigma(asset);
      const high = roundPrice(Decimal.max(open, close).times(ONE.plus(sigma.times(wick(stream.next())))));
      const low = roundPrice(Decimal.min(open, close).times(ONE.minus(sigma.times(wick(stream.next())))));
      const turnover = asset.sharesOutstanding.times(DAILY_TURNOVER).times(volumeFactor(stream.next()));
      return {
        open,
        high,
        low,
        close,
        volume: wholeUnits(turnover),
        highMinute: Math.floor(stream.next() * MINUTES_PER_DAY),
        lowMinute: Math.floor(stream.next() * MINUTES_PER_DAY),
      };
    });
  }

  function logPath(asset: SimulatedAsset, dayIndex: number): Decimal[] {
    return remember(minutePaths, `${asset.symbol}:${dayIndex}`, MINUTE_PATH_CACHE_LIMIT, () => {
      const model = dayModel(asset, dayIndex);
      const openLog = Decimal.ln(model.open);
      const total = Decimal.ln(model.close).minus(openLog);
      const stream = createStream(seed, asset.symbol, "minute-bridge", dayIndex);
      const sigma = minuteSigma(asset);
      const raw: Decimal[] = [ZERO];
      for (let minute = 0; minute < MINUTES_PER_DAY; minute += 1) {
        raw.push(elementAt(raw, minute, ZERO).plus(sigma.times(new Decimal(stream.nextNormal()))));
      }
      const correction = total.minus(elementAt(raw, MINUTES_PER_DAY, ZERO));
      return raw.map((value, minute) => openLog.plus(value).plus(correction.times(minute).div(MINUTES_PER_DAY)));
    });
  }

  function priceInDay(asset: SimulatedAsset, dayIndex: number, minuteOfDay: number): Decimal {
    const model = dayModel(asset, dayIndex);
    const path = logPath(asset, dayIndex);
    const price = roundPrice(Decimal.exp(elementAt(path, minuteOfDay, ZERO)));
    return clamp(price, model.low, model.high);
  }

  function minutePrice(asset: SimulatedAsset, minuteIndex: number): Decimal {
    const dayIndex = Math.floor(minuteIndex / MINUTES_PER_DAY);
    return priceInDay(asset, dayIndex, minuteIndex - dayIndex * MINUTES_PER_DAY);
  }

  function minuteBar(asset: SimulatedAsset, minuteIndex: number): Ohlcv {
    const dayIndex = Math.floor(minuteIndex / MINUTES_PER_DAY);
    const minuteOfDay = minuteIndex - dayIndex * MINUTES_PER_DAY;
    const model = dayModel(asset, dayIndex);
    const open = priceInDay(asset, dayIndex, minuteOfDay);
    const close = priceInDay(asset, dayIndex, minuteOfDay + 1);
    const stream = createStream(seed, asset.symbol, "minute-shape", dayIndex, minuteOfDay);
    const sigma = minuteSigma(asset);
    const top = roundPrice(Decimal.max(open, close).times(ONE.plus(sigma.times(wick(stream.next())))));
    const bottom = roundPrice(Decimal.min(open, close).times(ONE.minus(sigma.times(wick(stream.next())))));
    const share = model.volume.div(MINUTES_PER_DAY).times(volumeFactor(stream.next()));

    return {
      open,
      close,
      high: minuteOfDay === model.highMinute ? model.high : Decimal.min(top, model.high),
      low: minuteOfDay === model.lowMinute ? model.low : Decimal.max(bottom, model.low),
      volume: Decimal.max(ONE, wholeUnits(share)),
    };
  }

  function tickPrice(asset: SimulatedAsset, minuteIndex: number, draw: number): Decimal {
    const dayIndex = Math.floor(minuteIndex / MINUTES_PER_DAY);
    const model = dayModel(asset, dayIndex);
    const base = minutePrice(asset, minuteIndex);
    const moved = roundPrice(base.times(Decimal.exp(minuteSigma(asset).times(new Decimal(draw)))));
    return clamp(moved, model.low, model.high);
  }

  return { dayClose, dayModel, minuteBar, minutePrice, tickPrice };
}

export function roundPrice(price: Decimal): Decimal {
  return price.toDecimalPlaces(PRICE_DECIMALS, Decimal.ROUND_HALF_EVEN);
}

export function wholeUnits(value: Decimal): Decimal {
  return value.toDecimalPlaces(0, Decimal.ROUND_DOWN);
}

function clamp(value: Decimal, low: Decimal, high: Decimal): Decimal {
  return Decimal.min(Decimal.max(value, low), high);
}

function wick(draw: number): Decimal {
  return new Decimal(draw).times(WICK_SPAN).plus(WICK_BASE);
}

function volumeFactor(draw: number): Decimal {
  return new Decimal(draw).times(VOLUME_SPAN).plus(VOLUME_BASE);
}

function elementAt(values: Decimal[], index: number, fallback: Decimal): Decimal {
  return values[index] ?? fallback;
}

function remember<T>(cache: Map<string, T>, key: string, limit: number, create: () => T): T {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const value = create();
  cache.set(key, value);
  if (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return value;
}
