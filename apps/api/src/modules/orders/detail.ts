import type { OrderDetailResponseDto } from "@stockdesk/shared";
import { requireOwnedAccount } from "../accounts/service.js";
import { orderNotFound } from "./conflicts.js";
import { findOrder, listChildren } from "./repository.js";
import { toOrderDto, toTradeDto } from "./serializers.js";
import { listOrderTrades } from "./trades-repository.js";

export async function getOrderDetail(
  userId: string,
  accountId: string,
  orderId: string,
): Promise<OrderDetailResponseDto> {
  const account = await requireOwnedAccount(userId, accountId);
  const order = await findOrder(account.id, orderId);

  if (order === null) throw orderNotFound();

  const [children, trades] = await Promise.all([
    listChildren(order.id),
    listOrderTrades(order.id),
  ]);

  return {
    order: toOrderDto(order),
    children: children.map(toOrderDto),
    trades: trades.map(toTradeDto),
  };
}
