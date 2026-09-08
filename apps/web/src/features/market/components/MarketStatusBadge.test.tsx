import type { ReactNode } from "react";
import { marketStatusMessageSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const marketApi = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

vi.mock("../api", () => marketApi);

import { i18n } from "../../../i18n";
import { useSettingsStore } from "../../settings/store";
import { useMarketStore } from "../store";
import { MarketStatusBadge } from "./MarketStatusBadge";

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}

function seed(status: "open" | "closed", nextOpenAt: string | null, nextCloseAt: string | null) {
  useMarketStore.getState().applyMarketStatus(
    marketStatusMessageSchema.parse({ type: "market_status", status, nextOpenAt, nextCloseAt }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useMarketStore.getState().reset();
  marketApi.getMarketStatus.mockResolvedValue({ status: "closed", nextOpenAt: null, nextCloseAt: null });
});

describe("MarketStatusBadge", () => {
  it("renders the open label with the gain token on the dot", () => {
    seed("open", null, "2026-09-08T20:00:00.000Z");

    const { container } = render(<MarketStatusBadge />, { wrapper });

    expect(screen.getByText(i18n.t("shell:status.open"))).toBeInTheDocument();
    expect(container.querySelector(".bg-gain")).not.toBeNull();
  });

  it("renders the closed label with the neutral token and the next open time", () => {
    seed("closed", "2026-09-09T13:30:00.000Z", null);

    const { container } = render(<MarketStatusBadge />, { wrapper });

    expect(screen.getByText(i18n.t("shell:status.closed"))).toBeInTheDocument();
    expect(container.querySelector(".bg-neutral")).not.toBeNull();
    expect(container.querySelector(".bg-gain")).toBeNull();
    expect(screen.getByText(/\d/)).toBeInTheDocument();
  });

  it("falls back to the fetched status while nothing was pushed", async () => {
    render(<MarketStatusBadge />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(i18n.t("shell:status.closed"))).toBeInTheDocument();
    });
  });
});
