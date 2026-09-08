import type { AssetRecord } from "../types.js";
import type { FinnhubClient } from "./client.js";

const COMMON_STOCK = "Common Stock";
const DEFAULT_EXCHANGE = "US";

interface RawSymbol {
  symbol?: unknown;
  description?: unknown;
  mic?: unknown;
  exchange?: unknown;
  type?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function exchangeOf(entry: RawSymbol): string {
  if (typeof entry.mic === "string" && entry.mic.length > 0) return entry.mic;
  if (typeof entry.exchange === "string" && entry.exchange.length > 0) return entry.exchange;

  return DEFAULT_EXCHANGE;
}

export async function fetchFinnhubSymbols(client: FinnhubClient): Promise<AssetRecord[]> {
  const body = await client.get("/stock/symbol", { exchange: DEFAULT_EXCHANGE });
  const payload = JSON.parse(body) as unknown;

  if (!Array.isArray(payload)) return [];

  return (payload as RawSymbol[])
    .filter((entry) => entry.type === COMMON_STOCK)
    .map((entry) => ({
      symbol: text(entry.symbol),
      name: text(entry.description),
      exchange: exchangeOf(entry),
      shortable: true,
      fractionable: true,
    }));
}
