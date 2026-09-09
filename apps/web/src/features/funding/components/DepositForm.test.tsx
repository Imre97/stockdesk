import { Decimal, depositResponseSchema } from "@stockdesk/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ deposit: vi.fn(), listTransactions: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../api", () => api);
vi.mock("sonner", () => ({ toast }));

import { i18n } from "../../../i18n";
import { accountSummaryDto } from "../../../test/fixtures";
import { useAccountsStore } from "../../accounts/store";
import { DepositForm } from "./DepositForm";

const ACCOUNT_DTO = accountSummaryDto();

const RESPONSE = depositResponseSchema.parse({
  account: { ...ACCOUNT_DTO, cash: "105000.00", equity: "105000.00" },
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

function renderForm() {
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <DepositForm />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

function typeAmount(value: string): void {
  fireEvent.change(screen.getByLabelText(i18n.t("funding:deposit.amountLabel")), { target: { value } });
}

function submit(): void {
  fireEvent.click(screen.getByRole("button", { name: i18n.t("funding:deposit.submit") }));
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useAccountsStore.getState().setAccounts([ACCOUNT_DTO]);
});

describe("DepositForm", () => {
  it("submits the parsed amount as a Decimal for the active account", async () => {
    api.deposit.mockResolvedValue(RESPONSE);
    renderForm();

    typeAmount("5,000.00");
    submit();

    await waitFor(() => {
      expect(api.deposit).toHaveBeenCalledWith("acc-1", { amount: new Decimal("5000.00"), note: undefined });
    });
  });

  it("shows a validation message and does not call the api for an unparseable amount", async () => {
    renderForm();

    typeAmount("abc");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(i18n.t("funding:errors.amountInvalid"));
    expect(api.deposit).not.toHaveBeenCalled();
  });

  it("disables the submit button while the deposit is in flight", async () => {
    api.deposit.mockReturnValue(new Promise(() => undefined));
    renderForm();

    typeAmount("5000.00");
    submit();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: i18n.t("funding:deposit.submit") })).toBeDisabled();
    });
  });
});
