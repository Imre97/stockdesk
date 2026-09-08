import { Decimal } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";
import { accountEquity, toAccountSummary } from "./summary.js";

const account = {
  id: "acc-1",
  name: "Main",
  cashBalance: new Decimal("100000"),
  createdAt: new Date("2026-09-08T10:00:00.000Z"),
};

describe("accountEquity", () => {
  it("adds the positions value to the cash balance", () => {
    const values = accountEquity(account);

    expect(values.cash.equals("100000")).toBe(true);
    expect(values.positionsValue.isZero()).toBe(true);
    expect(values.equity.equals(values.cash.plus(values.positionsValue))).toBe(true);
  });
});

describe("toAccountSummary", () => {
  it("serializes every monetary field with two decimal places", () => {
    expect(toAccountSummary(account)).toEqual({
      id: "acc-1",
      name: "Main",
      cash: "100000.00",
      positionsValue: "0.00",
      equity: "100000.00",
      unrealizedPnl: "0.00",
      unrealizedPnlPct: "0.00",
      dailyPnl: "0.00",
      dailyPnlPct: "0.00",
      createdAt: "2026-09-08T10:00:00.000Z",
    });
  });

  it("computes the daily profit against the reference equity", () => {
    const summary = toAccountSummary(account, new Decimal("90000"));

    expect(summary.dailyPnl).toBe("10000.00");
    expect(summary.dailyPnlPct).toBe("11.11");
  });

  it("computes a negative daily profit", () => {
    const summary = toAccountSummary(account, new Decimal("125000"));

    expect(summary.dailyPnl).toBe("-25000.00");
    expect(summary.dailyPnlPct).toBe("-20.00");
  });

  it("falls back to zero when the reference equity is zero", () => {
    const summary = toAccountSummary(account, new Decimal("0"));

    expect(summary.dailyPnl).toBe("100000.00");
    expect(summary.dailyPnlPct).toBe("0.00");
  });

  it("rounds cash to two decimal places", () => {
    const summary = toAccountSummary({ ...account, cashBalance: new Decimal("1.005") });

    expect(summary.cash).toBe("1.00");
    expect(summary.equity).toBe("1.00");
  });
});
