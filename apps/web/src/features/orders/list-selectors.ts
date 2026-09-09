import type { Order, OrdersStatusFilter } from "@stockdesk/shared";

export const ALL_ACCOUNTS = "all";

export interface OrdersFilters {
  status: OrdersStatusFilter;
  accountId: string;
  symbol: string;
}

function statusMatches(order: Order, status: OrdersStatusFilter): boolean {
  if (status === "active") return order.status === "OPEN" || order.status === "TRIGGERED";

  if (status === "filled") return order.status === "FILLED";

  return true;
}

function compareDescending(left: Order, right: Order): number {
  if (left.createdAt !== right.createdAt) return left.createdAt < right.createdAt ? 1 : -1;

  return left.id < right.id ? 1 : -1;
}

export function selectOrders(ordersById: Record<string, Order>, filters: OrdersFilters): Order[] {
  const symbol = filters.symbol.trim().toUpperCase();

  return Object.values(ordersById)
    .filter(
      (order) =>
        statusMatches(order, filters.status) &&
        (filters.accountId === ALL_ACCOUNTS || order.accountId === filters.accountId) &&
        (symbol === "" || order.symbol.startsWith(symbol)),
    )
    .sort(compareDescending);
}

export function selectChildren(ordersById: Record<string, Order>, parentOrderId: string): Order[] {
  return Object.values(ordersById)
    .filter((order) => order.parentOrderId === parentOrderId)
    .sort((left, right) => -compareDescending(left, right));
}
