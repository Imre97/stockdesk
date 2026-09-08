import { useCallback, useMemo, useState, type FormEvent } from "react";
import {
  depositAmountSchema,
  toApiString,
  type DecimalValue,
  type DepositResponse,
  type TransactionsPage,
} from "@stockdesk/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { getErrorCode } from "../../lib/http";
import { useAccountsStore } from "../accounts/store";
import { useSettingsLocale } from "../settings/hooks";
import * as api from "./api";
import { parseAmountInput, toTransactionViewModel, type TransactionViewModel } from "./mappers";

const AMOUNT_DECIMAL_PLACES = 2;
const AMOUNT_ERROR_KEY = "errors.amountInvalid";
const GENERIC_ERROR_KEY = "errors.generic";

export interface DepositVariables {
  accountId: string;
  amount: DecimalValue;
  note?: string | undefined;
}

export function transactionsQueryKey(accountId: string | null): readonly unknown[] {
  return ["transactions", accountId];
}

export function useTransactions(accountId: string | null): UseQueryResult<TransactionsPage> {
  return useQuery({
    queryKey: transactionsQueryKey(accountId),
    queryFn: () => api.listTransactions(accountId ?? ""),
    enabled: accountId !== null,
  });
}

export function useTransactionRows(accountId: string | null): TransactionViewModel[] {
  const query = useTransactions(accountId);
  const locale = useSettingsLocale();
  const transactions = query.data?.transactions;

  return useMemo(
    () => (transactions ?? []).map((transaction) => toTransactionViewModel(transaction, locale)),
    [transactions, locale],
  );
}

export function useDeposit(): UseMutationResult<DepositResponse, Error, DepositVariables> {
  const queryClient = useQueryClient();
  const upsertAccount = useAccountsStore((state) => state.upsertAccount);
  const { t } = useTranslation("funding");

  return useMutation<DepositResponse, Error, DepositVariables>({
    mutationFn: ({ accountId, amount, note }) => api.deposit(accountId, { amount, note }),
    onSuccess: (response, variables) => {
      upsertAccount(response.account);
      queryClient.setQueryData<TransactionsPage>(transactionsQueryKey(variables.accountId), (previous) => ({
        transactions: [response.transaction, ...(previous?.transactions ?? [])],
        nextCursor: previous?.nextCursor ?? null,
      }));
      toast.success(t("deposit.success"));
    },
  });
}

export interface DepositFormState {
  accountId: string | null;
  amount: string;
  note: string;
  errorKey: string | null;
  pending: boolean;
  setAccountId: (accountId: string) => void;
  setAmount: (amount: string) => void;
  setNote: (note: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}

function toErrorKey(error: unknown): string {
  const code = getErrorCode(error);

  return code === "DEPOSIT_LIMIT_EXCEEDED" ? `errors.${code}` : GENERIC_ERROR_KEY;
}

export function useDepositForm(): DepositFormState {
  const accounts = useAccountsStore((state) => state.accounts);
  const activeAccountId = useAccountsStore((state) => state.activeAccountId);
  const locale = useSettingsLocale();
  const mutation = useDeposit();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const accountId = selectedId !== null && accounts.some((account) => account.id === selectedId)
    ? selectedId
    : activeAccountId;

  const { mutate } = mutation;

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setErrorKey(null);

      if (accountId === null) {
        setErrorKey(GENERIC_ERROR_KEY);
        return;
      }

      const parsed = parseAmountInput(amount, locale);
      const validated =
        parsed === null ? null : depositAmountSchema.safeParse(toApiString(parsed, AMOUNT_DECIMAL_PLACES));

      if (validated === null || !validated.success) {
        setErrorKey(AMOUNT_ERROR_KEY);
        return;
      }

      const trimmedNote = note.trim();

      mutate(
        { accountId, amount: validated.data, note: trimmedNote === "" ? undefined : trimmedNote },
        {
          onSuccess: () => {
            setAmount("");
            setNote("");
          },
          onError: (error) => setErrorKey(toErrorKey(error)),
        },
      );
    },
    [accountId, amount, locale, mutate, note],
  );

  return {
    accountId,
    amount,
    note,
    errorKey,
    pending: mutation.isPending,
    setAccountId: setSelectedId,
    setAmount,
    setNote,
    submit,
  };
}
