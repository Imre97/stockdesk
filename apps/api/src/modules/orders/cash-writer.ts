import type { Prisma } from "@prisma/client";
import { Decimal, quantityToApi, toApiString, type OrderSide } from "@stockdesk/shared";
import { incrementCashBalance } from "../accounts/repository.js";

const MONEY_PLACES = 2;

export type TradeCashClient = Pick<Prisma.TransactionClient, "$queryRaw" | "cashTransaction">;

export interface TradeCashMovement {
  accountId: string;
  userId: string;
  side: OrderSide;
  symbol: string;
  quantity: Decimal;
  amount: Decimal;
  commission: Decimal;
  tradeId: string;
  at: Date;
}

export function tradeCashDelta(side: OrderSide, amount: Decimal, commission: Decimal): Decimal {
  return side === "BUY" ? amount.plus(commission).negated() : amount.minus(commission);
}

export function tradeNote(movement: Pick<TradeCashMovement, "side" | "quantity" | "symbol">): string {
  const quantity = new Decimal(quantityToApi(movement.quantity)).toString();

  return `TRADE ${movement.side} ${quantity} ${movement.symbol}`;
}

export async function writeTradeCash(
  client: TradeCashClient,
  movement: TradeCashMovement,
): Promise<Decimal> {
  const delta = tradeCashDelta(movement.side, movement.amount, movement.commission);
  const amountText = toApiString(delta, MONEY_PLACES);

  const account = await incrementCashBalance(client, {
    accountId: movement.accountId,
    userId: movement.userId,
    amountText,
  });

  if (account === null) {
    throw new Error(`Account ${movement.accountId} vanished during a fill.`);
  }

  const balanceAfter = new Decimal(account.cashBalance.toString());

  await client.cashTransaction.create({
    data: {
      accountId: movement.accountId,
      type: "TRADE",
      amount: amountText,
      balanceAfter: toApiString(balanceAfter, MONEY_PLACES),
      note: tradeNote(movement),
      referenceId: movement.tradeId,
      createdAt: movement.at,
    },
  });

  return balanceAfter;
}
