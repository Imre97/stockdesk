import { describe, expect, it } from "vitest";
import {
  isEarlyClose,
  isNyseHoliday,
  NYSE_EARLY_CLOSE_DAYS,
  NYSE_HOLIDAYS,
} from "./holidays.js";

describe("isNyseHoliday", () => {
  it("covers every 2026 full-day closing", () => {
    const days = [
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-04-03",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-09-07",
      "2026-11-26",
      "2026-12-25",
    ];

    for (const day of days) expect(isNyseHoliday(day)).toBe(true);
    expect([...NYSE_HOLIDAYS].filter((day) => day.startsWith("2026")).sort()).toEqual(days);
  });

  it("covers every 2027 full-day closing", () => {
    const days = [
      "2027-01-01",
      "2027-01-18",
      "2027-02-15",
      "2027-03-26",
      "2027-05-31",
      "2027-06-18",
      "2027-07-05",
      "2027-09-06",
      "2027-11-25",
      "2027-12-24",
    ];

    for (const day of days) expect(isNyseHoliday(day)).toBe(true);
    expect([...NYSE_HOLIDAYS].filter((day) => day.startsWith("2027")).sort()).toEqual(days);
  });

  it("rejects regular sessions and the observed-shift originals", () => {
    expect(isNyseHoliday("2026-07-04")).toBe(false);
    expect(isNyseHoliday("2026-09-08")).toBe(false);
    expect(isNyseHoliday("2027-06-19")).toBe(false);
    expect(isNyseHoliday("2027-07-04")).toBe(false);
    expect(isNyseHoliday("2027-12-25")).toBe(false);
  });
});

describe("isEarlyClose", () => {
  it("lists the day after Thanksgiving and a weekday Christmas Eve", () => {
    expect([...NYSE_EARLY_CLOSE_DAYS].sort()).toEqual(["2026-11-27", "2026-12-24", "2027-11-26"]);
    expect(isEarlyClose("2026-11-27")).toBe(true);
    expect(isEarlyClose("2026-12-24")).toBe(true);
    expect(isEarlyClose("2027-11-26")).toBe(true);
  });

  it("has no July 3 early close while July 4 falls on a weekend", () => {
    expect(isEarlyClose("2026-07-02")).toBe(false);
    expect(isEarlyClose("2027-07-02")).toBe(false);
  });

  it("has no Christmas Eve early close when Christmas is observed on December 24", () => {
    expect(isEarlyClose("2027-12-23")).toBe(false);
    expect(isEarlyClose("2027-12-24")).toBe(false);
  });
});
