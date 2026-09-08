import { Decimal, type AccountSummaryDto } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { useSettingsStore } from "../settings/store";
import { useAccountsStore } from "./store";

function dto(overrides: Partial<AccountSummaryDto> = {}): AccountSummaryDto {
  return {
    id: "acc-1",
    name: "Main",
    cash: "100000.00",
    positionsValue: "0.00",
    equity: "100000.00",
    unrealizedPnl: "0.00",
    unrealizedPnlPct: "0.00",
    dailyPnl: "0.00",
    dailyPnlPct: "0.00",
    createdAt: "2026-09-08T10:00:00.000Z",
    ...overrides,
  };
}

const MAIN = dto();
const SAVINGS = dto({ id: "acc-2", name: "Savings", createdAt: "2026-09-09T10:00:00.000Z", equity: "250.50" });

beforeEach(() => {
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useSettingsStore.setState({ defaultAccountId: null });
});

describe("accounts store", () => {
  it("parses monetary fields of the account list into Decimal values", () => {
    useAccountsStore.getState().setAccounts([MAIN, SAVINGS]);

    const state = useAccountsStore.getState();

    expect(state.accounts).toHaveLength(2);
    expect(state.accounts[1]?.equity).toBeInstanceOf(Decimal);
    expect(state.accounts[1]?.equity.equals(new Decimal("250.50"))).toBe(true);
    expect(state.status).toBe("loaded");
  });

  it("activates the default account from the settings store", () => {
    useSettingsStore.setState({ defaultAccountId: "acc-2" });

    useAccountsStore.getState().setAccounts([MAIN, SAVINGS]);

    expect(useAccountsStore.getState().activeAccountId).toBe("acc-2");
  });

  it("falls back to the oldest account when the default account is unknown", () => {
    useSettingsStore.setState({ defaultAccountId: "acc-missing" });

    useAccountsStore.getState().setAccounts([SAVINGS, MAIN]);

    expect(useAccountsStore.getState().activeAccountId).toBe("acc-1");
  });

  it("replaces the list wholesale and keeps the active account when it still exists", () => {
    useAccountsStore.getState().setAccounts([MAIN, SAVINGS]);
    useAccountsStore.getState().setActiveAccount("acc-2");

    useAccountsStore.getState().applyAccountSummary({
      type: "account_summary",
      accounts: [dto({ id: "acc-2", name: "Savings", equity: "300.00", createdAt: SAVINGS.createdAt })],
    });

    const state = useAccountsStore.getState();

    expect(state.accounts).toHaveLength(1);
    expect(state.activeAccountId).toBe("acc-2");
    expect(state.accounts[0]?.equity.equals(new Decimal("300.00"))).toBe(true);
  });

  it("falls back to the oldest account when the active account disappears", () => {
    useAccountsStore.getState().setAccounts([MAIN, SAVINGS]);
    useAccountsStore.getState().setActiveAccount("acc-2");

    useAccountsStore.getState().applyAccountSummary({ type: "account_summary", accounts: [MAIN] });

    expect(useAccountsStore.getState().activeAccountId).toBe("acc-1");
  });

  it("switches the active account", () => {
    useAccountsStore.getState().setAccounts([MAIN, SAVINGS]);

    useAccountsStore.getState().setActiveAccount("acc-2");

    expect(useAccountsStore.getState().activeAccountId).toBe("acc-2");
  });

  it("replaces a single account and leaves the others untouched", () => {
    useAccountsStore.getState().setAccounts([MAIN, SAVINGS]);

    useAccountsStore.getState().upsertAccount(dto({ cash: "105000.00", equity: "105000.00" }));

    const state = useAccountsStore.getState();

    expect(state.accounts).toHaveLength(2);
    expect(state.accounts[0]?.equity.equals(new Decimal("105000.00"))).toBe(true);
    expect(state.accounts[1]?.name).toBe("Savings");
  });

  it("appends an account that is not in the list yet", () => {
    useAccountsStore.getState().setAccounts([MAIN]);

    useAccountsStore.getState().upsertAccount(SAVINGS);

    expect(useAccountsStore.getState().accounts.map((account) => account.id)).toEqual(["acc-1", "acc-2"]);
  });
});
