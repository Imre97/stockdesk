import type { OrderDto } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";
import { requireOwnedAccount } from "../accounts/service.js";
import { afterCashChange, currentTime } from "../accounts/snapshot-writer.js";
import { orderNotCancellable, orderNotFound, resolveWriteConflict } from "./conflicts.js";
import type { OrdersDependencies } from "./context.js";
import { publishOrderUpdate } from "./engine-events.js";
import { cancelByUser } from "./order-writes.js";
import { findOrder, findOrderById, isRestingStatus } from "./repository.js";
import { toOrderDto } from "./serializers.js";

export interface CancelResult {
  order: OrderDto;
}

/**
 * Only a fill cancels an OCO sibling, so a user cancel touches the one row it names: the surviving
 * sibling keeps protecting the position until it fills, is cancelled on its own, or the position
 * closes underneath it.
 */
export async function cancelOrder(
  userId: string,
  accountId: string,
  orderId: string,
  version: number,
  dependencies: OrdersDependencies,
): Promise<CancelResult> {
  const account = await requireOwnedAccount(userId, accountId);
  const order = await findOrder(account.id, orderId);

  if (order === null) throw orderNotFound();
  if (!isRestingStatus(order.status)) throw orderNotCancellable();

  const at = currentTime(dependencies.accounts);

  if ((await cancelByUser(prisma, order.id, version, at)) === 0) {
    await resolveWriteConflict(account.id, order.id, version, orderNotCancellable);
  }

  const cancelled = (await findOrderById(prisma, order.id)) ?? order;

  dependencies.engine.indexRemove(order.id);
  publishOrderUpdate(dependencies.accounts, userId, toOrderDto(cancelled));
  await afterCashChange(userId, dependencies.accounts);

  return { order: toOrderDto(cancelled) };
}
