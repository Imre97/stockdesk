import { Decimal } from "@stockdesk/shared";

import type { Quote, SymbolProfile, Trade } from "../types.js";
import { aggregate } from "./bars.js";
import { dayIndexOf, indexRange, minuteRefOf } from "./buckets.js";
import type { SimulatedAsset } from "./universe.js";
import type { Ohlcv, PriceWalk } from "./walk.js";

const WEEK_52_BARS = 252;
const MARKET_CAP_DECIMALS = 2;

export function buildQuote(
  walk: PriceWalk,
  asset: SimulatedAsset,
  lastTrade: Trade | undefined,
  now: Date,
): Quote {
  const { dayIndex, minuteOfDay } = minuteRefOf(now);
  const open = walk.dayClose(asset, dayIndex - 1);
  const session = sessionSoFar(walk, asset, dayIndex, minuteOfDay, open);
  const last = lastTrade === undefined ? session.close : lastTrade.price;

  return {
    symbol: asset.symbol,
    last,
    prevClose: open,
    open,
    high: Decimal.max(session.high, last),
    low: Decimal.min(session.low, last),
    volume: session.volume,
    at: lastTrade === undefined ? now : lastTrade.at,
  };
}

export function buildProfile(walk: PriceWalk, asset: SimulatedAsset, now: Date): SymbolProfile {
  const dayIndex = dayIndexOf(now);
  const first = Math.max(0, dayIndex - WEEK_52_BARS);
  const days = indexRange(first, dayIndex - first).map((index) => walk.dayModel(asset, index));

  return {
    symbol: asset.symbol,
    name: asset.name,
    exchange: asset.exchange,
    industry: asset.industry,
    marketCap: asset.basePrice.times(asset.sharesOutstanding).toDecimalPlaces(MARKET_CAP_DECIMALS),
    sharesOutstanding: asset.sharesOutstanding,
    peRatio: asset.peRatio,
    week52High: days.length === 0 ? null : Decimal.max(...days.map((day) => day.high)),
    week52Low: days.length === 0 ? null : Decimal.min(...days.map((day) => day.low)),
    beta: asset.beta,
    dividendYield: asset.dividendYield,
    logoUrl: asset.logoUrl,
    websiteUrl: asset.websiteUrl,
    ipoDate: null,
  };
}

function sessionSoFar(
  walk: PriceWalk,
  asset: SimulatedAsset,
  dayIndex: number,
  elapsed: number,
  open: Decimal,
): Ohlcv {
  if (elapsed <= 0) {
    return { open, high: open, low: open, close: open, volume: new Decimal(0) };
  }
  return aggregate(indexRange(0, elapsed).map((minute) => walk.minuteBar(asset, dayIndex, minute)));
}
