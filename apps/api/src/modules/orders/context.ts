import {
  Decimal,
  buyingPower,
  isMarginDeficit,
  toApiString,
  type MarketStatus,
  type PlaceOrderInput,
} from "@stockdesk/shared";
import type { AppConfig } from "../../lib/config.js";
import { AppError } from "../../lib/errors.js";
import type { AccountRecord } from "../accounts/repository.js";
import type { AccountsDependencies } from "../accounts/snapshot-writer.js";
import { valuePositions } from "../accounts/summary.js";
import { findActiveSymbol, type SymbolWithProfile } from "../market/symbols-repository.js";
import { listOpenPositions, sumReservedCashByAccounts } from "./positions-repository.js";
import { listOpenOrdersForSymbol, type OrderRow } from "./repository.js";
import { validatePlacement, type OrderValidationResult } from "./validation.js";

const MONEY_PLACES = 2;
const OPEN = "open";

export interface OrdersPriceService {
  getLastPrice: (symbol: string) => Promise<Decimal | null>;
  getMarketStatus: () => MarketStatus;
  ensureStreaming: (symbols: string[]) => Promise<void>;
}

export interface OrdersEnginePort {
  indexAdd: (order: OrderRow) => void;
  indexRemove: (orderId: string) => void;
  evaluateOrder: (orderId: string) => Promise<void>;
}

export interface OrdersDependencies {
  config: AppConfig;
  prices: OrdersPriceService;
  accounts: AccountsDependencies;
  engine: OrdersEnginePort;
}

export interface OrderContext {
  symbol: SymbolWithProfile;
  validation: OrderValidationResult;
  buyingPowerBefore: Decimal;
  marginDeficit: boolean;
}

export function symbolNotFound(): AppError {
  return new AppError(404, "SYMBOL_NOT_FOUND", "Symbol not found.");
}

function insufficientBuyingPower(required: Decimal, available: Decimal): AppError {
  return new AppError(
    422,
    "INSUFFICIENT_BUYING_POWER",
    "The reservation of this order exceeds the buying power of the account.",
    {
      required: toApiString(required, MONEY_PLACES),
      available: toApiString(available, MONEY_PLACES),
    },
  );
}

function marginDeficitReached(): AppError {
  return new AppError(
    422,
    "MARGIN_DEFICIT",
    "The account is in a margin deficit; only closing orders are accepted.",
  );
}

/**
 * Placement and preview share this pipeline so both report the same errors in the same order: the
 * margin deficit blocks a position-increasing order before the buying power is even compared.
 */
export async function loadOrderContext(
  account: AccountRecord,
  request: PlaceOrderInput,
  dependencies: OrdersDependencies,
): Promise<OrderContext> {
  const symbol = await findActiveSymbol(request.symbol);
  if (symbol === null) throw symbolNotFound();

  const [positions, reservations, lastPrice, openOrders] = await Promise.all([
    listOpenPositions(account.id),
    sumReservedCashByAccounts([account.id]),
    dependencies.prices.getLastPrice(request.symbol),
    listOpenOrdersForSymbol(account.id, request.symbol),
  ]);

  const values = await valuePositions(positions, dependencies.accounts.prices);
  const reservedCash = reservations.get(account.id) ?? new Decimal(0);
  const config = dependencies.config;

  const power = buyingPower({
    cash: new Decimal(account.cashBalance.toString()),
    longValue: values.longValue,
    shortValue: values.shortValue,
    shortMarginRate: config.shortMarginRate,
    reservedCash,
  });

  const held = positions.find((position) => position.symbol === request.symbol);

  const validation = validatePlacement({
    request,
    symbol: { shortable: symbol.shortable, fractionable: symbol.fractionable },
    positionQuantity: held?.quantity ?? new Decimal(0),
    openOrders: openOrders.map((order) => ({
      side: order.side,
      quantity: new Decimal(order.quantity.toString()),
    })),
    lastPrice,
    marketOpen: dependencies.prices.getMarketStatus().status === OPEN,
    rates: {
      shortMarginRate: config.shortMarginRate,
      marketOrderBuffer: config.marketOrderBuffer,
    },
    commission: config.commissionPerOrder,
  });

  const marginDeficit = isMarginDeficit(
    power.equity,
    values.shortValue,
    config.maintenanceMarginRate,
  );

  if (validation.increasesPosition) {
    if (marginDeficit) throw marginDeficitReached();

    if (validation.reservation.greaterThan(power.buyingPower)) {
      throw insufficientBuyingPower(validation.reservation, power.buyingPower);
    }
  }

  return { symbol, validation, buyingPowerBefore: power.buyingPower, marginDeficit };
}
