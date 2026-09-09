import { Prisma } from "@prisma/client";
import { toApiString, type Decimal, type Timeframe } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";

const PRICE_PLACES = 8;
const UPSERT_BATCH_SIZE = 500;

export interface CandleRow {
  time: Date;
  open: Prisma.Decimal;
  high: Prisma.Decimal;
  low: Prisma.Decimal;
  close: Prisma.Decimal;
  volume: Prisma.Decimal;
  isFinal: boolean;
}

export interface CandleInput {
  symbolId: string;
  timeframe: Timeframe;
  time: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

export interface LatestCloseRow {
  symbolId: string;
  timeframe: string;
  close: Prisma.Decimal;
}

export interface CoverageRow {
  id: string;
  from: Date;
  to: Date;
}

const CANDLE_COLUMNS = {
  time: true,
  open: true,
  high: true,
  low: true,
  close: true,
  volume: true,
  isFinal: true,
} as const;

interface CandleValues {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function values(bar: CandleInput): CandleValues {
  return {
    open: toApiString(bar.open, PRICE_PLACES),
    high: toApiString(bar.high, PRICE_PLACES),
    low: toApiString(bar.low, PRICE_PLACES),
    close: toApiString(bar.close, PRICE_PLACES),
    volume: toApiString(bar.volume, PRICE_PLACES),
  };
}

/**
 * Reads the newest bars strictly before `end` and flips them back to ascending order. The forming
 * bar written by the live aggregator (`isFinal = false`) is part of the result on purpose: a chart
 * page must show the candle that is still building.
 */
export async function listBarsBefore(
  symbolId: string,
  timeframe: Timeframe,
  end: Date,
  limit: number,
): Promise<CandleRow[]> {
  const rows = await prisma.candle.findMany({
    where: { symbolId, timeframe, time: { lt: end } },
    orderBy: { time: "desc" },
    take: limit,
    select: CANDLE_COLUMNS,
  });

  return rows.reverse();
}

export async function existsBarBefore(
  symbolId: string,
  timeframe: Timeframe,
  time: Date,
): Promise<boolean> {
  const older = await prisma.candle.findFirst({
    where: { symbolId, timeframe, time: { lt: time } },
    select: { time: true },
  });

  return older !== null;
}

function tuple(bar: CandleInput): Prisma.Sql {
  const data = values(bar);

  return Prisma.sql`(gen_random_uuid()::text, ${bar.symbolId}, ${bar.timeframe},
    ${bar.time.toISOString()}::timestamp, ${data.open}::decimal, ${data.high}::decimal,
    ${data.low}::decimal, ${data.close}::decimal, ${data.volume}::decimal, true)`;
}

const INSERT_COLUMNS = Prisma.sql`(
  "id", "symbolId", "timeframe", "time", "open", "high", "low", "close", "volume", "isFinal"
)`;

const REPLACE_WITH_EXCLUDED = Prisma.sql`
  "open" = EXCLUDED."open",
  "high" = EXCLUDED."high",
  "low" = EXCLUDED."low",
  "close" = EXCLUDED."close",
  "volume" = EXCLUDED."volume",
  "isFinal" = true`;

async function upsertBatch(bars: CandleInput[]): Promise<number> {
  return await prisma.$executeRaw`
    INSERT INTO "Candle" ${INSERT_COLUMNS}
    VALUES ${Prisma.join(bars.map(tuple))}
    ON CONFLICT ("symbolId", "timeframe", "time") DO UPDATE SET ${REPLACE_WITH_EXCLUDED}
  `;
}

/**
 * A provider page may repeat a bucket, and PostgreSQL rejects a whole `ON CONFLICT DO UPDATE`
 * statement whose `VALUES` list touches one row twice. The later row of the page wins, which is
 * also the provider's own correction order.
 */
function deduplicate(bars: CandleInput[]): CandleInput[] {
  const byBucket = new Map<string, CandleInput>();

  for (const bar of bars) {
    byBucket.set(`${bar.symbolId}|${bar.timeframe}|${bar.time.getTime()}`, bar);
  }

  return [...byBucket.values()];
}

/**
 * The provider is authoritative for a bucket it has served: the upsert overwrites whatever the live
 * aggregator left behind for the same `(symbolId, timeframe, time)`, forming or final, so a partial
 * session aggregate is replaced and no served bucket stays `isFinal = false`. Batching keeps the
 * bind parameter count of one statement well under the PostgreSQL limit for a large page.
 */
export async function insertFinalBars(bars: CandleInput[]): Promise<number> {
  const unique = deduplicate(bars);
  let written = 0;

  for (let offset = 0; offset < unique.length; offset += UPSERT_BATCH_SIZE) {
    written += await upsertBatch(unique.slice(offset, offset + UPSERT_BATCH_SIZE));
  }

  return written;
}

export async function saveFormingBar(bar: CandleInput): Promise<void> {
  const data = values(bar);

  await prisma.candle.upsert({
    where: {
      symbolId_timeframe_time: { symbolId: bar.symbolId, timeframe: bar.timeframe, time: bar.time },
    },
    create: { symbolId: bar.symbolId, timeframe: bar.timeframe, time: bar.time, isFinal: false, ...data },
    update: { isFinal: false, ...data },
  });
}

/**
 * The live aggregator owns a bucket only while its row is absent or still forming: the sweep can
 * close a bucket after a REST fetch already stored the provider's authoritative bar, and the
 * `isFinal = false` predicate makes that late write a no-op instead of an overwrite.
 */
export async function finalizeBar(bar: CandleInput): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "Candle" ${INSERT_COLUMNS}
    VALUES ${tuple(bar)}
    ON CONFLICT ("symbolId", "timeframe", "time") DO UPDATE SET ${REPLACE_WITH_EXCLUDED}
    WHERE "Candle"."isFinal" = false
  `;
}

export async function latestBar(symbolId: string, timeframe: Timeframe): Promise<CandleRow | null> {
  return await prisma.candle.findFirst({
    where: { symbolId, timeframe },
    orderBy: { time: "desc" },
    select: CANDLE_COLUMNS,
  });
}

/**
 * The newest bar of every requested `(symbolId, timeframe)` pair in one statement, so pricing a
 * whole position list costs one candle query instead of one read per symbol.
 */
export async function latestClosesFor(
  symbolIds: string[],
  timeframes: Timeframe[],
): Promise<LatestCloseRow[]> {
  if (symbolIds.length === 0 || timeframes.length === 0) return [];

  return await prisma.$queryRaw<LatestCloseRow[]>`
    SELECT DISTINCT ON ("symbolId", "timeframe") "symbolId", "timeframe", "close"
    FROM "Candle"
    WHERE "symbolId" IN (${Prisma.join(symbolIds)})
      AND "timeframe" IN (${Prisma.join(timeframes)})
    ORDER BY "symbolId", "timeframe", "time" DESC
  `;
}

export async function latestFinalBarBefore(
  symbolId: string,
  timeframe: Timeframe,
  time: Date,
): Promise<CandleRow | null> {
  return await prisma.candle.findFirst({
    where: { symbolId, timeframe, isFinal: true, time: { lt: time } },
    orderBy: { time: "desc" },
    select: CANDLE_COLUMNS,
  });
}

/**
 * The batched form of `latestFinalBarBefore`: one statement prices the previous close of a whole
 * subscribe batch instead of one read per symbol.
 */
export async function latestFinalClosesBefore(
  symbolIds: string[],
  timeframe: Timeframe,
  time: Date,
): Promise<LatestCloseRow[]> {
  if (symbolIds.length === 0) return [];

  return await prisma.$queryRaw<LatestCloseRow[]>`
    SELECT DISTINCT ON ("symbolId") "symbolId", "timeframe", "close"
    FROM "Candle"
    WHERE "symbolId" IN (${Prisma.join(symbolIds)})
      AND "timeframe" = ${timeframe}
      AND "isFinal" = true
      AND "time" < ${time}
    ORDER BY "symbolId", "time" DESC
  `;
}

export async function formingBarAt(
  symbolId: string,
  timeframe: Timeframe,
  time: Date,
): Promise<CandleRow | null> {
  return await prisma.candle.findFirst({
    where: { symbolId, timeframe, time, isFinal: false },
    select: CANDLE_COLUMNS,
  });
}

export async function listCoverage(symbolId: string, timeframe: Timeframe): Promise<CoverageRow[]> {
  return await prisma.candleCoverage.findMany({
    where: { symbolId, timeframe },
    orderBy: { from: "asc" },
    select: { id: true, from: true, to: true },
  });
}

/**
 * Merges the fetched interval with every touching or overlapping row. A transaction-scoped
 * PostgreSQL advisory lock keyed by the series serializes concurrent writers, so two identical
 * requests that both miss the cache still leave exactly one coverage row behind.
 */
export async function addCoverage(
  symbolId: string,
  timeframe: Timeframe,
  from: Date,
  to: Date,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${symbolId}|${timeframe}`}))`;

    const touching = await tx.candleCoverage.findMany({
      where: { symbolId, timeframe, from: { lte: to }, to: { gte: from } },
      select: { id: true, from: true, to: true },
    });

    const mergedFrom = touching.reduce(
      (oldest, row) => (row.from < oldest ? row.from : oldest),
      from,
    );
    const mergedTo = touching.reduce((newest, row) => (row.to > newest ? row.to : newest), to);

    if (touching.length > 0) {
      await tx.candleCoverage.deleteMany({ where: { id: { in: touching.map((row) => row.id) } } });
    }

    await tx.candleCoverage.create({
      data: { symbolId, timeframe, from: mergedFrom, to: mergedTo },
    });
  });
}
