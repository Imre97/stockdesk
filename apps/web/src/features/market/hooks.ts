import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketStatus, SymbolDetail, SymbolSearchResult, Timeframe, Trade } from "@stockdesk/shared";
import { useInfiniteQuery, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { userScopedKey } from "../../lib/query-keys";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useCurrentUserId } from "../auth/hooks";
import { useSettingsLocale } from "../settings/hooks";
import * as api from "./api";
import { acquireBars } from "./bars-consumers";
import {
  toChartBar,
  toMarketStatusBadge,
  type ChartBar,
  type MarketStatusBadgeView,
  type QuoteTick,
} from "./mappers";
import { barsKey, useMarketStore } from "./store";
import { subscribeBars, subscribeQuote } from "./subscriptions";

export const SEARCH_DEBOUNCE_MS = 200;
export const SEARCH_MIN_LENGTH = 1;
export const MARKET_STATUS_STALE_TIME_MS = 60_000;

const EMPTY_BARS: ChartBar[] = [];

function marketKey(userId: string | null, ...parts: readonly unknown[]): readonly unknown[] {
  return userScopedKey(userId, "market", ...parts);
}

export function symbolSearchQueryKey(userId: string | null, query: string): readonly unknown[] {
  return marketKey(userId, "search", query);
}

export function symbolDetailQueryKey(userId: string | null, symbol: string): readonly unknown[] {
  return marketKey(userId, "symbol", symbol);
}

export function marketStatusQueryKey(userId: string | null): readonly unknown[] {
  return marketKey(userId, "status");
}

export function barsQueryKey(
  userId: string | null,
  symbol: string,
  timeframe: Timeframe,
): readonly unknown[] {
  return marketKey(userId, "bars", symbol, timeframe);
}

export function symbolTradesQueryKey(
  userId: string | null,
  accountId: string | null,
  symbol: string,
): readonly unknown[] {
  return marketKey(userId, "trades", accountId, symbol);
}

export interface SymbolSearchView {
  results: SymbolSearchResult[];
  isLoading: boolean;
  hasQuery: boolean;
}

export function useSymbolSearch(query: string): SymbolSearchView {
  const userId = useCurrentUserId();
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const hasQuery = debounced.length >= SEARCH_MIN_LENGTH;

  const search = useQuery({
    queryKey: symbolSearchQueryKey(userId, debounced),
    queryFn: () => api.searchSymbols(debounced),
    enabled: hasQuery,
  });

  return {
    results: hasQuery ? (search.data?.results ?? []) : [],
    isLoading: hasQuery && search.isPending,
    hasQuery,
  };
}

export function useSymbolDetail(symbol: string): UseQueryResult<SymbolDetail> {
  const userId = useCurrentUserId();
  const upper = symbol.toUpperCase();

  return useQuery({
    queryKey: symbolDetailQueryKey(userId, upper),
    queryFn: () => api.getSymbol(upper),
    enabled: upper !== "",
  });
}

export function useMarketStatus(): MarketStatus | null {
  const userId = useCurrentUserId();
  const pushed = useMarketStore((state) => state.marketStatus);

  const status = useQuery({
    queryKey: marketStatusQueryKey(userId),
    queryFn: () => api.getMarketStatus(),
    staleTime: MARKET_STATUS_STALE_TIME_MS,
  });

  return pushed ?? status.data ?? null;
}

export function useMarketStatusBadge(): MarketStatusBadgeView | null {
  const status = useMarketStatus();
  const locale = useSettingsLocale();

  return useMemo(() => (status === null ? null : toMarketStatusBadge(status, locale)), [locale, status]);
}

export function useQuote(symbol: string): QuoteTick | null {
  const upper = symbol.toUpperCase();
  const tick = useMarketStore((state) => state.quotes[upper]);

  useEffect(() => subscribeQuote(upper), [upper]);

  return tick ?? null;
}

export interface BarsView {
  bars: ChartBar[];
  loadOlder: () => void;
  hasMore: boolean;
  isLoading: boolean;
}

export function useBars(symbol: string, timeframe: Timeframe): BarsView {
  const userId = useCurrentUserId();
  const upper = symbol.toUpperCase();
  const setBars = useMarketStore((state) => state.setBars);
  const prependBars = useMarketStore((state) => state.prependBars);
  const series = useMarketStore((state) => state.bars[barsKey(upper, timeframe)]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const page = useQuery({
    queryKey: barsQueryKey(userId, upper, timeframe),
    queryFn: () => api.getBars(upper, timeframe, {}),
    enabled: upper !== "",
  });

  const firstPage = page.data;

  useEffect(() => {
    if (firstPage === undefined) return;

    setBars(upper, timeframe, firstPage.bars.map((bar) => toChartBar(bar)));
    setHasMore(firstPage.hasMore);
  }, [firstPage, setBars, timeframe, upper]);

  useEffect(() => subscribeBars(upper, timeframe), [timeframe, upper]);

  useEffect(() => acquireBars(upper, timeframe), [timeframe, upper]);

  const bars = series ?? EMPTY_BARS;
  const oldest = bars[0];

  const loadOlder = useCallback(() => {
    if (oldest === undefined || !hasMore || loadingOlder) return;

    setLoadingOlder(true);

    void api
      .getBars(upper, timeframe, { end: oldest.time.toISOString() })
      .then((older) => {
        prependBars(upper, timeframe, older.bars.map((bar) => toChartBar(bar)));
        setHasMore(older.hasMore);
      })
      .finally(() => setLoadingOlder(false));
  }, [hasMore, loadingOlder, oldest, prependBars, timeframe, upper]);

  return { bars, loadOlder, hasMore, isLoading: page.isPending || loadingOlder };
}

export interface SymbolTradesView {
  trades: Trade[];
  nextCursor: string | null;
  loadMore: () => void;
  isLoading: boolean;
}

export function useSymbolTrades(accountId: string | null, symbol: string): SymbolTradesView {
  const userId = useCurrentUserId();
  const upper = symbol.toUpperCase();

  const pages = useInfiniteQuery({
    queryKey: symbolTradesQueryKey(userId, accountId, upper),
    queryFn: ({ pageParam }) =>
      api.getTrades(accountId ?? "", pageParam === null ? { symbol: upper } : { symbol: upper, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: accountId !== null && upper !== "",
  });

  const loaded = pages.data?.pages;
  const trades = useMemo(() => (loaded ?? []).flatMap((entry) => entry.trades), [loaded]);
  const nextCursor = loaded?.[loaded.length - 1]?.nextCursor ?? null;

  const { hasNextPage, fetchNextPage } = pages;

  const loadMore = useCallback(() => {
    if (!hasNextPage) return;

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage]);

  return { trades, nextCursor, loadMore, isLoading: pages.isPending };
}
