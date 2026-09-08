import type { Decimal, Timeframe } from "@stockdesk/shared";
import type { MarketDataProviderName } from "../../../lib/config.js";

export type ProviderName = MarketDataProviderName | "composite";

export const CAPABILITIES = ["stream", "bars", "search", "profile", "quote"] as const;

export type Capability = (typeof CAPABILITIES)[number];

export interface Trade {
  symbol: string;
  price: Decimal;
  size: Decimal;
  at: Date;
}

export interface Bar {
  symbol: string;
  timeframe: Timeframe;
  time: Date;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}

export interface Quote {
  symbol: string;
  last: Decimal;
  prevClose: Decimal | null;
  open: Decimal | null;
  high: Decimal | null;
  low: Decimal | null;
  volume: Decimal | null;
  at: Date;
}

export interface BarsQuery {
  symbol: string;
  timeframe: Timeframe;
  end: Date;
  limit: number;
  start?: Date;
}

export interface AssetRecord {
  symbol: string;
  name: string;
  exchange: string;
  shortable: boolean;
  fractionable: boolean;
}

export interface SymbolProfile {
  symbol: string;
  name: string | null;
  exchange: string | null;
  industry: string | null;
  marketCap: Decimal | null;
  sharesOutstanding: Decimal | null;
  peRatio: Decimal | null;
  week52High: Decimal | null;
  week52Low: Decimal | null;
  beta: Decimal | null;
  dividendYield: Decimal | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  ipoDate: Date | null;
}

export type TradeHandler = (trade: Trade) => void;

export interface MarketDataProvider {
  readonly name: ProviderName;
  readonly capabilities: ReadonlySet<Capability>;
  start(): Promise<void>;
  stop(): Promise<void>;
  subscribeTrades(symbols: string[]): Promise<void>;
  unsubscribeTrades(symbols: string[]): Promise<void>;
  onTrade(handler: TradeHandler): () => void;
  getBars(query: BarsQuery): Promise<Bar[]>;
  listAssets(): Promise<AssetRecord[]>;
  getProfile(symbol: string): Promise<SymbolProfile | null>;
  getQuote(symbol: string): Promise<Quote | null>;
}
