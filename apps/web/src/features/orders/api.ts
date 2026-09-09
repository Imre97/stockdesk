import {
  orderDetailResponseSchema,
  orderPreviewResponseSchema,
  orderSchema,
  ordersResponseSchema,
  placeOrderResponseSchema,
  type ModifyOrderRequest,
  type Order,
  type OrderDetailResponse,
  type OrderPreview,
  type OrdersResponse,
  type OrdersStatusFilter,
  type PlaceOrderRequest,
  type PlaceOrderResponse,
} from "@stockdesk/shared";

import { http } from "../../lib/http";

const BASE_PATH = "/api/v1/accounts";
const ORDERS_PATH = "/api/v1/orders";

export interface OrdersPageQuery {
  status?: OrdersStatusFilter | undefined;
  accountId?: string | undefined;
  symbol?: string | undefined;
  limit?: number | undefined;
  cursor?: string | undefined;
}

function withQuery(path: string, params: [string, string | undefined][]): string {
  const search = new URLSearchParams();

  for (const [key, value] of params) {
    if (value !== undefined) search.set(key, value);
  }

  const query = search.toString();

  return query === "" ? path : `${path}?${query}`;
}

function count(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function ordersQueryParams(query: OrdersPageQuery): [string, string | undefined][] {
  return [
    ["status", query.status],
    ["accountId", query.accountId],
    ["symbol", query.symbol?.toUpperCase()],
    ["limit", count(query.limit)],
    ["cursor", query.cursor],
  ];
}

function parseOrderEnvelope(json: unknown): Order {
  return orderSchema.parse((json as { order?: unknown }).order);
}

export async function previewOrder(accountId: string, request: PlaceOrderRequest): Promise<OrderPreview> {
  const response = await http(`${BASE_PATH}/${accountId}/orders/preview`, {
    method: "POST",
    json: request,
    parse: (json) => orderPreviewResponseSchema.parse(json),
  });

  return response.preview;
}

export function placeOrder(accountId: string, request: PlaceOrderRequest): Promise<PlaceOrderResponse> {
  return http<PlaceOrderResponse>(`${BASE_PATH}/${accountId}/orders`, {
    method: "POST",
    json: request,
    parse: (json) => placeOrderResponseSchema.parse(json),
  });
}

export function listOrders(query: OrdersPageQuery): Promise<OrdersResponse> {
  return http<OrdersResponse>(withQuery(ORDERS_PATH, ordersQueryParams(query)), {
    method: "GET",
    parse: (json) => ordersResponseSchema.parse(json),
  });
}

export function listAccountOrders(accountId: string, query: OrdersPageQuery): Promise<OrdersResponse> {
  return http<OrdersResponse>(
    withQuery(`${BASE_PATH}/${accountId}/orders`, ordersQueryParams({ ...query, accountId: undefined })),
    { method: "GET", parse: (json) => ordersResponseSchema.parse(json) },
  );
}

export function getOrder(accountId: string, orderId: string): Promise<OrderDetailResponse> {
  return http<OrderDetailResponse>(`${BASE_PATH}/${accountId}/orders/${orderId}`, {
    method: "GET",
    parse: (json) => orderDetailResponseSchema.parse(json),
  });
}

export function modifyOrder(
  accountId: string,
  orderId: string,
  request: ModifyOrderRequest,
): Promise<Order> {
  return http<Order>(`${BASE_PATH}/${accountId}/orders/${orderId}`, {
    method: "PATCH",
    json: request,
    parse: parseOrderEnvelope,
  });
}

export function cancelOrder(accountId: string, orderId: string, version: number): Promise<Order> {
  return http<Order>(`${BASE_PATH}/${accountId}/orders/${orderId}`, {
    method: "DELETE",
    json: { version },
    parse: parseOrderEnvelope,
  });
}
