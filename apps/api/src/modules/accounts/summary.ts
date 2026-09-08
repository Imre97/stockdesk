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

export interface EquityValues {
  cash: Decimal;
  positionsValue: Decimal;
  equity: Decimal;
}

export function accountEquity(account: AccountCashRecord): EquityValues {
  const cash = new Decimal(account.cashBalance.toString());
  const positionsValue = new Decimal("0");

  return { cash, positionsValue, equity: cash.plus(positionsValue) };
}

function percentOf(value: Decimal, denominator: Decimal | undefined): string {
  if (denominator === undefined || denominator.isZero()) return ZERO;

  return toApiString(value.dividedBy(denominator).times(PERCENT_MULTIPLIER), MONEY_PLACES);
}

export function toAccountSummary(
  account: AccountCashRecord,
  referenceEquity?: Decimal,
): AccountSummaryDto {
  const values = accountEquity(account);
  const dailyPnl =
    referenceEquity === undefined ? new Decimal("0") : values.equity.minus(referenceEquity);

  return {
    id: account.id,
    name: account.name,
    cash: toApiString(values.cash, MONEY_PLACES),
    positionsValue: toApiString(values.positionsValue, MONEY_PLACES),
    equity: toApiString(values.equity, MONEY_PLACES),
    unrealizedPnl: ZERO,
    unrealizedPnlPct: ZERO,
    dailyPnl: toApiString(dailyPnl, MONEY_PLACES),
    dailyPnlPct: percentOf(dailyPnl, referenceEquity),
    createdAt: account.createdAt.toISOString(),
  };
}
