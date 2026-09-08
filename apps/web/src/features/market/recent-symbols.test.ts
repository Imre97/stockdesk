import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RECENT_SYMBOLS_LIMIT,
  RECENT_SYMBOLS_STORAGE_KEY,
  clearRecentSymbols,
  pushRecentSymbol,
  readRecentSymbols,
} from "./recent-symbols";

const TSLA = { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" };
const AAPL = { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" };

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("readRecentSymbols", () => {
  it("returns an empty list when nothing was stored", () => {
    expect(readRecentSymbols()).toEqual([]);
  });

  it("returns an empty list for a corrupt value", () => {
    window.localStorage.setItem(RECENT_SYMBOLS_STORAGE_KEY, "{not json");

    expect(readRecentSymbols()).toEqual([]);
  });

  it("drops entries that are not symbol objects", () => {
    window.localStorage.setItem(RECENT_SYMBOLS_STORAGE_KEY, JSON.stringify([TSLA, 7, null, AAPL]));

    expect(readRecentSymbols()).toEqual([TSLA, AAPL]);
  });

  it("drops the old string-only format instead of guessing a name", () => {
    window.localStorage.setItem(RECENT_SYMBOLS_STORAGE_KEY, JSON.stringify(["TSLA", "AAPL"]));

    expect(readRecentSymbols()).toEqual([]);
  });

  it("survives a localStorage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readRecentSymbols()).toEqual([]);
  });
});

describe("pushRecentSymbol", () => {
  it("puts the newest symbol in front with its name and exchange", () => {
    pushRecentSymbol(AAPL);
    pushRecentSymbol(TSLA);

    expect(readRecentSymbols()).toEqual([TSLA, AAPL]);
  });

  it("deduplicates an already known symbol instead of repeating it", () => {
    pushRecentSymbol(AAPL);
    pushRecentSymbol(TSLA);
    pushRecentSymbol(AAPL);

    expect(readRecentSymbols()).toEqual([AAPL, TSLA]);
  });

  it("keeps at most five entries", () => {
    for (const symbol of ["A", "B", "C", "D", "E", "F"]) {
      pushRecentSymbol({ symbol, name: `${symbol} Inc.`, exchange: "NYSE" });
    }

    expect(readRecentSymbols()).toHaveLength(RECENT_SYMBOLS_LIMIT);
    expect(readRecentSymbols().map((entry) => entry.symbol)).toEqual(["F", "E", "D", "C", "B"]);
  });

  it("upper-cases the stored symbol", () => {
    pushRecentSymbol({ symbol: "tsla", name: "Tesla, Inc.", exchange: "NASDAQ" });

    expect(readRecentSymbols()).toEqual([TSLA]);
  });

  it("ignores an entry whose ticker is not a symbol", () => {
    pushRecentSymbol({ symbol: "not a ticker", name: "Nope", exchange: "NYSE" });

    expect(readRecentSymbols()).toEqual([]);
  });
});

describe("clearRecentSymbols", () => {
  it("removes every stored symbol", () => {
    pushRecentSymbol(TSLA);

    clearRecentSymbols();

    expect(readRecentSymbols()).toEqual([]);
  });
});
