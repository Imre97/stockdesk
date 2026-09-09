import { Decimal } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  finalizeBar,
  insertFinalBars,
  saveFormingBar,
  type CandleInput,
} from "../src/modules/market/candles-repository.js";
import { truncateAll } from "./db.js";

const SYMBOL = "TSLA";
const BUCKET = new Date("2026-09-09T18:00:00.000Z");
const PROVIDER_CLOSE = "251.37";
const AGGREGATE_CLOSE = "5.75";
const VOLUME = new Decimal("1000");

async function seedSymbol(): Promise<string> {
  const row = await prisma.symbol.create({
    data: { symbol: SYMBOL, name: "Tesla, Inc.", exchange: "NASDAQ", source: "test" },
  });

  return row.id;
}

function bar(symbolId: string, close: string): CandleInput {
  const price = new Decimal(close);

  return {
    symbolId,
    timeframe: "1m",
    time: BUCKET,
    open: price,
    high: price,
    low: price,
    close: price,
    volume: VOLUME,
  };
}

async function storedBar(symbolId: string) {
  const rows = await prisma.candle.findMany({ where: { symbolId, timeframe: "1m" } });
  const row = rows[0];
  if (row === undefined) throw new Error("Expected a candle row at the bucket.");

  return { close: row.close.toString(), isFinal: row.isFinal, count: rows.length };
}

beforeEach(async () => {
  await truncateAll();
});

describe("aggregator finalize against the provider row of the same bucket", () => {
  it("keeps the provider bar when the aggregator finalizes the bucket late", async () => {
    const symbolId = await seedSymbol();
    await insertFinalBars([bar(symbolId, PROVIDER_CLOSE)]);

    await finalizeBar(bar(symbolId, AGGREGATE_CLOSE));

    const stored = await storedBar(symbolId);

    expect(stored.count).toBe(1);
    expect(stored.close).toBe(PROVIDER_CLOSE);
    expect(stored.isFinal).toBe(true);
  });

  it("writes the final aggregate when no provider row holds the bucket", async () => {
    const symbolId = await seedSymbol();

    await finalizeBar(bar(symbolId, AGGREGATE_CLOSE));

    const stored = await storedBar(symbolId);

    expect(stored.count).toBe(1);
    expect(stored.close).toBe(AGGREGATE_CLOSE);
    expect(stored.isFinal).toBe(true);
  });

  it("promotes its own forming row of the bucket to final", async () => {
    const symbolId = await seedSymbol();
    await saveFormingBar(bar(symbolId, "1.00"));

    await finalizeBar(bar(symbolId, AGGREGATE_CLOSE));

    const stored = await storedBar(symbolId);

    expect(stored.count).toBe(1);
    expect(stored.close).toBe(AGGREGATE_CLOSE);
    expect(stored.isFinal).toBe(true);
  });

  it("lets a later provider page replace the final aggregate", async () => {
    const symbolId = await seedSymbol();
    await finalizeBar(bar(symbolId, AGGREGATE_CLOSE));

    await insertFinalBars([bar(symbolId, PROVIDER_CLOSE)]);

    const stored = await storedBar(symbolId);

    expect(stored.count).toBe(1);
    expect(stored.close).toBe(PROVIDER_CLOSE);
    expect(stored.isFinal).toBe(true);
  });
});
