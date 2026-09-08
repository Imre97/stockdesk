import { Prisma } from "@prisma/client";
import { toApiString, type EquityPointDto, type EquityRange } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";
import { lastNWeekdaysWindow, nyTradingDayWindow, NY_LOCAL_AT_SQL, type NyWindow } from "./ny-time.js";

const MONEY_PLACES = 2;
const WEEKDAYS_IN_WEEK_RANGE = 5;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const BIN_ORIGIN = "2000-01-01 00:00:00";

export type EquityBucket =
  | { kind: "trunc"; unit: "minute" | "hour" | "day" }
  | { kind: "bin"; interval: "5 minutes" | "15 minutes" };

const BUCKETS: Record<EquityRange, EquityBucket> = {
  "1D": { kind: "trunc", unit: "minute" },
  "5D": { kind: "bin", interval: "5 minutes" },
  "1W": { kind: "bin", interval: "15 minutes" },
  "1M": { kind: "trunc", unit: "hour" },
  "1Y": { kind: "trunc", unit: "day" },
};

const CALENDAR_DAYS: Record<string, number> = { "1W": 7, "1M": 30, "1Y": 365 };

interface SnapshotRow {
  at: Date;
  equity: Prisma.Decimal | string;
}

export function rangeBucket(range: EquityRange): EquityBucket {
  return BUCKETS[range];
}

export function rangeWindow(range: EquityRange, now: Date): NyWindow {
  if (range === "1D") return nyTradingDayWindow(now);
  if (range === "5D") return lastNWeekdaysWindow(now, WEEKDAYS_IN_WEEK_RANGE);

  const days = CALENDAR_DAYS[range] ?? 1;

  return { from: new Date(now.getTime() - days * MILLISECONDS_PER_DAY), to: now };
}

function bucketSql(bucket: EquityBucket): Prisma.Sql {
  if (bucket.kind === "trunc") return Prisma.raw(`date_trunc('${bucket.unit}', ${NY_LOCAL_AT_SQL})`);

  return Prisma.raw(`date_bin('${bucket.interval}', ${NY_LOCAL_AT_SQL}, TIMESTAMP '${BIN_ORIGIN}')`);
}

export async function loadEquityPoints(
  accountId: string,
  range: EquityRange,
  now: Date,
): Promise<EquityPointDto[]> {
  const window = rangeWindow(range, now);
  const bucket = bucketSql(rangeBucket(range));

  const rows = await prisma.$queryRaw<SnapshotRow[]>(Prisma.sql`
    SELECT "at", "equity"
    FROM (
      SELECT DISTINCT ON (bucket) "at", "equity"
      FROM (
        SELECT "at", "equity", ${bucket} AS bucket
        FROM "AccountEquitySnapshot"
        WHERE "accountId" = ${accountId} AND "at" >= ${window.from} AND "at" < ${window.to}
      ) samples
      ORDER BY bucket, "at" DESC
    ) buckets
    ORDER BY "at" ASC
  `);

  return rows.map((row) => ({
    at: row.at.toISOString(),
    equity: toApiString(row.equity.toString(), MONEY_PLACES),
  }));
}
