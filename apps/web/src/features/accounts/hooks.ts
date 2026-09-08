import { useCallback, useMemo } from "react";
import type {
  AccountResponse,
  AccountSummary,
  CreateAccountInput,
  EquityRange,
  EquityResponse,
  PositionsResponse,
  RenameAccountInput,
} from "@stockdesk/shared";
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from "@tanstack/react-query";

import { useSettingsLocale } from "../settings/hooks";
import * as api from "./api";
import { toAccountViewModel, type AccountViewModel } from "./mappers";
import { useAccountsStore } from "./store";

export const MARKET_DATA_STALE_TIME_MS = 60_000;

export function equityQueryKey(accountId: string | null, range: EquityRange): readonly unknown[] {
  return ["equity", accountId, range];
}

export function positionsQueryKey(accountId: string | null): readonly unknown[] {
  return ["positions", accountId];
}

export interface AccountsView {
  accounts: AccountViewModel[];
  activeAccountId: string | null;
  setActiveAccount: (accountId: string) => void;
}

export function useAccounts(): AccountsView {
  const accounts = useAccountsStore((state) => state.accounts);
  const activeAccountId = useAccountsStore((state) => state.activeAccountId);
  const setActiveAccount = useAccountsStore((state) => state.setActiveAccount);
  const locale = useSettingsLocale();

  const views = useMemo(
    () => accounts.map((account) => toAccountViewModel(account, locale)),
    [accounts, locale],
  );

  return { accounts: views, activeAccountId, setActiveAccount };
}

export function useActiveAccountId(): string | null {
  return useAccountsStore((state) => state.activeAccountId);
}

export function useActiveAccount(): AccountSummary | null {
  const accounts = useAccountsStore((state) => state.accounts);
  const activeAccountId = useAccountsStore((state) => state.activeAccountId);

  return useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? null,
    [accounts, activeAccountId],
  );
}

export function useActiveAccountView(): AccountViewModel | null {
  const account = useActiveAccount();
  const locale = useSettingsLocale();

  return useMemo(() => (account === null ? null : toAccountViewModel(account, locale)), [account, locale]);
}

export function useEquity(accountId: string | null, range: EquityRange): UseQueryResult<EquityResponse> {
  return useQuery({
    queryKey: equityQueryKey(accountId, range),
    queryFn: () => api.getEquity(accountId ?? "", range),
    enabled: accountId !== null,
    staleTime: MARKET_DATA_STALE_TIME_MS,
  });
}

export function usePositions(accountId: string | null): UseQueryResult<PositionsResponse> {
  return useQuery({
    queryKey: positionsQueryKey(accountId),
    queryFn: () => api.getPositions(accountId ?? ""),
    enabled: accountId !== null,
    staleTime: MARKET_DATA_STALE_TIME_MS,
  });
}

export function useCreateAccount(): UseMutationResult<AccountResponse, Error, CreateAccountInput> {
  const upsertAccount = useAccountsStore((state) => state.upsertAccount);
  const setActiveAccount = useAccountsStore((state) => state.setActiveAccount);

  return useMutation<AccountResponse, Error, CreateAccountInput>({
    mutationFn: (input) => api.createAccount(input),
    onSuccess: (response) => {
      upsertAccount(response.account);
      setActiveAccount(response.account.id);
    },
  });
}

export interface RenameAccountVariables extends RenameAccountInput {
  accountId: string;
}

export function useRenameAccount(): UseMutationResult<AccountResponse, Error, RenameAccountVariables> {
  const upsertAccount = useAccountsStore((state) => state.upsertAccount);

  return useMutation<AccountResponse, Error, RenameAccountVariables>({
    mutationFn: ({ accountId, name }) => api.renameAccount(accountId, { name }),
    onSuccess: (response) => upsertAccount(response.account),
  });
}

export function useSelectAccount(): (accountId: string) => void {
  const setActiveAccount = useAccountsStore((state) => state.setActiveAccount);

  return useCallback((accountId: string) => setActiveAccount(accountId), [setActiveAccount]);
}
