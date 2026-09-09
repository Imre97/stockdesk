import { describe, expect, it } from "vitest";
import { nextSessionClose } from "./expiry.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const WEDNESDAY_CLOSE = "2026-09-09T20:00:00.000Z";
const FRIDAY_17_00_NY = new Date("2026-09-11T21:00:00.000Z");
const SATURDAY_12_00_NY = new Date("2026-09-12T16:00:00.000Z");
const MONDAY_CLOSE = "2026-09-14T20:00:00.000Z";
const LABOR_DAY_10_00_NY = new Date("2026-09-07T14:00:00.000Z");
const TUESDAY_CLOSE = "2026-09-08T20:00:00.000Z";
const EARLY_CLOSE_DAY_10_00_NY = new Date("2026-11-27T15:00:00.000Z");
const EARLY_CLOSE = "2026-11-27T18:00:00.000Z";

describe("nextSessionClose", () => {
  it("expires a mid-session order at the close of the running session", () => {
    expect(nextSessionClose(WEDNESDAY_15_00_NY).toISOString()).toBe(WEDNESDAY_CLOSE);
  });

  it("expires an order placed after the close at the next session close", () => {
    expect(nextSessionClose(FRIDAY_17_00_NY).toISOString()).toBe(MONDAY_CLOSE);
  });

  it("expires a weekend order at the next trading day close", () => {
    expect(nextSessionClose(SATURDAY_12_00_NY).toISOString()).toBe(MONDAY_CLOSE);
  });

  it("expires a holiday order at the next trading day close", () => {
    expect(nextSessionClose(LABOR_DAY_10_00_NY).toISOString()).toBe(TUESDAY_CLOSE);
  });

  it("expires an order placed on an early-close day at 13:00 New York", () => {
    expect(nextSessionClose(EARLY_CLOSE_DAY_10_00_NY).toISOString()).toBe(EARLY_CLOSE);
  });
});
