import * as accountsApi from "../accounts/api";
import { useAuthStore } from "../auth/store";
import { useAccountsStore } from "../accounts/store";
import * as settingsApi from "../settings/api";
import { useSettingsStore } from "../settings/store";
import { getBootstrappedUserId, setBootstrappedUserId } from "./bootstrap-state";

/**
 * Runs once before the first authenticated render: the cached settings paint the right
 * theme and language, then the server settings and the account list arrive together so
 * the active account is resolved from `defaultAccountId` before any component reads it.
 */
export async function bootstrapAuthenticatedApp(): Promise<void> {
  const userId = useAuthStore.getState().user?.id ?? null;

  useSettingsStore.getState().hydrateFromCache();

  if (userId !== null && getBootstrappedUserId() === userId) return;

  const [settings, accounts] = await Promise.all([
    settingsApi.fetchSettings().catch(() => null),
    accountsApi.listAccounts().catch(() => null),
  ]);

  if (settings !== null) {
    useSettingsStore.getState().applyServerSettings(settings.settings);
  }

  if (accounts !== null) {
    useAccountsStore.getState().setAccounts(accounts.accounts);
  }

  setBootstrappedUserId(userId);
}
