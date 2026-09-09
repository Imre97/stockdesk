import { prisma } from "../../lib/prisma.js";
import type { TradeRow } from "./serializers.js";

const TRADE_SEQUENCE = [{ executedAt: "desc" as const }, { id: "desc" as const }];

export interface TradesCursor {
  executedAt: Date;
  id: string;
}

export interface TradesFilter {
  accountId: string;
  symbol?: string | undefined;
}

export async function listOrderTrades(orderId: string): Promise<TradeRow[]> {
  return await prisma.trade.findMany({ where: { orderId }, orderBy: TRADE_SEQUENCE });
}

export async function listTradesPage(
  filter: TradesFilter,
  limit: number,
  cursor: TradesCursor | undefined,
): Promise<TradeRow[]> {
  const keyset =
    cursor === undefined
      ? {}
      : {
          OR: [
            { executedAt: { lt: cursor.executedAt } },
            { executedAt: cursor.executedAt, id: { lt: cursor.id } },
          ],
        };

  return await prisma.trade.findMany({
    where: {
      accountId: filter.accountId,
      ...(filter.symbol === undefined ? {} : { symbol: filter.symbol }),
      ...keyset,
    },
    orderBy: TRADE_SEQUENCE,
    take: limit,
  });
}
