import { useEffect, useMemo } from "react";
import { Decimal, QUOTE_SUBSCRIPTION_LIMIT, type DecimalValue } from "@stockdesk/shared";
import { useQuery } from "@tanstack/react-query";

import * as accountsApi from "../accounts/api";
import { positionsQueryKey, useActiveAccountId } from "../accounts/hooks";
import { useCurrentUserId } from "../auth/hooks";
import type { PositionViewModel } from "../dashboard/mappers";
import { useMarketStore } from "../market/store";
import { subscribeQuote } from "../market/subscriptions";
import { useSettingsLocale } from "../settings/hooks";
import { toPositionRow, type PositionEntry } from "./mappers";
import { usePositionsStore, type PositionsState } from "./store";

const SYMBOL_SEPARATOR = ",";
const NO_ROWS: PositionViewModel[] = [];
const ZERO_QUANTITY = new Decimal(0);

function openPositions(state: PositionsState, accountId: string | null): Record<string, PositionEntry> | undefined {
  return accountId === null ? undefined : state.positionsByAccount[accountId];
}

function subscribedSymbolsKey(state: PositionsState, accountId: string | null): string {
  return Object.keys(openPositions(state, accountId) ?? {})
    .sort()
    .slice(0, QUOTE_SUBSCRIPTION_LIMIT)
    .join(SYMBOL_SEPARATOR);
}

export function usePositions(accountId: string | null): void {
  const userId = useCurrentUserId();
  const setPositions = usePositionsStore((state) => state.setPositions);

  const query = useQuery({
    queryKey: positionsQueryKey(userId, accountId),
    queryFn: () => accountsApi.getPositions(accountId ?? ""),
    enabled: accountId !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const positions = query.data?.positions;

  useEffect(() => {
    if (accountId === null || positions === undefined) return;

    setPositions(accountId, positions);
  }, [accountId, positions, setPositions]);
}

export function useActivePositions(): string | null {
  const accountId = useActiveAccountId();

  usePositions(accountId);
  usePositionsQuoteSubscription(accountId);

  return accountId;
}

export function usePositionRows(accountId: string | null): PositionViewModel[] {
  const positions = usePositionsStore((state) => openPositions(state, accountId));
  const quotes = useMarketStore((state) => state.quotes);
  const locale = useSettingsLocale();

  return useMemo(() => {
    if (positions === undefined) return NO_ROWS;

    return Object.keys(positions)
      .sort()
      .flatMap((symbol) => {
        const entry = positions[symbol];

        return entry === undefined ? [] : [toPositionRow(entry, quotes[symbol] ?? null, locale)];
      });
  }, [locale, positions, quotes]);
}

export function usePosition(accountId: string | null, symbol: string): PositionViewModel | null {
  const upper = symbol.toUpperCase();
  const entry = usePositionsStore((state) => openPositions(state, accountId)?.[upper]);
  const quote = useMarketStore((state) => state.quotes[upper]);
  const locale = useSettingsLocale();

  return useMemo(
    () => (entry === undefined ? null : toPositionRow(entry, quote ?? null, locale)),
    [entry, locale, quote],
  );
}

export function usePositionQuantity(accountId: string | null, symbol: string): DecimalValue {
  const upper = symbol.toUpperCase();
  const quantity = usePositionsStore((state) => openPositions(state, accountId)?.[upper]?.quantity);

  return quantity ?? ZERO_QUANTITY;
}

export function usePositionsQuoteSubscription(accountId: string | null): void {
  const symbolsKey = usePositionsStore((state) => subscribedSymbolsKey(state, accountId));

  useEffect(() => {
    if (symbolsKey === "") return;

    const releases = symbolsKey.split(SYMBOL_SEPARATOR).map((symbol) => subscribeQuote(symbol));

    return () => {
      for (const release of releases) release();
    };
  }, [symbolsKey]);
}
