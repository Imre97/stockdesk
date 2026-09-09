import type { ReactNode } from "react";
import { placeOrderResponseSchema, symbolDetailSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ previewOrder: vi.fn(), placeOrder: vi.fn() }));

const marketApi = vi.hoisted(() => ({
  searchSymbols: vi.fn(),
  getSymbol: vi.fn(),
  getBars: vi.fn(),
  getMarketStatus: vi.fn(),
  getTrades: vi.fn(),
}));

const subscriptions = vi.hoisted(() => ({
  subscribeQuote: vi.fn(() => () => undefined),
  subscribeBars: vi.fn(() => () => undefined),
}));

interface LinkProps {
  to: string;
  children: ReactNode;
  className?: string;
}

vi.mock("../api", () => api);
vi.mock("../../market/api", () => marketApi);
vi.mock("../../market/subscriptions", () => subscriptions);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: LinkProps) => (
    <a className={className} href={to}>
      {children}
    </a>
  ),
}));

import { i18n } from "../../../i18n";
import {
  accountSummaryDto,
  orderPreviewDto,
  placeOrderResponseDto,
  symbolDetailDto,
} from "../../../test/fixtures";
import { MARKET_OPEN, resetOrderPanelStores } from "../../../test/order-panel";
import { OrderPanel } from "./OrderPanel";

let queryClient: QueryClient;
let backCalls: number;

function renderPanel(side: "BUY" | "SELL" = "BUY") {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <OrderPanel onBack={() => (backCalls += 1)} side={side} symbol="TSLA" />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function label(key: string): string {
  return i18n.t(key);
}

function pick(comboboxLabel: string, optionName: string): void {
  fireEvent.click(screen.getByRole("combobox", { name: comboboxLabel }));
  fireEvent.click(screen.getByRole("option", { name: optionName }));
}

function typeQuantity(value: string): void {
  fireEvent.change(screen.getByLabelText(label("orders:panel.quantityLabel")), { target: { value } });
}

async function waitForLastPrice(): Promise<void> {
  await waitFor(() => {
    expect(marketApi.getSymbol).toHaveBeenCalled();
  });

  await screen.findByRole("combobox", { name: label("orders:panel.unitLabel") });
}

beforeEach(() => {
  vi.clearAllMocks();
  backCalls = 0;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  resetOrderPanelStores([accountSummaryDto({ id: "acc-1", name: "Main" })]);
  marketApi.getSymbol.mockResolvedValue(symbolDetailSchema.parse(symbolDetailDto()));
  marketApi.getMarketStatus.mockResolvedValue(MARKET_OPEN);
  api.previewOrder.mockResolvedValue(orderPreviewDto());
  api.placeOrder.mockResolvedValue(placeOrderResponseSchema.parse(placeOrderResponseDto()));
});

describe("OrderPanel quantity in USD mode", () => {
  it("shows and submits the fractional share count of a fractionable symbol", async () => {
    renderPanel();
    await waitForLastPrice();

    pick(label("orders:panel.unitLabel"), label("orders:unit.usd"));
    typeQuantity("1000");

    expect(screen.getByText(i18n.t("orders:hint.shares", { quantity: "3.978674" }))).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: i18n.t("orders:submit.buy", { quantity: "3.978674", symbol: "TSLA" }),
      }),
    );

    await waitFor(() => {
      expect(api.placeOrder).toHaveBeenCalledWith("acc-1", {
        symbol: "TSLA",
        side: "BUY",
        type: "MARKET",
        quantity: "3.978674",
        limitPrice: null,
        stopPrice: null,
        timeInForce: "GTC",
        stopLossPrice: null,
        takeProfitPrice: null,
      });
    });
  });

  it("shows and submits whole shares on a non-fractionable symbol", async () => {
    marketApi.getSymbol.mockResolvedValue(
      symbolDetailSchema.parse(symbolDetailDto({ fractionable: false })),
    );
    renderPanel();
    await waitForLastPrice();

    pick(label("orders:panel.unitLabel"), label("orders:unit.usd"));
    typeQuantity("1000");

    expect(screen.getByText(i18n.t("orders:hint.shares", { quantity: "3" }))).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("orders:submit.buy", { quantity: "3", symbol: "TSLA" }) }),
    );

    await waitFor(() => {
      expect(api.placeOrder).toHaveBeenCalledWith("acc-1", expect.objectContaining({ quantity: "3.000000" }));
    });
  });
});

describe("OrderPanel order type fields", () => {
  it("reveals the price inputs the chosen type needs", async () => {
    renderPanel();
    await waitForLastPrice();

    expect(screen.queryByLabelText(label("orders:panel.limitPriceLabel"))).not.toBeInTheDocument();
    expect(screen.queryByLabelText(label("orders:panel.stopPriceLabel"))).not.toBeInTheDocument();

    pick(label("orders:panel.typeLabel"), label("orders:type.LIMIT"));

    expect(screen.getByLabelText(label("orders:panel.limitPriceLabel"))).toHaveValue("251.3400");
    expect(screen.queryByLabelText(label("orders:panel.stopPriceLabel"))).not.toBeInTheDocument();

    pick(label("orders:panel.typeLabel"), label("orders:type.STOP_LIMIT"));

    expect(screen.getByLabelText(label("orders:panel.limitPriceLabel"))).toBeInTheDocument();
    expect(screen.getByLabelText(label("orders:panel.stopPriceLabel"))).toHaveValue("251.3400");
  });

  it("sends null bracket prices while both checkboxes stay unchecked", async () => {
    renderPanel();
    await waitForLastPrice();

    typeQuantity("10");

    expect(screen.getByRole("checkbox", { name: label("orders:bracket.stopLoss") })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: label("orders:bracket.takeProfit") })).not.toBeChecked();

    fireEvent.click(
      screen.getByRole("button", { name: i18n.t("orders:submit.buy", { quantity: "10", symbol: "TSLA" }) }),
    );

    await waitFor(() => {
      expect(api.placeOrder).toHaveBeenCalledWith(
        "acc-1",
        expect.objectContaining({ stopLossPrice: null, takeProfitPrice: null }),
      );
    });
  });

  it("prefills a checked bracket five percent away from the entry", async () => {
    renderPanel();
    await waitForLastPrice();

    fireEvent.click(screen.getByRole("checkbox", { name: label("orders:bracket.stopLoss") }));

    expect(screen.getByLabelText(label("orders:bracket.stopLossPriceLabel"))).toHaveValue("238.7730");
  });
});

describe("OrderPanel shell", () => {
  it("keeps the order slot region, the account select and the back button", async () => {
    renderPanel();
    await waitForLastPrice();

    expect(screen.getByRole("region", { name: label("market:orderSlot.title") })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: label("orders:panel.accountLabel") })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: label("market:side.back") }));

    expect(backCalls).toBe(1);
  });
});
