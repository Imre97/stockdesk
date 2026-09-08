import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/lib/config.js";
import { prisma } from "../src/lib/prisma.js";
import { CANDLE_MAX_ROWS_PER_SERIES, createMarketJobs } from "../src/modules/market/jobs.js";
import { truncateAll } from "./db.js";
import { createTestMarket, MARKET_NOW, seedSymbols } from "./market-helpers.js";

const EXTRA_ROWS = 5;
const MS_PER_MINUTE = 60_000;

const config = loadConfig(process.env);
const market = createTestMarket();

async function tslaId(): Promise<string> {
  const row = await prisma.symbol.findUnique({ where: { symbol: "TSLA" } });
  if (row === null) throw new Error("Expected the TSLA symbol row.");

  return row.id;
}

describe("market jobs", () => {
  beforeEach(async () => {
    await truncateAll();
    await seedSymbols(market);
    market.logs.length = 0;
  });

  it("refreshes the symbol master only when the newest row is stale", async () => {
    const jobs = createMarketJobs({ config, runtime: market.runtime, log: (line) => market.logs.push(line) });

    await jobs.runSymbolRefresh();

    expect(market.logs.some((line) => line.includes("Symbol master refresh skipped"))).toBe(true);
  });

  it("refreshes the symbol master when the table is empty", async () => {
    await prisma.symbol.deleteMany({});

    const jobs = createMarketJobs({ config, runtime: market.runtime, log: (line) => market.logs.push(line) });
    await jobs.runSymbolRefresh();

    expect(await prisma.symbol.count()).toBeGreaterThan(0);
    expect(market.logs.some((line) => line.includes("Symbol master refreshed"))).toBe(true);
  });

  it("thins a series above the cap and trims the coverage", async () => {
    const symbolId = await tslaId();
    const total = CANDLE_MAX_ROWS_PER_SERIES + EXTRA_ROWS;
    const oldestTime = new Date(MARKET_NOW.getTime() - total * MS_PER_MINUTE);

    await prisma.candle.createMany({
      data: Array.from({ length: total }, (_value, index) => ({
        symbolId,
        timeframe: "1m",
        time: new Date(oldestTime.getTime() + index * MS_PER_MINUTE),
        open: "100",
        high: "100",
        low: "100",
        close: "100",
        volume: "1",
      })),
    });

    await prisma.candleCoverage.create({
      data: { symbolId, timeframe: "1m", from: oldestTime, to: MARKET_NOW },
    });

    const jobs = createMarketJobs({ config, runtime: market.runtime, log: (line) => market.logs.push(line) });
    await jobs.runCandleThinning();

    expect(await prisma.candle.count({ where: { symbolId, timeframe: "1m" } })).toBe(
      CANDLE_MAX_ROWS_PER_SERIES,
    );

    const coverage = await prisma.candleCoverage.findFirst({ where: { symbolId, timeframe: "1m" } });
    expect(coverage?.from.toISOString()).toBe(
      new Date(oldestTime.getTime() + EXTRA_ROWS * MS_PER_MINUTE).toISOString(),
    );
  });

  it("leaves a series under the cap untouched", async () => {
    const symbolId = await tslaId();

    await prisma.candle.createMany({
      data: Array.from({ length: EXTRA_ROWS }, (_value, index) => ({
        symbolId,
        timeframe: "5m",
        time: new Date(MARKET_NOW.getTime() - index * MS_PER_MINUTE),
        open: "100",
        high: "100",
        low: "100",
        close: "100",
        volume: "1",
      })),
    });

    const jobs = createMarketJobs({ config, runtime: market.runtime, log: (line) => market.logs.push(line) });
    await jobs.runCandleThinning();

    expect(await prisma.candle.count({ where: { symbolId, timeframe: "5m" } })).toBe(EXTRA_ROWS);
  });
});
