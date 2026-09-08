import type { FormEvent, ReactNode } from "react";
import { Decimal, cashTransactionSchema, depositResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ deposit: vi.fn(), listTransactions: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./api", () => api);
vi.mock("sonner", () => ({ toast }));

import { i18n } from "../../i18n";
import { useAccountsStore } from "../accounts/store";
import { useAuthStore } from "../auth/store";
import { useSettingsStore } from "../settings/store";
import {
  transactionsQueryKey,
  useDeposit,
  useDepositForm,
  useSelectedFundingAccountId,
  useTransactionRows,
} from "./hooks";
import { useFundingStore } from "./store";

function accountDto(id: string, name: string, createdAt: string, cash = "100000.00") {
  return {
    id,
    name,
    cash,
    positionsValue: "0.00",
    equity: cash,
    unrealizedPnl: "0.00",
    unrealizedPnlPct: "0.00",
    dailyPnl: "0.00",
    dailyPnlPct: "0.00",
    createdAt,
  };
}

const MAIN = accountDto("acc-1", "Main", "2026-09-08T10:00:00.000Z");
const SAVINGS = accountDto("acc-2", "Savings", "2026-09-09T10:00:00.000Z", "250.50");

function transaction(id: string, accountId: string, amount: string, balanceAfter: string, createdAt: string) {
  return {
    id,
    accountId,
    type: "DEPOSIT" as const,
    amount,
    balanceAfter,
    note: null,
    referenceId: null,
    createdAt,
  };
}

const MAIN_LEDGER = [
  cashTransactionSchema.parse(transaction("tx-main", "acc-1", "100000.00", "100000.00", "2026-09-08T10:00:00.000Z")),
];
const SAVINGS_LEDGER = [
  cashTransactionSchema.parse(transaction("tx-savings", "acc-2", "250.50", "250.50", "2026-09-09T10:00:00.000Z")),
];

const SAVINGS_DEPOSIT = depositResponseSchema.parse({
  account: { ...SAVINGS, cash: "5250.50", equity: "5250.50" },
  transaction: transaction("tx-new", "acc-2", "5000.00", "5250.50", "2026-09-09T11:00:00.000Z"),
});

const SUBMIT_EVENT = { preventDefault: () => undefined } as unknown as FormEvent<HTMLFormElement>;

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

function useDepositPage() {
  const form = useDepositForm();
  const accountId = useSelectedFundingAccountId();
  const rows = useTransactionRows(accountId);

  return { form, accountId, rows };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useAccountsStore.getState().setAccounts([MAIN, SAVINGS]);
  useFundingStore.setState({ selectedAccountId: null });
  api.listTransactions.mockImplementation((accountId: string) =>
    Promise.resolve({
      transactions: accountId === "acc-2" ? SAVINGS_LEDGER : MAIN_LEDGER,
      nextCursor: null,
    }),
  );
});

describe("useDeposit", () => {
  it("upserts the returned account and prepends the transaction to the cached page", async () => {
    queryClient.setQueryData(transactionsQueryKey(USER.id, "acc-2"), {
      transactions: SAVINGS_LEDGER,
      nextCursor: null,
    });
    api.deposit.mockResolvedValue(SAVINGS_DEPOSIT);

    const { result } = renderHook(() => useDeposit(), { wrapper });

    result.current.mutate({ accountId: "acc-2", amount: new Decimal("5000.00") });

    await waitFor(() => {
      expect(api.deposit).toHaveBeenCalledWith("acc-2", { amount: new Decimal("5000.00"), note: undefined });
    });

    await waitFor(() => {
      const account = useAccountsStore.getState().accounts.find((entry) => entry.id === "acc-2");
      expect(account?.equity.equals(new Decimal("5250.50"))).toBe(true);
    });

    const page = queryClient.getQueryData(transactionsQueryKey(USER.id, "acc-2")) as { transactions: { id: string }[] };

    expect(page.transactions.map((entry) => entry.id)).toEqual(["tx-new", "tx-savings"]);
    expect(toast.success).toHaveBeenCalled();
  });
});

describe("the deposit page ledger", () => {
  it("follows the account chosen in the form instead of the sidebar-active one", async () => {
    api.deposit.mockResolvedValue(SAVINGS_DEPOSIT);

    const { result } = renderHook(() => useDepositPage(), { wrapper });

    expect(useAccountsStore.getState().activeAccountId).toBe("acc-1");

    act(() => result.current.form.setAccountId("acc-2"));

    await waitFor(() => {
      expect(result.current.accountId).toBe("acc-2");
    });

    await waitFor(() => {
      expect(result.current.rows.map((row) => row.id)).toEqual(["tx-savings"]);
    });

    act(() => result.current.form.setAmount("5000.00"));
    act(() => result.current.form.submit(SUBMIT_EVENT));

    await waitFor(() => {
      expect(api.deposit).toHaveBeenCalledWith("acc-2", { amount: new Decimal("5000.00"), note: undefined });
    });

    await waitFor(() => {
      expect(result.current.rows.map((row) => row.id)).toEqual(["tx-new", "tx-savings"]);
    });

    const mainPage = queryClient.getQueryData(transactionsQueryKey(USER.id, "acc-1")) as
      | { transactions: { id: string }[] }
      | undefined;

    expect(mainPage?.transactions.map((entry) => entry.id) ?? []).not.toContain("tx-new");
  });

  it("falls back to the sidebar-active account when nothing was chosen", () => {
    const { result } = renderHook(() => useDepositPage(), { wrapper });

    expect(result.current.accountId).toBe("acc-1");
  });
});

describe("useDepositForm validation", () => {
  it("rejects an amount with more than two decimals instead of rounding it", async () => {
    const { result } = renderHook(() => useDepositForm(), { wrapper });

    act(() => result.current.setAmount("1000.005"));
    act(() => result.current.submit(SUBMIT_EVENT));

    await waitFor(() => {
      expect(result.current.errorKey).toBe("errors.amountInvalid");
    });

    expect(api.deposit).not.toHaveBeenCalled();
  });
});
