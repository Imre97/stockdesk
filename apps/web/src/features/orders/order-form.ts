import {
  Decimal,
  priceToApi,
  type DecimalValue,
  type OrderSide,
  type OrderTypeValue,
  type TimeInForce,
} from "@stockdesk/shared";

export type OrderFormUnit = "shares" | "usd";

export type BracketRole = "stopLoss" | "takeProfit";

export interface OrderFormState {
  side: OrderSide;
  accountId: string | null;
  unit: OrderFormUnit;
  quantityInput: string;
  amountInput: string;
  type: OrderTypeValue;
  limitPrice: string;
  stopPrice: string;
  timeInForce: TimeInForce;
  stopLossEnabled: boolean;
  stopLossPrice: string;
  takeProfitEnabled: boolean;
  takeProfitPrice: string;
}

export interface OrderFormInputs {
  symbol: string;
  lastPrice: DecimalValue | null;
  fractionable: boolean;
  shortable: boolean;
  positionQuantity: DecimalValue;
}

export interface VisibleFields {
  limitPrice: boolean;
  stopPrice: boolean;
}

export type OrderFormErrors = Record<string, string>;

export type OrderFormAction =
  | { kind: "setSide"; side: OrderSide; lastPrice: DecimalValue | null }
  | { kind: "setAccountId"; accountId: string }
  | { kind: "setUnit"; unit: OrderFormUnit }
  | { kind: "setQuantityInput"; value: string }
  | { kind: "setAmountInput"; value: string }
  | { kind: "setType"; orderType: OrderTypeValue; lastPrice: DecimalValue | null }
  | { kind: "setLimitPrice"; value: string }
  | { kind: "setStopPrice"; value: string }
  | { kind: "setTimeInForce"; timeInForce: TimeInForce }
  | { kind: "setStopLossPrice"; value: string }
  | { kind: "setTakeProfitPrice"; value: string }
  | { kind: "toggleStopLoss"; enabled: boolean; lastPrice: DecimalValue | null }
  | { kind: "toggleTakeProfit"; enabled: boolean; lastPrice: DecimalValue | null };

const DECIMAL_INPUT = /^\d+(\.\d+)?$/;
const STOP_LOSS_FACTOR: Record<OrderSide, string> = { BUY: "0.95", SELL: "1.05" };
const TAKE_PROFIT_FACTOR: Record<OrderSide, string> = { BUY: "1.05", SELL: "0.95" };

export function parseDecimalInput(value: string): DecimalValue | null {
  const trimmed = value.trim();

  return DECIMAL_INPUT.test(trimmed) ? new Decimal(trimmed) : null;
}

export function initialOrderFormState(side: OrderSide, accountId: string | null): OrderFormState {
  return {
    side,
    accountId,
    unit: "shares",
    quantityInput: "",
    amountInput: "",
    type: "MARKET",
    limitPrice: "",
    stopPrice: "",
    timeInForce: "GTC",
    stopLossEnabled: false,
    stopLossPrice: "",
    takeProfitEnabled: false,
    takeProfitPrice: "",
  };
}

export function visibleFields(type: OrderTypeValue): VisibleFields {
  return {
    limitPrice: type === "LIMIT" || type === "STOP_LIMIT",
    stopPrice: type === "STOP" || type === "STOP_LIMIT",
  };
}

export function estimationPrice(state: OrderFormState, lastPrice: DecimalValue | null): DecimalValue | null {
  if (state.type === "LIMIT" || state.type === "STOP_LIMIT") {
    return parseDecimalInput(state.limitPrice) ?? lastPrice;
  }

  return lastPrice;
}

function bracketDefault(entry: DecimalValue | null, factor: string): string {
  return entry === null ? "" : priceToApi(entry.times(factor));
}

function withSide(state: OrderFormState, side: OrderSide, lastPrice: DecimalValue | null): OrderFormState {
  const next = { ...state, side };
  const entry = estimationPrice(next, lastPrice);

  return {
    ...next,
    stopLossPrice: next.stopLossEnabled ? bracketDefault(entry, STOP_LOSS_FACTOR[side]) : next.stopLossPrice,
    takeProfitPrice: next.takeProfitEnabled
      ? bracketDefault(entry, TAKE_PROFIT_FACTOR[side])
      : next.takeProfitPrice,
  };
}

function withType(
  state: OrderFormState,
  orderType: OrderTypeValue,
  lastPrice: DecimalValue | null,
): OrderFormState {
  const visible = visibleFields(orderType);
  const prefill = lastPrice === null ? "" : priceToApi(lastPrice);

  return {
    ...state,
    type: orderType,
    limitPrice: visible.limitPrice && state.limitPrice === "" ? prefill : state.limitPrice,
    stopPrice: visible.stopPrice && state.stopPrice === "" ? prefill : state.stopPrice,
  };
}

function withBracket(
  state: OrderFormState,
  role: BracketRole,
  enabled: boolean,
  lastPrice: DecimalValue | null,
): OrderFormState {
  const current = role === "stopLoss" ? state.stopLossPrice : state.takeProfitPrice;
  const factor = role === "stopLoss" ? STOP_LOSS_FACTOR[state.side] : TAKE_PROFIT_FACTOR[state.side];
  const price = enabled && current === "" ? bracketDefault(estimationPrice(state, lastPrice), factor) : "";
  const value = enabled ? (current === "" ? price : current) : "";

  return role === "stopLoss"
    ? { ...state, stopLossEnabled: enabled, stopLossPrice: value }
    : { ...state, takeProfitEnabled: enabled, takeProfitPrice: value };
}

export function orderFormReducer(state: OrderFormState, action: OrderFormAction): OrderFormState {
  switch (action.kind) {
    case "setSide":
      return withSide(state, action.side, action.lastPrice);
    case "setAccountId":
      return { ...state, accountId: action.accountId };
    case "setUnit":
      return { ...state, unit: action.unit };
    case "setQuantityInput":
      return { ...state, quantityInput: action.value };
    case "setAmountInput":
      return { ...state, amountInput: action.value };
    case "setType":
      return withType(state, action.orderType, action.lastPrice);
    case "setLimitPrice":
      return { ...state, limitPrice: action.value };
    case "setStopPrice":
      return { ...state, stopPrice: action.value };
    case "setTimeInForce":
      return { ...state, timeInForce: action.timeInForce };
    case "setStopLossPrice":
      return { ...state, stopLossPrice: action.value };
    case "setTakeProfitPrice":
      return { ...state, takeProfitPrice: action.value };
    case "toggleStopLoss":
      return withBracket(state, "stopLoss", action.enabled, action.lastPrice);
    case "toggleTakeProfit":
      return withBracket(state, "takeProfit", action.enabled, action.lastPrice);
  }
}
