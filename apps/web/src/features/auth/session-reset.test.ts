import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";

import { useAccountsStore } from "../accounts/store";
import { useFundingStore } from "../funding/store";
import { SETTINGS_STORAGE_KEY, readCachedSettings } from "../settings/storage";
import { useSettingsStore } from "../settings/store";
import { resetClientState } from "./session-reset";

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

let queryClient: QueryClient;

beforeEach(() => {
  window.localStorage.clear();
  queryClient = new QueryClient();
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useFundingStore.setState({ selectedAccountId: null });
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
});
