import { Prisma } from "@prisma/client";
import { toApiString, type Decimal } from "@stockdesk/shared";
import { prisma } from "../../lib/prisma.js";
import type { AssetRecord, SymbolProfile } from "./providers/types.js";

const BATCH_SIZE = 500;
const PRICE_PLACES = 8;
const MARKET_CAP_PLACES = 2;

export interface SymbolRecord {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  shortable: boolean;
  fractionable: boolean;
  isActive: boolean;
}

export interface SymbolProfileRecord {
  industry: string | null;
  marketCap: Prisma.Decimal | null;
  sharesOutstanding: Prisma.Decimal | null;
  peRatio: Prisma.Decimal | null;
  week52High: Prisma.Decimal | null;
  week52Low: Prisma.Decimal | null;
  beta: Prisma.Decimal | null;
  dividendYield: Prisma.Decimal | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  profileFetchedAt: Date | null;
  metricsFetchedAt: Date | null;
}

export interface SymbolWithProfile extends SymbolRecord {
  profile: SymbolProfileRecord | null;
}

export interface SymbolSearchRow {
  symbol: string;
  name: string;
  exchange: string;
}

export interface UpsertSymbolsResult {
  listed: number;
  created: number;
  updated: number;
  deactivated: number;
}

export interface ProfileStamps {
  profileFetchedAt?: Date;
  metricsFetchedAt?: Date;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function differs(row: SymbolRecord & { source: string }, asset: AssetRecord, source: string): boolean {
  return (
    row.name !== asset.name ||
    row.exchange !== asset.exchange ||
    row.shortable !== asset.shortable ||
    row.fractionable !== asset.fractionable ||
    row.source !== source ||
    !row.isActive
  );
}

export async function upsertSymbols(
  assets: AssetRecord[],
  source: string,
): Promise<UpsertSymbolsResult> {
  const symbols = assets.map((asset) => asset.symbol);

  const created = await prisma.symbol.createMany({
    data: assets.map((asset) => ({
      symbol: asset.symbol,
      name: asset.name,
      exchange: asset.exchange,
      shortable: asset.shortable,
      fractionable: asset.fractionable,
      source,
    })),
    skipDuplicates: true,
  });

  const existing = await prisma.symbol.findMany({
    where: { symbol: { in: symbols } },
    select: {
      id: true,
      symbol: true,
      name: true,
      exchange: true,
      currency: true,
      shortable: true,
      fractionable: true,
      isActive: true,
      source: true,
    },
  });

  const bySymbol = new Map(existing.map((row) => [row.symbol, row]));
  const changed = assets.filter((asset) => {
    const row = bySymbol.get(asset.symbol);
    return row !== undefined && differs(row, asset, source);
  });

  for (const batch of chunk(changed, BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((asset) =>
        prisma.symbol.update({
          where: { symbol: asset.symbol },
          data: {
            name: asset.name,
            exchange: asset.exchange,
            shortable: asset.shortable,
            fractionable: asset.fractionable,
            isActive: true,
            source,
          },
        }),
      ),
    );
  }

  const changedSymbols = new Set(changed.map((asset) => asset.symbol));
  const unchanged = symbols.filter(
    (symbol) => !changedSymbols.has(symbol) && bySymbol.has(symbol),
  );

  for (const batch of chunk(unchanged, BATCH_SIZE)) {
    await prisma.symbol.updateMany({ where: { symbol: { in: batch } }, data: { source } });
  }

  const deactivated = await prisma.symbol.updateMany({
    where: { isActive: true, symbol: { notIn: symbols } },
    data: { isActive: false },
  });

  return {
    listed: assets.length,
    created: created.count,
    updated: changed.length,
    deactivated: deactivated.count,
  };
}

export async function findActiveSymbol(symbol: string): Promise<SymbolWithProfile | null> {
  return await prisma.symbol.findFirst({
    where: { symbol, isActive: true },
    select: {
      id: true,
      symbol: true,
      name: true,
      exchange: true,
      currency: true,
      shortable: true,
      fractionable: true,
      isActive: true,
      profile: {
        select: {
          industry: true,
          marketCap: true,
          sharesOutstanding: true,
          peRatio: true,
          week52High: true,
          week52Low: true,
          beta: true,
          dividendYield: true,
          logoUrl: true,
          websiteUrl: true,
          profileFetchedAt: true,
          metricsFetchedAt: true,
        },
      },
    },
  });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export async function searchSymbols(query: string, limit: number): Promise<SymbolSearchRow[]> {
  const escaped = escapeLike(query);
  const prefix = `${escaped}%`;
  const contains = `%${escaped}%`;

  return await prisma.$queryRaw<SymbolSearchRow[]>`
    SELECT "symbol", "name", "exchange"
    FROM "Symbol"
    WHERE "isActive" = true
      AND ("symbol" ILIKE ${prefix} ESCAPE '\\' OR "name" ILIKE ${contains} ESCAPE '\\')
    ORDER BY ("symbol" ILIKE ${prefix} ESCAPE '\\') DESC, "symbol" ASC
    LIMIT ${limit}
  `;
}

export async function newestSymbolUpdatedAt(): Promise<Date | null> {
  const newest = await prisma.symbol.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return newest?.updatedAt ?? null;
}

function price(value: Decimal | null): string | null {
  return value === null ? null : toApiString(value, PRICE_PLACES);
}

export async function upsertProfile(
  symbolId: string,
  profile: SymbolProfile | null,
  stamps: ProfileStamps,
): Promise<void> {
  const values = {
    industry: profile?.industry ?? null,
    marketCap: profile?.marketCap === undefined || profile.marketCap === null
      ? null
      : toApiString(profile.marketCap, MARKET_CAP_PLACES),
    sharesOutstanding: price(profile?.sharesOutstanding ?? null),
    peRatio: price(profile?.peRatio ?? null),
    week52High: price(profile?.week52High ?? null),
    week52Low: price(profile?.week52Low ?? null),
    beta: price(profile?.beta ?? null),
    dividendYield: price(profile?.dividendYield ?? null),
    logoUrl: profile?.logoUrl ?? null,
    websiteUrl: profile?.websiteUrl ?? null,
    ipoDate: profile?.ipoDate ?? null,
    ...(stamps.profileFetchedAt === undefined ? {} : { profileFetchedAt: stamps.profileFetchedAt }),
    ...(stamps.metricsFetchedAt === undefined ? {} : { metricsFetchedAt: stamps.metricsFetchedAt }),
  };

  await prisma.symbolProfile.upsert({
    where: { symbolId },
    create: { symbolId, ...values },
    update: values,
  });
}
