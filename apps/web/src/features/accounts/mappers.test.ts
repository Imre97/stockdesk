import { Decimal, accountSummarySchema, type AccountSummaryDto } from "@stockdesk/shared";
import { describe, expect, it } from "vitest";

import { accountSummaryDto } from "../../test/fixtures";
import {
  localeForLanguage,
  parseAccountSummaries,
  pnlTone,
  toAccountInitials,
  toAccountViewModel,
  toneClass,
} from "./mappers";

const MONEY_OPTIONS: Intl.NumberFormatOptions = {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

function dto(overrides: Partial<AccountSummaryDto> = {}): AccountSummaryDto {
  return accountSummaryDto(overrides);
}

describe("localeForLanguage", () => {
  it("maps the supported languages to their Intl locales", () => {
    expect(localeForLanguage("en")).toBe("en-US");
    expect(localeForLanguage("hu")).toBe("hu-HU");
  });
});

describe("pnlTone", () => {
  it("classifies a positive value as a gain", () => {
    expect(pnlTone(new Decimal("0.01"))).toBe("gain");
  });

  it("classifies a negative value as a loss", () => {
    expect(pnlTone(new Decimal("-0.01"))).toBe("loss");
  });

  it("classifies zero as neutral", () => {
    expect(pnlTone(new Decimal("0.00"))).toBe("neutral");
  });

  it("maps every tone to its semantic utility class", () => {
    expect(toneClass("gain")).toBe("text-gain");
    expect(toneClass("loss")).toBe("text-loss");
    expect(toneClass("neutral")).toBe("text-neutral");
  });
});

describe("toAccountInitials", () => {
  it("takes the first letter of a single word name", () => {
    expect(toAccountInitials("Main")).toBe("M");
  });

  it("takes at most two initials from a multi word name", () => {
    expect(toAccountInitials("Long Term Savings")).toBe("LT");
  });
});

describe("parseAccountSummaries", () => {
  it("turns decimal strings into Decimal values", () => {
    const [account] = parseAccountSummaries([dto({ cash: "1234.56" })]);

    expect(account?.cash).toBeInstanceOf(Decimal);
    expect(account?.cash.equals(new Decimal("1234.56"))).toBe(true);
  });

  it("passes an already parsed summary through unchanged", () => {
    const parsed = accountSummarySchema.parse(dto());

    expect(parseAccountSummaries([parsed])[0]).toBe(parsed);
  });
});

describe("toAccountViewModel", () => {
  it("formats every money field for en-US and tones the profit and loss", () => {
    const account = accountSummarySchema.parse(dto({ dailyPnl: "125.40", dailyPnlPct: "12.54" }));

    const view = toAccountViewModel(account, "en-US");

    expect(view.id).toBe("acc-1");
    expect(view.initials).toBe("M");
    expect(view.equity).toBe("$100,000.00");
    expect(view.dailyPnl).toBe("+$125.40");
    expect(view.dailyPnlPct).toBe("12.54%");
    expect(view.dailyTone).toBe("gain");
    expect(view.unrealizedTone).toBe("neutral");
    expect(view.buyingPower).toBe("$100,000.00");
    expect(view.marginDeficit).toBe(false);
  });

  it("carries the buying power and the margin deficit flag of the summary", () => {
    const account = accountSummarySchema.parse(
      dto({ buyingPower: "97436.33", shortValue: "5000.00", marginDeficit: true }),
    );

    const view = toAccountViewModel(account, "en-US");

    expect(view.buyingPower).toBe("$97,436.33");
    expect(view.marginDeficit).toBe(true);
  });

  it("formats a negative daily result as a loss", () => {
    const account = accountSummarySchema.parse(dto({ dailyPnl: "-125.40", dailyPnlPct: "-1.25" }));

    const view = toAccountViewModel(account, "en-US");

    expect(view.dailyPnl).toBe("-$125.40");
    expect(view.dailyTone).toBe("loss");
  });

  it("formats money with the Hungarian layout", () => {
    const account = accountSummarySchema.parse(dto({ equity: "1234567.89" }));

    const view = toAccountViewModel(account, "hu-HU");

    expect(view.equity).toBe(new Intl.NumberFormat("hu-HU", MONEY_OPTIONS).format(1234567.89));
  });
});
