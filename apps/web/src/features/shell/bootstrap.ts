import * as accountsApi from "../accounts/api";
import { useAccountsStore } from "../accounts/store";
import * as settingsApi from "../settings/api";
import { useSettingsStore } from "../settings/store";

/**
 * Runs once before the first authenticated render: the cached settings paint the right
 * theme and language, then the server settings and the account list arrive together so
 * the active account is resolved from `defaultAccountId` before any component reads it.
 */
export async function bootstrapAuthenticatedApp(): Promise<void> {
  const settingsStore = useSettingsStore.getState();
  const accountsStore = useAccountsStore.getState();

  settingsStore.hydrateFromCache();

  if (settingsStore.status === "loaded" && accountsStore.status === "loaded") return;

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
}
