import { Decimal } from "@stockdesk/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { createCompositeProvider } from "../src/modules/market/providers/composite.js";
import type { ProfilePart, SymbolProfile } from "../src/modules/market/providers/types.js";
import { createSymbolsService, type SymbolsService } from "../src/modules/market/symbols.js";
import { truncateAll } from "./db.js";
import { createFakeProvider } from "./market-fakes.js";

const NOW = new Date("2026-09-08T18:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const STALE_METRICS_AT = new Date(NOW.getTime() - 2 * HOUR_MS);
const STALE_PROFILE_AT = new Date(NOW.getTime() - 25 * HOUR_MS);
const SYMBOL = "TSLA";

const FRESH_PROFILE_INDUSTRY = "Automobiles";
const STORED_INDUSTRY = "Stored Industry";

interface Harness {
  service: SymbolsService;
  parts: ProfilePart[];
}

function providerProfile(symbol: string, parts: ProfilePart): SymbolProfile {
  const wantsProfile = parts !== "metrics";
  const wantsMetrics = parts !== "profile";

  return {
    symbol,
    name: wantsProfile ? "Tesla, Inc." : null,
    exchange: wantsProfile ? "NASDAQ" : null,
    industry: wantsProfile ? FRESH_PROFILE_INDUSTRY : null,
    marketCap: wantsProfile ? new Decimal("1000000") : null,
    sharesOutstanding: wantsProfile ? new Decimal("3200") : null,
    peRatio: wantsMetrics ? new Decimal("72.5") : null,
    week52High: wantsMetrics ? new Decimal("299") : null,
    week52Low: wantsMetrics ? new Decimal("138") : null,
    beta: wantsMetrics ? new Decimal("2.1") : null,
    dividendYield: wantsMetrics ? new Decimal("0.0130") : null,
    logoUrl: null,
    websiteUrl: null,
    ipoDate: null,
  };
}

function createHarness(): Harness {
  const parts: ProfilePart[] = [];
  const provider = createFakeProvider({
    name: "finnhub",
    capabilities: ["profile"],
    getProfile: async (symbol, options) => {
      const requested = options?.parts ?? "all";
      parts.push(requested);

      return providerProfile(symbol, requested);
    },
  });

  const service = createSymbolsService({
    composite: createCompositeProvider({ providers: [provider], log: vi.fn() }),
    prices: { getQuoteSnapshot: async () => null },
    now: () => NOW,
    log: vi.fn(),
    source: "test",
    refreshHours: 24,
  });

  return { service, parts };
}

async function seedSymbol(profileFetchedAt: Date, metricsFetchedAt: Date): Promise<void> {
  const record = await prisma.symbol.create({
    data: { symbol: SYMBOL, name: "Tesla, Inc.", exchange: "NASDAQ", source: "test" },
  });

  await prisma.symbolProfile.create({
    data: {
      symbolId: record.id,
      industry: STORED_INDUSTRY,
      peRatio: "10",
      profileFetchedAt,
      metricsFetchedAt,
    },
  });
}

async function storedProfile() {
  const row = await prisma.symbolProfile.findFirst();
  if (row === null) throw new Error("Expected a stored symbol profile.");

  return row;
}

describe("symbol profile and metrics refresh", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("refreshes only the metrics when the profile is still young", async () => {
    await seedSymbol(STALE_METRICS_AT, STALE_METRICS_AT);
    const { service, parts } = createHarness();

    await service.getDetail(SYMBOL);

    await vi.waitFor(async () => {
      expect((await storedProfile()).metricsFetchedAt).toEqual(NOW);
    });

    expect(parts).toEqual(["metrics"]);

    const row = await storedProfile();
    expect(row.profileFetchedAt).toEqual(STALE_METRICS_AT);
    expect(row.industry).toBe(STORED_INDUSTRY);
    expect(row.peRatio?.toString()).toBe("72.5");
  });

  it("refreshes both parts when the profile is stale", async () => {
    await seedSymbol(STALE_PROFILE_AT, STALE_PROFILE_AT);
    const { service, parts } = createHarness();

    await service.getDetail(SYMBOL);

    await vi.waitFor(async () => {
      expect((await storedProfile()).profileFetchedAt).toEqual(NOW);
    });

    expect(parts).toEqual(["all"]);

    const row = await storedProfile();
    expect(row.metricsFetchedAt).toEqual(NOW);
    expect(row.industry).toBe(FRESH_PROFILE_INDUSTRY);
  });
});
