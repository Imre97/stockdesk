import type { ReactNode } from "react";
import { Decimal, cashTransactionSchema, depositResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ deposit: vi.fn(), listTransactions: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("./api", () => api);
vi.mock("sonner", () => ({ toast }));

import { useAccountsStore } from "../accounts/store";
import { transactionsQueryKey, useDeposit } from "./hooks";

const ACCOUNT_DTO = {
  id: "acc-1",
  name: "Main",
  cash: "105000.00",
  positionsValue: "0.00",
  equity: "105000.00",
  unrealizedPnl: "0.00",
  unrealizedPnlPct: "0.00",
  dailyPnl: "0.00",
  dailyPnlPct: "0.00",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const EXISTING_TRANSACTION = cashTransactionSchema.parse({
  id: "tx-0",
  accountId: "acc-1",
  type: "DEPOSIT",
  amount: "100000.00",
  balanceAfter: "100000.00",
  note: "initial funding",
  referenceId: null,
  createdAt: "2026-09-08T10:00:00.000Z",
});

const DEPOSIT_RESPONSE = depositResponseSchema.parse({
  account: ACCOUNT_DTO,
  transaction: {
    id: "tx-1",
    accountId: "acc-1",
    type: "DEPOSIT",
    amount: "5000.00",
    balanceAfter: "105000.00",
    note: null,
    referenceId: null,
    createdAt: "2026-09-08T10:05:00.000Z",
  },
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
});

describe("useDeposit", () => {
  it("upserts the returned account and prepends the transaction to the cached page", async () => {
    useAccountsStore.getState().setAccounts([{ ...ACCOUNT_DTO, cash: "100000.00", equity: "100000.00" }]);
    queryClient.setQueryData(transactionsQueryKey("acc-1"), {
      transactions: [EXISTING_TRANSACTION],
      nextCursor: null,
    });
    api.deposit.mockResolvedValue(DEPOSIT_RESPONSE);

    const { result } = renderHook(() => useDeposit(), { wrapper });

    result.current.mutate({ accountId: "acc-1", amount: new Decimal("5000.00") });

    await waitFor(() => {
      expect(api.deposit).toHaveBeenCalledWith("acc-1", { amount: new Decimal("5000.00"), note: undefined });
    });

    await waitFor(() => {
      expect(useAccountsStore.getState().accounts[0]?.equity.equals(new Decimal("105000.00"))).toBe(true);
    });

    const page = queryClient.getQueryData(transactionsQueryKey("acc-1")) as {
      transactions: { id: string }[];
      nextCursor: string | null;
    };

    expect(page.transactions.map((transaction) => transaction.id)).toEqual(["tx-1", "tx-0"]);
    expect(toast.success).toHaveBeenCalled();
  });
});
