import type { ReactNode } from "react";
import { equityResponseSchema, positionsResponseSchema, type EquityRange } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accountsApi = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  renameAccount: vi.fn(),
  getEquity: vi.fn(),
  getPositions: vi.fn(),
}));

vi.mock("../accounts/api", () => accountsApi);

import { accountSummaryDto, positionDto } from "../../test/fixtures";
import { useAccountsStore } from "../accounts/store";
import { useMarketStore } from "../market/store";
import { usePositionsStore } from "../positions/store";
import { useSettingsStore } from "../settings/store";
import { useEquityChartData, usePositionRows } from "./hooks";

function accountDto(id: string, name: string, createdAt: string) {
  return accountSummaryDto({ id, name, createdAt });
}

const EQUITY: Record<string, Record<string, string>> = {
  "acc-1": { "1D": "100000.00", "1W": "101000.00" },
  "acc-2": { "1D": "250.50", "1W": "260.50" },
};

function equityResponse(accountId: string, range: EquityRange) {
  return equityResponseSchema.parse({
    range,
    points: [{ at: "2026-09-08T14:30:00.000Z", equity: EQUITY[accountId]?.[range] ?? "0.00" }],
  });
}

const POSITIONS: Record<string, ReturnType<typeof positionDto>[]> = {
  "acc-1": [positionDto({ symbol: "AAPL", quantity: "10.000000", averageCost: "180.2500" })],
  "acc-2": [positionDto({ symbol: "TSLA", quantity: "-4.000000", averageCost: "250.0000" })],
};

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useAccountsStore
    .getState()
    .setAccounts([
      accountDto("acc-1", "Main", "2026-09-08T10:00:00.000Z"),
      accountDto("acc-2", "Savings", "2026-09-09T10:00:00.000Z"),
    ]);
  accountsApi.getEquity.mockImplementation((accountId: string, range: EquityRange) =>
    Promise.resolve(equityResponse(accountId, range)),
  );
  accountsApi.getPositions.mockImplementation((accountId: string) =>
    Promise.resolve(positionsResponseSchema.parse({ positions: POSITIONS[accountId] ?? [] })),
  );
  useMarketStore.getState().reset();
  usePositionsStore.getState().reset();
});

describe("useEquityChartData", () => {
  it("maps the equity points of the active account for the requested range", async () => {
    const { result } = renderHook(({ range }: { range: EquityRange }) => useEquityChartData(range), {
      initialProps: { range: "1D" as EquityRange },
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.series).toEqual([{ time: 1788877800, value: 100000 }]);
    });

    expect(accountsApi.getEquity).toHaveBeenCalledWith("acc-1", "1D");
    expect(result.current.isEmpty).toBe(false);
  });

  it("fetches and maps a new series when the range changes", async () => {
    const { result, rerender } = renderHook(({ range }: { range: EquityRange }) => useEquityChartData(range), {
      initialProps: { range: "1D" as EquityRange },
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.series).toHaveLength(1);
    });

    rerender({ range: "1W" });

    await waitFor(() => {
      expect(result.current.series).toEqual([{ time: 1788877800, value: 101000 }]);
    });

    expect(accountsApi.getEquity).toHaveBeenCalledWith("acc-1", "1W");
  });

  it("fetches and maps a new series when the active account changes", async () => {
    const { result } = renderHook(({ range }: { range: EquityRange }) => useEquityChartData(range), {
      initialProps: { range: "1D" as EquityRange },
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.series).toHaveLength(1);
    });

    act(() => useAccountsStore.getState().setActiveAccount("acc-2"));

    await waitFor(() => {
      expect(result.current.series).toEqual([{ time: 1788877800, value: 250.5 }]);
    });

    expect(accountsApi.getEquity).toHaveBeenCalledWith("acc-2", "1D");
  });

  it("reports an empty range", async () => {
    accountsApi.getEquity.mockResolvedValue(equityResponseSchema.parse({ range: "1D", points: [] }));

    const { result } = renderHook(({ range }: { range: EquityRange }) => useEquityChartData(range), {
      initialProps: { range: "1D" as EquityRange },
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.series).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });
});

describe("usePositionRows", () => {
  it("follows the sidebar active account", async () => {
    const { result } = renderHook(() => usePositionRows(), { wrapper });

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });

    expect(result.current[0]?.symbol).toBe("AAPL");
    expect(result.current[0]?.short).toBe(false);

    act(() => useAccountsStore.getState().setActiveAccount("acc-2"));

    await waitFor(() => {
      expect(result.current[0]?.symbol).toBe("TSLA");
    });

    expect(result.current[0]?.short).toBe(true);
    expect(result.current[0]?.quantity).toBe("-4");
    expect(accountsApi.getPositions).toHaveBeenCalledWith("acc-2");
  });
});
