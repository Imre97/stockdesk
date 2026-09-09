import type {
  AccountSummaryDto,
  OrderDto,
  PositionDto,
  PositionRecordDto,
  TradeDto,
} from "@stockdesk/shared";

const ACCOUNT_ID = "acc-1";
const CREATED_AT = "2026-09-08T10:00:00.000Z";
const EXECUTED_AT = "2026-09-08T14:31:00.000Z";
const ZERO_MONEY = "0.00";

export function accountSummaryDto(overrides: Partial<AccountSummaryDto> = {}): AccountSummaryDto {
  const base: AccountSummaryDto = {
    id: ACCOUNT_ID,
    name: "Main",
    cash: "100000.00",
    positionsValue: ZERO_MONEY,
    equity: "100000.00",
    unrealizedPnl: ZERO_MONEY,
    unrealizedPnlPct: ZERO_MONEY,
    dailyPnl: ZERO_MONEY,
    dailyPnlPct: ZERO_MONEY,
    longValue: ZERO_MONEY,
    shortValue: ZERO_MONEY,
    shortMargin: ZERO_MONEY,
    reservedCash: ZERO_MONEY,
    buyingPower: "100000.00",
    marginDeficit: false,
    createdAt: CREATED_AT,
    ...overrides,
  };

  return { ...base, buyingPower: overrides.buyingPower ?? base.equity };
}

export function positionDto(overrides: Partial<PositionDto> = {}): PositionDto {
  return {
    symbol: "AAPL",
    quantity: "10.000000",
    averageCost: "180.2500",
    lastPrice: "182.1000",
    marketValue: "1821.00",
    unrealizedPnl: "18.50",
    unrealizedPnlPct: "1.03",
    dailyChange: "-4.20",
    dailyChangePct: "-0.23",
    realizedPnl: ZERO_MONEY,
    ...overrides,
  };
}

export function positionRecordDto(overrides: Partial<PositionRecordDto> = {}): PositionRecordDto {
  return {
    id: "pos-1",
    accountId: ACCOUNT_ID,
    symbol: "AAPL",
    quantity: "10.000000",
    averageCost: "180.2500",
    realizedPnl: ZERO_MONEY,
    openedAt: CREATED_AT,
    closedAt: null,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

export function tradeDto(overrides: Partial<TradeDto> = {}): TradeDto {
  return {
    id: "trade-1",
    orderId: "order-1",
    accountId: ACCOUNT_ID,
    symbol: "TSLA",
    side: "BUY",
    quantity: "10.000000",
    price: "250.0000",
    amount: "2500.00",
    commission: ZERO_MONEY,
    realizedPnl: null,
    executedAt: EXECUTED_AT,
    ...overrides,
  };
}

export function orderDto(overrides: Partial<OrderDto> = {}): OrderDto {
  return {
    id: "order-1",
    accountId: ACCOUNT_ID,
    clientOrderId: null,
    symbol: "TSLA",
    side: "BUY",
    type: "LIMIT",
    role: "ENTRY",
    status: "OPEN",
    timeInForce: "GTC",
    quantity: "10.000000",
    limitPrice: "250.0000",
    stopPrice: null,
    stopLossPrice: null,
    takeProfitPrice: null,
    reservedCash: "2500.00",
    avgFillPrice: null,
    commission: ZERO_MONEY,
    parentOrderId: null,
    ocoGroupId: null,
    cancelReason: null,
    rejectReason: null,
    version: 1,
    expiresAt: null,
    triggeredAt: null,
    filledAt: null,
    cancelledAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}
