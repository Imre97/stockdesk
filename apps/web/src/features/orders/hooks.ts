import { useCallback, useMemo, useReducer } from "react";
import type {
  DecimalValue,
  OrderPreview,
  OrderSide,
  OrderTypeValue,
  PlaceOrderRequest,
  PlaceOrderResponse,
  TimeInForce,
} from "@stockdesk/shared";
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { userScopedKey } from "../../lib/query-keys";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useAccounts, useActiveAccountId, useSelectAccount } from "../accounts/hooks";
import { useAccountsStore } from "../accounts/store";
import type { AccountViewModel } from "../accounts/mappers";
import { useCurrentUserId } from "../auth/hooks";
import { useQuote, useSymbolDetail } from "../market/hooks";
import { usePositionQuantity } from "../positions/hooks";
import { usePositionsStore } from "../positions/store";
import * as api from "./api";
import {
  estimationPrice,
  initialOrderFormState,
  orderFormReducer,
  visibleFields,
  type OrderFormErrors,
  type OrderFormInputs,
  type OrderFormState,
  type OrderFormUnit,
  type VisibleFields,
} from "./order-form";
import {
  bracketsAllowed,
  estimatedCost,
  isSubmittable,
  opensShort,
  resolvedQuantity,
  toPlaceOrderRequest,
  validate,
} from "./order-form-selectors";
import { useOrdersStore } from "./store";

export const PREVIEW_DEBOUNCE_MS = 300;

export interface OrderFormView {
  state: OrderFormState;
  inputs: OrderFormInputs;
  errors: OrderFormErrors;
  visible: VisibleFields;
  quantity: DecimalValue | null;
  cost: DecimalValue | null;
  price: DecimalValue | null;
  bracketsAllowed: boolean;
  opensShort: boolean;
  request: PlaceOrderRequest | null;
  submittable: boolean;
  accounts: AccountViewModel[];
  selectAccount: (accountId: string) => void;
  setSide: (side: OrderSide) => void;
  setUnit: (unit: OrderFormUnit) => void;
  setQuantityInput: (value: string) => void;
  setAmountInput: (value: string) => void;
  setType: (orderType: OrderTypeValue) => void;
  setLimitPrice: (value: string) => void;
  setStopPrice: (value: string) => void;
  setTimeInForce: (timeInForce: TimeInForce) => void;
  setStopLossPrice: (value: string) => void;
  setTakeProfitPrice: (value: string) => void;
  toggleStopLoss: (enabled: boolean) => void;
  toggleTakeProfit: (enabled: boolean) => void;
}

export interface PlaceOrderVariables {
  accountId: string;
  request: PlaceOrderRequest;
}

export function orderPreviewQueryKey(
  userId: string | null,
  accountId: string | null,
  request: string | null,
): readonly unknown[] {
  return userScopedKey(userId, "order-preview", accountId, request);
}

/**
 * The panel's account select is the global active account (module spec decision 3), so the
 * reducer's own account field is overwritten with it instead of holding a second copy.
 */
export function useOrderForm(symbol: string, side: OrderSide): OrderFormView {
  const upper = symbol.toUpperCase();
  const activeAccountId = useActiveAccountId();
  const selectAccount = useSelectAccount();
  const { accounts } = useAccounts();
  const detail = useSymbolDetail(upper).data ?? null;
  const quote = useQuote(upper);
  const positionQuantity = usePositionQuantity(activeAccountId, upper);
  const [raw, dispatch] = useReducer(orderFormReducer, side, (initial) =>
    initialOrderFormState(initial, activeAccountId),
  );

  const state = useMemo(() => ({ ...raw, accountId: activeAccountId }), [activeAccountId, raw]);

  const inputs = useMemo<OrderFormInputs>(
    () => ({
      symbol: upper,
      lastPrice: quote?.price ?? detail?.quote?.last ?? null,
      fractionable: detail?.fractionable ?? true,
      shortable: detail?.shortable ?? true,
      positionQuantity,
    }),
    [detail, positionQuantity, quote, upper],
  );

  const lastPrice = inputs.lastPrice;

  const setSide = useCallback((next: OrderSide) => dispatch({ kind: "setSide", side: next, lastPrice }), [
    lastPrice,
  ]);
  const setType = useCallback(
    (orderType: OrderTypeValue) => dispatch({ kind: "setType", orderType, lastPrice }),
    [lastPrice],
  );
  const toggleStopLoss = useCallback(
    (enabled: boolean) => dispatch({ kind: "toggleStopLoss", enabled, lastPrice }),
    [lastPrice],
  );
  const toggleTakeProfit = useCallback(
    (enabled: boolean) => dispatch({ kind: "toggleTakeProfit", enabled, lastPrice }),
    [lastPrice],
  );

  return {
    state,
    inputs,
    errors: validate(state, inputs),
    visible: visibleFields(state.type),
    quantity: resolvedQuantity(state, inputs),
    cost: estimatedCost(state, inputs),
    price: estimationPrice(state, inputs.lastPrice),
    bracketsAllowed: bracketsAllowed(state, inputs),
    opensShort: opensShort(state, inputs),
    request: toPlaceOrderRequest(state, inputs),
    submittable: isSubmittable(state, inputs),
    accounts,
    selectAccount,
    setSide,
    setType,
    toggleStopLoss,
    toggleTakeProfit,
    setUnit: (unit) => dispatch({ kind: "setUnit", unit }),
    setQuantityInput: (value) => dispatch({ kind: "setQuantityInput", value }),
    setAmountInput: (value) => dispatch({ kind: "setAmountInput", value }),
    setLimitPrice: (value) => dispatch({ kind: "setLimitPrice", value }),
    setStopPrice: (value) => dispatch({ kind: "setStopPrice", value }),
    setTimeInForce: (timeInForce) => dispatch({ kind: "setTimeInForce", timeInForce }),
    setStopLossPrice: (value) => dispatch({ kind: "setStopLossPrice", value }),
    setTakeProfitPrice: (value) => dispatch({ kind: "setTakeProfitPrice", value }),
  };
}

export function usePreviewOrder(
  accountId: string | null,
  request: PlaceOrderRequest | null,
): UseQueryResult<OrderPreview> {
  const userId = useCurrentUserId();
  const serialized = request === null ? null : JSON.stringify(request);
  const debounced = useDebouncedValue(serialized, PREVIEW_DEBOUNCE_MS);

  return useQuery({
    queryKey: orderPreviewQueryKey(userId, accountId, debounced),
    queryFn: () => api.previewOrder(accountId ?? "", JSON.parse(debounced ?? "null") as PlaceOrderRequest),
    enabled: accountId !== null && debounced !== null,
  });
}

export function usePlaceOrder(): UseMutationResult<PlaceOrderResponse, Error, PlaceOrderVariables> {
  const upsertOrders = useOrdersStore((state) => state.upsertOrders);
  const upsertTrade = useOrdersStore((state) => state.upsertTrade);
  const upsertPosition = usePositionsStore((state) => state.upsertPosition);
  const upsertAccount = useAccountsStore((state) => state.upsertAccount);

  return useMutation<PlaceOrderResponse, Error, PlaceOrderVariables>({
    mutationFn: ({ accountId, request }) => api.placeOrder(accountId, request),
    onSuccess: (response) => {
      upsertOrders([response.order]);

      if (response.trade !== undefined) upsertTrade(response.trade);
      if (response.position !== undefined) upsertPosition(response.position);

      upsertAccount(response.account);
    },
  });
}
