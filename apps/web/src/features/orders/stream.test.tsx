import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { wsSession } from "../../lib/ws-session";
import { orderDto, tradeDto } from "../../test/fixtures";
import { useAuthStore } from "../auth/store";
import { symbolTradesQueryKey } from "../market/hooks";
import { useOrderStream } from "./stream";
import { tradesKey, useOrdersStore } from "./store";

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

const ORDER_UPDATE = { type: "order_update", order: orderDto({ status: "FILLED", version: 2 }) };
const TRADE = { type: "trade", trade: tradeDto({ accountId: "acc-1", symbol: "TSLA" }) };

const nativeWebSocket = globalThis.WebSocket;

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function handshake(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];

  if (socket === undefined) throw new Error("no socket was created");

  socket.open();
  socket.emit({ type: "auth_ok", userId: USER.id });

  return socket;
}

beforeEach(() => {
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useOrdersStore.getState().reset();
});

afterEach(() => {
  wsSession.disconnect();
  globalThis.WebSocket = nativeWebSocket;
});

describe("useOrderStream", () => {
  it("routes an order update into the orders store", () => {
    const { unmount } = renderHook(() => useOrderStream(), { wrapper });
    const socket = handshake();

    socket.emit(ORDER_UPDATE);

    expect(useOrdersStore.getState().ordersById["order-1"]?.status).toBe("FILLED");

    unmount();
  });

  it("routes a trade into the orders store and refreshes the symbol trade history", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { unmount } = renderHook(() => useOrderStream(), { wrapper });
    const socket = handshake();

    socket.emit(TRADE);

    expect(useOrdersStore.getState().tradesByAccountSymbol[tradesKey("acc-1", "TSLA")]).toHaveLength(1);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: symbolTradesQueryKey(USER.id, "acc-1", "TSLA"),
    });

    unmount();
  });

  it("ignores messages of other channels", () => {
    const { unmount } = renderHook(() => useOrderStream(), { wrapper });
    const socket = handshake();

    socket.emit({ type: "account_summary", accounts: [] });

    expect(useOrdersStore.getState().ordersById).toEqual({});

    unmount();
  });

  it("stops applying messages after unmount", () => {
    const { unmount } = renderHook(() => useOrderStream(), { wrapper });
    const socket = handshake();

    unmount();
    socket.emit(ORDER_UPDATE);

    expect(useOrdersStore.getState().ordersById).toEqual({});
  });
});
