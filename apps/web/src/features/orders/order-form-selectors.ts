import {
  Decimal,
  MIN_QUANTITY,
  QUANTITY_DECIMALS,
  estimateCost as estimateOrderCost,
  placeOrderSchema,
  positionEffect,
  priceToApi,
  quantityToApi,
  sharesFromAmount,
  validateBracketPrices,
  type DecimalValue,
  type OrderSide,
  type PlaceOrderRequest,
  type PositionEffect,
} from "@stockdesk/shared";

import {
  estimationPrice,
  parseDecimalInput,
  visibleFields,
  type BracketRole,
  type OrderFormErrors,
  type OrderFormInputs,
  type OrderFormState,
} from "./order-form";

const NAMESPACE = "orders";
const OPENING_EFFECTS: readonly PositionEffect[] = [
  "open_long",
  "increase_long",
  "open_short",
  "increase_short",
];
const SHORT_OPENING_EFFECTS: readonly PositionEffect[] = ["open_short", "increase_short"];
const BRACKET_FIELDS: Record<BracketRole, string> = {
  stopLoss: "stopLossPrice",
  takeProfit: "takeProfitPrice",
};

function errorKey(name: string): string {
  return `${NAMESPACE}:errors.${name}`;
}

const FIELD_ERROR_KEYS: Record<string, string> = {
  quantity: errorKey("field.quantity"),
  amount: errorKey("field.amount"),
  limitPrice: errorKey("field.limitPrice"),
  stopPrice: errorKey("field.stopPrice"),
  stopLossPrice: errorKey("field.stopLossPrice"),
  takeProfitPrice: errorKey("field.takeProfitPrice"),
};

export const GENERIC_FIELD_ERROR_KEY = errorKey("field.generic");

export function resolvedQuantity(state: OrderFormState, inputs: OrderFormInputs): DecimalValue | null {
  const price = estimationPrice(state, inputs.lastPrice);

  if (state.unit === "usd") {
    const amount = parseDecimalInput(state.amountInput);

    if (amount === null || price === null || price.lessThanOrEqualTo(0)) return null;

    const shares = sharesFromAmount(amount, price, inputs.fractionable);

    return shares.greaterThan(0) ? shares : null;
  }

  const parsed = parseDecimalInput(state.quantityInput);

  if (parsed === null || parsed.lessThanOrEqualTo(0)) return null;
  if (parsed.decimalPlaces() > QUANTITY_DECIMALS) return null;
  if (!inputs.fractionable && parsed.decimalPlaces() > 0) return null;

  return parsed;
}

export function estimatedCost(state: OrderFormState, inputs: OrderFormInputs): DecimalValue | null {
  const quantity = resolvedQuantity(state, inputs);
  const price = estimationPrice(state, inputs.lastPrice);

  return quantity === null || price === null ? null : estimateOrderCost(quantity, price);
}

export function effectOf(state: OrderFormState, inputs: OrderFormInputs): PositionEffect {
  const quantity = resolvedQuantity(state, inputs) ?? new Decimal(MIN_QUANTITY);

  return positionEffect(inputs.positionQuantity, state.side, quantity);
}

export function bracketsAllowed(state: OrderFormState, inputs: OrderFormInputs): boolean {
  return OPENING_EFFECTS.includes(effectOf(state, inputs));
}

export function opensShort(state: OrderFormState, inputs: OrderFormInputs): boolean {
  return state.side === "SELL" && SHORT_OPENING_EFFECTS.includes(effectOf(state, inputs));
}

function bracketPriceFor(enabled: boolean, value: string): string | null {
  if (!enabled) return null;

  const price = parseDecimalInput(value);

  return price === null ? null : priceToApi(price);
}

function buildRequest(
  state: OrderFormState,
  inputs: OrderFormInputs,
  quantity: DecimalValue,
): PlaceOrderRequest {
  const visible = visibleFields(state.type);
  const limit = parseDecimalInput(state.limitPrice);
  const stop = parseDecimalInput(state.stopPrice);
  const allowed = bracketsAllowed(state, inputs);

  return {
    symbol: inputs.symbol,
    side: state.side,
    type: state.type,
    quantity: quantityToApi(quantity),
    limitPrice: visible.limitPrice && limit !== null ? priceToApi(limit) : null,
    stopPrice: visible.stopPrice && stop !== null ? priceToApi(stop) : null,
    timeInForce: state.timeInForce,
    stopLossPrice: bracketPriceFor(state.stopLossEnabled && allowed, state.stopLossPrice),
    takeProfitPrice: bracketPriceFor(state.takeProfitEnabled && allowed, state.takeProfitPrice),
  };
}

