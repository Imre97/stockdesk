import type { BarMessage, MarketStatus, MarketStatusMessage, QuoteMessage, Timeframe } from "@stockdesk/shared";
import { create } from "zustand";

import { toChartBar, toQuoteTick, type ChartBar, type QuoteTick } from "./mappers";

export interface MarketState {
  quotes: Record<string, QuoteTick>;
  marketStatus: MarketStatus | null;
  bars: Record<string, ChartBar[]>;
  applyQuote: (message: QuoteMessage) => void;
  applyBar: (message: BarMessage) => void;
  setBars: (symbol: string, timeframe: Timeframe, bars: ChartBar[]) => void;
  prependBars: (symbol: string, timeframe: Timeframe, olderBars: ChartBar[]) => void;
  applyMarketStatus: (message: MarketStatusMessage) => void;
  clearBars: (symbol: string, timeframe: Timeframe) => void;
  reset: () => void;
}

export function barsKey(symbol: string, timeframe: Timeframe): string {
  return `${symbol}:${timeframe}`;
}

function mergeLive(existing: ChartBar[], incoming: ChartBar): ChartBar[] {
  const last = existing[existing.length - 1];

  if (last === undefined || incoming.time.getTime() > last.time.getTime()) return [...existing, incoming];
  if (incoming.time.getTime() < last.time.getTime()) return existing;

  return [...existing.slice(0, -1), incoming];
}

export const useMarketStore = create<MarketState>((set) => ({
  quotes: {},
  marketStatus: null,
  bars: {},

  applyQuote: (message) =>
    set((state) => ({ quotes: { ...state.quotes, [message.symbol]: toQuoteTick(message) } })),

  applyBar: (message) =>
    set((state) => {
      const key = barsKey(message.symbol, message.timeframe);

      return { bars: { ...state.bars, [key]: mergeLive(state.bars[key] ?? [], toChartBar(message.bar, message.isFinal)) } };
    }),

  setBars: (symbol, timeframe, bars) =>
    set((state) => ({ bars: { ...state.bars, [barsKey(symbol, timeframe)]: bars } })),

  prependBars: (symbol, timeframe, olderBars) =>
    set((state) => {
      const key = barsKey(symbol, timeframe);

      return { bars: { ...state.bars, [key]: [...olderBars, ...(state.bars[key] ?? [])] } };
    }),

  applyMarketStatus: (message) =>
    set({
      marketStatus: {
        status: message.status,
        nextOpenAt: message.nextOpenAt,
        nextCloseAt: message.nextCloseAt,
      },
    }),

  clearBars: (symbol, timeframe) =>
    set((state) => {
      const { [barsKey(symbol, timeframe)]: _removed, ...rest } = state.bars;

      return { bars: rest };
    }),

  reset: () => set({ quotes: {}, marketStatus: null, bars: {} }),
}));
