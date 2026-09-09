import {
  formatQuantity,
  orderPriceSchema,
  orderQuantitySchema,
  priceToApi,
  quantityToApi,
  type DecimalValue,
  type ModifyOrderRequest,
  type Order,
  type OrderRole,
  type OrderSide,
  type OrderStatus,
  type OrderTypeValue,
  type TimeInForce,
} from "@stockdesk/shared";

import { formatPrice, formatTimestamp } from "../market/mappers";

const NAMESPACE = "orders";
const ACTIVE_STATUSES: readonly OrderStatus[] = ["OPEN", "TRIGGERED"];
const LIMIT_PRICE_TYPES: readonly OrderTypeValue[] = ["LIMIT", "STOP_LIMIT"];
const STOP_PRICE_TYPES: readonly OrderTypeValue[] = ["STOP", "STOP_LIMIT"];
const ROLE_BADGE_KEYS: Partial<Record<OrderRole, string>> = {
  STOP_LOSS: `${NAMESPACE}:roleBadge.STOP_LOSS`,
  TAKE_PROFIT: `${NAMESPACE}:roleBadge.TAKE_PROFIT`,
};
const BRACKET_FIELDS = ["stopLossPrice", "takeProfitPrice"] as const;
const PRICE_FIELDS = ["limitPrice", "stopPrice"] as const;

export interface OrderRowView {
  id: string;
  accountId: string;
  accountName: string | null;
  createdAt: string;
  symbol: string;
  side: OrderSide;
  sideKey: string;
  typeKey: string;
  quantity: string;
  limitPrice: string | null;
  stopPrice: string | null;
  statusKey: string;
  status: OrderStatus;
  filledPrice: string | null;
  filledAt: string | null;
  timeInForceKey: string;
  roleBadgeKey: string | null;
  parentOrderId: string | null;
  version: number;
  isActive: boolean;
  isEntryWithChildren: boolean;
}

export interface OrderRowContext {
  accountName: string | null;
  childCount: number;
}

export interface ModifiableFields {
  quantity: boolean;
  limitPrice: boolean;
  stopPrice: boolean;
  timeInForce: boolean;
  stopLossPrice: boolean;
  takeProfitPrice: boolean;
}

export interface ModifyFormValues {
  quantity: string;
  limitPrice: string;
  stopPrice: string;
  timeInForce: TimeInForce;
  stopLossPrice: string;
  takeProfitPrice: string;
}

export interface ModifyFormState {
  values: ModifyFormValues;
  initial: ModifyFormValues;
  editable: ModifiableFields;
}

export type ModifyFormErrors = Partial<Record<keyof ModifyFormValues, string>>;

const NO_FIELDS: ModifiableFields = {
  quantity: false,
  limitPrice: false,
  stopPrice: false,
  timeInForce: false,
  stopLossPrice: false,
  takeProfitPrice: false,
};

function price(value: DecimalValue | null, locale: string): string | null {
  return value === null ? null : formatPrice(value, locale);
}

function timestamp(at: string | null, locale: string): string | null {
  return at === null ? null : formatTimestamp(at, locale);
}

export function toOrderRow(order: Order, locale: string, context: OrderRowContext): OrderRowView {
  return {
    id: order.id,
    accountId: order.accountId,
    accountName: context.accountName,
    createdAt: formatTimestamp(order.createdAt, locale),
    symbol: order.symbol,
    side: order.side,
    sideKey: `${NAMESPACE}:side.${order.side}`,
    typeKey: `${NAMESPACE}:type.${order.type}`,
    quantity: formatQuantity(order.quantity, locale),
    limitPrice: price(order.limitPrice, locale),
    stopPrice: price(order.stopPrice, locale),
    statusKey: `${NAMESPACE}:status.${order.status}`,
    status: order.status,
    filledPrice: price(order.avgFillPrice, locale),
    filledAt: timestamp(order.filledAt, locale),
    timeInForceKey: `${NAMESPACE}:timeInForce.${order.timeInForce}`,
    roleBadgeKey: ROLE_BADGE_KEYS[order.role] ?? null,
    parentOrderId: order.parentOrderId,
    version: order.version,
    isActive: ACTIVE_STATUSES.includes(order.status),
    isEntryWithChildren: order.role === "ENTRY" && context.childCount > 0,
  };
}

