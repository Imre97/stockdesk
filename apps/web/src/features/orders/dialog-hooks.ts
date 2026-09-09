import { useMemo, useState } from "react";
import type { Order, TimeInForce } from "@stockdesk/shared";

import { useAccountsStore } from "../accounts/store";
import type { TradeRowView } from "../market/panel-mappers";
import { useSettingsLocale } from "../settings/hooks";
import {
  useCancelOrder,
  useModifyOrder,
  useOrderDetail,
  useReloadOrder,
  type OrderReference,
} from "./list-hooks";
import { selectChildren } from "./list-selectors";
import {
  hasModifyChanges,
  initialModifyForm,
  modifyErrors,
  toModifyRequest,
  toOrderRow,
  type ModifiableFields,
  type ModifyFormErrors,
  type ModifyFormState,
  type ModifyFormValues,
} from "./row-mappers";
import { useOrdersStore } from "./store";
import { toOrderTradeRow } from "./table-mappers";

export type ModifyTextField = Exclude<keyof ModifyFormValues, "timeInForce">;

export interface ModifyDialogView {
  values: ModifyFormValues;
  editable: ModifiableFields;
  errors: ModifyFormErrors;
  description: DialogDescription;
  submittable: boolean;
  pending: boolean;
  errorKey: string | null;
  versionConflict: boolean;
  setValue: (field: ModifyTextField, value: string) => void;
  setTimeInForce: (timeInForce: TimeInForce) => void;
  submit: () => void;
  reload: () => void;
  close: () => void;
}

export interface DialogDescription {
  sideKey: string;
  quantity: string;
  symbol: string;
}

export interface CancelDialogView {
  description: DialogDescription;
  pending: boolean;
  errorKey: string | null;
  confirm: () => void;
  close: () => void;
}

export interface DetailsDrawerView {
  description: DialogDescription;
  fields: DetailField[];
  children: DetailChild[];
  trades: TradeRowView[];
  isLoading: boolean;
  close: () => void;
}

export interface DetailField {
  labelKey: string;
  value: string | null;
  valueKey: string | null;
}

export interface DetailChild {
  id: string;
  roleBadgeKey: string | null;
  statusKey: string;
  typeKey: string;
  quantity: string;
  price: string | null;
}

export interface OrderDialogsView {
  modify: ModifyDialogView | null;
  cancel: CancelDialogView | null;
  details: DetailsDrawerView | null;
  openModify: (orderId: string) => void;
  openCancel: (orderId: string) => void;
  openDetails: (orderId: string) => void;
}

function describe(order: Order, locale: string, accountName: string | null): DialogDescription {
  const row = toOrderRow(order, locale, { accountName, childCount: 0 });

  return { sideKey: row.sideKey, quantity: row.quantity, symbol: row.symbol };
}

function detailFields(order: Order, locale: string, accountName: string | null): DetailField[] {
  const row = toOrderRow(order, locale, { accountName, childCount: 0 });

  return [
    { labelKey: "table.columns.createdAt", value: row.createdAt, valueKey: null },
    { labelKey: "table.columns.account", value: row.accountName, valueKey: null },
    { labelKey: "table.columns.side", value: null, valueKey: row.sideKey },
    { labelKey: "table.columns.type", value: null, valueKey: row.typeKey },
    { labelKey: "table.columns.status", value: null, valueKey: row.statusKey },
    { labelKey: "table.columns.quantity", value: row.quantity, valueKey: null },
    { labelKey: "table.columns.limitPrice", value: row.limitPrice, valueKey: null },
    { labelKey: "table.columns.stopPrice", value: row.stopPrice, valueKey: null },
    { labelKey: "table.columns.filledPrice", value: row.filledPrice, valueKey: null },
    { labelKey: "table.columns.filledAt", value: row.filledAt, valueKey: null },
    { labelKey: "table.columns.timeInForce", value: null, valueKey: row.timeInForceKey },
  ];
}

function detailChildren(children: Order[], locale: string): DetailChild[] {
  return children.map((child) => {
    const row = toOrderRow(child, locale, { accountName: null, childCount: 0 });

    return {
      id: row.id,
      roleBadgeKey: row.roleBadgeKey,
      statusKey: row.statusKey,
      typeKey: row.typeKey,
      quantity: row.quantity,
      price: row.stopPrice ?? row.limitPrice,
    };
  });
}

