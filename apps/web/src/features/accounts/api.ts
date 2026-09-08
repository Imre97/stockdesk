import {
  accountResponseSchema,
  accountsResponseSchema,
  equityResponseSchema,
  positionsResponseSchema,
  type AccountResponse,
  type AccountsResponse,
  type CreateAccountInput,
  type EquityRange,
  type EquityResponse,
  type PositionsResponse,
  type RenameAccountInput,
} from "@stockdesk/shared";

import { http } from "../../lib/http";

const BASE_PATH = "/api/v1/accounts";

export function listAccounts(): Promise<AccountsResponse> {
  return http<AccountsResponse>(BASE_PATH, {
    method: "GET",
    parse: (json) => accountsResponseSchema.parse(json),
  });
}

export function createAccount(input: CreateAccountInput): Promise<AccountResponse> {
  return http<AccountResponse>(BASE_PATH, {
    method: "POST",
    json: input,
    parse: (json) => accountResponseSchema.parse(json),
  });
}

export function renameAccount(accountId: string, input: RenameAccountInput): Promise<AccountResponse> {
  return http<AccountResponse>(`${BASE_PATH}/${accountId}`, {
    method: "PATCH",
    json: input,
    parse: (json) => accountResponseSchema.parse(json),
  });
}

export function getEquity(accountId: string, range: EquityRange): Promise<EquityResponse> {
  return http<EquityResponse>(`${BASE_PATH}/${accountId}/equity?range=${range}`, {
    method: "GET",
    parse: (json) => equityResponseSchema.parse(json),
  });
}

export function getPositions(accountId: string): Promise<PositionsResponse> {
  return http<PositionsResponse>(`${BASE_PATH}/${accountId}/positions`, {
    method: "GET",
    parse: (json) => positionsResponseSchema.parse(json),
  });
}
