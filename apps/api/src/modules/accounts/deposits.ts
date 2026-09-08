import {
  Decimal,
  decimalStringValue,
  depositSchema,
  DEPOSIT_LIMIT,
  type DepositInput,
  type DepositResponseDto,
} from "@stockdesk/shared";
import { AppError } from "../../lib/errors.js";
import { toCashTransactionDto } from "./ledger.js";
import { applyDeposit } from "./repository.js";
import { accountNotFound } from "./service.js";
import {
  afterCashChange,
  currentTime,
  summarizeAccounts,
  type AccountsDependencies,
} from "./snapshot-writer.js";

export type DepositService = (
  userId: string,
  accountId: string,
  input: DepositInput,
) => Promise<DepositResponseDto>;

function depositLimitExceeded(): AppError {
  return new AppError(422, "DEPOSIT_LIMIT_EXCEEDED", "The amount exceeds the deposit limit.");
}

/**
 * The shared depositSchema folds the limit into a validation issue, so the limit is checked first to
 * keep the dedicated DEPOSIT_LIMIT_EXCEEDED code that the API contract promises.
 */
export function parseDepositBody(body: unknown): DepositInput {
  const amount = (body as { amount?: unknown } | null | undefined)?.amount;
  const parsed = decimalStringValue.safeParse(amount);

  if (parsed.success && new Decimal(parsed.data).greaterThan(DEPOSIT_LIMIT)) {
    throw depositLimitExceeded();
  }

  return depositSchema.parse(body);
}

export function createDepositService(dependencies: AccountsDependencies = {}): DepositService {
  return async function deposit(
    userId: string,
    accountId: string,
    input: DepositInput,
  ): Promise<DepositResponseDto> {
    const result = await applyDeposit(userId, accountId, input.amount, input.note);

    if (result.status === "notFound") throw accountNotFound();

    await afterCashChange(userId, dependencies);

    const [account] = await summarizeAccounts([result.account], currentTime(dependencies), dependencies);

    if (account === undefined) throw accountNotFound();

    return { account, transaction: toCashTransactionDto(result.transaction) };
  };
}
