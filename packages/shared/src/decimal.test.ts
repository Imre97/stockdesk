import { describe, expect, it } from "vitest";

import { Decimal, decimalString, toApiString } from "./decimal.js";

const DECIMAL_ERROR = "Expected a decimal string";

describe("Decimal configuration", () => {
  it("uses 28 digits of precision", () => {
    expect(Decimal.precision).toBe(28);
  });

  it("uses half-even rounding", () => {
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_EVEN);
  });
});

describe("decimalString", () => {
  it("accepts an integer string and produces an equal Decimal", () => {
    const result = decimalString.parse("100000.00");

    expect(result).toBeInstanceOf(Decimal);
    expect(result.equals(new Decimal("100000"))).toBe(true);
  });

  it.each([
    ["0", "0"],
    ["1", "1"],
    ["-1", "-1"],
    ["-0.5", "-0.5"],
    ["1.23456789", "1.23456789"],
    ["0.000001", "0.000001"],
    ["-12345678901234567890.12345678", "-12345678901234567890.12345678"],
  ])("accepts %s", (input, expected) => {
    expect(decimalString.parse(input).toString()).toBe(new Decimal(expected).toString());
  });

  it("rejects a JSON number", () => {
    const result = decimalString.safeParse(100000);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(DECIMAL_ERROR);
  });

  it.each([
    ["exponent notation", "1e5"],
    ["letters", "abc"],
    ["empty string", ""],
    ["leading space", " 1"],
    ["trailing space", "1 "],
    ["trailing dot", "1."],
    ["leading dot", ".5"],
    ["explicit plus sign", "+1"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["thousands separator", "1,000"],
    ["double minus", "--1"],
    ["two dots", "1.2.3"],
  ])("rejects %s", (_label, input) => {
    const result = decimalString.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(DECIMAL_ERROR);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["boolean", true],
    ["object", {}],
    ["array", ["1"]],
    ["Decimal instance", new Decimal("1")],
  ])("rejects a non-string value: %s", (_label, input) => {
    const result = decimalString.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(DECIMAL_ERROR);
  });
});

describe("toApiString", () => {
  it("pads an integer Decimal to the requested places", () => {
    expect(toApiString(new Decimal("100000"), 2)).toBe("100000.00");
  });

  it("rounds half down to the even digit", () => {
    expect(toApiString("2.345", 2)).toBe("2.34");
  });

  it("rounds half up to the even digit", () => {
    expect(toApiString("2.355", 2)).toBe("2.36");
  });

  it("keeps the sign and pads negative values", () => {
    expect(toApiString("-0.5", 2)).toBe("-0.50");
  });

  it("truncates with rounding to four places", () => {
    expect(toApiString("1.23456789", 4)).toBe("1.2346");
  });

  it("accepts a plain string", () => {
    expect(toApiString("42", 2)).toBe("42.00");
  });

  it("supports zero decimal places", () => {
    expect(toApiString("2.5", 0)).toBe("2");
    expect(toApiString("3.5", 0)).toBe("4");
  });

  it("supports six decimal places for share quantities", () => {
    expect(toApiString("1.5", 6)).toBe("1.500000");
  });

  it("formats zero", () => {
    expect(toApiString(new Decimal("0"), 2)).toBe("0.00");
  });

  it("never uses exponent notation for large values", () => {
    expect(toApiString("123456789012345678901", 2)).toBe("123456789012345678901.00");
  });
});
