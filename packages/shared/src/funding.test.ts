import { describe, expect, it } from "vitest";

import { Decimal } from "./decimal.js";
import {
  DEPOSIT_LIMIT,
  DEPOSIT_NOTE_MAX,
  TRANSACTIONS_PAGE_DEFAULT,
  TRANSACTIONS_PAGE_MAX,
  cashTransactionSchema,
  cashTransactionTypeSchema,
  depositResponseSchema,
  depositSchema,
  transactionsPageSchema,
  transactionsQuerySchema,
} from "./funding.js";

const AMOUNT_POSITIVE_ERROR = "Amount must be positive";
const AMOUNT_PLACES_ERROR = "Amount has more than 2 decimal places";
const AMOUNT_LIMIT_ERROR = "Amount exceeds the deposit limit";

const CASH_TRANSACTION = {
  id: "clx0000000000000000000002",
  accountId: "clx0000000000000000000001",
  type: "DEPOSIT",
  amount: "5000.00",
  balanceAfter: "105000.00",
  note: "initial funding",
  referenceId: null,
  createdAt: "2026-09-08T10:05:00.000Z",
};

const ACCOUNT_SUMMARY = {
  id: "clx0000000000000000000001",
  name: "Main",
  cash: "105000.00",
  positionsValue: "0.00",
  equity: "105000.00",
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

function messages(input: unknown): string[] {
  const result = depositSchema.safeParse(input);

  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("funding constants", () => {
  it("limits a single deposit to one million", () => {
    expect(DEPOSIT_LIMIT.equals(new Decimal("1000000.00"))).toBe(true);
  });

  it("bounds the note and the transactions page size", () => {
    expect(DEPOSIT_NOTE_MAX).toBe(200);
    expect(TRANSACTIONS_PAGE_DEFAULT).toBe(50);
    expect(TRANSACTIONS_PAGE_MAX).toBe(100);
  });
});

describe("cashTransactionTypeSchema", () => {
  it("lists exactly the ledger types from the module spec", () => {
    expect(cashTransactionTypeSchema.options).toEqual([
      "DEPOSIT",
      "WITHDRAWAL",
      "TRANSFER_IN",
      "TRANSFER_OUT",
      "TRADE",
    ]);
  });

  it("rejects an unknown type", () => {
    expect(cashTransactionTypeSchema.safeParse("REFUND").success).toBe(false);
  });
});

describe("depositSchema amount", () => {
  it("transforms a valid amount into a Decimal", () => {
    const result = depositSchema.parse({ amount: "5000.00" });

    expect(result.amount).toBeInstanceOf(Decimal);
    expect(result.amount.equals(new Decimal("5000"))).toBe(true);
  });

  it("rejects zero with the positive message", () => {
    expect(messages({ amount: "0.00" })).toContain(AMOUNT_POSITIVE_ERROR);
  });

  it("rejects a negative amount with the positive message", () => {
    expect(messages({ amount: "-1.00" })).toContain(AMOUNT_POSITIVE_ERROR);
  });

  it("accepts the smallest positive amount", () => {
    expect(depositSchema.safeParse({ amount: "0.01" }).success).toBe(true);
  });

  it("rejects three decimal places with the precision message", () => {
    expect(messages({ amount: "1.234" })).toContain(AMOUNT_PLACES_ERROR);
  });

  it("accepts an amount with fewer than two decimal places", () => {
    expect(depositSchema.safeParse({ amount: "1" }).success).toBe(true);
  });

  it("accepts the deposit limit exactly", () => {
    expect(depositSchema.safeParse({ amount: "1000000.00" }).success).toBe(true);
  });

  it("rejects one cent above the deposit limit with the limit message", () => {
    expect(messages({ amount: "1000000.01" })).toContain(AMOUNT_LIMIT_ERROR);
  });

  it("rejects an amount sent as a JSON number", () => {
    expect(depositSchema.safeParse({ amount: 5000 }).success).toBe(false);
  });

  it("rejects a body without an amount", () => {
    expect(depositSchema.safeParse({}).success).toBe(false);
  });
});

describe("depositSchema note", () => {
  it("trims the note", () => {
    expect(depositSchema.parse({ amount: "1.00", note: "  salary  " }).note).toBe("salary");
  });

  it("treats a blank note as absent", () => {
    expect(depositSchema.parse({ amount: "1.00", note: "   " }).note).toBeUndefined();
  });

  it("omits the note when it is not sent", () => {
    expect(depositSchema.parse({ amount: "1.00" }).note).toBeUndefined();
  });

  it("accepts a note of two hundred characters", () => {
    expect(depositSchema.safeParse({ amount: "1.00", note: "a".repeat(200) }).success).toBe(true);
  });

  it("rejects a note of two hundred and one characters", () => {
    expect(depositSchema.safeParse({ amount: "1.00", note: "a".repeat(201) }).success).toBe(false);
  });
});

describe("cashTransactionSchema", () => {
  it("transforms the amounts into Decimals", () => {
    const result = cashTransactionSchema.parse(CASH_TRANSACTION);

    expect(result.amount).toBeInstanceOf(Decimal);
    expect(result.balanceAfter.equals(new Decimal("105000"))).toBe(true);
    expect(result.type).toBe("DEPOSIT");
  });

  it("accepts a null note and a null reference", () => {
    const result = cashTransactionSchema.parse({ ...CASH_TRANSACTION, note: null, referenceId: null });

    expect(result.note).toBeNull();
    expect(result.referenceId).toBeNull();
  });

  it("accepts a negative amount for money leaving the account", () => {
    const result = cashTransactionSchema.parse({ ...CASH_TRANSACTION, type: "TRANSFER_OUT", amount: "-250.00" });

    expect(result.amount.isNegative()).toBe(true);
  });

  it("rejects an unknown transaction type", () => {
    expect(cashTransactionSchema.safeParse({ ...CASH_TRANSACTION, type: "REFUND" }).success).toBe(false);
  });

  it("rejects a row without the note key", () => {
    const body: Record<string, unknown> = { ...CASH_TRANSACTION };
    delete body.note;

    expect(cashTransactionSchema.safeParse(body).success).toBe(false);
  });
});

describe("depositResponseSchema", () => {
  it("accepts the account and the ledger row together", () => {
    const result = depositResponseSchema.parse({ account: ACCOUNT_SUMMARY, transaction: CASH_TRANSACTION });

    expect(result.account.cash.equals(new Decimal("105000"))).toBe(true);
    expect(result.transaction.balanceAfter.equals(result.account.cash)).toBe(true);
  });

  it("rejects a response without a transaction", () => {
    expect(depositResponseSchema.safeParse({ account: ACCOUNT_SUMMARY }).success).toBe(false);
  });
});

describe("transactionsQuerySchema", () => {
  it("defaults the limit to fifty", () => {
    expect(transactionsQuerySchema.parse({}).limit).toBe(50);
  });

  it("coerces a query string limit into an integer", () => {
    expect(transactionsQuerySchema.parse({ limit: "25" }).limit).toBe(25);
  });

  it("accepts the maximum limit", () => {
    expect(transactionsQuerySchema.parse({ limit: "100" }).limit).toBe(100);
  });

  it.each([["0"], ["101"], ["-1"], ["1.5"], ["abc"]])("rejects a limit of %s", (limit) => {
    expect(transactionsQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it("keeps the cursor when present", () => {
    expect(transactionsQuerySchema.parse({ cursor: "clx0000000000000000000002" }).cursor).toBe(
      "clx0000000000000000000002",
    );
  });

  it("leaves the cursor undefined when absent", () => {
    expect(transactionsQuerySchema.parse({}).cursor).toBeUndefined();
  });

  it("rejects an empty cursor", () => {
    expect(transactionsQuerySchema.safeParse({ cursor: "" }).success).toBe(false);
  });
});

describe("transactionsPageSchema", () => {
  it("accepts a page with a next cursor", () => {
    const result = transactionsPageSchema.parse({
      transactions: [CASH_TRANSACTION],
      nextCursor: "clx0000000000000000000003",
    });

    expect(result.transactions).toHaveLength(1);
    expect(result.nextCursor).toBe("clx0000000000000000000003");
  });

  it("accepts the last page", () => {
    expect(transactionsPageSchema.parse({ transactions: [], nextCursor: null }).nextCursor).toBeNull();
  });

  it("rejects a page without the cursor key", () => {
    expect(transactionsPageSchema.safeParse({ transactions: [] }).success).toBe(false);
  });
});
