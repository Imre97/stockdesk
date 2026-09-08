import type { SymbolDetailDto, SymbolSearchResult } from "@stockdesk/shared";
import { AppError } from "../../lib/errors.js";
import { ProviderUnavailableError, type CompositeProvider } from "./providers/composite.js";
import type { SocketTimers } from "./providers/reconnecting-socket.js";
import { systemTimers } from "./providers/reconnecting-socket.js";
import type { SymbolProfile } from "./providers/types.js";
import type { PriceService } from "./price-service.js";
import { toSymbolDetailDto } from "./symbol-detail.js";
import * as repository from "./symbols-repository.js";
import type { SymbolWithProfile } from "./symbols-repository.js";

const PROFILE_TIMEOUT_MS = 3000;
const PROFILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const METRICS_MAX_AGE_MS = 60 * 60 * 1000;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

export interface SymbolsServiceOptions {
  composite: CompositeProvider;
  prices: Pick<PriceService, "getQuoteSnapshot">;
  now: () => Date;
  log: (message: string) => void;
  source: string;
  refreshHours: number;
  timers?: SocketTimers | undefined;
}

export interface RefreshResult {
  refreshed: boolean;
  listed?: number;
  created?: number;
  updated?: number;
  deactivated?: number;
}

export interface SymbolsService {
  refreshSymbols: () => Promise<RefreshResult>;
  search: (query: string, limit: number) => Promise<SymbolSearchResult[]>;
  getDetail: (symbol: string) => Promise<SymbolDetailDto>;
}

export function symbolNotFound(symbol: string): AppError {
  return new AppError(404, "SYMBOL_NOT_FOUND", `Unknown symbol ${symbol}.`);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isStale(fetchedAt: Date | null, maxAgeMs: number, now: Date): boolean {
  return fetchedAt === null || now.getTime() - fetchedAt.getTime() > maxAgeMs;
}

export function createSymbolsService(options: SymbolsServiceOptions): SymbolsService {
  const { composite, prices, now, log, source, refreshHours } = options;
  const timers = options.timers ?? systemTimers;
  const inFlight = new Set<string>();

  /** Keeps a slow provider from blocking the symbol page: the caller continues without a profile. */
  async function fetchProfile(symbol: string): Promise<SymbolProfile | null> {
    let handle: unknown = null;

    const timeout = new Promise<null>((resolve) => {
      handle = timers.setTimeout(() => {
        log(`Fetching the profile of ${symbol} timed out`);
        resolve(null);
      }, PROFILE_TIMEOUT_MS);
    });

    try {
      return await Promise.race([composite.getProfile(symbol), timeout]);
    } catch (error) {
      log(`Fetching the profile of ${symbol} failed: ${describe(error)}`);
      return null;
    } finally {
      timers.clearTimeout(handle);
    }
  }

  async function storeProfile(symbolId: string, symbol: string): Promise<void> {
    const profile = await fetchProfile(symbol);
    const at = now();

    await repository.upsertProfile(symbolId, profile, {
      profileFetchedAt: at,
      metricsFetchedAt: at,
    });
  }

  function refreshInBackground(symbolId: string, symbol: string): void {
    if (inFlight.has(symbol)) return;

    inFlight.add(symbol);
    void storeProfile(symbolId, symbol)
      .catch((error: unknown) => {
        log(`Refreshing the profile of ${symbol} failed: ${describe(error)}`);
      })
      .finally(() => {
        inFlight.delete(symbol);
      });
  }

  async function withProfile(record: SymbolWithProfile): Promise<SymbolWithProfile> {
    const profile = record.profile;
    const at = now();

    if (profile === null || profile.profileFetchedAt === null) {
      await storeProfile(record.id, record.symbol);
      return (await repository.findActiveSymbol(record.symbol)) ?? record;
    }

    if (
      isStale(profile.profileFetchedAt, PROFILE_MAX_AGE_MS, at) ||
      isStale(profile.metricsFetchedAt, METRICS_MAX_AGE_MS, at)
    ) {
      refreshInBackground(record.id, record.symbol);
    }

    return record;
  }

  return {
    async refreshSymbols(): Promise<RefreshResult> {
      const newest = await repository.newestSymbolUpdatedAt();
      const ageMs = newest === null ? null : now().getTime() - newest.getTime();

      if (ageMs !== null && ageMs < refreshHours * MILLISECONDS_PER_HOUR) {
        log(`Symbol master refresh skipped: the newest row is younger than ${refreshHours} hours`);
        return { refreshed: false };
      }

      try {
        const assets = await composite.listAssets();
        const result = await repository.upsertSymbols(assets, source);

        log(
          `Symbol master refreshed from ${source}: ${result.listed} listed, ${result.created} created, ` +
            `${result.updated} updated, ${result.deactivated} deactivated`,
        );

        return { refreshed: true, ...result };
      } catch (error) {
        if (error instanceof ProviderUnavailableError) {
          log(`Symbol master refresh skipped: ${error.message}`);
          return { refreshed: false };
        }
        throw error;
      }
    },

    async search(query: string, limit: number): Promise<SymbolSearchResult[]> {
      return await repository.searchSymbols(query, limit);
    },

    async getDetail(symbol: string): Promise<SymbolDetailDto> {
      const found = await repository.findActiveSymbol(symbol);
      if (found === null) throw symbolNotFound(symbol);

      const record = await withProfile(found);
      const quote = await prices.getQuoteSnapshot(record.symbol);

      return toSymbolDetailDto(record, quote);
    },
  };
}
