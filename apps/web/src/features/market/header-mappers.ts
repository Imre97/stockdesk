import type { DecimalValue, SymbolDetail } from "@stockdesk/shared";

import {
  changeFrom,
  formatChange,
  formatChangePercent,
  formatPrice,
  formatSessionTime,
  type QuoteTick,
} from "./mappers";

export type PriceDirection = "gain" | "loss" | "flat";

const DIRECTION_CLASSES: Record<PriceDirection, string> = {
  gain: "text-gain",
  loss: "text-loss",
  flat: "text-neutral",
};

export function directionClass(direction: PriceDirection | null): string {
  return direction === null ? "text-neutral" : DIRECTION_CLASSES[direction];
}

export interface SymbolHeaderView {
  symbol: string;
  name: string;
  exchange: string;
  priceText: string | null;
  changeText: string | null;
  changePctText: string | null;
  direction: PriceDirection | null;
  asOfText: string | null;
}

function directionOf(change: DecimalValue): PriceDirection {
  if (change.isZero()) return "flat";

  return change.isNegative() ? "loss" : "gain";
}

export function toSymbolHeaderView(
  detail: SymbolDetail,
  liveQuote: QuoteTick | null,
  locale: string,
): SymbolHeaderView {
  const price = liveQuote?.price ?? detail.quote?.last ?? null;
  const prevClose = liveQuote?.prevClose ?? detail.quote?.prevClose ?? null;
  const at = liveQuote?.at ?? detail.quote?.at ?? null;
  const change = price === null ? null : changeFrom(price, prevClose);

  return {
    symbol: detail.symbol,
    name: detail.name,
    exchange: detail.exchange,
    priceText: price === null ? null : formatPrice(price, locale),
    changeText: change === null ? null : formatChange(change.change, locale),
    changePctText: change === null ? null : formatChangePercent(change.changePct, locale),
    direction: change === null ? null : directionOf(change.change),
    asOfText: at === null ? null : formatSessionTime(at, locale),
  };
}
