import type { FormEvent, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  renameAccount: vi.fn(),
  getEquity: vi.fn(),
  getPositions: vi.fn(),
}));

vi.mock("./api", () => api);

import { HttpError } from "../../lib/http";
import { useSettingsStore } from "../settings/store";
import { useCreateAccountForm, useRenameAccountForm } from "./form";
import { useAccountsStore } from "./store";

function accountDto(id: string, name: string, createdAt: string) {
  return {
    id,
    name,
    cash: "0.00",
    positionsValue: "0.00",
    equity: "0.00",
    unrealizedPnl: "0.00",
    unrealizedPnlPct: "0.00",
    dailyPnl: "0.00",
    dailyPnlPct: "0.00",
    createdAt,
  };
}

const MAIN = accountDto("acc-1", "Main", "2026-09-08T10:00:00.000Z");
const SUBMIT_EVENT = { preventDefault: () => undefined } as unknown as FormEvent<HTMLFormElement>;

let queryClient: QueryClient;
let closed: boolean;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  closed = false;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useAccountsStore.getState().setAccounts([MAIN]);
});

describe("useCreateAccountForm", () => {
  it("creates the account, adds it to the store and closes the dialog", async () => {
    api.createAccount.mockResolvedValue({ account: accountDto("acc-2", "Savings", "2026-09-09T10:00:00.000Z") });

    const { result } = renderHook(() => useCreateAccountForm(() => (closed = true)), { wrapper });

    act(() => result.current.setName("Savings"));
    act(() => result.current.submit(SUBMIT_EVENT));

    await waitFor(() => {
      expect(api.createAccount).toHaveBeenCalledWith({ name: "Savings" });
    });

    await waitFor(() => {
      expect(closed).toBe(true);
    });

    expect(useAccountsStore.getState().accounts.map((account) => account.id)).toEqual(["acc-1", "acc-2"]);
  });

  it("rejects an empty name without calling the api", () => {
    const { result } = renderHook(() => useCreateAccountForm(() => (closed = true)), { wrapper });

    act(() => result.current.submit(SUBMIT_EVENT));

    expect(result.current.errorKey).toBe("errors.generic");
    expect(api.createAccount).not.toHaveBeenCalled();
  });

  it("maps a duplicate name to its error key", async () => {
    api.createAccount.mockRejectedValue(new HttpError(409, "ACCOUNT_NAME_TAKEN", "taken"));

    const { result } = renderHook(() => useCreateAccountForm(() => (closed = true)), { wrapper });

    act(() => result.current.setName("Main"));
    act(() => result.current.submit(SUBMIT_EVENT));

    await waitFor(() => {
      expect(result.current.errorKey).toBe("errors.ACCOUNT_NAME_TAKEN");
    });

    expect(closed).toBe(false);
  });
});

describe("useRenameAccountForm", () => {
  it("renames the account and closes the dialog", async () => {
    api.renameAccount.mockResolvedValue({ account: { ...MAIN, name: "Trading" } });

    const { result } = renderHook(() => useRenameAccountForm("acc-1", "Main", () => (closed = true)), {
      wrapper,
    });

    expect(result.current.name).toBe("Main");

    act(() => result.current.setName("Trading"));
    act(() => result.current.submit(SUBMIT_EVENT));

    await waitFor(() => {
      expect(api.renameAccount).toHaveBeenCalledWith("acc-1", { name: "Trading" });
    });

    await waitFor(() => {
      expect(closed).toBe(true);
    });

    expect(useAccountsStore.getState().accounts[0]?.name).toBe("Trading");
  });

  it("does nothing without a target account", () => {
    const { result } = renderHook(() => useRenameAccountForm(null, "", () => (closed = true)), { wrapper });

    act(() => result.current.submit(SUBMIT_EVENT));

    expect(result.current.errorKey).toBe("errors.generic");
    expect(api.renameAccount).not.toHaveBeenCalled();
  });
});
