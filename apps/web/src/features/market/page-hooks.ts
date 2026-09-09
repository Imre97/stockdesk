import { useCallback, useEffect, useMemo, useState } from "react";
import type { MarketStatus, SymbolDetail, Timeframe, TradeSide } from "@stockdesk/shared";
import { useTranslation } from "react-i18next";

import { useActiveAccountId } from "../accounts/hooks";
import type { PositionViewModel } from "../dashboard/mappers";
import { useActivePositions, usePosition } from "../positions/hooks";
import { useSettingsLocale } from "../settings/hooks";
import { readChartPrefs, writeChartPrefs, type ChartType } from "./chart-prefs";
import { toSymbolHeaderView, type SymbolHeaderView } from "./header-mappers";
import { useMarketStatus, useQuote, useSymbolDetail, useSymbolTrades } from "./hooks";
import { toKeyStatRows, toTradeRow, type KeyStatRow, type TradeRowView } from "./panel-mappers";

export type SidePanelMode = "stats" | "order";

export interface SymbolPageView {
  detail: SymbolDetail | null;
  header: SymbolHeaderView | null;
  marketStatus: MarketStatus | null;
  isLoading: boolean;
}

export interface ChartPrefsControls {
  interval: Timeframe;
  chartType: ChartType;
  setInterval: (interval: Timeframe) => void;
  setChartType: (chartType: ChartType) => void;
}

export interface SidePanelControls {
  mode: SidePanelMode;
  side: TradeSide | null;
  openOrder: (side: TradeSide) => void;
  back: () => void;
}

export function useSymbolPage(symbol: string): SymbolPageView {
  const detailQuery = useSymbolDetail(symbol);
  const quote = useQuote(symbol);
  const marketStatus = useMarketStatus();
  const locale = useSettingsLocale();
  const detail = detailQuery.data ?? null;

  const header = useMemo(
    () => (detail === null ? null : toSymbolHeaderView(detail, quote, locale)),
    [detail, locale, quote],
  );

  return { detail, header, marketStatus, isLoading: detailQuery.isPending };
}

export function useSymbolPageTitle(symbol: string): void {
  const { t } = useTranslation("market");

  useEffect(() => {
    const previous = document.title;

    document.title = t("page.title", { symbol });

    return () => {
      document.title = previous;
    };
  }, [symbol, t]);
}

export function useChartPrefs(): ChartPrefsControls {
  const [prefs, setPrefs] = useState(() => readChartPrefs());

  const setInterval = useCallback((interval: Timeframe) => {
    setPrefs((current) => {
      const next = { interval, chartType: current.chartType };

      writeChartPrefs(next);

      return next;
    });
  }, []);

  const setChartType = useCallback((chartType: ChartType) => {
    setPrefs((current) => {
      const next = { interval: current.interval, chartType };

      writeChartPrefs(next);

      return next;
    });
  }, []);

  return { interval: prefs.interval, chartType: prefs.chartType, setInterval, setChartType };
}

export function useSidePanel(): SidePanelControls {
  const [side, setSide] = useState<TradeSide | null>(null);

  const openOrder = useCallback((next: TradeSide) => setSide(next), []);
  const back = useCallback(() => setSide(null), []);

  return { mode: side === null ? "stats" : "order", side, openOrder, back };
}

export function useSymbolPosition(symbol: string): PositionViewModel | null {
  const accountId = useActivePositions();

  return usePosition(accountId, symbol);
}

export interface SymbolTradeRowsView {
  rows: TradeRowView[];
  hasMore: boolean;
  loadMore: () => void;
  isLoading: boolean;
}

export function useSymbolTradeRows(symbol: string): SymbolTradeRowsView {
  const accountId = useActiveAccountId();
  const locale = useSettingsLocale();
  const { trades, nextCursor, loadMore, isLoading } = useSymbolTrades(accountId, symbol);

  const rows = useMemo(() => trades.map((trade) => toTradeRow(trade, locale)), [locale, trades]);

  return { rows, hasMore: nextCursor !== null, loadMore, isLoading };
}

export function useKeyStats(detail: SymbolDetail | null): KeyStatRow[] | null {
  const locale = useSettingsLocale();

  return useMemo(() => (detail === null ? null : toKeyStatRows(detail, locale)), [detail, locale]);
}
