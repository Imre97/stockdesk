import { describe, expect, it } from "vitest";

import { createStream, hashString } from "./prng.js";

function draw(count: number, ...parts: (string | number)[]): number[] {
  const stream = createStream(...parts);
  return Array.from({ length: count }, () => stream.next());
}

describe("hashString", () => {
  it("is deterministic and differs between inputs", () => {
    expect(hashString("AAPL:1D:7")).toBe(hashString("AAPL:1D:7"));
    expect(hashString("AAPL:1D:7")).not.toBe(hashString("AAPL:1D:8"));
  });
});

describe("createStream", () => {
  it("repeats the same sequence for the same parts", () => {
    expect(draw(8, 1, "AAPL", "1m", 42)).toEqual(draw(8, 1, "AAPL", "1m", 42));
  });

  it("produces a different sequence for a different seed, symbol or bucket", () => {
    const base = draw(8, 1, "AAPL", "1m", 42);
    expect(draw(8, 2, "AAPL", "1m", 42)).not.toEqual(base);
    expect(draw(8, 1, "MSFT", "1m", 42)).not.toEqual(base);
    expect(draw(8, 1, "AAPL", "1m", 43)).not.toEqual(base);
  });

  it("draws uniforms inside the unit interval", () => {
    for (const value of draw(500, 7, "TSLA", "tick", 1)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("draws normals with a mean close to zero", () => {
    const stream = createStream(7, "TSLA", "normal", 1);
    let total = 0;
    for (let index = 0; index < 2000; index += 1) total += stream.nextNormal();
    expect(Math.abs(total / 2000)).toBeLessThan(0.1);
  });
});
