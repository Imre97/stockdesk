import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const accountsApi = vi.hoisted(() => ({
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
  renameAccount: vi.fn(),
  getEquity: vi.fn(),
  getPositions: vi.fn(),
}));
const settingsApi = vi.hoisted(() => ({ fetchSettings: vi.fn(), updateSettings: vi.fn() }));

vi.mock("../accounts/api", () => accountsApi);
vi.mock("../settings/api", () => settingsApi);

import { accountSummaryDto } from "../../test/fixtures";
import { useAccountsStore } from "../accounts/store";
import { resetClientState } from "../auth/session-reset";
import { useAuthStore } from "../auth/store";
import { useFundingStore } from "../funding/store";
import { useSettingsStore } from "../settings/store";
import { bootstrapAuthenticatedApp } from "./bootstrap";

function user(id: string, displayName: string) {
  return { id, email: `${id}@example.com`, displayName, createdAt: "2026-09-08T10:00:00.000Z" };
}

function accountDto(id: string, name: string) {
  return accountSummaryDto({ id, name });
}

const ACCOUNTS: Record<string, { accounts: ReturnType<typeof accountDto>[] }> = {
  "user-a": { accounts: [accountDto("acc-a", "Ada Main")] },
  "user-b": { accounts: [accountDto("acc-b", "Bob Main")] },
};

const SETTINGS: Record<string, { settings: { language: "en" | "hu"; theme: "light" | "dark" | "system"; defaultAccountId: string } }> = {
  "user-a": { settings: { language: "hu", theme: "dark", defaultAccountId: "acc-a" } },
  "user-b": { settings: { language: "en", theme: "light", defaultAccountId: "acc-b" } },
};

let queryClient: QueryClient;

function signIn(id: string, displayName: string): void {
  useAuthStore.setState({ user: user(id, displayName), accessToken: `token-${id}`, status: "authenticated" });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  queryClient = new QueryClient();
  resetClientState({ queryClient });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useFundingStore.setState({ selectedAccountId: null });
  accountsApi.listAccounts.mockImplementation(() =>
    Promise.resolve(ACCOUNTS[useAuthStore.getState().user?.id ?? ""] ?? { accounts: [] }),
  );
  settingsApi.fetchSettings.mockImplementation(() =>
    Promise.resolve(SETTINGS[useAuthStore.getState().user?.id ?? ""] ?? SETTINGS["user-a"]),
  );
});

describe("bootstrapAuthenticatedApp", () => {
  it("loads the settings and the accounts of the signed in user once", async () => {
    signIn("user-a", "Ada");

    await bootstrapAuthenticatedApp();
    await bootstrapAuthenticatedApp();

    expect(settingsApi.fetchSettings).toHaveBeenCalledTimes(1);
    expect(accountsApi.listAccounts).toHaveBeenCalledTimes(1);
    expect(useAccountsStore.getState().accounts.map((account) => account.name)).toEqual(["Ada Main"]);
    expect(useAccountsStore.getState().activeAccountId).toBe("acc-a");
  });

  it("loads again for the next user in the same tab", async () => {
    signIn("user-a", "Ada");
    await bootstrapAuthenticatedApp();

    resetClientState({ queryClient });
    useAuthStore.getState().clearSession();

    signIn("user-b", "Bob");
    await bootstrapAuthenticatedApp();

    expect(settingsApi.fetchSettings).toHaveBeenCalledTimes(2);
    expect(accountsApi.listAccounts).toHaveBeenCalledTimes(2);
    expect(useAccountsStore.getState().accounts.map((account) => account.name)).toEqual(["Bob Main"]);
    expect(useAccountsStore.getState().activeAccountId).toBe("acc-b");
    expect(useSettingsStore.getState().theme).toBe("light");
  });

  it("refetches for a new user even when the reset was missed", async () => {
    signIn("user-a", "Ada");
    await bootstrapAuthenticatedApp();

    signIn("user-b", "Bob");
    await bootstrapAuthenticatedApp();

    expect(accountsApi.listAccounts).toHaveBeenCalledTimes(2);
    expect(useAccountsStore.getState().accounts.map((account) => account.name)).toEqual(["Bob Main"]);
  });
});
