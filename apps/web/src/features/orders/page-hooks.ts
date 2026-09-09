import { useCallback, useMemo, useState } from "react";
import type { OrdersStatusFilter } from "@stockdesk/shared";

import { useActiveAccountId } from "../accounts/hooks";
import { useAccountsStore } from "../accounts/store";
import { useSettingsLocale } from "../settings/hooks";
import { useOrderDialogs, type OrderDialogsView } from "./dialog-hooks";
import { useOrders } from "./list-hooks";
import { ALL_ACCOUNTS, type OrdersFilters } from "./list-selectors";
import { useOrdersStore } from "./store";
import { toOrderGroups, type OrderGroupView } from "./table-mappers";

export const ORDER_STATUS_FILTERS: readonly OrdersStatusFilter[] = ["active", "filled", "all"];

const NO_ACCOUNT = "__none__";

export interface AccountOption {
  id: string;
  name: string;
}

export interface OrdersTableView {
  groups: OrderGroupView[];
  hasMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
  toggle: (orderId: string) => void;
}

export interface OrdersPageView {
  filters: OrdersFilters;
  statuses: readonly OrdersStatusFilter[];
  accounts: AccountOption[];
  setStatus: (status: OrdersStatusFilter) => void;
  setAccount: (accountId: string) => void;
  setSymbol: (symbol: string) => void;
  table: OrdersTableView;
  dialogs: OrderDialogsView;
}

export interface SymbolOrdersPanelView {
  table: OrdersTableView;
  dialogs: OrderDialogsView;
}

export function useOrdersTable(filters: OrdersFilters, enabled = true): OrdersTableView {
  const locale = useSettingsLocale();
  const list = useOrders(filters, { enabled });
  const ordersById = useOrdersStore((state) => state.ordersById);
  const accounts = useAccountsStore((state) => state.accounts);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const accountNames = useMemo(() => {
    const names: Record<string, string> = {};

    for (const account of accounts) names[account.id] = account.name;

    return names;
  }, [accounts]);

  const groups = useMemo(
    () => toOrderGroups(list.orders, ordersById, { accountNames, expanded, locale }),
    [accountNames, expanded, list.orders, locale, ordersById],
  );

  const toggle = useCallback((orderId: string) => {
    setExpanded((current) => ({ ...current, [orderId]: current[orderId] !== true }));
  }, []);

  return { groups, hasMore: list.hasMore, loadMore: list.loadMore, isLoading: list.isLoading, toggle };
}

export function useOrdersPage(): OrdersPageView {
  const [filters, setFilters] = useState<OrdersFilters>({
    status: "active",
    accountId: ALL_ACCOUNTS,
    symbol: "",
  });
  const stored = useAccountsStore((state) => state.accounts);
  const table = useOrdersTable(filters);
  const dialogs = useOrderDialogs();

  const accounts = useMemo<AccountOption[]>(
    () => stored.map((account) => ({ id: account.id, name: account.name })),
    [stored],
  );

  return {
    filters,
    statuses: ORDER_STATUS_FILTERS,
    accounts,
    setStatus: (status) => setFilters((current) => ({ ...current, status })),
    setAccount: (accountId) => setFilters((current) => ({ ...current, accountId })),
    setSymbol: (symbol) => setFilters((current) => ({ ...current, symbol })),
    table,
    dialogs,
  };
}

export function useSymbolOrdersPanel(symbol: string): SymbolOrdersPanelView {
  const accountId = useActiveAccountId();
  const upper = symbol.toUpperCase();

  const filters = useMemo<OrdersFilters>(
    () => ({ status: "all", accountId: accountId ?? NO_ACCOUNT, symbol: upper }),
    [accountId, upper],
  );

  return { table: useOrdersTable(filters, accountId !== null), dialogs: useOrderDialogs() };
}
