import { Decimal } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";

const RESTING_STATUSES = ["OPEN", "TRIGGERED"] as const;

export interface PositionRow {
  id: string;
  accountId: string;
  symbol: string;
  quantity: Decimal;
  averageCost: Decimal;
  realizedPnl: Decimal;
  openedAt: Date;
  updatedAt: Date;
}

interface PositionRecord {
  id: string;
  accountId: string;
  symbol: string;
  quantity: { toString: () => string };
  averageCost: { toString: () => string };
  realizedPnl: { toString: () => string };
  openedAt: Date;
  updatedAt: Date;
}

function toPositionRow(record: PositionRecord): PositionRow {
  return {
    id: record.id,
    accountId: record.accountId,
    symbol: record.symbol,
    quantity: new Decimal(record.quantity.toString()),
    averageCost: new Decimal(record.averageCost.toString()),
    realizedPnl: new Decimal(record.realizedPnl.toString()),
    openedAt: record.openedAt,
    updatedAt: record.updatedAt,
  };
}

export async function listOpenPositions(accountId: string): Promise<PositionRow[]> {
  const rows = await prisma.position.findMany({
    where: { accountId, closedAt: null, quantity: { not: 0 } },
    orderBy: { symbol: "asc" },
  });

  return rows.map(toPositionRow);
}

export async function listOpenPositionsByAccounts(
  accountIds: string[],
): Promise<Map<string, PositionRow[]>> {
  const grouped = new Map<string, PositionRow[]>();

  if (accountIds.length === 0) return grouped;

  const rows = await prisma.position.findMany({
    where: { accountId: { in: accountIds }, closedAt: null, quantity: { not: 0 } },
    orderBy: [{ accountId: "asc" }, { symbol: "asc" }],
  });

  for (const row of rows) {
    const owned = grouped.get(row.accountId) ?? [];
    owned.push(toPositionRow(row));
    grouped.set(row.accountId, owned);
  }

  return grouped;
}

export async function sumReservedCashByAccounts(
  accountIds: string[],
): Promise<Map<string, Decimal>> {
  const sums = new Map<string, Decimal>();

  if (accountIds.length === 0) return sums;

  for (const accountId of accountIds) sums.set(accountId, new Decimal(0));

  const grouped = await prisma.order.groupBy({
    by: ["accountId"],
    where: { accountId: { in: accountIds }, status: { in: [...RESTING_STATUSES] } },
    _sum: { reservedCash: true },
  });

  for (const row of grouped) {
    sums.set(row.accountId, new Decimal(row._sum.reservedCash?.toString() ?? "0"));
  }

  return sums;
}
