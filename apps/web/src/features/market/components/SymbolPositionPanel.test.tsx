import type { ReactNode } from "react";
import { positionsResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accountsApi = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  renameAccount: vi.fn(),
  getEquity: vi.fn(),
  getPositions: vi.fn(),
}));

const subscriptions = vi.hoisted(() => ({
  subscribeQuote: vi.fn(() => () => undefined),
  subscribeBars: vi.fn(() => () => undefined),
}));

vi.mock("../../accounts/api", () => accountsApi);
vi.mock("../subscriptions", () => subscriptions);

import { i18n } from "../../../i18n";
import { accountSummaryDto, positionDto } from "../../../test/fixtures";
import { useAccountsStore } from "../../accounts/store";
import { useAuthStore } from "../../auth/store";
import { usePositionsStore } from "../../positions/store";
import { SymbolPositionPanel } from "./SymbolPositionPanel";

const USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

const ACCOUNT = accountSummaryDto({ id: "acc-1" });

const SHORT_POSITION = positionsResponseSchema.parse({
  positions: [positionDto({ symbol: "TSLA", quantity: "-10.000000", averageCost: "250.0000" })],
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({ user: USER, accessToken: "token-1", status: "authenticated" });
  useAccountsStore.getState().reset();
  useAccountsStore.getState().setAccounts([ACCOUNT]);
  usePositionsStore.getState().reset();
  accountsApi.getPositions.mockResolvedValue({ positions: [] });
});

describe("SymbolPositionPanel", () => {
  it("renders the empty state without a position in the symbol", () => {
    render(<SymbolPositionPanel symbol="TSLA" />, { wrapper });

    expect(screen.getByText(i18n.t("market:position.empty"))).toBeInTheDocument();
  });

  it("renders a short position with the badge and the signed quantity", () => {
    usePositionsStore.getState().setPositions("acc-1", SHORT_POSITION.positions);

    render(<SymbolPositionPanel symbol="TSLA" />, { wrapper });

    expect(screen.getByText(i18n.t("market:position.short"))).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /^-10\b/ })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "-$2,500.00" })).toBeInTheDocument();
  });
});
