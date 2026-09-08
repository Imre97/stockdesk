import type { ReactNode } from "react";
import { Decimal, barsResponseSchema, marketStatusMessageSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

vi.mock("./api", () => api);

import { wsSession } from "../../lib/ws-session";
import { useAuthStore } from "../auth/store";
import { useMarketStatus, useQuote, useSymbolDetail, useSymbolSearch } from "./hooks";
import { useMarketStore } from "./store";

class FakeSocket {
  static instances: FakeSocket[] = [];

  readonly sent: string[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor() {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const SEARCH_RESULTS = { results: [{ symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" }] };

const FIRST_PAGE = barsResponseSchema.parse({
  symbol: "TSLA",
  timeframe: "1m",
  bars: [
    {
      time: "2026-09-08T14:31:00.000Z",
      open: "251.10",
      high: "251.40",
      low: "251.05",
      close: "251.34",
      volume: "1200",
    },
  ],
  hasMore: true,
});

const QUOTE_FRAME = {
  type: "quote",
  symbol: "TSLA",
  price: "251.3400",
  size: "100",
  at: "2026-09-08T14:30:01.123Z",
  prevClose: "248.9000",
};

const SUBSCRIBE_FRAME = JSON.stringify({ type: "subscribe", channel: "quotes", symbols: ["TSLA"] });
const UNSUBSCRIBE_FRAME = JSON.stringify({ type: "unsubscribe", channel: "quotes", symbols: ["TSLA"] });

const nativeWebSocket = globalThis.WebSocket;

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function lastSocket(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (socket === undefined) throw new Error("no socket was created");
  return socket;
}

function framesOf(frame: string): string[] {
  return lastSocket().sent.filter((sent) => sent === frame);
}

beforeEach(() => {
  vi.clearAllMocks();
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useMarketStore.getState().reset();
  api.searchSymbols.mockResolvedValue(SEARCH_RESULTS);
  api.getMarketStatus.mockResolvedValue({ status: "closed", nextOpenAt: null, nextCloseAt: null });
  api.getBars.mockResolvedValue(FIRST_PAGE);
  api.getTrades.mockResolvedValue({ trades: [], nextCursor: null });
});

afterEach(() => {
  wsSession.disconnect();
  globalThis.WebSocket = nativeWebSocket;
});

describe("useSymbolSearch", () => {
  it("searches once the debounce elapsed", async () => {
    const { result } = renderHook(() => useSymbolSearch("tsl"), { wrapper });

    await waitFor(() => {
      expect(result.current.results.map((entry) => entry.symbol)).toEqual(["TSLA"]);
    });

    expect(api.searchSymbols).toHaveBeenCalledWith("tsl");
  });

  it("stays idle for an empty query", async () => {
    const { result } = renderHook(() => useSymbolSearch("   "), { wrapper });

    await waitFor(() => {
      expect(result.current.hasQuery).toBe(false);
    });

    expect(api.searchSymbols).not.toHaveBeenCalled();
  });
});

describe("useSymbolDetail", () => {
  it("loads the detail of the upper-cased symbol", async () => {
    api.getSymbol.mockResolvedValue({ symbol: "TSLA", name: "Tesla, Inc." });

    const { result } = renderHook(() => useSymbolDetail("TSLA"), { wrapper });

    await waitFor(() => {
      expect(result.current.data?.name).toBe("Tesla, Inc.");
    });

    expect(api.getSymbol).toHaveBeenCalledWith("TSLA");
  });
});

describe("useMarketStatus", () => {
  it("starts from the fetched status and lets a pushed status win", async () => {
    const { result } = renderHook(() => useMarketStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current?.status).toBe("closed");
    });

    act(() => {
      useMarketStore.getState().applyMarketStatus(
        marketStatusMessageSchema.parse({
          type: "market_status",
          status: "open",
          nextOpenAt: null,
          nextCloseAt: "2026-09-08T20:00:00.000Z",
        }),
      );
    });

    expect(result.current?.status).toBe("open");
  });
});

describe("useQuote", () => {
  it("shares one quote subscription between two mounted consumers", async () => {
    wsSession.connect();
    const first = renderHook(() => useQuote("TSLA"), { wrapper });
    const socket = lastSocket();
    socket.open();
    socket.emit({ type: "auth_ok", userId: "user-1" });

    const second = renderHook(() => useQuote("TSLA"), { wrapper });

    await waitFor(() => {
      expect(framesOf(SUBSCRIBE_FRAME)).toHaveLength(1);
    });

    first.unmount();

    expect(framesOf(UNSUBSCRIBE_FRAME)).toHaveLength(0);

    second.unmount();

    expect(framesOf(UNSUBSCRIBE_FRAME)).toHaveLength(1);
  });

  it("reads the last tick of the symbol from the store", async () => {
    wsSession.connect();
    const { result, unmount } = renderHook(() => useQuote("TSLA"), { wrapper });
    const socket = lastSocket();
    socket.open();
    socket.emit({ type: "auth_ok", userId: "user-1" });

    act(() => {
      useMarketStore.getState().applyQuote({ ...QUOTE_FRAME, type: "quote" });
    });

    await waitFor(() => {
      expect(result.current?.price.equals(new Decimal("251.34"))).toBe(true);
    });

    unmount();
  });
});
