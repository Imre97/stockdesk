import type { AssetRecord } from "../types.js";
import type { AlpacaClient } from "./client.js";

interface RawAsset {
  symbol?: unknown;
  name?: unknown;
  exchange?: unknown;
  tradable?: unknown;
  shortable?: unknown;
  fractionable?: unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function flag(value: unknown): boolean {
  return value === true;
}

export async function fetchAlpacaAssets(client: AlpacaClient): Promise<AssetRecord[]> {
  const body = await client.getTrading("/v2/assets", { status: "active", asset_class: "us_equity" });
  const payload = JSON.parse(body) as unknown;

  if (!Array.isArray(payload)) return [];

  return (payload as RawAsset[])
    .filter((asset) => asset.tradable === true)
    .map((asset) => ({
      symbol: text(asset.symbol),
      name: text(asset.name),
      exchange: text(asset.exchange),
      shortable: flag(asset.shortable),
      fractionable: flag(asset.fractionable),
    }));
}
