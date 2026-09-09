export interface SymbolQueue {
  run: (symbol: string, task: () => Promise<void>) => Promise<void>;
  flush: () => Promise<void>;
  pending: () => number;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Work for one symbol is chained so two ticks never evaluate the same orders at the same time,
 * while different symbols run concurrently. A task never rejects its caller: the failure is logged
 * and the chain keeps running, and `flush` waits until nothing is left in flight.
 */
export function createSymbolQueue(log: (message: string) => void): SymbolQueue {
  const chains = new Map<string, Promise<void>>();
  const inFlight = new Set<Promise<void>>();

  return {
    run(symbol: string, task: () => Promise<void>): Promise<void> {
      const previous = chains.get(symbol) ?? Promise.resolve();
      const guarded = previous
        .then(task)
        .catch((error: unknown) => {
          log(`Processing the order queue of ${symbol} failed: ${describe(error)}`);
        });

      chains.set(symbol, guarded);
      inFlight.add(guarded);

      void guarded.finally(() => {
        inFlight.delete(guarded);
        if (chains.get(symbol) === guarded) chains.delete(symbol);
      });

      return guarded;
    },

    async flush(): Promise<void> {
      while (inFlight.size > 0) await Promise.all([...inFlight]);
    },

    pending: () => inFlight.size,
  };
}
