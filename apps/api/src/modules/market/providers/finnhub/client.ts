export const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

export interface HttpResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}

export type FetchLike = (
  url: string,
  init?: { headers: Record<string, string> },
) => Promise<HttpResponse>;

export interface FinnhubClientOptions {
  key: string;
  fetchImpl: FetchLike;
  baseUrl?: string;
}

export interface FinnhubClient {
  get: (path: string, query: Record<string, string>) => Promise<string>;
}

export function createFinnhubClient(options: FinnhubClientOptions): FinnhubClient {
  const baseUrl = options.baseUrl ?? FINNHUB_BASE_URL;
  const headers = { "X-Finnhub-Token": options.key };

  return {
    get: async (path, query) => {
      const url = new URL(`${baseUrl}${path}`);

      for (const [name, value] of Object.entries(query)) url.searchParams.set(name, value);

      const response = await options.fetchImpl(url.toString(), { headers });

      if (!response.ok) {
        throw new Error(`Finnhub request failed with status ${response.status} for ${url.pathname}.`);
      }

      return response.text();
    },
  };
}
