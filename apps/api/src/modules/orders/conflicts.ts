import { AppError } from "../../lib/errors.js";
import { findOrder } from "./repository.js";

export function orderNotFound(): AppError {
  return new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
}

export function orderNotModifiable(): AppError {
  return new AppError(422, "ORDER_NOT_MODIFIABLE", "This order can no longer be modified.");
}

export function orderNotCancellable(): AppError {
  return new AppError(422, "ORDER_NOT_CANCELLABLE", "This order can no longer be cancelled.");
}

export function versionConflict(): AppError {
  return new AppError(
    409,
    "ORDER_VERSION_CONFLICT",
    "The order changed since it was read; reload it and try again.",
  );
}

/**
 * A conditional write that matched nothing means another writer moved the row first: the re-read
 * separates a stale client version, which the client can recover from, from a decided order.
 */
export async function resolveWriteConflict(
  accountId: string,
  orderId: string,
  version: number,
  onFinalStatus: () => AppError,
): Promise<never> {
  const current = await findOrder(accountId, orderId);

  if (current === null) throw orderNotFound();
  if (current.version !== version) throw versionConflict();

  throw onFinalStatus();
}
