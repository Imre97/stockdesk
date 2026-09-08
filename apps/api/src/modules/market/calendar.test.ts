import { describe, expect, it } from "vitest";
import { marketStatusAt } from "./calendar.js";

function at(iso: string): Date {
  return new Date(iso);
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

describe("marketStatusAt", () => {
  it("is closed on a Saturday and points at the Monday open", () => {
    const status = marketStatusAt(at("2026-09-12T18:00:00.000Z"));

    expect(status.status).toBe("closed");
    expect(iso(status.nextOpenAt)).toBe("2026-09-14T13:30:00.000Z");
    expect(iso(status.nextCloseAt)).toBe("2026-09-14T20:00:00.000Z");
  });

  it("is open at 10:00 New York on a regular weekday", () => {
    const status = marketStatusAt(at("2026-09-09T14:00:00.000Z"));

    expect(status.status).toBe("open");
    expect(iso(status.nextOpenAt)).toBeNull();
    expect(iso(status.nextCloseAt)).toBe("2026-09-09T20:00:00.000Z");
  });

  it("is pre-market at 08:00 New York", () => {
    const status = marketStatusAt(at("2026-09-09T12:00:00.000Z"));

    expect(status.status).toBe("pre");
    expect(iso(status.nextOpenAt)).toBe("2026-09-09T13:30:00.000Z");
    expect(iso(status.nextCloseAt)).toBe("2026-09-09T20:00:00.000Z");
  });

  it("is after-hours at 17:00 New York", () => {
    const status = marketStatusAt(at("2026-09-09T21:00:00.000Z"));

    expect(status.status).toBe("after");
    expect(iso(status.nextOpenAt)).toBe("2026-09-10T13:30:00.000Z");
    expect(iso(status.nextCloseAt)).toBe("2026-09-10T20:00:00.000Z");
  });

  it("is closed before the pre-market session starts", () => {
    const status = marketStatusAt(at("2026-09-09T06:00:00.000Z"));

    expect(status.status).toBe("closed");
    expect(iso(status.nextOpenAt)).toBe("2026-09-09T13:30:00.000Z");
    expect(iso(status.nextCloseAt)).toBe("2026-09-09T20:00:00.000Z");
  });

  it("is closed on Thanksgiving and points at the shortened Friday session", () => {
    const status = marketStatusAt(at("2026-11-26T15:00:00.000Z"));

    expect(status.status).toBe("closed");
    expect(iso(status.nextOpenAt)).toBe("2026-11-27T14:30:00.000Z");
    expect(iso(status.nextCloseAt)).toBe("2026-11-27T18:00:00.000Z");
  });

  it("is after-hours at 14:00 New York on the early-close Black Friday", () => {
    const status = marketStatusAt(at("2026-11-27T19:00:00.000Z"));

    expect(status.status).toBe("after");
    expect(iso(status.nextOpenAt)).toBe("2026-11-30T14:30:00.000Z");
    expect(iso(status.nextCloseAt)).toBe("2026-11-30T21:00:00.000Z");
  });

  it("is still open at 12:59 New York on an early-close day", () => {
    const status = marketStatusAt(at("2026-11-27T17:59:00.000Z"));

    expect(status.status).toBe("open");
    expect(iso(status.nextCloseAt)).toBe("2026-11-27T18:00:00.000Z");
  });

  it("resolves the next open across the spring forward Sunday", () => {
    const status = marketStatusAt(at("2026-03-08T18:00:00.000Z"));

    expect(status.status).toBe("closed");
    expect(iso(status.nextOpenAt)).toBe("2026-03-09T13:30:00.000Z");
  });

  it("uses standard time on the first Monday after the fall back", () => {
    const status = marketStatusAt(at("2026-11-02T15:00:00.000Z"));

    expect(status.status).toBe("open");
    expect(iso(status.nextCloseAt)).toBe("2026-11-02T21:00:00.000Z");
  });
});
