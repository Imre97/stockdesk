import { Prisma } from "@prisma/client";
import { toApiString, type Decimal, type Timeframe } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";

const PRICE_PLACES = 8;

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

export async function insertFinalBars(bars: CandleInput[]): Promise<number> {
  if (bars.length === 0) return 0;

  const result = await prisma.candle.createMany({
    data: bars.map((bar) => ({
      symbolId: bar.symbolId,
      timeframe: bar.timeframe,
      time: bar.time,
      isFinal: true,
      ...values(bar),
    })),
    skipDuplicates: true,
  });

  return result.count;
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

export async function finalizeBar(bar: CandleInput): Promise<void> {
  const data = values(bar);

  await prisma.candle.upsert({
    where: {
      symbolId_timeframe_time: { symbolId: bar.symbolId, timeframe: bar.timeframe, time: bar.time },
    },
    create: { symbolId: bar.symbolId, timeframe: bar.timeframe, time: bar.time, isFinal: true, ...data },
    update: { isFinal: true, ...data },
  });
}

export async function latestBar(symbolId: string, timeframe: Timeframe): Promise<CandleRow | null> {
  return await prisma.candle.findFirst({
    where: { symbolId, timeframe },
    orderBy: { time: "desc" },
    select: CANDLE_COLUMNS,
  });
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

export async function formingBarSince(
  symbolId: string,
  timeframe: Timeframe,
  from: Date,
): Promise<CandleRow | null> {
  return await prisma.candle.findFirst({
    where: { symbolId, timeframe, isFinal: false, time: { gte: from } },
    orderBy: { time: "desc" },
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

export async function trimCoverageBefore(
  symbolId: string,
  timeframe: Timeframe,
  oldestKeptTime: Date,
): Promise<void> {
  await prisma.candleCoverage.deleteMany({
    where: { symbolId, timeframe, to: { lte: oldestKeptTime } },
  });

  await prisma.candleCoverage.updateMany({
    where: { symbolId, timeframe, from: { lt: oldestKeptTime } },
    data: { from: oldestKeptTime },
  });
}

export async function countBars(symbolId: string, timeframe: Timeframe): Promise<number> {
  return await prisma.candle.count({ where: { symbolId, timeframe } });
}

export async function oldestBarTime(symbolId: string, timeframe: Timeframe): Promise<Date | null> {
  const oldest = await prisma.candle.findFirst({
    where: { symbolId, timeframe },
    orderBy: { time: "asc" },
    select: { time: true },
  });

  return oldest?.time ?? null;
}

export async function listSeries(): Promise<{ symbolId: string; timeframe: string }[]> {
  return await prisma.$queryRaw<{ symbolId: string; timeframe: string }[]>`
    SELECT DISTINCT "symbolId", "timeframe" FROM "Candle"
  `;
}

export async function deleteOldestBarsAbove(
  symbolId: string,
  timeframe: Timeframe,
  cap: number,
): Promise<number> {
  return await prisma.$executeRaw`
    DELETE FROM "Candle"
    WHERE "symbolId" = ${symbolId}
      AND "timeframe" = ${timeframe}
      AND "time" < (
        SELECT MIN("time") FROM (
          SELECT "time" FROM "Candle"
          WHERE "symbolId" = ${symbolId} AND "timeframe" = ${timeframe}
          ORDER BY "time" DESC
          LIMIT ${cap}
        ) kept
      )
  `;
}
