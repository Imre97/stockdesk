import {
  Decimal,
  buyingPower,
  isMarginDeficit,
  toApiString,
  type AccountSummaryDto,
} from "@stockdesk/shared";
import type { AppConfig } from "../../lib/config.js";

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
  getLastPrices: (symbols: string[]) => Promise<Map<string, Decimal | null>>;
  getPrevClose: (symbol: string, at?: Date) => Promise<Decimal | null>;
}

export interface PositionValues {
  longValue: Decimal;
  shortValue: Decimal;
  positionsValue: Decimal;
  unrealizedPnl: Decimal;
}

export interface EquityValues {
  cash: Decimal;
  positionsValue: Decimal;
  equity: Decimal;
}

export interface MarginRates {
  shortMarginRate: Decimal;
  maintenanceMarginRate: Decimal;
}

export interface SummaryInput {
  referenceEquity?: Decimal | undefined;
  values?: PositionValues | undefined;
  reservedCash?: Decimal | undefined;
  rates: MarginRates;
}

export const NO_POSITIONS: PositionValues = {
  longValue: new Decimal("0"),
  shortValue: new Decimal("0"),
  positionsValue: new Decimal("0"),
  unrealizedPnl: new Decimal("0"),
};

export function marginRatesOf(config: AppConfig): MarginRates {
  return {
    shortMarginRate: config.shortMarginRate,
    maintenanceMarginRate: config.maintenanceMarginRate,
  };
}

/**
 * A position without a price contributes its cost basis, so an unpriced symbol never distorts the
 * unrealized result: it reports zero profit instead of wiping the position out of the equity.
 */
export async function valuePositions(
  positions: PositionInput[],
  prices: PriceLookup | undefined,
): Promise<PositionValues> {
  let longValue = new Decimal("0");
  let shortValue = new Decimal("0");
  let unrealizedPnl = new Decimal("0");

  const last =
    prices === undefined || positions.length === 0
      ? new Map<string, Decimal | null>()
      : await prices.getLastPrices(positions.map((position) => position.symbol));

  for (const position of positions) {
    const price = last.get(position.symbol) ?? position.averageCost;
    const value = position.quantity.times(price);

    if (position.quantity.isNegative()) {
      shortValue = shortValue.plus(value.negated());
    } else {
      longValue = longValue.plus(value);
    }

    unrealizedPnl = unrealizedPnl.plus(position.quantity.times(price.minus(position.averageCost)));
  }

  return { longValue, shortValue, positionsValue: longValue.minus(shortValue), unrealizedPnl };
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
  input: SummaryInput,
): AccountSummaryDto {
  const values = input.values ?? NO_POSITIONS;
  const reservedCash = input.reservedCash ?? new Decimal("0");
  const cash = new Decimal(account.cashBalance.toString());

  const power = buyingPower({
    cash,
    longValue: values.longValue,
    shortValue: values.shortValue,
    shortMarginRate: input.rates.shortMarginRate,
    reservedCash,
  });

  const dailyPnl =
    input.referenceEquity === undefined
      ? new Decimal("0")
      : power.equity.minus(input.referenceEquity);
  const costBasis = values.positionsValue.minus(values.unrealizedPnl);

  return {
    id: account.id,
    name: account.name,
    cash: toApiString(cash, MONEY_PLACES),
    positionsValue: toApiString(values.positionsValue, MONEY_PLACES),
    equity: toApiString(power.equity, MONEY_PLACES),
    unrealizedPnl: toApiString(values.unrealizedPnl, MONEY_PLACES),
    unrealizedPnlPct: costBasis.isZero() ? ZERO : percentOf(values.unrealizedPnl, costBasis),
    dailyPnl: toApiString(dailyPnl, MONEY_PLACES),
    dailyPnlPct: percentOf(dailyPnl, input.referenceEquity),
    longValue: toApiString(values.longValue, MONEY_PLACES),
    shortValue: toApiString(values.shortValue, MONEY_PLACES),
    shortMargin: toApiString(power.shortMargin, MONEY_PLACES),
    reservedCash: toApiString(reservedCash, MONEY_PLACES),
    buyingPower: toApiString(power.buyingPower, MONEY_PLACES),
    marginDeficit: isMarginDeficit(
      power.equity,
      values.shortValue,
      input.rates.maintenanceMarginRate,
    ),
    createdAt: account.createdAt.toISOString(),
  };
}
