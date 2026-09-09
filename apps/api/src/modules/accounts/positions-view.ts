import { Decimal, toApiString, type PositionDto } from "@stockdesk/shared";
import type { PositionRow } from "../orders/positions-repository.js";
import type { PriceLookup } from "./summary.js";

const MONEY_PLACES = 2;
const PRICE_PLACES = 4;
const QUANTITY_PLACES = 6;
const PERCENT_MULTIPLIER = "100";
const ZERO = "0.00";

function percentOf(value: Decimal, denominator: Decimal): string {
  if (denominator.isZero()) return ZERO;

  return toApiString(value.dividedBy(denominator).times(PERCENT_MULTIPLIER), MONEY_PLACES);
}

async function prevCloseOf(
  symbol: string,
  prices: PriceLookup | undefined,
  at: Date,
): Promise<Decimal | null> {
  if (prices === undefined) return null;

  return await prices.getPrevClose(symbol, at);
}

export async function toPositionViews(
  rows: PositionRow[],
  prices: PriceLookup | undefined,
  at: Date,
): Promise<PositionDto[]> {
  const last =
    prices === undefined || rows.length === 0
      ? new Map<string, Decimal | null>()
      : await prices.getLastPrices(rows.map((row) => row.symbol));

  const views: PositionDto[] = [];

  for (const row of rows) {
    const lastPrice = last.get(row.symbol) ?? row.averageCost;
    const absolute = row.quantity.absoluteValue();
    const unrealizedPnl = row.quantity.times(lastPrice.minus(row.averageCost));
    const prevClose = await prevCloseOf(row.symbol, prices, at);
    const dailyChange =
      prevClose === null ? new Decimal("0") : lastPrice.minus(prevClose).times(row.quantity);

    views.push({
      symbol: row.symbol,
      quantity: toApiString(row.quantity, QUANTITY_PLACES),
      averageCost: toApiString(row.averageCost, PRICE_PLACES),
      lastPrice: toApiString(lastPrice, PRICE_PLACES),
      marketValue: toApiString(row.quantity.times(lastPrice), MONEY_PLACES),
      unrealizedPnl: toApiString(unrealizedPnl, MONEY_PLACES),
      unrealizedPnlPct: percentOf(unrealizedPnl, absolute.times(row.averageCost)),
      dailyChange: toApiString(dailyChange, MONEY_PLACES),
      dailyChangePct:
        prevClose === null ? ZERO : percentOf(dailyChange, absolute.times(prevClose)),
      realizedPnl: toApiString(row.realizedPnl, MONEY_PLACES),
    });
  }

  return views;
}
