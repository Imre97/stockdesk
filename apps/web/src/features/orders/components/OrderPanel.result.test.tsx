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
import { HttpError } from "../../../lib/http";
import {
  accountSummaryDto,
  orderDto,
  orderPreviewDto,
  placeOrderResponseDto,
  positionRecordDto,
  symbolDetailDto,
  tradeDto,
} from "../../../test/fixtures";
import { MARKET_OPEN, resetOrderPanelStores } from "../../../test/order-panel";
import { usePositionsStore } from "../../positions/store";
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

function typeQuantity(value: string): void {
  fireEvent.change(screen.getByLabelText(label("orders:panel.quantityLabel")), { target: { value } });
}

function submitButton(key: string, quantity: string): HTMLElement {
  return screen.getByRole("button", { name: i18n.t(key, { quantity, symbol: "TSLA" }) });
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

describe("OrderPanel short path", () => {
  it("labels a sell with no position as a short sale and shows the margin requirement", async () => {
    renderPanel("SELL");
    await waitForLastPrice();

    typeQuantity("10");

    expect(submitButton("orders:submit.sellShort", "10")).toBeInTheDocument();
    expect(await screen.findByText(label("orders:summary.short"))).toBeInTheDocument();
    expect(
      await screen.findByText(i18n.t("orders:summary.marginRequirement", { amount: "$1,020.00" })),
    ).toBeInTheDocument();
  });

  it("explains and disables the short path on a symbol that cannot be shorted", async () => {
    marketApi.getSymbol.mockResolvedValue(symbolDetailSchema.parse(symbolDetailDto({ shortable: false })));
    renderPanel("SELL");
    await waitForLastPrice();

    typeQuantity("10");

    expect(screen.getByRole("alert")).toHaveTextContent(label("orders:errors.SYMBOL_NOT_SHORTABLE"));
    expect(submitButton("orders:submit.sellShort", "10")).toBeDisabled();
    expect(api.placeOrder).not.toHaveBeenCalled();
  });

  it("keeps a sell that closes a long out of the short path", async () => {
    usePositionsStore.getState().applyPositionUpdate({
      type: "position_update",
      position: positionRecordDto({ accountId: "acc-1", symbol: "TSLA", quantity: "10.000000" }),
    });
    renderPanel("SELL");
    await waitForLastPrice();

    typeQuantity("10");

    expect(submitButton("orders:submit.sell", "10")).toBeInTheDocument();
  });
});

describe("OrderPanel result", () => {
  it("shows the fill price in the success dialog", async () => {
    api.placeOrder.mockResolvedValue(
      placeOrderResponseSchema.parse(
        placeOrderResponseDto({
          order: orderDto({
            type: "MARKET",
            limitPrice: null,
            status: "FILLED",
            quantity: "10.000000",
            avgFillPrice: "251.3400",
            filledAt: "2026-09-08T14:31:00.000Z",
          }),
          trade: tradeDto({ price: "251.3400", amount: "2513.40" }),
        }),
      ),
    );

    renderPanel();
    await waitForLastPrice();

    typeQuantity("10");
    fireEvent.click(submitButton("orders:submit.buy", "10"));

    expect(
      await screen.findByText(i18n.t("orders:success.filled", { price: "251.3400" })),
    ).toBeInTheDocument();
    expect(screen.getByText("$2,513.40")).toBeInTheDocument();
  });

  it("returns to the key stats when the success dialog closes", async () => {
    renderPanel();
    await waitForLastPrice();

    typeQuantity("10");
    fireEvent.click(submitButton("orders:submit.buy", "10"));

    fireEvent.click(await screen.findByRole("button", { name: label("orders:success.close") }));

    await waitFor(() => {
      expect(backCalls).toBe(1);
    });
  });

  it("renders required versus available for an insufficient buying power error", async () => {
    api.placeOrder.mockRejectedValue(
      new HttpError(422, "INSUFFICIENT_BUYING_POWER", "no power", {
        required: "1020.00",
        available: "500.00",
      }),
    );

    renderPanel();
    await waitForLastPrice();

    typeQuantity("10");
    fireEvent.click(submitButton("orders:submit.buy", "10"));

    const alert = await screen.findByRole("alert");

    expect(alert).toHaveTextContent(label("orders:errors.INSUFFICIENT_BUYING_POWER"));
    expect(alert).toHaveTextContent(
      i18n.t("orders:errors.buyingPowerDetails", { required: "$1,020.00", available: "$500.00" }),
    );
  });
});
