import { useCallback, useEffect, useMemo } from "react";
import {
  symbolSchema,
  type ModifyOrderRequest,
  type Order,
  type OrderDetailResponse,
} from "@stockdesk/shared";
import { useInfiniteQuery, useMutation, useQuery, type UseMutationResult } from "@tanstack/react-query";

import { getErrorCode } from "../../lib/http";
import { userScopedKey } from "../../lib/query-keys";
import { useCurrentUserId } from "../auth/hooks";
import * as api from "./api";
import { ALL_ACCOUNTS, selectOrders, type OrdersFilters } from "./list-selectors";
import { toOrderErrorKey } from "./mappers";
import { useOrdersStore } from "./store";

export { ALL_ACCOUNTS, selectChildren, selectOrders } from "./list-selectors";
export type { OrdersFilters } from "./list-selectors";

const VERSION_CONFLICT_CODE = "ORDER_VERSION_CONFLICT";

export interface OrdersListView {
  orders: Order[];
  hasMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
}

export interface ModifyOrderVariables {
  accountId: string;
  orderId: string;
  request: ModifyOrderRequest;
}

export interface CancelOrderVariables {
  accountId: string;
  orderId: string;
  version: number;
}

export interface OrderReference {
  accountId: string;
  orderId: string;
}

export interface OrderMutationView<V> {
  mutate: (variables: V, onSuccess?: () => void) => void;
  isPending: boolean;
  errorKey: string | null;
  versionConflict: boolean;
  reset: () => void;
}

export interface OrderDetailView {
  detail: OrderDetailResponse | null;
  isLoading: boolean;
}

function queryableSymbol(symbol: string): string | undefined {
  const trimmed = symbol.trim().toUpperCase();

  return trimmed !== "" && symbolSchema.safeParse(trimmed).success ? trimmed : undefined;
}

export function ordersQueryKey(userId: string | null, filters: OrdersFilters): readonly unknown[] {
  return userScopedKey(
    userId,
    "orders",
    filters.status,
    filters.accountId,
    queryableSymbol(filters.symbol) ?? "",
  );
}

export interface OrdersListOptions {
  enabled?: boolean | undefined;
}

export function useOrders(filters: OrdersFilters, options: OrdersListOptions = {}): OrdersListView {
  const userId = useCurrentUserId();
  const upsertOrders = useOrdersStore((state) => state.upsertOrders);
  const ordersById = useOrdersStore((state) => state.ordersById);
  const { status, accountId: selected, symbol: typedSymbol } = filters;
  const symbol = queryableSymbol(typedSymbol);
  const accountId = selected === ALL_ACCOUNTS ? undefined : selected;

  const pages = useInfiniteQuery({
    queryKey: ordersQueryKey(userId, filters),
    queryFn: ({ pageParam }) => {
      const cursor = pageParam === null ? {} : { cursor: pageParam };

      return accountId === undefined
        ? api.listOrders({ status, accountId, symbol, ...cursor })
        : api.listAccountOrders(accountId, { status, symbol, ...cursor });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: options.enabled !== false,
  });

  const loaded = pages.data?.pages;
  const fetched = useMemo(() => (loaded ?? []).flatMap((entry) => entry.orders), [loaded]);

  useEffect(() => {
    if (fetched.length > 0) upsertOrders(fetched);
  }, [fetched, upsertOrders]);

  const orders = useMemo(
    () => selectOrders(ordersById, { status, accountId: selected, symbol: typedSymbol }),
    [ordersById, selected, status, typedSymbol],
  );

  const { hasNextPage, fetchNextPage } = pages;

  const loadMore = useCallback(() => {
    if (!hasNextPage) return;

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage]);

  return { orders, hasMore: hasNextPage, loadMore, isLoading: pages.isLoading };
}

export function isVersionConflict(error: unknown): boolean {
  return getErrorCode(error) === VERSION_CONFLICT_CODE;
}

function toMutationView<T, V>(mutation: UseMutationResult<T, Error, V>): OrderMutationView<V> {
  return {
    mutate: (variables, onSuccess) => {
      if (onSuccess === undefined) {
        mutation.mutate(variables);
        return;
      }

      mutation.mutate(variables, { onSuccess: () => onSuccess() });
    },
    isPending: mutation.isPending,
    errorKey: mutation.error === null ? null : toOrderErrorKey(mutation.error),
    versionConflict: isVersionConflict(mutation.error),
    reset: () => mutation.reset(),
  };
}

export function useModifyOrder(): OrderMutationView<ModifyOrderVariables> {
  const upsertOrders = useOrdersStore((state) => state.upsertOrders);

  return toMutationView(
    useMutation<Order, Error, ModifyOrderVariables>({
      mutationFn: ({ accountId, orderId, request }) => api.modifyOrder(accountId, orderId, request),
      onSuccess: (order) => upsertOrders([order]),
    }),
  );
}

export function useCancelOrder(): OrderMutationView<CancelOrderVariables> {
  const upsertOrders = useOrdersStore((state) => state.upsertOrders);

  return toMutationView(
    useMutation<Order, Error, CancelOrderVariables>({
      mutationFn: ({ accountId, orderId, version }) => api.cancelOrder(accountId, orderId, version),
      onSuccess: (order) => upsertOrders([order]),
    }),
  );
}

export function useReloadOrder(): OrderMutationView<OrderReference> {
  const upsertOrders = useOrdersStore((state) => state.upsertOrders);
  const upsertTrade = useOrdersStore((state) => state.upsertTrade);

  return toMutationView(
    useMutation<OrderDetailResponse, Error, OrderReference>({
      mutationFn: ({ accountId, orderId }) => api.getOrder(accountId, orderId),
      onSuccess: (detail) => {
        upsertOrders([detail.order, ...detail.children]);

        for (const trade of detail.trades) upsertTrade(trade);
      },
    }),
  );
}

export function useOrderDetail(reference: OrderReference | null): OrderDetailView {
  const userId = useCurrentUserId();
  const upsertOrders = useOrdersStore((state) => state.upsertOrders);
  const upsertTrade = useOrdersStore((state) => state.upsertTrade);

  const query = useQuery({
    queryKey: userScopedKey(userId, "order-detail", reference?.accountId ?? null, reference?.orderId ?? null),
    queryFn: () => api.getOrder(reference?.accountId ?? "", reference?.orderId ?? ""),
    enabled: reference !== null,
  });

  const detail = query.data ?? null;

  useEffect(() => {
    if (detail === null) return;

    upsertOrders([detail.order, ...detail.children]);

    for (const trade of detail.trades) upsertTrade(trade);
  }, [detail, upsertOrders, upsertTrade]);

  return { detail, isLoading: query.isLoading };
}
