import { useCallback, useMemo, useState } from "react";
import type { ExpectedExecution, PlaceOrderResponse } from "@stockdesk/shared";

import { useSettingsLocale } from "../settings/hooks";
import { useOrderForm, usePlaceOrder, usePreviewOrder, type OrderFormView } from "./hooks";
import {
  insufficientBuyingPowerDetails,
  toOrderErrorKey,
  toOrderSuccessView,
  toOrderSummaryView,
  toQuantityHint,
  toSubmitLabel,
  type BuyingPowerShortfall,
  type OrderSuccessView,
  type OrderSummaryView,
  type QuantityHint,
  type SubmitLabel,
} from "./mappers";

const SIDE_FIELD = "side";

export interface OrderPanelView {
  form: OrderFormView;
  hint: QuantityHint | null;
  summary: OrderSummaryView | null;
  marginRequirement: string | null;
  submitLabel: SubmitLabel;
  errorKey: string | null;
  shortfall: BuyingPowerShortfall | null;
  success: OrderSuccessView | null;
  pending: boolean;
  submit: () => void;
  closeSuccess: () => void;
}

export function useOrderPanel(symbol: string, side: "BUY" | "SELL", onBack: () => void): OrderPanelView {
  const locale = useSettingsLocale();
  const form = useOrderForm(symbol, side);
  const [placed, setPlaced] = useState<PlaceOrderResponse | null>(null);

  const accountId = form.state.accountId;
  const preview = usePreviewOrder(accountId, form.submittable ? form.request : null);
  const mutation = usePlaceOrder();
  const { mutate } = mutation;

  const previewData = preview.data ?? null;
  const expectedExecution: ExpectedExecution | null = previewData?.expectedExecution ?? null;

  const summary = useMemo(
    () => (previewData === null ? null : toOrderSummaryView(previewData, locale)),
    [locale, previewData],
  );

  const request = form.request;
  const submittable = form.submittable;

  const submit = useCallback(() => {
    if (accountId === null || request === null || !submittable) return;

    mutate({ accountId, request }, { onSuccess: (response) => setPlaced(response) });
  }, [accountId, mutate, request, submittable]);

  const closeSuccess = useCallback(() => {
    setPlaced(null);
    onBack();
  }, [onBack]);

  const mutationErrorKey = mutation.error === null ? null : toOrderErrorKey(mutation.error);

  return {
    form,
    hint: toQuantityHint({
      unit: form.state.unit,
      quantity: form.quantity,
      cost: form.cost,
      price: form.price,
      locale,
    }),
    summary,
    marginRequirement: form.opensShort && summary !== null ? summary.reservedCash : null,
    submitLabel: toSubmitLabel({
      side: form.state.side,
      opensShort: form.opensShort,
      quantity: form.quantity,
      symbol: form.inputs.symbol,
      locale,
    }),
    errorKey: mutationErrorKey ?? form.errors[SIDE_FIELD] ?? null,
    shortfall: insufficientBuyingPowerDetails(mutation.error, locale),
    success: placed === null ? null : toOrderSuccessView(placed, expectedExecution, locale),
    pending: mutation.isPending,
    submit,
    closeSuccess,
  };
}
