import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
const api = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
}));

vi.mock("./api", () => api);
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));

import { queryClient } from "../../lib/query-client";
import { accountSummaryDto } from "../../test/fixtures";
import { useAccountsStore } from "../accounts/store";
import { useFundingStore } from "../funding/store";
import { useSettingsStore } from "../settings/store";
import { useLogout } from "./hooks";
import { useAuthStore } from "./store";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const ACCOUNT_DTO = accountSummaryDto();

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryClient.clear();
  api.logout.mockResolvedValue(undefined);
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useFundingStore.setState({ selectedAccountId: null });
});

describe("useLogout", () => {
  it("clears the session, every domain store and the query cache before navigating", async () => {
    useAccountsStore.getState().setAccounts([ACCOUNT_DTO]);
    useFundingStore.getState().setSelectedAccountId("acc-1");
    useSettingsStore.getState().applyServerSettings({ language: "en", theme: "system", defaultAccountId: "acc-1" });
    queryClient.setQueryData(["positions", "acc-1"], { positions: [] });

    const { result } = renderHook(() => useLogout(), { wrapper });

    await result.current();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAccountsStore.getState().accounts).toEqual([]);
    expect(useAccountsStore.getState().status).toBe("idle");
    expect(useFundingStore.getState().selectedAccountId).toBeNull();
    expect(useSettingsStore.getState().defaultAccountId).toBeNull();
    expect(queryClient.getQueryData(["positions", "acc-1"])).toBeUndefined();
    expect(navigate).toHaveBeenCalledWith({ to: "/login" });
  });

  it("resets the client state exactly once", async () => {
    const resetAccounts = vi.spyOn(useAccountsStore.getState(), "reset");

    const { result } = renderHook(() => useLogout(), { wrapper });

    await result.current();

    expect(resetAccounts).toHaveBeenCalledTimes(1);
    resetAccounts.mockRestore();
  });
});

describe("a failed silent refresh", () => {
  it("resets the domain stores through clearSession", async () => {
    useAccountsStore.getState().setAccounts([ACCOUNT_DTO]);
    useFundingStore.getState().setSelectedAccountId("acc-1");
    api.refresh.mockRejectedValue(new Error("expired"));

    await expect(useAuthStore.getState().refresh()).rejects.toThrow();

    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(useAccountsStore.getState().accounts).toEqual([]);
    expect(useFundingStore.getState().selectedAccountId).toBeNull();
  });
});