/** A triggered stop-limit is already past its stop, so only its limit price is still editable. */
export function modifiableFields(order: Order): ModifiableFields {
  if (!ACTIVE_STATUSES.includes(order.status)) return NO_FIELDS;

  if (order.status === "TRIGGERED" && order.type === "STOP_LIMIT") {
    return { ...NO_FIELDS, limitPrice: true };
  }

  const entry = order.role === "ENTRY";

  return {
    quantity: true,
    limitPrice: LIMIT_PRICE_TYPES.includes(order.type),
    stopPrice: STOP_PRICE_TYPES.includes(order.type),
    timeInForce: true,
    stopLossPrice: entry,
    takeProfitPrice: entry,
  };
}

function priceInput(value: DecimalValue | null): string {
  return value === null ? "" : priceToApi(value);
}

export function initialModifyForm(order: Order): ModifyFormState {
  const values: ModifyFormValues = {
    quantity: quantityToApi(order.quantity),
    limitPrice: priceInput(order.limitPrice),
    stopPrice: priceInput(order.stopPrice),
    timeInForce: order.timeInForce,
    stopLossPrice: priceInput(order.stopLossPrice),
    takeProfitPrice: priceInput(order.takeProfitPrice),
  };

  return { values, initial: values, editable: modifiableFields(order) };
}

function isChanged(state: ModifyFormState, field: keyof ModifyFormValues): boolean {
  return state.editable[field] && state.values[field] !== state.initial[field];
}

function fieldErrorKey(field: keyof ModifyFormValues): string {
  return `${NAMESPACE}:errors.field.${field}`;
}

export function modifyErrors(state: ModifyFormState): ModifyFormErrors {
  const errors: ModifyFormErrors = {};

  if (isChanged(state, "quantity") && !orderQuantitySchema.safeParse(state.values.quantity).success) {
    errors.quantity = fieldErrorKey("quantity");
  }

  for (const field of PRICE_FIELDS) {
    if (isChanged(state, field) && !orderPriceSchema.safeParse(state.values[field]).success) {
      errors[field] = fieldErrorKey(field);
    }
  }

  for (const field of BRACKET_FIELDS) {
    const value = state.values[field].trim();

    if (isChanged(state, field) && value !== "" && !orderPriceSchema.safeParse(value).success) {
      errors[field] = fieldErrorKey(field);
    }
  }

  return errors;
}

export function hasModifyChanges(state: ModifyFormState): boolean {
  const fields: (keyof ModifyFormValues)[] = [
    "quantity",
    "timeInForce",
    ...PRICE_FIELDS,
    ...BRACKET_FIELDS,
  ];

  return fields.some((field) => isChanged(state, field));
}

export function toModifyRequest(state: ModifyFormState, version: number): ModifyOrderRequest {
  const request: ModifyOrderRequest = { version };

  if (isChanged(state, "quantity")) {
    const parsed = orderQuantitySchema.safeParse(state.values.quantity);

    if (parsed.success) request.quantity = quantityToApi(parsed.data);
  }

  if (isChanged(state, "timeInForce")) request.timeInForce = state.values.timeInForce;

  for (const field of PRICE_FIELDS) {
    if (!isChanged(state, field)) continue;

    const parsed = orderPriceSchema.safeParse(state.values[field]);

    if (parsed.success) request[field] = priceToApi(parsed.data);
  }

  for (const field of BRACKET_FIELDS) {
    if (!isChanged(state, field)) continue;

    const value = state.values[field].trim();

    if (value === "") {
      request[field] = null;
      continue;
    }

    const parsed = orderPriceSchema.safeParse(value);

    if (parsed.success) request[field] = priceToApi(parsed.data);
  }

  return request;
}
