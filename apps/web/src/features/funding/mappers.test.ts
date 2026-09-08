import { Decimal, cashTransactionSchema, type CashTransactionDto } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { parseAmountInput, toTransactionViewModel } from "./mappers";

const HU_GROUP = new Intl.NumberFormat("hu-HU").formatToParts(12345.6).find((part) => part.type === "group")?.value ?? "";

function dto(overrides: Partial<CashTransactionDto> = {}): CashTransactionDto {
  return {
    id: "tx-1",
    accountId: "acc-1",
    type: "DEPOSIT",
    amount: "5000.00",
    balanceAfter: "105000.00",
    note: "initial funding",
    referenceId: null,
    createdAt: "2026-09-08T10:05:00.000Z",
    ...overrides,
  };
}

describe("parseAmountInput", () => {
  it("accepts a plain decimal string", () => {
    expect(parseAmountInput("5000.00", "en-US")?.equals(new Decimal("5000"))).toBe(true);
  });

  it("accepts an en-US grouped amount", () => {
    expect(parseAmountInput("5,000.00", "en-US")?.equals(new Decimal("5000"))).toBe(true);
  });

  it("accepts a hu-HU grouped amount typed with a plain space", () => {
    expect(parseAmountInput("5 000,00", "hu-HU")?.equals(new Decimal("5000"))).toBe(true);
  });

  it("accepts a hu-HU grouped amount typed with the locale group separator", () => {
    expect(parseAmountInput(`5${HU_GROUP}000,00`, "hu-HU")?.equals(new Decimal("5000"))).toBe(true);
  });

  it("rejects text", () => {
    expect(parseAmountInput("abc", "en-US")).toBeNull();
  });

  it("rejects an empty input", () => {
    expect(parseAmountInput("   ", "en-US")).toBeNull();
  });

  it("rejects a Hungarian formatted amount in the en-US locale", () => {
    expect(parseAmountInput("5.000,00", "en-US")).toBeNull();
  });

  it("rejects a second decimal separator", () => {
    expect(parseAmountInput("5.00.00", "en-US")).toBeNull();
  });

  it("keeps the exact decimal value without a floating point detour", () => {
    expect(parseAmountInput("0.1", "en-US")?.plus("0.2").equals(new Decimal("0.3"))).toBe(true);
  });
});

describe("toTransactionViewModel", () => {
  it("formats a deposit with a signed amount and a neutral balance", () => {
    const view = toTransactionViewModel(cashTransactionSchema.parse(dto()), "en-US");

    expect(view.id).toBe("tx-1");
    expect(view.type).toBe("DEPOSIT");
    expect(view.amount).toBe("+$5,000.00");
    expect(view.balanceAfter).toBe("$105,000.00");
    expect(view.tone).toBe("gain");
    expect(view.date).not.toBe("");
  });

  it("tones a negative movement as a loss", () => {
    const view = toTransactionViewModel(
      cashTransactionSchema.parse(dto({ type: "TRANSFER_OUT", amount: "-250.00", balanceAfter: "104750.00" })),
      "en-US",
    );

    expect(view.amount).toBe("-$250.00");
    expect(view.tone).toBe("loss");
  });
});
