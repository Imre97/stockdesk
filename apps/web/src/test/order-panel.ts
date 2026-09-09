import type { AccountSummaryDto } from "@stockdesk/shared";

import { useAccountsStore } from "../features/accounts/store";
import { useAuthStore } from "../features/auth/store";
import { useMarketStore } from "../features/market/store";
import { useOrdersStore } from "../features/orders/store";
import { usePositionsStore } from "../features/positions/store";
import { useSettingsStore } from "../features/settings/store";

export const TEST_USER = {
  id: "user-1",
  email: "trader@example.com",
  displayName: "Ada Trader",
  createdAt: "2026-09-08T10:00:00.000Z",
};

export const MARKET_OPEN = {
  status: "open",
  nextOpenAt: null,
  nextCloseAt: "2026-09-08T20:00:00.000Z",
  serverTime: "2026-09-08T14:31:00.000Z",
};

export function resetOrderPanelStores(accounts: AccountSummaryDto[]): void {
  useAuthStore.setState({ user: TEST_USER, accessToken: "token-1", status: "authenticated" });
  useSettingsStore.setState({ language: "en", theme: "system", defaultAccountId: null, status: "idle" });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, status: "idle" });
  useAccountsStore.getState().setAccounts(accounts);
  useOrdersStore.getState().reset();
  usePositionsStore.getState().reset();
  useMarketStore.getState().reset();
}
