import type { Timeframe } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";

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
