import { Prisma } from "@prisma/client";
import { Decimal, toApiString } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";
import { NY_LOCAL_AT_SQL } from "./ny-time.js";

const MONEY_PLACES = 2;
const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SnapshotInput {
  accountId: string;
  at: Date;
  cash: Decimal;
  positionsValue: Decimal;
  equity: Decimal;
}

interface ReferenceRow {
  accountId: string;
  equity: Prisma.Decimal | string;
}

export function truncateToSecond(date: Date): Date {
  return new Date(date.getTime() - (date.getTime() % MILLISECONDS_PER_SECOND));
}

export async function writeSnapshots(rows: SnapshotInput[]): Promise<number> {
  if (rows.length === 0) return 0;

  const result = await prisma.accountEquitySnapshot.createMany({
    data: rows.map((row) => ({
      accountId: row.accountId,
      at: row.at,
      cash: toApiString(row.cash, MONEY_PLACES),
      positionsValue: toApiString(row.positionsValue, MONEY_PLACES),
      equity: toApiString(row.equity, MONEY_PLACES),
    })),
    skipDuplicates: true,
  });

  return result.count;
}

export async function referenceEquities(
  accountIds: string[],
  before: Date,
): Promise<Map<string, Decimal>> {
  if (accountIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<ReferenceRow[]>`
    SELECT DISTINCT ON ("accountId") "accountId", "equity"
    FROM "AccountEquitySnapshot"
    WHERE "accountId" IN (${Prisma.join(accountIds)}) AND "at" < ${before}
    ORDER BY "accountId", "at" DESC
  `;

  return new Map(rows.map((row) => [row.accountId, new Decimal(row.equity.toString())]));
}

function localHour(): string {
  return `date_trunc('hour', ${NY_LOCAL_AT_SQL})`;
}

export async function deleteCoarseSnapshots(before: Date): Promise<number> {
  return await prisma.$executeRaw`DELETE FROM "AccountEquitySnapshot" WHERE "at" < ${before}`;
}

export async function thinFineSnapshots(before: Date): Promise<number> {
  const hour = Prisma.raw(localHour());

  return await prisma.$executeRaw(Prisma.sql`
    DELETE FROM "AccountEquitySnapshot" AS victim
    WHERE victim."at" < ${before}
      AND victim."id" NOT IN (
        SELECT DISTINCT ON ("accountId", ${hour}) "id"
        FROM "AccountEquitySnapshot"
        WHERE "at" < ${before}
        ORDER BY "accountId", ${hour}, "at" DESC
      )
  `);
}

export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * MILLISECONDS_PER_DAY);
}
