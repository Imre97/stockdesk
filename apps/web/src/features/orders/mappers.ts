import {
  Decimal,
  ORDER_ERROR_CODES,
  formatMoney,
  formatQuantity,
  insufficientBuyingPowerDetailsSchema,
  priceToApi,
  type DecimalValue,
  type ExpectedExecution,
  type OrderPreview,
  type OrderSide,
  type PlaceOrderResponse,
} from "@stockdesk/shared";

import { getErrorCode, HttpError } from "../../lib/http";
import type { OrderFormUnit } from "./order-form";

const NAMESPACE = "orders";
const BUYING_POWER_CODE = "INSUFFICIENT_BUYING_POWER";
const REUSED_ERROR_CODES = ["SYMBOL_NOT_FOUND", "ACCOUNT_NOT_FOUND", "VALIDATION_ERROR"];
const KNOWN_ERROR_CODES: readonly string[] = [...ORDER_ERROR_CODES, ...REUSED_ERROR_CODES];

export const GENERIC_ERROR_KEY = `${NAMESPACE}:errors.generic`;

export interface OrderSummaryView {
  estimatedCost: string;
  estimatedPrice: string;
  reservedCash: string;
  buyingPowerBefore: string;
  buyingPowerAfter: string;
  positionAfter: string;
  positionEffectKey: string;
  expectedExecutionKey: string;
  warningKeys: string[];
}

export interface BuyingPowerShortfall {
  required: string;
  available: string;
}

export interface SubmitLabelInput {
  side: OrderSide;
  opensShort: boolean;
  quantity: DecimalValue | null;
  symbol: string;
  locale: string;
}

export interface SubmitLabel {
  key: string;
  values: Record<string, string>;
}

export interface QuantityHintInput {
  unit: OrderFormUnit;
  quantity: DecimalValue | null;
  cost: DecimalValue | null;
  price: DecimalValue | null;
  locale: string;
}

export interface QuantityHint {
  key: string;
  values: Record<string, string>;
}

export interface OrderChildView {
  roleKey: string;
  price: string;
}

export interface OrderSuccessView {
  statusKey: string;
  statusValues: Record<string, string>;
  quantity: string;
  costLabelKey: string;
  cost: string;
  children: OrderChildView[];
}

const SUBMIT_KEYS: Record<string, string> = {
  BUY: `${NAMESPACE}:submit.buy`,
  SELL: `${NAMESPACE}:submit.sell`,
  SELL_SHORT: `${NAMESPACE}:submit.sellShort`,
  BUY_PLAIN: `${NAMESPACE}:submit.buyPlain`,
  SELL_PLAIN: `${NAMESPACE}:submit.sellPlain`,
  SELL_SHORT_PLAIN: `${NAMESPACE}:submit.sellShortPlain`,
};

const RESTING_STATUS_KEYS: Record<ExpectedExecution, string> = {
  immediate: `${NAMESPACE}:success.resting`,
  waiting_for_market_open: `${NAMESPACE}:success.waitingForMarketOpen`,
  resting: `${NAMESPACE}:success.resting`,
};

export function toOrderSummaryView(preview: OrderPreview, locale: string): OrderSummaryView {
  return {
    estimatedCost: formatMoney(preview.estimatedCost, locale),
    estimatedPrice: formatMoney(preview.estimatedPrice, locale),
    reservedCash: formatMoney(preview.reservedCash, locale),
    buyingPowerBefore: formatMoney(preview.buyingPowerBefore, locale),
    buyingPowerAfter: formatMoney(preview.buyingPowerAfter, locale),
    positionAfter: formatQuantity(preview.positionAfter, locale),
    positionEffectKey: `${NAMESPACE}:positionEffect.${preview.positionEffect}`,
    expectedExecutionKey: `${NAMESPACE}:expectedExecution.${preview.expectedExecution}`,
    warningKeys: preview.warnings.map((warning) => `${NAMESPACE}:warnings.${warning}`),
  };
}

export function toQuantityHint(input: QuantityHintInput): QuantityHint | null {
  if (input.unit === "usd") {
    return input.quantity === null
      ? null
      : { key: `${NAMESPACE}:hint.shares`, values: { quantity: formatQuantity(input.quantity, input.locale) } };
  }

  if (input.cost === null || input.price === null) return null;

  return {
    key: `${NAMESPACE}:hint.cost`,
    values: {
      cost: formatMoney(input.cost, input.locale),
      price: formatMoney(input.price, input.locale),
    },
  };
}

export function toOrderErrorKey(error: unknown): string {
  const code = getErrorCode(error);

  return code !== null && KNOWN_ERROR_CODES.includes(code) ? `${NAMESPACE}:errors.${code}` : GENERIC_ERROR_KEY;
}

export function insufficientBuyingPowerDetails(error: unknown, locale: string): BuyingPowerShortfall | null {
  if (!(error instanceof HttpError) || error.code !== BUYING_POWER_CODE) return null;

  const parsed = insufficientBuyingPowerDetailsSchema.safeParse(error.details);

  if (!parsed.success) return null;

  return {
    required: formatMoney(new Decimal(parsed.data.required), locale),
    available: formatMoney(new Decimal(parsed.data.available), locale),
  };
}

function submitKey(side: OrderSide, opensShort: boolean, plain: boolean): string {
  const base = side === "SELL" && opensShort ? "SELL_SHORT" : side;
  const key = SUBMIT_KEYS[plain ? `${base}_PLAIN` : base];

  return key ?? SUBMIT_KEYS["BUY"] ?? "";
}

export function toSubmitLabel(input: SubmitLabelInput): SubmitLabel {
  const quantity = input.quantity;

  if (quantity === null) {
    return { key: submitKey(input.side, input.opensShort, true), values: { symbol: input.symbol } };
  }

  return {
    key: submitKey(input.side, input.opensShort, false),
    values: { quantity: formatQuantity(quantity, input.locale), symbol: input.symbol },
  };
}

function childViews(
  stopLossPrice: DecimalValue | null,
  takeProfitPrice: DecimalValue | null,
): OrderChildView[] {
  const children: OrderChildView[] = [];

  if (stopLossPrice !== null) {
    children.push({ roleKey: `${NAMESPACE}:role.STOP_LOSS`, price: priceToApi(stopLossPrice) });
  }

  if (takeProfitPrice !== null) {
    children.push({ roleKey: `${NAMESPACE}:role.TAKE_PROFIT`, price: priceToApi(takeProfitPrice) });
  }

  return children;
}

export function toOrderSuccessView(
  response: PlaceOrderResponse,
  expectedExecution: ExpectedExecution | null,
  locale: string,
): OrderSuccessView {
  const { order, trade } = response;
  const filled = order.status === "FILLED" && order.avgFillPrice !== null;

  return {
    statusKey: filled
      ? `${NAMESPACE}:success.filled`
      : RESTING_STATUS_KEYS[expectedExecution ?? "resting"],
    statusValues:
      filled && order.avgFillPrice !== null ? { price: priceToApi(order.avgFillPrice) } : {},
    quantity: formatQuantity(order.quantity, locale),
    costLabelKey: trade === undefined ? `${NAMESPACE}:success.reserved` : `${NAMESPACE}:success.cost`,
    cost: formatMoney(trade === undefined ? order.reservedCash : trade.amount, locale),
    children: childViews(order.stopLossPrice, order.takeProfitPrice),
  };
}
