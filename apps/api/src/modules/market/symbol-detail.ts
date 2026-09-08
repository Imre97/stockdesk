import { toApiString, type Decimal, type QuoteDto, type SymbolDetailDto } from "@stockdesk/shared";
import type { QuoteSnapshot } from "./price-service.js";
import type { SymbolProfileRecord, SymbolWithProfile } from "./symbols-repository.js";

const PRICE_PLACES = 4;
const VOLUME_PLACES = 0;
const MARKET_CAP_PLACES = 2;
const SHARES_PLACES = 0;
const RATIO_PLACES = 2;
const YIELD_PLACES = 4;

type DecimalLike = { toString: () => string } | null;

function serialize(value: DecimalLike, places: number): string | null {
  return value === null ? null : toApiString(value.toString(), places);
}

function serializeDecimal(value: Decimal | null, places: number): string | null {
  return value === null ? null : toApiString(value, places);
}

function toQuoteDto(quote: QuoteSnapshot): QuoteDto {
  return {
    last: toApiString(quote.last, PRICE_PLACES),
    prevClose: serializeDecimal(quote.prevClose, PRICE_PLACES),
    open: serializeDecimal(quote.open, PRICE_PLACES),
    high: serializeDecimal(quote.high, PRICE_PLACES),
    low: serializeDecimal(quote.low, PRICE_PLACES),
    volume: serializeDecimal(quote.volume, VOLUME_PLACES),
    change: serializeDecimal(quote.change, PRICE_PLACES),
    changePct: serializeDecimal(quote.changePct, RATIO_PLACES),
    at: quote.at.toISOString(),
  };
}

function toStats(profile: SymbolProfileRecord | null): SymbolDetailDto["stats"] {
  return {
    marketCap: serialize(profile?.marketCap ?? null, MARKET_CAP_PLACES),
    sharesOutstanding: serialize(profile?.sharesOutstanding ?? null, SHARES_PLACES),
    peRatio: serialize(profile?.peRatio ?? null, RATIO_PLACES),
    week52High: serialize(profile?.week52High ?? null, PRICE_PLACES),
    week52Low: serialize(profile?.week52Low ?? null, PRICE_PLACES),
    beta: serialize(profile?.beta ?? null, RATIO_PLACES),
    dividendYield: serialize(profile?.dividendYield ?? null, YIELD_PLACES),
  };
}

export function toSymbolDetailDto(
  record: SymbolWithProfile,
  quote: QuoteSnapshot | null,
): SymbolDetailDto {
  return {
    symbol: record.symbol,
    name: record.name,
    exchange: record.exchange,
    currency: record.currency,
    shortable: record.shortable,
    fractionable: record.fractionable,
    industry: record.profile?.industry ?? null,
    logoUrl: record.profile?.logoUrl ?? null,
    websiteUrl: record.profile?.websiteUrl ?? null,
    quote: quote === null ? null : toQuoteDto(quote),
    stats: toStats(record.profile),
  };
}
