import {
  priceToApi,
  quantityToApi,
  toApiString,
  type AccountSummaryDto,
  type Decimal,
  type OrderDto,
  type PlaceOrderInput,
  type PositionRecordDto,
  type TradeDto,
} from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";
import { accountNotFound, requireOwnedAccount } from "../accounts/service.js";
import { afterCashChange, currentTime, summarizeAccounts } from "../accounts/snapshot-writer.js";
import { loadOrderContext, type OrdersDependencies } from "./context.js";
import { nextSessionClose } from "./expiry.js";
import { findPosition } from "./positions-repository.js";
import { createOrder, findByClientOrderId, findOrderById, type OrderRow } from "./repository.js";
import { toOrderDto, toPositionRecordDto, toTradeDto } from "./serializers.js";

const MONEY_PLACES = 2;

export interface PlacementResult {
  created: boolean;
  order: OrderDto;
  trade?: TradeDto;
  position?: PositionRecordDto;
  account: AccountSummaryDto;
}

function optionalPrice(value: Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : priceToApi(value);
}

async function fillDetails(
  order: OrderRow,
): Promise<{ trade?: TradeDto; position?: PositionRecordDto }> {
  if (order.status !== "FILLED") return {};

  const [trade, position] = await Promise.all([
    prisma.trade.findFirst({ where: { orderId: order.id }, orderBy: { executedAt: "desc" } }),
    findPosition(order.accountId, order.symbol),
  ]);

  return {
    ...(trade === null ? {} : { trade: toTradeDto(trade) }),
    ...(position === null ? {} : { position: toPositionRecordDto(position) }),
  };
}

async function respond(
  userId: string,
  accountId: string,
  order: OrderRow,
  created: boolean,
  dependencies: OrdersDependencies,
): Promise<PlacementResult> {
  const account = await requireOwnedAccount(userId, accountId);
  const [[summary], details] = await Promise.all([
    summarizeAccounts([account], currentTime(dependencies.accounts), dependencies.accounts),
    fillDetails(order),
  ]);

  if (summary === undefined) throw accountNotFound();

  return { created, order: toOrderDto(order), ...details, account: summary };
}

/**
 * Every accepted order is evaluated once against the last known price while the market is open, so a
 * marketable order answers the request with its fill. The engine owns the broadcasts of a fill; only
 * an order that is still resting needs the reservation pushed from here.
 */
export async function placeOrder(
  userId: string,
  accountId: string,
  request: PlaceOrderInput,
  dependencies: OrdersDependencies,
): Promise<PlacementResult> {
  const account = await requireOwnedAccount(userId, accountId);
  const clientOrderId = request.clientOrderId ?? null;

  if (clientOrderId !== null) {
    const replay = await findByClientOrderId(account.id, clientOrderId);

    if (replay !== null) return await respond(userId, account.id, replay, false, dependencies);
  }

  const context = await loadOrderContext(account, request, dependencies);
  const now = currentTime(dependencies.accounts);

  const result = await createOrder(prisma, {
    accountId: account.id,
    clientOrderId,
    symbol: context.symbol.symbol,
    side: request.side,
    type: request.type,
    status: "OPEN",
    timeInForce: request.timeInForce,
    quantity: quantityToApi(request.quantity),
    limitPrice: optionalPrice(request.limitPrice),
    stopPrice: optionalPrice(request.stopPrice),
    stopLossPrice: optionalPrice(request.stopLossPrice),
    takeProfitPrice: optionalPrice(request.takeProfitPrice),
    reservedCash: toApiString(context.validation.reservation, MONEY_PLACES),
    commission: toApiString(dependencies.config.commissionPerOrder, MONEY_PLACES),
    expiresAt: request.timeInForce === "DAY" ? nextSessionClose(now) : null,
  });

  if (!result.created) {
    return await respond(userId, account.id, result.order, false, dependencies);
  }

  dependencies.engine.indexAdd(result.order);
  await dependencies.prices.ensureStreaming([context.symbol.symbol]);

  await dependencies.engine.evaluateOrder(result.order.id);

  const settled = (await findOrderById(prisma, result.order.id)) ?? result.order;

  if (settled.status !== "FILLED") await afterCashChange(userId, dependencies.accounts);

  return await respond(userId, account.id, settled, true, dependencies);
}
