import {
  orderPreviewResponseSchema,
  placeOrderResponseSchema,
  type OrderPreview,
  type PlaceOrderRequest,
  type PlaceOrderResponse,
} from "@stockdesk/shared";

import { http } from "../../lib/http";

const BASE_PATH = "/api/v1/accounts";

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
