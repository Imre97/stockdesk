import { Decimal } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { insertFinalBars, type CandleInput } from "../src/modules/market/candles-repository.js";
import { truncateAll } from "./db.js";

const SYMBOL = "TSLA";
const BUCKET = new Date("2026-09-08T04:00:00.000Z");
const NEXT_BUCKET = new Date("2026-09-09T04:00:00.000Z");
const VOLUME = new Decimal("1000");
const STALE = "1";

async function seedSymbol(): Promise<string> {
  const row = await prisma.symbol.create({
    data: { symbol: SYMBOL, name: "Tesla, Inc.", exchange: "NASDAQ", source: "test" },
  });

  return row.id;
}

function bar(symbolId: string, time: Date, close: string): CandleInput {
  const price = new Decimal(close);

  return {
    symbolId,
    timeframe: "1D",
    time,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: VOLUME,
  };
}

async function seedAggregatorRow(symbolId: string, time: Date): Promise<void> {
  await prisma.candle.create({
    data: {
      symbolId,
      timeframe: "1D",
      time,
      open: STALE,
      high: STALE,
      low: STALE,
      close: STALE,
      volume: STALE,
      isFinal: false,
    },
  });
}

async function storedBars(symbolId: string) {
  return await prisma.candle.findMany({
    where: { symbolId, timeframe: "1D" },
    orderBy: { time: "asc" },
  });
}

beforeEach(async () => {
  await truncateAll();
});

describe("insertFinalBars with a bucket repeated inside one provider page", () => {
  it("stores one row per bucket and keeps the last occurrence", async () => {
    const symbolId = await seedSymbol();

    const written = await insertFinalBars([
      bar(symbolId, BUCKET, "10"),
      bar(symbolId, NEXT_BUCKET, "11"),
      bar(symbolId, BUCKET, "12"),
    ]);

    const rows = await storedBars(symbolId);

    expect(written).toBe(2);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.close.toString()).toBe("12");
    expect(rows[0]?.isFinal).toBe(true);
    expect(rows[1]?.close.toString()).toBe("11");
  });

  it("still replaces a non-final aggregator row at the repeated bucket", async () => {
    const symbolId = await seedSymbol();
    await seedAggregatorRow(symbolId, BUCKET);

    await insertFinalBars([bar(symbolId, BUCKET, "10"), bar(symbolId, BUCKET, "12")]);

    const rows = await storedBars(symbolId);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.close.toString()).toBe("12");
    expect(rows[0]?.isFinal).toBe(true);
  });
});