export function useOrderDialogs(): OrderDialogsView {
  const locale = useSettingsLocale();
  const ordersById = useOrdersStore((state) => state.ordersById);
  const accounts = useAccountsStore((state) => state.accounts);
  const [modifyId, setModifyId] = useState<string | null>(null);
  const [form, setForm] = useState<ModifyFormState | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const modifyOrder = useModifyOrder();
  const cancelOrder = useCancelOrder();
  const reloadOrder = useReloadOrder();

  const accountName = (accountId: string): string | null =>
    accounts.find((account) => account.id === accountId)?.name ?? null;

  const modifyTarget = modifyId === null ? undefined : ordersById[modifyId];
  const cancelTarget = cancelId === null ? undefined : ordersById[cancelId];
  const detailsTarget = detailsId === null ? undefined : ordersById[detailsId];

  const reference: OrderReference | null =
    detailsTarget === undefined ? null : { accountId: detailsTarget.accountId, orderId: detailsTarget.id };
  const detail = useOrderDetail(reference);

  const children = useMemo(
    () => (detailsId === null ? [] : selectChildren(ordersById, detailsId)),
    [detailsId, ordersById],
  );

  const trades = useMemo(
    () => (detail.detail?.trades ?? []).map((trade) => toOrderTradeRow(trade, locale)),
    [detail.detail, locale],
  );

  const closeModify = () => {
    setModifyId(null);
    setForm(null);
    modifyOrder.reset();
    reloadOrder.reset();
  };

  const openModify = (orderId: string) => {
    const order = useOrdersStore.getState().ordersById[orderId];

    if (order === undefined) return;

    modifyOrder.reset();
    reloadOrder.reset();
    setModifyId(orderId);
    setForm(initialModifyForm(order));
  };

  const errors = form === null ? {} : modifyErrors(form);
  const pending = modifyOrder.isPending || reloadOrder.isPending;

  const modify: ModifyDialogView | null =
    form === null || modifyTarget === undefined
      ? null
      : {
          values: form.values,
          editable: form.editable,
          errors,
          description: describe(modifyTarget, locale, accountName(modifyTarget.accountId)),
          submittable: hasModifyChanges(form) && Object.keys(errors).length === 0 && !pending,
          pending,
          errorKey: modifyOrder.errorKey ?? reloadOrder.errorKey,
          versionConflict: modifyOrder.versionConflict,
          setValue: (field, value) =>
            setForm((current) =>
              current === null ? current : { ...current, values: { ...current.values, [field]: value } },
            ),
          setTimeInForce: (timeInForce) =>
            setForm((current) =>
              current === null ? current : { ...current, values: { ...current.values, timeInForce } },
            ),
          submit: () =>
            modifyOrder.mutate(
              {
                accountId: modifyTarget.accountId,
                orderId: modifyTarget.id,
                request: toModifyRequest(form, modifyTarget.version),
              },
              closeModify,
            ),
          reload: () =>
            reloadOrder.mutate({ accountId: modifyTarget.accountId, orderId: modifyTarget.id }, () => {
              const fresh = useOrdersStore.getState().ordersById[modifyTarget.id];

              if (fresh !== undefined) setForm(initialModifyForm(fresh));

              modifyOrder.reset();
            }),
          close: closeModify,
        };

  const closeCancel = () => {
    setCancelId(null);
    cancelOrder.reset();
  };

  const cancel: CancelDialogView | null =
    cancelTarget === undefined
      ? null
      : {
          description: describe(cancelTarget, locale, accountName(cancelTarget.accountId)),
          pending: cancelOrder.isPending,
          errorKey: cancelOrder.errorKey,
          confirm: () =>
            cancelOrder.mutate(
              {
                accountId: cancelTarget.accountId,
                orderId: cancelTarget.id,
                version: cancelTarget.version,
              },
              closeCancel,
            ),
          close: closeCancel,
        };

  const details: DetailsDrawerView | null =
    detailsTarget === undefined
      ? null
      : {
          description: describe(detailsTarget, locale, accountName(detailsTarget.accountId)),
          fields: detailFields(detailsTarget, locale, accountName(detailsTarget.accountId)),
          children: detailChildren(children, locale),
          trades,
          isLoading: detail.isLoading,
          close: () => setDetailsId(null),
        };

  return {
    modify,
    cancel,
    details,
    openModify,
    openCancel: (orderId) => {
      cancelOrder.reset();
      setCancelId(orderId);
    },
    openDetails: (orderId) => setDetailsId(orderId),
  };
}
