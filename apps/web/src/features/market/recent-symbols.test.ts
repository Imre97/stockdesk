import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RECENT_SYMBOLS_LIMIT,
  RECENT_SYMBOLS_STORAGE_KEY,
  clearRecentSymbols,
  pushRecentSymbol,
  readRecentSymbols,
} from "./recent-symbols";

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

  it("drops entries that are not symbols", () => {
    window.localStorage.setItem(RECENT_SYMBOLS_STORAGE_KEY, JSON.stringify(["TSLA", 7, null, "AAPL"]));

    expect(readRecentSymbols()).toEqual(["TSLA", "AAPL"]);
  });

  it("survives a localStorage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readRecentSymbols()).toEqual([]);
  });
});

describe("pushRecentSymbol", () => {
  it("puts the newest symbol in front", () => {
    pushRecentSymbol("AAPL");
    pushRecentSymbol("TSLA");

    expect(readRecentSymbols()).toEqual(["TSLA", "AAPL"]);
  });

  it("deduplicates an already known symbol instead of repeating it", () => {
    pushRecentSymbol("AAPL");
    pushRecentSymbol("TSLA");
    pushRecentSymbol("AAPL");

    expect(readRecentSymbols()).toEqual(["AAPL", "TSLA"]);
  });

  it("keeps at most five entries", () => {
    for (const symbol of ["A", "B", "C", "D", "E", "F"]) pushRecentSymbol(symbol);

    expect(readRecentSymbols()).toHaveLength(RECENT_SYMBOLS_LIMIT);
    expect(readRecentSymbols()).toEqual(["F", "E", "D", "C", "B"]);
  });

  it("upper-cases the stored symbol", () => {
    pushRecentSymbol("tsla");

    expect(readRecentSymbols()).toEqual(["TSLA"]);
  });
});

describe("clearRecentSymbols", () => {
  it("removes every stored symbol", () => {
    pushRecentSymbol("TSLA");

    clearRecentSymbols();

    expect(readRecentSymbols()).toEqual([]);
  });
});
