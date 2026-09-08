import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
const marketApi = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("../../market/api", () => marketApi);

import { i18n } from "../../../i18n";
import { RECENT_SYMBOLS_STORAGE_KEY } from "../../market/recent-symbols";
import { TickerSearch } from "./TickerSearch";

const TSLA = { symbol: "TSLA", name: "Tesla, Inc.", exchange: "NASDAQ" };
const TSM = { symbol: "TSM", name: "Taiwan Semiconductor", exchange: "NYSE" };
const AAPL = { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" };

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

function renderSearch() {
  return render(<TickerSearch />, { wrapper });
}

function combobox(): HTMLElement {
  return screen.getByRole("combobox");
}

function type(value: string): void {
  fireEvent.change(combobox(), { target: { value } });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  marketApi.searchSymbols.mockResolvedValue({ results: [TSLA, TSM] });
});

describe("TickerSearch", () => {
  it("shows the matching symbols of the typed query", async () => {
    renderSearch();

    fireEvent.focus(combobox());
    type("tsl");

    const option = await screen.findByRole("option", { name: /TSLA/ });

    expect(option).toHaveTextContent("Tesla, Inc.");
    expect(option).toHaveTextContent("NASDAQ");
    expect(combobox()).toHaveAttribute("aria-expanded", "true");
  });

  it("navigates to the symbol page with the arrow keys and Enter", async () => {
    renderSearch();

    fireEvent.focus(combobox());
    type("tsl");

    await screen.findByRole("option", { name: /TSLA/ });

    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    fireEvent.keyDown(combobox(), { key: "Enter" });

    expect(navigate).toHaveBeenCalledWith({ to: "/symbols/$symbol", params: { symbol: "TSLA" } });
    expect(combobox()).toHaveValue("");
  });

  it("moves down and back up through the options", async () => {
    renderSearch();

    fireEvent.focus(combobox());
    type("ts");

    await screen.findByRole("option", { name: /TSM/ });

    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    fireEvent.keyDown(combobox(), { key: "ArrowDown" });
    fireEvent.keyDown(combobox(), { key: "ArrowUp" });
    fireEvent.keyDown(combobox(), { key: "Enter" });

    expect(navigate).toHaveBeenCalledWith({ to: "/symbols/$symbol", params: { symbol: "TSLA" } });
  });

  it("navigates when an option is clicked and remembers the symbol", async () => {
    renderSearch();

    fireEvent.focus(combobox());
    type("tsl");

    fireEvent.click(await screen.findByRole("option", { name: /TSLA/ }));

    expect(navigate).toHaveBeenCalledWith({ to: "/symbols/$symbol", params: { symbol: "TSLA" } });
    expect(window.localStorage.getItem(RECENT_SYMBOLS_STORAGE_KEY)).toBe(JSON.stringify([TSLA]));
  });

  it("closes the dropdown on Escape", async () => {
    renderSearch();

    fireEvent.focus(combobox());
    type("tsl");

    await screen.findByRole("option", { name: /TSLA/ });

    fireEvent.keyDown(combobox(), { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(combobox()).toHaveAttribute("aria-expanded", "false");
  });

  it("lists the recent symbols with their name and exchange when the focused input is empty", async () => {
    window.localStorage.setItem(RECENT_SYMBOLS_STORAGE_KEY, JSON.stringify([TSLA, AAPL]));

    renderSearch();

    fireEvent.focus(combobox());

    expect(await screen.findByText(i18n.t("shell:search.recent"))).toBeInTheDocument();

    const options = screen.getAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual([
      "TSLATesla, Inc.NASDAQ",
      "AAPLApple Inc.NASDAQ",
    ]);
    expect(marketApi.searchSymbols).not.toHaveBeenCalled();
  });

  it("shows the empty state when the query matches nothing", async () => {
    marketApi.searchSymbols.mockResolvedValue({ results: [] });

    renderSearch();

    fireEvent.focus(combobox());
    type("zzz");

    await waitFor(() => {
      expect(screen.getByText(i18n.t("shell:search.noResults"))).toBeInTheDocument();
    });

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });
});
