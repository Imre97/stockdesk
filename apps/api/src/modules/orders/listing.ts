import type {
  OrderStatus,
  OrdersQuery,
  OrdersResponseDto,
  TradesQuery,
  TradesResponseDto,
} from "@stockdesk/shared";
import { listAccounts } from "../accounts/repository.js";
import { requireOwnedAccount } from "../accounts/service.js";
import { encodeKeysetCursor, requireCursor } from "./cursor.js";
import { listOrdersPage, RESTING_STATUSES, type OrderRow } from "./repository.js";
import { toOrderDto, toTradeDto } from "./serializers.js";
import { listTradesPage } from "./trades-repository.js";

const FILLED_STATUSES: readonly OrderStatus[] = ["FILLED"];

function statusesFor(status: OrdersQuery["status"]): readonly OrderStatus[] | undefined {
  if (status === "active") return RESTING_STATUSES;
  if (status === "filled") return FILLED_STATUSES;

  return undefined;
}

function nextCursorOf<T>(rows: T[], limit: number, key: (row: T) => [Date, string]): string | null {
  if (rows.length <= limit) return null;

  const last = rows[limit - 1];
  if (last === undefined) return null;

  const [at, id] = key(last);

  return encodeKeysetCursor(at, id);
}

async function scopeOf(userId: string, query: OrdersQuery): Promise<string[]> {
  if (query.accountId !== undefined) {
    return [(await requireOwnedAccount(userId, query.accountId)).id];
  }

  return (await listAccounts(userId)).map((account) => account.id);
}

/**
 * One page is read with `limit + 1` rows: the extra row proves another page exists without a count
 * query, and the cursor is taken from the last row that is actually returned.
 */
export async function listOrders(
  userId: string,
  query: OrdersQuery,
  scopedAccountId?: string,
): Promise<OrdersResponseDto> {
  const accountIds =
    scopedAccountId === undefined
      ? await scopeOf(userId, query)
      : [(await requireOwnedAccount(userId, scopedAccountId)).id];

  const cursor = requireCursor(query.cursor);
  const rows = await listOrdersPage(
    { accountIds, statuses: statusesFor(query.status), symbol: query.symbol },
    query.limit + 1,
    cursor === undefined ? undefined : { createdAt: cursor.at, id: cursor.id },
  );

  return {
    orders: rows.slice(0, query.limit).map(toOrderDto),
    nextCursor: nextCursorOf(rows, query.limit, (row: OrderRow) => [row.createdAt, row.id]),
  };
}

export async function listAccountTrades(
  accountId: string,
  query: TradesQuery,
): Promise<TradesResponseDto> {
  const cursor = requireCursor(query.cursor);
  const rows = await listTradesPage(
    { accountId, symbol: query.symbol },
    query.limit + 1,
    cursor === undefined ? undefined : { executedAt: cursor.at, id: cursor.id },
  );

  return {
    trades: rows.slice(0, query.limit).map(toTradeDto),
    nextCursor: nextCursorOf(rows, query.limit, (row) => [row.executedAt, row.id]),
  };
}
