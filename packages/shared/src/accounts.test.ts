import { describe, expect, it } from "vitest";

import {
  ACCOUNT_ERROR_CODES,
  ACCOUNT_LIMIT,
  ACCOUNT_NAME_MAX,
  ACCOUNT_NAME_MIN,
  accountResponseSchema,
  accountSummaryDtoSchema,
  accountSummarySchema,
  accountsResponseSchema,
  createAccountSchema,
  equityPointSchema,
  equityRangeSchema,
  equityResponseSchema,
  positionSchema,
  positionsResponseSchema,
  renameAccountSchema,
} from "./accounts.js";
import { Decimal } from "./decimal.js";

const ACCOUNT_SUMMARY = {
  id: "clx0000000000000000000001",
  name: "Main",
  cash: "100000.00",
  positionsValue: "0.00",
  equity: "100000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  longValue: "0.00",
  shortValue: "0.00",
  shortMargin: "0.00",
  reservedCash: "0.00",
  buyingPower: "100000.00",
  marginDeficit: false,
  createdAt: "2026-09-08T10:00:00.000Z",
};

const POSITION = {
  symbol: "AAPL",
  quantity: "10",
  averageCost: "180.2500",
  lastPrice: "182.1000",
  marketValue: "1821.00",
  unrealizedPnl: "18.50",
  unrealizedPnlPct: "1.03",
  dailyChange: "-4.20",
  dailyChangePct: "-0.23",
  realizedPnl: "12.50",
};

describe("account constants", () => {
  it("caps accounts per user at ten", () => {
    expect(ACCOUNT_LIMIT).toBe(10);
  });

  it("bounds the account name between one and forty characters", () => {
    expect(ACCOUNT_NAME_MIN).toBe(1);
    expect(ACCOUNT_NAME_MAX).toBe(40);
  });
});

describe("ACCOUNT_ERROR_CODES", () => {
  it("lists exactly the codes from the module spec", () => {
    expect(ACCOUNT_ERROR_CODES).toEqual([
      "ACCOUNT_NOT_FOUND",
      "ACCOUNT_NAME_TAKEN",
      "ACCOUNT_LIMIT_REACHED",
      "DEPOSIT_LIMIT_EXCEEDED",
    ]);
  });
});

describe("accountSummarySchema", () => {
  it("transforms every monetary field into a Decimal", () => {
    const result = accountSummarySchema.parse(ACCOUNT_SUMMARY);

    for (const field of [
      "cash",
      "positionsValue",
      "equity",
      "unrealizedPnl",
      "unrealizedPnlPct",
      "dailyPnl",
      "dailyPnlPct",
    ] as const) {
      expect(result[field]).toBeInstanceOf(Decimal);
    }

    expect(result.cash.equals(new Decimal("100000"))).toBe(true);
    expect(result.createdAt).toBe(ACCOUNT_SUMMARY.createdAt);
  });

  it("rejects a monetary field sent as a JSON number", () => {
    expect(accountSummarySchema.safeParse({ ...ACCOUNT_SUMMARY, cash: 100000 }).success).toBe(false);
  });

  it("rejects an empty id", () => {
    expect(accountSummarySchema.safeParse({ ...ACCOUNT_SUMMARY, id: "" }).success).toBe(false);
  });

  it("rejects a createdAt without a time component", () => {
    expect(accountSummarySchema.safeParse({ ...ACCOUNT_SUMMARY, createdAt: "2026-09-08" }).success).toBe(false);
  });

  it("strips unknown keys", () => {
    const result = accountSummarySchema.parse({ ...ACCOUNT_SUMMARY, userId: "clx000" });

    expect(result).not.toHaveProperty("userId");
  });
});

describe("accountSummarySchema buying power fields", () => {
  it("transforms the buying power fields into Decimal values and keeps the deficit flag", () => {
    const result = accountSummarySchema.parse({ ...ACCOUNT_SUMMARY, shortValue: "1200.00", marginDeficit: true });

    expect(result.buyingPower.equals(new Decimal("100000"))).toBe(true);
    expect(result.shortValue.equals(new Decimal("1200"))).toBe(true);
    expect(result.marginDeficit).toBe(true);
  });

  it.each([
    ["a missing buyingPower", { ...ACCOUNT_SUMMARY, buyingPower: undefined }],
    ["a marginDeficit sent as a string", { ...ACCOUNT_SUMMARY, marginDeficit: "false" }],
    ["a reservedCash sent as a JSON number", { ...ACCOUNT_SUMMARY, reservedCash: 0 }],
  ])("rejects %s", (_label, input) => {
    expect(accountSummarySchema.safeParse(input).success).toBe(false);
  });
});

describe("accountSummaryDtoSchema", () => {
  it("keeps the monetary fields as strings", () => {
    const result = accountSummaryDtoSchema.parse(ACCOUNT_SUMMARY);

    expect(result.cash).toBe("100000.00");
    expect(result.equity).toBe("100000.00");
  });

  it("rejects a malformed decimal string", () => {
    expect(accountSummaryDtoSchema.safeParse({ ...ACCOUNT_SUMMARY, cash: "1e5" }).success).toBe(false);
  });
});

