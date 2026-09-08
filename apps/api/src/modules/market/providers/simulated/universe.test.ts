import { describe, expect, it } from "vitest";

import { findSimulatedAsset, SIMULATED_UNIVERSE } from "./universe.js";

const EXPECTED_SIZE = 40;

describe("simulated universe", () => {
  it("holds 40 assets with unique symbols", () => {
    expect(SIMULATED_UNIVERSE).toHaveLength(EXPECTED_SIZE);
    expect(new Set(SIMULATED_UNIVERSE.map((asset) => asset.symbol)).size).toBe(EXPECTED_SIZE);
  });

  it("restricts shorting and fractional trading on a few assets", () => {
    expect(SIMULATED_UNIVERSE.filter((asset) => !asset.shortable).length).toBeGreaterThanOrEqual(2);
    expect(SIMULATED_UNIVERSE.filter((asset) => !asset.fractionable).length).toBeGreaterThanOrEqual(2);
  });

  it("lists only NASDAQ and NYSE assets with positive prices, volatilities and share counts", () => {
    for (const asset of SIMULATED_UNIVERSE) {
      expect(["NASDAQ", "NYSE"]).toContain(asset.exchange);
      expect(asset.basePrice.greaterThan(0)).toBe(true);
      expect(asset.annualVolatility.greaterThan(0)).toBe(true);
      expect(asset.sharesOutstanding.greaterThan(0)).toBe(true);
      expect(asset.name.length).toBeGreaterThan(0);
      expect(asset.industry.length).toBeGreaterThan(0);
    }
  });

  it("leaves the logo empty on at least one asset", () => {
    expect(SIMULATED_UNIVERSE.some((asset) => asset.logoUrl === null)).toBe(true);
  });

  it("looks assets up case-insensitively and returns undefined for an unknown symbol", () => {
    expect(findSimulatedAsset("tsla")?.symbol).toBe("TSLA");
    expect(findSimulatedAsset("BRK.B")?.fractionable).toBe(false);
    expect(findSimulatedAsset("NOPE")).toBeUndefined();
  });
});
