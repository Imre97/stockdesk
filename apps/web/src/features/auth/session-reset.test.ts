import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAccountsStore } from "../accounts/store";
import { useFundingStore } from "../funding/store";
import { marketStatusQueryKey, symbolDetailQueryKey } from "../market/hooks";
import { RECENT_SYMBOLS_STORAGE_KEY, pushRecentSymbol, readRecentSymbols } from "../market/recent-symbols";
import { useMarketStore } from "../market/store";
import { SETTINGS_STORAGE_KEY, readCachedSettings } from "../settings/storage";
import { useSettingsStore } from "../settings/store";
import { useAccountSummaryStream } from "../shell/hooks";
import { resetClientState } from "./session-reset";
import { useAuthStore } from "./store";

const ACCOUNT_DTO = {
  id: "acc-1",
  name: "Main",
  cash: "100000.00",
  positionsValue: "0.00",
  equity: "100000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const QUOTE_MESSAGE = {
  type: "quote" as const,
  symbol: "TSLA",
  price: "251.3400",
  size: "100",
  at: "2026-09-08T14:30:01.123Z",
  prevClose: "248.9000",
};

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

class FakeSocket {
  static instances: FakeSocket[] = [];

  readonly sent: string[] = [];
  closedByClient = false;
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
    this.closedByClient = true;
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

function lastSocket(): FakeSocket {
  const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
  if (socket === undefined) throw new Error("no socket was created");
  return socket;
}

const nativeWebSocket = globalThis.WebSocket;

let queryClient: QueryClient;

beforeEach(() => {
  window.localStorage.clear();
  queryClient = new QueryClient();
  FakeSocket.instances = [];
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useFundingStore.setState({ selectedAccountId: null });
  useMarketStore.getState().reset();
});

afterEach(() => {
  globalThis.WebSocket = nativeWebSocket;
});

describe("resetClientState", () => {
  it("drops every trace of the previous user from the client stores and the query cache", () => {
    useAccountsStore.getState().setAccounts([ACCOUNT_DTO]);
    useSettingsStore.getState().applyServerSettings({ language: "hu", theme: "dark", defaultAccountId: "acc-1" });
    useFundingStore.getState().setSelectedAccountId("acc-1");
    queryClient.setQueryData(["transactions", "acc-1"], { transactions: [], nextCursor: null });

    resetClientState({ queryClient });

    const accounts = useAccountsStore.getState();
    const settings = useSettingsStore.getState();

    expect(accounts.accounts).toEqual([]);
    expect(accounts.activeAccountId).toBeNull();
    expect(accounts.status).toBe("idle");
    expect(settings.defaultAccountId).toBeNull();
    expect(settings.status).toBe("idle");
    expect(useFundingStore.getState().selectedAccountId).toBeNull();
    expect(queryClient.getQueryData(["transactions", "acc-1"])).toBeUndefined();
  });

  it("keeps the language and theme preference but forgets the default account", () => {
    useSettingsStore.getState().applyServerSettings({ language: "hu", theme: "dark", defaultAccountId: "acc-1" });

    resetClientState({ queryClient });

    const settings = useSettingsStore.getState();

    expect(settings.language).toBe("hu");
    expect(settings.theme).toBe("dark");
    expect(window.localStorage.getItem(SETTINGS_STORAGE_KEY)).not.toBeNull();
    expect(readCachedSettings()?.theme).toBe("dark");
    expect(readCachedSettings()?.defaultAccountId).toBeNull();
  });

  it("leaves the cached language and theme untouched when the store was never hydrated", () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ language: "hu", theme: "dark", defaultAccountId: "acc-1" }),
    );

    resetClientState({ queryClient });

    expect(readCachedSettings()?.language).toBe("hu");
    expect(readCachedSettings()?.theme).toBe("dark");
    expect(readCachedSettings()?.defaultAccountId).toBeNull();
  });

  it("closes the session socket so a late message cannot repopulate the accounts store", () => {
    const { unmount } = renderHook(() => useAccountSummaryStream());

    const socket = lastSocket();
    socket.open();
    socket.emit({ type: "auth_ok", userId: "user-1" });
    socket.emit({ type: "account_summary", accounts: [ACCOUNT_DTO] });

    expect(useAccountsStore.getState().accounts).toHaveLength(1);

    resetClientState({ queryClient });

    expect(socket.closedByClient).toBe(true);

    socket.emit({ type: "account_summary", accounts: [ACCOUNT_DTO] });

    expect(useAccountsStore.getState().accounts).toEqual([]);
    unmount();
  });
});

describe("resetClientState and the market feature", () => {
  it("drops the live quotes of the previous user", () => {
    useMarketStore.getState().applyQuote(QUOTE_MESSAGE);

    expect(useMarketStore.getState().quotes.TSLA).toBeDefined();

    resetClientState({ queryClient });

    expect(useMarketStore.getState().quotes).toEqual({});
    expect(useMarketStore.getState().bars).toEqual({});
    expect(useMarketStore.getState().marketStatus).toBeNull();
  });

  it("forgets the recently opened symbols", () => {
    pushRecentSymbol("TSLA");

    resetClientState({ queryClient });

    expect(readRecentSymbols()).toEqual([]);
    expect(window.localStorage.getItem(RECENT_SYMBOLS_STORAGE_KEY)).toBeNull();
  });
});

describe("a second user in the same tab", () => {
  it("observes no market quote, recent symbol or cached query of the first user", () => {
    useMarketStore.getState().applyQuote(QUOTE_MESSAGE);
    pushRecentSymbol("TSLA");
    queryClient.setQueryData(symbolDetailQueryKey(USER.id, "TSLA"), { symbol: "TSLA" });
    queryClient.setQueryData(marketStatusQueryKey(USER.id), { status: "open" });

    resetClientState({ queryClient });
    useAuthStore.setState({ user: { ...USER, id: "user-2" }, accessToken: "token-2", status: "authenticated" });

    expect(useMarketStore.getState().quotes.TSLA).toBeUndefined();
    expect(readRecentSymbols()).toEqual([]);
    expect(queryClient.getQueryData(symbolDetailQueryKey(USER.id, "TSLA"))).toBeUndefined();
    expect(queryClient.getQueryData(symbolDetailQueryKey("user-2", "TSLA"))).toBeUndefined();
    expect(queryClient.getQueryData(marketStatusQueryKey("user-2"))).toBeUndefined();
  });
});
