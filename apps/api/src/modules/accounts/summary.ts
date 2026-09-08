import { Decimal, toApiString, type AccountSummaryDto } from "@stockdesk/shared";

const MONEY_PLACES = 2;
const PERCENT_MULTIPLIER = "100";
const ZERO = "0.00";

export interface DecimalLike {
  toString: () => string;
}

export interface AccountCashRecord {
  id: string;
  name: string;
  cashBalance: DecimalLike;
  createdAt: Date;
}

export interface PositionInput {
  symbol: string;
  quantity: Decimal;
  averageCost: Decimal;
}

export interface PriceLookup {
  getLastPrice: (symbol: string) => Promise<Decimal | null>;
  getPrevClose: (symbol: string, at?: Date) => Promise<Decimal | null>;
}

export interface PositionValues {
  positionsValue: Decimal;
  unrealizedPnl: Decimal;
}

export interface EquityValues {
  cash: Decimal;
  positionsValue: Decimal;
  equity: Decimal;
}

export const NO_POSITIONS: PositionValues = {
  positionsValue: new Decimal("0"),
  unrealizedPnl: new Decimal("0"),
};

/**
 * A position without a price contributes its cost basis, so an unpriced symbol never distorts the
 * unrealized result: it reports zero profit instead of wiping the position out of the equity.
 */
export async function valuePositions(
  positions: PositionInput[],
  prices: PriceLookup | undefined,
): Promise<PositionValues> {
  let positionsValue = new Decimal("0");
  let unrealizedPnl = new Decimal("0");

  for (const position of positions) {
    const last = prices === undefined ? null : await prices.getLastPrice(position.symbol);
    const price = last ?? position.averageCost;

    positionsValue = positionsValue.plus(position.quantity.times(price));
    unrealizedPnl = unrealizedPnl.plus(position.quantity.times(price.minus(position.averageCost)));
  }

  return { positionsValue, unrealizedPnl };
}

export function accountEquity(
  account: AccountCashRecord,
  values: PositionValues = NO_POSITIONS,
): EquityValues {
  const cash = new Decimal(account.cashBalance.toString());

  return { cash, positionsValue: values.positionsValue, equity: cash.plus(values.positionsValue) };
}

function percentOf(value: Decimal, denominator: Decimal | undefined): string {
  if (denominator === undefined || denominator.isZero()) return ZERO;

  return toApiString(value.dividedBy(denominator).times(PERCENT_MULTIPLIER), MONEY_PLACES);
}

export function toAccountSummary(
  account: AccountCashRecord,
  referenceEquity?: Decimal,
  values: PositionValues = NO_POSITIONS,
): AccountSummaryDto {
  const equity = accountEquity(account, values);
  const dailyPnl =
    referenceEquity === undefined ? new Decimal("0") : equity.equity.minus(referenceEquity);
  const costBasis = values.positionsValue.minus(values.unrealizedPnl);

  return {
    id: account.id,
    name: account.name,
    cash: toApiString(equity.cash, MONEY_PLACES),
    positionsValue: toApiString(equity.positionsValue, MONEY_PLACES),
    equity: toApiString(equity.equity, MONEY_PLACES),
    unrealizedPnl: toApiString(values.unrealizedPnl, MONEY_PLACES),
    unrealizedPnlPct: costBasis.isZero()
      ? ZERO
      : percentOf(values.unrealizedPnl, costBasis),
    dailyPnl: toApiString(dailyPnl, MONEY_PLACES),
    dailyPnlPct: percentOf(dailyPnl, referenceEquity),
    createdAt: account.createdAt.toISOString(),
  };
}
