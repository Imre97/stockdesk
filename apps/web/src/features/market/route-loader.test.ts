import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

vi.mock("./api", () => api);

import { HttpError } from "../../lib/http";
import { loadSymbolDetail, normalizeSymbolParam } from "./route-loader";

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.getSymbol.mockResolvedValue({ symbol: "TSLA" });
});

describe("normalizeSymbolParam", () => {
  it("upper-cases the route parameter", () => {
    expect(normalizeSymbolParam("tsla")).toBe("TSLA");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSymbolParam("  tsla  ")).toBe("TSLA");
  });

  it("leaves an already upper-cased parameter untouched", () => {
    expect(normalizeSymbolParam("TSLA")).toBe("TSLA");
  });
});

describe("loadSymbolDetail", () => {
  it("reports a known symbol as loaded", async () => {
    await expect(loadSymbolDetail("TSLA", client)).resolves.toBe("ok");
    expect(api.getSymbol).toHaveBeenCalledWith("TSLA");
  });

  it("maps a SYMBOL_NOT_FOUND response to the not-found result", async () => {
    api.getSymbol.mockRejectedValue(new HttpError(404, "SYMBOL_NOT_FOUND", "Unknown symbol"));

    await expect(loadSymbolDetail("NOPE", client)).resolves.toBe("not-found");
  });

  it("propagates any other failure", async () => {
    api.getSymbol.mockRejectedValue(new HttpError(503, "PROVIDER_UNAVAILABLE", "Provider down"));

    await expect(loadSymbolDetail("TSLA", client)).rejects.toThrow("Provider down");
  });
});
