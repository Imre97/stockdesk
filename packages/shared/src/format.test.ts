import { describe, expect, it } from "vitest";

import { Decimal } from "./decimal.js";
import { formatMoney, formatPercent, formatQuantity, formatSignedMoney } from "./format.js";

const MONEY_OPTIONS: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

function intlMoney(locale: string, probe: number): string {
  return new Intl.NumberFormat(locale, MONEY_OPTIONS).format(probe);
}

function intlSignedMoney(locale: string, probe: number, sign: string): string {
  return new Intl.NumberFormat(locale, MONEY_OPTIONS)
    .formatToParts(probe)
    .map((part) => (part.type === "minusSign" ? sign : part.value))
    .join("");
}

function intlPercent(locale: string, probe: number): string {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(probe);
}

function intlQuantity(locale: string, probe: number, fractionDigits: number): string {
  return new Intl.NumberFormat(locale, {
    style: "decimal",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(probe);
}

describe("formatMoney", () => {
  it("groups thousands and prefixes the dollar sign for en-US", () => {
    expect(formatMoney(new Decimal("1234567.89"), "en-US")).toBe("$1,234,567.89");
  });

  it("places the minus sign before the currency symbol for en-US", () => {
    expect(formatMoney(new Decimal("-1234.56"), "en-US")).toBe("-$1,234.56");
  });

  it("pads an integer value to two decimal places", () => {
    expect(formatMoney(new Decimal("100000"), "en-US")).toBe("$100,000.00");
  });

  it("formats zero without a sign", () => {
    expect(formatMoney(new Decimal("0"), "en-US")).toBe("$0.00");
  });

  it("formats a value below one cent as zero without a sign", () => {
    expect(formatMoney(new Decimal("-0.001"), "en-US")).toBe("$0.00");
  });

  it("keeps a value shorter than one group ungrouped", () => {
    expect(formatMoney(new Decimal("999.5"), "en-US")).toBe("$999.50");
  });

  it("matches the Intl layout for hu-HU", () => {
    expect(formatMoney(new Decimal("1234567.89"), "hu-HU")).toBe(intlMoney("hu-HU", 1234567.89));
  });

  it("matches the Intl layout for a negative hu-HU value", () => {
    expect(formatMoney(new Decimal("-1234.56"), "hu-HU")).toBe(intlMoney("hu-HU", -1234.56));
  });

  it("leaves a four-digit hu-HU value ungrouped", () => {
    expect(formatMoney(new Decimal("1234.56"), "hu-HU")).toBe(intlMoney("hu-HU", 1234.56));
  });

  it("groups a five-digit hu-HU value", () => {
    expect(formatMoney(new Decimal("12345.67"), "hu-HU")).toBe(intlMoney("hu-HU", 12345.67));
  });

  it("leaves a four-digit en-US value grouped", () => {
    expect(formatMoney(new Decimal("1234.56"), "en-US")).toBe("$1,234.56");
  });
  it("honours an explicit currency", () => {
    expect(formatMoney(new Decimal("1234.5"), "en-US", "EUR")).toBe(
      new Intl.NumberFormat("en-US", { ...MONEY_OPTIONS, currency: "EUR" }).format(1234.5),
    );
  });
});

describe("formatMoney precision", () => {
  it("adds binary-unfriendly values exactly", () => {
    expect(formatMoney(new Decimal("0.1").plus("0.2"), "en-US")).toBe("$0.30");
  });

  it("rounds half to even instead of following the double representation", () => {
    expect(formatMoney(new Decimal("2.675"), "en-US")).toBe("$2.68");
  });

  it("formats a twenty-digit value without losing a digit", () => {
    expect(formatMoney(new Decimal("12345678901234567890.12"), "en-US")).toBe("$12,345,678,901,234,567,890.12");
  });

  it("formats a twenty-digit value with the hu-HU separators", () => {
    const parts = new Intl.NumberFormat("hu-HU", MONEY_OPTIONS).formatToParts(1234567.89);
    const group = parts.find((part) => part.type === "group")?.value ?? "";
    const decimal = parts.find((part) => part.type === "decimal")?.value ?? "";
    const probe = ["1", "234", "567"].join(group) + decimal + "89";
    const digits = ["12", "345", "678", "901", "234", "567", "890"].join(group) + decimal + "12";

    expect(formatMoney(new Decimal("12345678901234567890.12"), "hu-HU")).toBe(
      intlMoney("hu-HU", 1234567.89).replace(probe, digits),
    );
  });
});

describe("formatSignedMoney", () => {
  it("prefixes a positive value with a plus sign", () => {
    expect(formatSignedMoney(new Decimal("1234.56"), "en-US")).toBe("+$1,234.56");
  });

  it("prefixes a negative value with a minus sign", () => {
    expect(formatSignedMoney(new Decimal("-1234.56"), "en-US")).toBe("-$1,234.56");
  });

  it("leaves zero without a sign", () => {
    expect(formatSignedMoney(new Decimal("0"), "en-US")).toBe("$0.00");
  });

  it("leaves a value rounding to zero without a sign", () => {
    expect(formatSignedMoney(new Decimal("0.004"), "en-US")).toBe("$0.00");
  });

  it("places the plus sign where hu-HU places the minus sign", () => {
    expect(formatSignedMoney(new Decimal("1234.56"), "hu-HU")).toBe(intlSignedMoney("hu-HU", -1234.56, "+"));
  });

  it("matches the Intl layout for a negative hu-HU value", () => {
    expect(formatSignedMoney(new Decimal("-1234.56"), "hu-HU")).toBe(intlMoney("hu-HU", -1234.56));
  });
});

describe("formatPercent", () => {
  it("appends the percent sign for en-US", () => {
    expect(formatPercent(new Decimal("1.03"), "en-US")).toBe("1.03%");
  });

  it("keeps the sign of a negative percentage", () => {
    expect(formatPercent(new Decimal("-0.23"), "en-US")).toBe("-0.23%");
  });

  it("pads zero to two decimal places", () => {
    expect(formatPercent(new Decimal("0"), "en-US")).toBe("0.00%");
  });

  it("groups a large percentage", () => {
    expect(formatPercent(new Decimal("1234.5"), "en-US")).toBe("1,234.50%");
  });

  it("matches the Intl layout for hu-HU", () => {
    expect(formatPercent(new Decimal("1.03"), "hu-HU")).toBe(intlPercent("hu-HU", 0.0103));
  });

  it("matches the Intl layout for a negative hu-HU percentage", () => {
    expect(formatPercent(new Decimal("-0.23"), "hu-HU")).toBe(intlPercent("hu-HU", -0.0023));
  });

  it("rounds half to even", () => {
    expect(formatPercent(new Decimal("2.675"), "en-US")).toBe("2.68%");
  });
});

describe("formatQuantity", () => {
  it("drops the fraction for a whole quantity", () => {
    expect(formatQuantity(new Decimal("10"), "en-US")).toBe("10");
  });

  it("trims trailing zeros", () => {
    expect(formatQuantity(new Decimal("1.500000"), "en-US")).toBe("1.5");
  });

  it("keeps six decimal places", () => {
    expect(formatQuantity(new Decimal("0.000001"), "en-US")).toBe("0.000001");
  });

  it("rounds beyond six decimal places", () => {
    expect(formatQuantity(new Decimal("0.00000049"), "en-US")).toBe("0");
  });

  it("groups thousands", () => {
    expect(formatQuantity(new Decimal("1234567"), "en-US")).toBe("1,234,567");
  });

  it("keeps the sign of a short position", () => {
    expect(formatQuantity(new Decimal("-1234.5"), "en-US")).toBe("-1,234.5");
  });

  it("matches the Intl layout for hu-HU", () => {
    expect(formatQuantity(new Decimal("1234.5"), "hu-HU")).toBe(intlQuantity("hu-HU", 1234.5, 1));
  });

  it("leaves a four-digit hu-HU quantity ungrouped", () => {
    expect(formatQuantity(new Decimal("1234"), "hu-HU")).toBe(intlQuantity("hu-HU", 1234, 0));
  });

  it("groups a five-digit hu-HU quantity", () => {
    expect(formatQuantity(new Decimal("12345"), "hu-HU")).toBe(intlQuantity("hu-HU", 12345, 0));
  });
  it("matches the Intl layout for a negative hu-HU quantity", () => {
    expect(formatQuantity(new Decimal("-1234.5"), "hu-HU")).toBe(intlQuantity("hu-HU", -1234.5, 1));
  });
});
