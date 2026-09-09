import {
  estimateCost,
  priceToApi,
  quantityToApi,
  toApiString,
  type OrderPreviewDto,
  type PlaceOrderInput,
} from "@stockdesk/shared";
import { requireOwnedAccount } from "../accounts/service.js";
import { loadOrderContext, type OrdersDependencies } from "./context.js";

const MONEY_PLACES = 2;

export async function previewOrder(
  userId: string,
  accountId: string,
  request: PlaceOrderInput,
  dependencies: OrdersDependencies,
): Promise<OrderPreviewDto> {
  const account = await requireOwnedAccount(userId, accountId);
  const context = await loadOrderContext(account, request, dependencies);
  const validation = context.validation;

  return {
    quantity: quantityToApi(request.quantity),
    estimatedPrice: priceToApi(validation.estimatedPrice),
    estimatedCost: toApiString(
      estimateCost(request.quantity, validation.estimatedPrice),
      MONEY_PLACES,
    ),
    reservedCash: toApiString(validation.reservation, MONEY_PLACES),
    commission: toApiString(dependencies.config.commissionPerOrder, MONEY_PLACES),
    positionEffect: validation.positionEffect,
    positionAfter: quantityToApi(validation.positionAfter),
    buyingPowerBefore: toApiString(context.buyingPowerBefore, MONEY_PLACES),
    buyingPowerAfter: toApiString(
      context.buyingPowerBefore.minus(validation.reservation),
      MONEY_PLACES,
    ),
    expectedExecution: validation.expectedExecution,
    warnings: validation.warnings,
  };
}
