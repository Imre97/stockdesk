export const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";
export const ALPACA_TRADING_BASE_URL = "https://paper-api.alpaca.markets";

export type AlpacaFeed = "iex" | "sip";

export interface HttpResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers: Record<string, string> },
) => Promise<HttpResponse>;

export interface AlpacaClientOptions {
  key: string;
  secret: string;
  feed: AlpacaFeed;
  fetchImpl: FetchLike;
  dataBaseUrl?: string;
  tradingBaseUrl?: string;
}

export interface AlpacaClient {
  readonly feed: AlpacaFeed;
  getData: (path: string, query: Record<string, string>) => Promise<string>;
  getTrading: (path: string, query: Record<string, string>) => Promise<string>;
}

function buildUrl(baseUrl: string, path: string, query: Record<string, string>): URL {
  const url = new URL(path, baseUrl);

  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);

  return url;
}

export function createAlpacaClient(options: AlpacaClientOptions): AlpacaClient {
  const dataBaseUrl = options.dataBaseUrl ?? ALPACA_DATA_BASE_URL;
  const tradingBaseUrl = options.tradingBaseUrl ?? ALPACA_TRADING_BASE_URL;
  const headers = {
    "APCA-API-KEY-ID": options.key,
    "APCA-API-SECRET-KEY": options.secret,
  };

  async function request(baseUrl: string, path: string, query: Record<string, string>): Promise<string> {
    const url = buildUrl(baseUrl, path, query);
    const response = await options.fetchImpl(url.toString(), { headers });

    if (!response.ok) {
      throw new Error(`Alpaca request failed with status ${response.status} for ${url.pathname}.`);
    }

    return response.text();
  }

  return {
    feed: options.feed,
    getData: (path, query) => request(dataBaseUrl, path, query),
    getTrading: (path, query) => request(tradingBaseUrl, path, query),
  };
}
