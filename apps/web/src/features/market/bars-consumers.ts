import type { Timeframe } from "@stockdesk/shared";

import { barsKey, useMarketStore } from "./store";

const counts = new Map<string, number>();

export function acquireBars(symbol: string, timeframe: Timeframe): () => void {
  const key = barsKey(symbol, timeframe);

  counts.set(key, (counts.get(key) ?? 0) + 1);

  let released = false;

  return () => {
    if (released) return;

    released = true;

    const remaining = (counts.get(key) ?? 1) - 1;

    if (remaining > 0) {
      counts.set(key, remaining);

      return;
    }

    counts.delete(key);
    useMarketStore.getState().clearBars(symbol, timeframe);
  };
}