export function toPlaceOrderRequest(
  state: OrderFormState,
  inputs: OrderFormInputs,
): PlaceOrderRequest | null {
  const quantity = resolvedQuantity(state, inputs);

  return quantity === null ? null : buildRequest(state, inputs, quantity);
}

function paramsCode(issue: unknown): string | null {
  if (typeof issue !== "object" || issue === null || !("params" in issue)) return null;

  const params = (issue as { params?: unknown }).params;

  if (typeof params !== "object" || params === null) return null;

  const code = (params as Record<string, unknown>)["code"];

  return typeof code === "string" ? code : null;
}

function assignSchemaErrors(errors: OrderFormErrors, request: PlaceOrderRequest): void {
  const result = placeOrderSchema.safeParse(request);

  if (result.success) return;

  for (const issue of result.error.issues) {
    const field = issue.path[0];

    if (typeof field !== "string" || errors[field] !== undefined) continue;

    const code = paramsCode(issue);

    errors[field] =
      code === "INVALID_STOP_LIMIT_PRICES"
        ? errorKey(code)
        : (FIELD_ERROR_KEYS[field] ?? GENERIC_FIELD_ERROR_KEY);
  }
}

function assignQuantityError(errors: OrderFormErrors, state: OrderFormState, inputs: OrderFormInputs): void {
  if (state.unit === "usd") {
    errors["amount"] = FIELD_ERROR_KEYS["amount"] ?? GENERIC_FIELD_ERROR_KEY;
    return;
  }

  const parsed = parseDecimalInput(state.quantityInput);
  const fractional = parsed !== null && parsed.decimalPlaces() > 0;

  errors["quantity"] =
    fractional && !inputs.fractionable
      ? errorKey("FRACTIONAL_NOT_ALLOWED")
      : (FIELD_ERROR_KEYS["quantity"] ?? GENERIC_FIELD_ERROR_KEY);
}

function assignShortErrors(
  errors: OrderFormErrors,
  state: OrderFormState,
  inputs: OrderFormInputs,
  quantity: DecimalValue | null,
): void {
  if (!opensShort(state, inputs)) return;

  if (!inputs.shortable) {
    errors["side"] ??= errorKey("SYMBOL_NOT_SHORTABLE");
    return;
  }

  if (quantity !== null && quantity.decimalPlaces() > 0) {
    errors["quantity"] ??= errorKey("FRACTIONAL_SHORT_NOT_ALLOWED");
  }
}

function bracketInvalid(
  side: OrderSide,
  entry: DecimalValue,
  price: DecimalValue,
  role: BracketRole,
): boolean {
  const prices = role === "stopLoss" ? { stopLossPrice: price } : { takeProfitPrice: price };

  return validateBracketPrices({ side, entryPrice: entry, ...prices }) !== null;
}

function assignBracketError(
  errors: OrderFormErrors,
  state: OrderFormState,
  inputs: OrderFormInputs,
  role: BracketRole,
): void {
  const enabled = role === "stopLoss" ? state.stopLossEnabled : state.takeProfitEnabled;
  const field = BRACKET_FIELDS[role];

  if (!enabled) return;

  if (!bracketsAllowed(state, inputs)) {
    errors[field] ??= errorKey("BRACKET_NOT_ALLOWED");
    return;
  }

  const price = parseDecimalInput(role === "stopLoss" ? state.stopLossPrice : state.takeProfitPrice);
  const entry = estimationPrice(state, inputs.lastPrice);

  if (price === null) {
    errors[field] ??= FIELD_ERROR_KEYS[field] ?? GENERIC_FIELD_ERROR_KEY;
    return;
  }

  if (entry !== null && bracketInvalid(state.side, entry, price, role)) {
    errors[field] ??= errorKey("INVALID_BRACKET_PRICE");
  }
}

export function validate(state: OrderFormState, inputs: OrderFormInputs): OrderFormErrors {
  const errors: OrderFormErrors = {};
  const quantity = resolvedQuantity(state, inputs);

  if (quantity === null) assignQuantityError(errors, state, inputs);

  assignSchemaErrors(errors, buildRequest(state, inputs, quantity ?? new Decimal(MIN_QUANTITY)));
  assignShortErrors(errors, state, inputs, quantity);
  assignBracketError(errors, state, inputs, "stopLoss");
  assignBracketError(errors, state, inputs, "takeProfit");

  return errors;
}

export function isSubmittable(state: OrderFormState, inputs: OrderFormInputs): boolean {
  if (state.accountId === null || resolvedQuantity(state, inputs) === null) return false;

  return Object.keys(validate(state, inputs)).length === 0;
}