describe("account responses", () => {
  it("accepts a list response", () => {
    const result = accountsResponseSchema.parse({ accounts: [ACCOUNT_SUMMARY] });

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]?.equity.equals(new Decimal("100000"))).toBe(true);
  });

  it("accepts an empty list", () => {
    expect(accountsResponseSchema.parse({ accounts: [] }).accounts).toEqual([]);
  });

  it("accepts a single account response", () => {
    const result = accountResponseSchema.parse({ account: ACCOUNT_SUMMARY });

    expect(result.account.name).toBe("Main");
  });

  it("rejects a list response without the accounts key", () => {
    expect(accountsResponseSchema.safeParse({}).success).toBe(false);
  });
});

describe("createAccountSchema and renameAccountSchema", () => {
  it.each([[createAccountSchema], [renameAccountSchema]])("trims the name", (schema) => {
    expect(schema.parse({ name: "  Savings  " })).toEqual({ name: "Savings" });
  });

  it.each([[createAccountSchema], [renameAccountSchema]])("rejects a name empty after trimming", (schema) => {
    expect(schema.safeParse({ name: "   " }).success).toBe(false);
  });

  it.each([[createAccountSchema], [renameAccountSchema]])("accepts a name of forty characters", (schema) => {
    expect(schema.safeParse({ name: "a".repeat(40) }).success).toBe(true);
  });

  it.each([[createAccountSchema], [renameAccountSchema]])("rejects a name of forty-one characters", (schema) => {
    expect(schema.safeParse({ name: "a".repeat(41) }).success).toBe(false);
  });

  it("strips unknown keys", () => {
    expect(createAccountSchema.parse({ name: "Savings", cashBalance: "999" })).toEqual({ name: "Savings" });
  });
});

describe("equityRangeSchema", () => {
  it.each([["1D"], ["5D"], ["1W"], ["1M"], ["1Y"]])("accepts %s", (range) => {
    expect(equityRangeSchema.parse(range)).toBe(range);
  });

  it.each([["1d"], ["2D"], ["ALL"], [""], ["1"]])("rejects %s", (range) => {
    expect(equityRangeSchema.safeParse(range).success).toBe(false);
  });
});

describe("equityPointSchema and equityResponseSchema", () => {
  it("transforms the equity into a Decimal", () => {
    const result = equityPointSchema.parse({ at: "2026-09-08T14:30:00.000Z", equity: "100000.00" });

    expect(result.equity).toBeInstanceOf(Decimal);
    expect(result.at).toBe("2026-09-08T14:30:00.000Z");
  });

  it("accepts a response with points", () => {
    const result = equityResponseSchema.parse({
      range: "1D",
      points: [{ at: "2026-09-08T14:30:00.000Z", equity: "100000.00" }],
    });

    expect(result.range).toBe("1D");
    expect(result.points[0]?.equity.equals(new Decimal("100000"))).toBe(true);
  });

  it("accepts a response with no points", () => {
    expect(equityResponseSchema.parse({ range: "1Y", points: [] }).points).toEqual([]);
  });

  it("rejects a response with an unknown range", () => {
    expect(equityResponseSchema.safeParse({ range: "ALL", points: [] }).success).toBe(false);
  });
});

describe("positionSchema", () => {
  it("transforms every numeric field into a Decimal", () => {
    const result = positionSchema.parse(POSITION);

    expect(result.symbol).toBe("AAPL");
    expect(result.quantity).toBeInstanceOf(Decimal);
    expect(result.dailyChange.equals(new Decimal("-4.20"))).toBe(true);
  });

  it("accepts a negative quantity for a short position", () => {
    const result = positionSchema.parse({ ...POSITION, quantity: "-10" });

    expect(result.quantity.isNegative()).toBe(true);
  });

  it("accepts a symbol of ten characters", () => {
    expect(positionSchema.safeParse({ ...POSITION, symbol: "A".repeat(10) }).success).toBe(true);
  });

  it.each([
    ["an empty symbol", ""],
    ["a symbol of eleven characters", "A".repeat(11)],
    ["a lowercase symbol", "aapl"],
  ])("rejects %s", (_label, symbol) => {
    expect(positionSchema.safeParse({ ...POSITION, symbol }).success).toBe(false);
  });

  it("rejects a price sent as a JSON number", () => {
    expect(positionSchema.safeParse({ ...POSITION, lastPrice: 182.1 }).success).toBe(false);
  });

  it("transforms the realized profit into a Decimal and rejects its absence", () => {
    expect(positionSchema.parse(POSITION).realizedPnl.equals(new Decimal("12.5"))).toBe(true);
    expect(positionSchema.safeParse({ ...POSITION, realizedPnl: undefined }).success).toBe(false);
  });

  it("accepts an empty positions response", () => {
    expect(positionsResponseSchema.parse({ positions: [] }).positions).toEqual([]);
  });

  it("accepts a positions response with rows", () => {
    expect(positionsResponseSchema.parse({ positions: [POSITION] }).positions).toHaveLength(1);
  });
});
