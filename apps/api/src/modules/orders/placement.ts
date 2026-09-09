import {
  priceToApi,
  quantityToApi,
  toApiString,
  type AccountSummaryDto,
  type Decimal,
  type OrderDto,
  type PlaceOrderInput,
} from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";
import type { AccountRecord } from "../accounts/repository.js";
import { accountNotFound, requireOwnedAccount } from "../accounts/service.js";
import {
  afterCashChange,
  currentTime,
  summarizeAccounts,
} from "../accounts/snapshot-writer.js";
import { loadOrderContext, type OrdersDependencies } from "./context.js";
import { nextSessionClose } from "./expiry.js";
import { createOrder, findByClientOrderId, type OrderRow } from "./repository.js";
import { toOrderDto } from "./serializers.js";

const MONEY_PLACES = 2;

export interface PlacementResult {
  created: boolean;
  order: OrderDto;
  account: AccountSummaryDto;
}

function optionalPrice(value: Decimal | null | undefined): string | null {
  return value === null || value === undefined ? null : priceToApi(value);
}

async function respond(
  account: AccountRecord,
  order: OrderRow,
  created: boolean,
  dependencies: OrdersDependencies,
): Promise<PlacementResult> {
  const [summary] = await summarizeAccounts(
    [account],
    currentTime(dependencies.accounts),
    dependencies.accounts,
  );

  if (summary === undefined) throw accountNotFound();

  return { created, order: toOrderDto(order), account: summary };
}

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

    if (replay !== null) return await respond(account, replay, false, dependencies);
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

  await dependencies.prices.ensureStreaming([context.symbol.symbol]);
  await afterCashChange(userId, dependencies.accounts);

  return await respond(account, result.order, result.created, dependencies);
}
