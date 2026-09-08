import type { QueryClient } from "@tanstack/react-query";

import { queryClient as appQueryClient } from "../../lib/query-client";
import { wsSession } from "../../lib/ws-session";
import { useAccountsStore } from "../accounts/store";
import { useFundingStore } from "../funding/store";
import { useSettingsStore } from "../settings/store";
import { clearBootstrappedUserId } from "../shell/bootstrap-state";

export interface ResetClientStateOptions {
  queryClient: QueryClient;
}

/**
 * Leaves nothing of the previous user behind in the tab: the live socket is closed before
 * anything else so no in-flight message can repopulate a store, every domain store returns
 * to its initial state, the request cache is dropped and the next sign-in bootstraps again.
 * The cached language and theme survive as a device preference.
 */
export function resetClientState({ queryClient }: ResetClientStateOptions): void {
  wsSession.disconnect();
  useAccountsStore.getState().reset();
  useSettingsStore.getState().reset();
  useFundingStore.getState().reset();
  clearBootstrappedUserId();
  queryClient.clear();
}

export function resetSessionState(): void {
  resetClientState({ queryClient: appQueryClient });
}
