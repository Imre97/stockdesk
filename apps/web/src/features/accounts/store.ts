import type { AccountSummary, AccountSummaryMessage } from "@stockdesk/shared";
import { create } from "zustand";

import { useSettingsStore } from "../settings/store";
import { parseAccountSummaries, resolveActiveAccountId, type AccountSummaryInput } from "./mappers";

export type AccountsStatus = "idle" | "loaded";

export interface AccountsState {
  accounts: AccountSummary[];
  activeAccountId: string | null;
  status: AccountsStatus;
  setAccounts: (accounts: AccountSummaryInput[]) => void;
  applyAccountSummary: (message: AccountSummaryMessage) => void;
  setActiveAccount: (accountId: string) => void;
  upsertAccount: (account: AccountSummaryInput) => void;
}

function defaultAccountId(): string | null {
  return useSettingsStore.getState().defaultAccountId;
}

export const useAccountsStore = create<AccountsState>((set, get) => {
  function replace(accounts: AccountSummary[]): void {
    set({
      accounts,
      activeAccountId: resolveActiveAccountId(accounts, get().activeAccountId, defaultAccountId()),
      status: "loaded",
    });
  }

  return {
    accounts: [],
    activeAccountId: null,
    status: "idle",

    setAccounts: (accounts) => replace(parseAccountSummaries(accounts)),

    applyAccountSummary: (message) => replace(parseAccountSummaries(message.accounts)),

    setActiveAccount: (accountId) => set({ activeAccountId: accountId }),

    upsertAccount: (account) => {
      const [parsed] = parseAccountSummaries([account]);

      if (parsed === undefined) return;

      const current = get().accounts;
      const index = current.findIndex((existing) => existing.id === parsed.id);
      const next = index === -1 ? [...current, parsed] : current.map((existing, at) => (at === index ? parsed : existing));

      replace(next);
    },
  };
});
