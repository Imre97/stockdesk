import {
  TRANSACTIONS_PAGE_DEFAULT,
  depositResponseSchema,
  toApiString,
  transactionsPageSchema,
  type DepositInput,
  type DepositResponse,
  type TransactionsPage,
} from "@stockdesk/shared";

import { http } from "../../lib/http";

const BASE_PATH = "/api/v1/accounts";
const AMOUNT_DECIMAL_PLACES = 2;

export function deposit(accountId: string, input: DepositInput): Promise<DepositResponse> {
  return http<DepositResponse>(`${BASE_PATH}/${accountId}/deposits`, {
    method: "POST",
    json: { amount: toApiString(input.amount, AMOUNT_DECIMAL_PLACES), note: input.note },
    parse: (json) => depositResponseSchema.parse(json),
  });
}

export function listTransactions(accountId: string, limit = TRANSACTIONS_PAGE_DEFAULT): Promise<TransactionsPage> {
  return http<TransactionsPage>(`${BASE_PATH}/${accountId}/transactions?limit=${String(limit)}`, {
    method: "GET",
    parse: (json) => transactionsPageSchema.parse(json),
  });
}
