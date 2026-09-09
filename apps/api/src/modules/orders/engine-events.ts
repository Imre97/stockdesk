import type { OrderDto, PositionRecordDto, TradeDto } from "@stockdesk/shared";
import { afterCashChange, type AccountsDependencies } from "../accounts/snapshot-writer.js";

export interface FillMessages {
  userId: string;
  trade: TradeDto;
  order: OrderDto;
  children: OrderDto[];
  position: PositionRecordDto;
}

export function publishOrderUpdate(
  accounts: AccountsDependencies,
  userId: string,
  order: OrderDto,
): void {
  accounts.broadcast?.(userId, { type: "order_update", order });
}

/**
 * The emission order the module spec fixes: the trade, the filled order, every child the fill
 * created or cancelled, the position, and last the account summary written by the snapshot path.
 */
export async function publishFill(
  accounts: AccountsDependencies,
  messages: FillMessages,
): Promise<void> {
  const broadcast = accounts.broadcast;

  if (broadcast !== undefined) {
    broadcast(messages.userId, { type: "trade", trade: messages.trade });
    broadcast(messages.userId, { type: "order_update", order: messages.order });

    for (const child of messages.children) {
      broadcast(messages.userId, { type: "order_update", order: child });
    }

    broadcast(messages.userId, { type: "position_update", position: messages.position });
  }

  await afterCashChange(messages.userId, accounts);
}
