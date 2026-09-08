import { Decimal } from "@stockdesk/shared";
import { describe, expect, it, vi } from "vitest";

import { createBarWriter, type PendingBar } from "./bar-writer.js";
import type { CandleInput } from "./candles-repository.js";

const SYMBOL_ID = "symbol-1";
const BUCKET = new Date("2026-09-08T18:00:00.000Z");
const OTHER_BUCKET = new Date("2026-09-08T18:01:00.000Z");

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

function bar(time: Date, close: string): PendingBar {
  return {
    timeframe: "1m",
    time,
    open: new Decimal("250"),
    high: new Decimal("251"),
    low: new Decimal("249"),
    close: new Decimal(close),
    volume: new Decimal("100"),
  };
}

describe("createBarWriter", () => {
  it("applies writes for one series in issue order so a finalized bucket stays final", async () => {
    const applied: string[] = [];
    const slowForming = deferred();

    const candles = {
      saveFormingBar: async (input: CandleInput): Promise<void> => {
        await slowForming.promise;
        applied.push(`forming:${input.close.toString()}`);
      },
      finalizeBar: async (input: CandleInput): Promise<void> => {
        applied.push(`final:${input.close.toString()}`);
      },
    };

    const writer = createBarWriter({
      candles,
      symbols: async () => SYMBOL_ID,
      log: vi.fn(),
    });

    writer.save("TSLA", bar(BUCKET, "250.10"), false);
    writer.save("TSLA", bar(BUCKET, "250.20"), true);

    slowForming.resolve();
    await writer.flush();

    expect(applied).toEqual(["forming:250.1", "final:250.2"]);
  });

  it("does not let one slow series block another", async () => {
    const applied: string[] = [];
    const slowForming = deferred();

    const candles = {
      saveFormingBar: async (input: CandleInput): Promise<void> => {
        if (input.time.getTime() === BUCKET.getTime()) await slowForming.promise;
        applied.push(`forming:${input.time.toISOString()}`);
      },
      finalizeBar: async (): Promise<void> => undefined,
    };

    const writer = createBarWriter({
      candles,
      symbols: async () => SYMBOL_ID,
      log: vi.fn(),
    });

    writer.save("TSLA", bar(BUCKET, "250.10"), false);
    writer.save("TSLA", bar(OTHER_BUCKET, "250.30"), false);

    await vi.waitFor(() => {
      expect(applied).toEqual([`forming:${OTHER_BUCKET.toISOString()}`]);
    });

    slowForming.resolve();
    await writer.flush();

    expect(applied).toHaveLength(2);
  });
});
