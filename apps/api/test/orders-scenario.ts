import {
  orderDtoSchema,
  type AccountSummaryDto,
  type OrderDto,
} from "@stockdesk/shared";
import type { Express } from "express";
import { expect } from "vitest";
import { expectNoMonetaryNumbers } from "./helpers.js";
import { postOrder, seedOrder, type OrdersTestContext } from "./orders-helpers.js";

const MINUTE_MS = 60_000;
const CREATED = 201;

export function orderOf(body: unknown): OrderDto {
  expectNoMonetaryNumbers(body);

  return orderDtoSchema.parse((body as { order: unknown }).order) as unknown as OrderDto;
}

export async function placeAccepted(
  app: Express,
  token: string,
  accountId: string,
  body: Record<string, unknown>,
): Promise<OrderDto> {
  const response = await postOrder(app, token, accountId, body);

  expect(response.status).toBe(CREATED);

  return orderOf(response.body);
}

export function orderUpdatesFor(context: OrdersTestContext, orderId: string): OrderDto[] {
  return context.broadcasts
    .filter((record) => record.message.type === "order_update")
    .map((record) => (record.message as { order: OrderDto }).order)
    .filter((order) => order.id === orderId);
}

export function lastAccountSummary(
  context: OrdersTestContext,
  accountId: string,
): AccountSummaryDto {
  const pages = context.broadcasts
    .filter((record) => record.message.type === "account_summary")
    .map((record) => (record.message as { accounts: AccountSummaryDto[] }).accounts);
  const latest = pages[pages.length - 1];

  if (latest === undefined) throw new Error("No account_summary message was broadcast.");

  const summary = latest.find((account) => account.id === accountId);
  if (summary === undefined) throw new Error("The account is missing from the summary broadcast.");

  return summary;
}

export interface SeededLadder {
  open: string;
  triggered: string;
  filled: string;
  cancelled: string;
  expired: string;
}

export interface LadderSymbols {
  primary: string;
  secondary: string;
}

/**
 * One order per persisted status, one minute apart, so a listing test can assert both the status
 * filters and the newest-first order of the keyset without depending on insertion timing.
 */
export async function seedOrderLadder(
  accountId: string,
  base: Date,
  symbols: LadderSymbols,
): Promise<SeededLadder> {
  const at = (minutes: number): Date => new Date(base.getTime() + minutes * MINUTE_MS);

  const open = await seedOrder(accountId, {
    symbol: symbols.primary,
    side: "BUY",
    type: "LIMIT",
    status: "OPEN",
    quantity: "10",
    limitPrice: "180.0000",
    createdAt: at(1),
  });
  const triggered = await seedOrder(accountId, {
    symbol: symbols.secondary,
    side: "BUY",
    type: "STOP_LIMIT",
    status: "TRIGGERED",
    quantity: "5",
    stopPrice: "200.0000",
    limitPrice: "205.0000",
    createdAt: at(2),
  });
  const filled = await seedOrder(accountId, {
    symbol: symbols.primary,
    side: "BUY",
    type: "MARKET",
    status: "FILLED",
    quantity: "1",
    createdAt: at(3),
  });
  const cancelled = await seedOrder(accountId, {
    symbol: symbols.primary,
    side: "SELL",
    type: "LIMIT",
    status: "CANCELLED",
    quantity: "2",
    limitPrice: "300.0000",
    createdAt: at(4),
  });
  const expired = await seedOrder(accountId, {
    symbol: symbols.secondary,
    side: "BUY",
    type: "LIMIT",
    status: "EXPIRED",
    quantity: "3",
    limitPrice: "100.0000",
    timeInForce: "DAY",
    createdAt: at(5),
  });

  return {
    open: open.id,
    triggered: triggered.id,
    filled: filled.id,
    cancelled: cancelled.id,
    expired: expired.id,
  };
}
