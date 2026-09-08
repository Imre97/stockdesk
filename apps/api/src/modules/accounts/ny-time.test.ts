import { describe, expect, it } from "vitest";
import {
  isNyWeekday,
  lastElapsedSessionOpen,
  lastNWeekdaysWindow,
  nyDayStart,
  nyTradingDayWindow,
} from "./ny-time.js";

function at(iso: string): Date {
  return new Date(iso);
}

describe("nyDayStart", () => {
  it("returns midnight New York during daylight saving time", () => {
    expect(nyDayStart(at("2026-09-08T18:00:00.000Z")).toISOString()).toBe("2026-09-08T04:00:00.000Z");
  });

  it("returns midnight New York during standard time", () => {
    expect(nyDayStart(at("2026-01-15T18:00:00.000Z")).toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });

  it("handles the spring forward day", () => {
    expect(nyDayStart(at("2026-03-08T18:00:00.000Z")).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(nyDayStart(at("2026-03-09T12:00:00.000Z")).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("handles the fall back day", () => {
    expect(nyDayStart(at("2026-11-01T18:00:00.000Z")).toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(nyDayStart(at("2026-11-02T12:00:00.000Z")).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("uses the New York calendar day, not the UTC one", () => {
    expect(nyDayStart(at("2026-09-08T02:00:00.000Z")).toISOString()).toBe("2026-09-07T04:00:00.000Z");
  });
});

describe("isNyWeekday", () => {
  it("accepts Monday to Friday", () => {
    expect(isNyWeekday(at("2026-09-07T12:00:00.000Z"))).toBe(true);
    expect(isNyWeekday(at("2026-09-04T12:00:00.000Z"))).toBe(true);
  });

  it("rejects Saturday and Sunday", () => {
    expect(isNyWeekday(at("2026-09-05T12:00:00.000Z"))).toBe(false);
    expect(isNyWeekday(at("2026-09-06T12:00:00.000Z"))).toBe(false);
  });

  it("uses the New York calendar day", () => {
    expect(isNyWeekday(at("2026-09-07T01:00:00.000Z"))).toBe(false);
  });
});

describe("lastElapsedSessionOpen", () => {
  it("returns today when the session already opened", () => {
    expect(lastElapsedSessionOpen(at("2026-09-08T18:00:00.000Z")).toISOString()).toBe(
      "2026-09-08T13:30:00.000Z",
    );
  });

  it("returns the previous weekday before 09:30", () => {
    expect(lastElapsedSessionOpen(at("2026-09-08T12:00:00.000Z")).toISOString()).toBe(
      "2026-09-07T13:30:00.000Z",
    );
  });

  it("returns Friday on a weekend", () => {
    expect(lastElapsedSessionOpen(at("2026-09-06T18:00:00.000Z")).toISOString()).toBe(
      "2026-09-04T13:30:00.000Z",
    );
  });

  it("returns the standard time boundary on the spring forward weekend", () => {
    expect(lastElapsedSessionOpen(at("2026-03-08T18:00:00.000Z")).toISOString()).toBe(
      "2026-03-06T14:30:00.000Z",
    );
  });

  it("returns the daylight saving boundary after the switch", () => {
    expect(lastElapsedSessionOpen(at("2026-03-09T18:00:00.000Z")).toISOString()).toBe(
      "2026-03-09T13:30:00.000Z",
    );
  });

  it("returns the standard time boundary after the fall back switch", () => {
    expect(lastElapsedSessionOpen(at("2026-11-02T18:00:00.000Z")).toISOString()).toBe(
      "2026-11-02T14:30:00.000Z",
    );
  });
});

describe("nyTradingDayWindow", () => {
  it("covers the current trading day on a weekday", () => {
    const window = nyTradingDayWindow(at("2026-09-08T18:00:00.000Z"));

    expect(window.from.toISOString()).toBe("2026-09-08T04:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-09T04:00:00.000Z");
  });

  it("covers the last weekday on a weekend", () => {
    const window = nyTradingDayWindow(at("2026-09-06T18:00:00.000Z"));

    expect(window.from.toISOString()).toBe("2026-09-04T04:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-05T04:00:00.000Z");
  });
});

describe("lastNWeekdaysWindow", () => {
  it("skips the weekend when counting five trading days", () => {
    const window = lastNWeekdaysWindow(at("2026-09-08T18:00:00.000Z"), 5);

    expect(window.from.toISOString()).toBe("2026-09-02T04:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-09T04:00:00.000Z");
  });

  it("counts back from the last weekday on a weekend", () => {
    const window = lastNWeekdaysWindow(at("2026-09-06T18:00:00.000Z"), 5);

    expect(window.from.toISOString()).toBe("2026-08-31T04:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-09-05T04:00:00.000Z");
  });
});
