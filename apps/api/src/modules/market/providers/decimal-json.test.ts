import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { parseJsonWithDecimals } from "./decimal-json.js";

const PRICE_KEYS: ReadonlySet<string> = new Set(["p", "s"]);

describe("parseJsonWithDecimals", () => {
  it("turns the configured keys into Decimal values", () => {
    const parsed = parseJsonWithDecimals('{"p":182.10,"s":100}', PRICE_KEYS) as {
      p: Decimal;
      s: Decimal;
    };

    expect(parsed.p).toBeInstanceOf(Decimal);
    expect(parsed.p.toString()).toBe("182.1");
    expect(parsed.s).toBeInstanceOf(Decimal);
    expect(parsed.s.toString()).toBe("100");
  });

  it("preserves digits a JavaScript number would lose", () => {
    const parsed = parseJsonWithDecimals('{"p":123456789.123456789}', PRICE_KEYS) as { p: Decimal };

    expect(parsed.p.toString()).toBe("123456789.123456789");
  });

  it("preserves a seventeen significant digit price", () => {
    const parsed = parseJsonWithDecimals('{"p":182.10000000000000001}', PRICE_KEYS) as { p: Decimal };

    expect(parsed.p.toString()).toBe("182.10000000000000001");
  });

  it("converts decimal keys inside nested arrays and objects", () => {
    const parsed = parseJsonWithDecimals(
      '{"trades":{"AAPL":[{"p":1.5,"s":2},{"p":1.75,"s":3}]}}',
      PRICE_KEYS,
    ) as { trades: { AAPL: { p: Decimal; s: Decimal }[] } };

    expect(parsed.trades.AAPL.map((trade) => trade.p.toString())).toEqual(["1.5", "1.75"]);
    expect(parsed.trades.AAPL.map((trade) => trade.s.toString())).toEqual(["2", "3"]);
  });

  it("leaves numbers under other keys as numbers", () => {
    const parsed = parseJsonWithDecimals('{"p":1.5,"n":12,"flag":true}', PRICE_KEYS) as {
      p: Decimal;
      n: unknown;
      flag: unknown;
    };

    expect(parsed.p).toBeInstanceOf(Decimal);
    expect(parsed.n).toBe(12);
    expect(parsed.flag).toBe(true);
  });

  it("leaves null and string values under decimal keys untouched", () => {
    const parsed = parseJsonWithDecimals('{"p":null,"s":"AAPL"}', PRICE_KEYS) as {
      p: unknown;
      s: unknown;
    };

    expect(parsed.p).toBeNull();
    expect(parsed.s).toBe("AAPL");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonWithDecimals("{not json", PRICE_KEYS)).toThrow();
  });
});
