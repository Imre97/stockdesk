import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../api", () => api);

import { i18n } from "../../../i18n";
import { SymbolNotFound } from "./SymbolNotFound";

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
  api.searchSymbols.mockResolvedValue({ results: [] });
});

describe("SymbolNotFound", () => {
  it("explains the missing symbol and offers the ticker search", () => {
    render(<SymbolNotFound />, { wrapper });

    expect(screen.getByText(i18n.t("market:page.notFound.title"))).toBeInTheDocument();
    expect(screen.getByText(i18n.t("market:page.notFound.body"))).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
