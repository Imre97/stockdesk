import type { Prisma } from "@prisma/client";
import {
  Decimal,
  nextAverageCost,
  realizedPnlFor,
  splitCrossingFill,
  toApiString,
  type OrderSide,
} from "@stockdesk/shared";
import type { PositionRecord } from "./positions-repository.js";

const QUANTITY_PLACES = 6;
const AVERAGE_COST_PLACES = 8;
const MONEY_PLACES = 2;

export type PositionClient = Pick<Prisma.TransactionClient, "position" | "$queryRaw">;

interface LockedPosition {
  id: string;
  quantity: { toString: () => string };
  averageCost: { toString: () => string };
  realizedPnl: { toString: () => string };
}

export interface HeldPosition {
  quantity: Decimal;
  averageCost: Decimal;
  realizedPnl: Decimal;
  existed: boolean;
}

export interface PositionFill {
  accountId: string;
  symbol: string;
  side: OrderSide;
  quantity: Decimal;
  price: Decimal;
  commission: Decimal;
  at: Date;
}

export interface PositionFillResult {
  record: PositionRecord;
  realizedPnl: Decimal | null;
  quantityAfter: Decimal;
}

export const NO_HOLDING: HeldPosition = {
  quantity: new Decimal(0),
  averageCost: new Decimal(0),
  realizedPnl: new Decimal(0),
  existed: false,
};

/**
 * The engine reads the position row it is about to change under a row lock, so a second fill on the
 * same account and symbol waits here instead of computing an average cost from a stale quantity.
 */
export async function lockPosition(
  client: PositionClient,
  accountId: string,
  symbol: string,
): Promise<HeldPosition> {
  const rows = await client.$queryRaw<LockedPosition[]>`
    SELECT "id", "quantity", "averageCost", "realizedPnl"
    FROM "Position"
    WHERE "accountId" = ${accountId} AND "symbol" = ${symbol}
    FOR UPDATE
  `;

  const row = rows[0];
  if (row === undefined) return NO_HOLDING;

  return {
    quantity: new Decimal(row.quantity.toString()),
    averageCost: new Decimal(row.averageCost.toString()),
    realizedPnl: new Decimal(row.realizedPnl.toString()),
    existed: true,
  };
}

function costAfterFill(held: HeldPosition, fill: PositionFill, opening: Decimal, closing: Decimal): Decimal {
  if (closing.isZero()) {
    return new Decimal(
      nextAverageCost({
        quantity: held.quantity,
        averageCost: held.averageCost,
        fillQuantity: fill.quantity,
        fillPrice: fill.price,
        commission: fill.commission,
        side: fill.side,
      }),
    );
  }

  if (opening.isZero()) return held.averageCost;

  return new Decimal(
    nextAverageCost({
      quantity: new Decimal(0),
      averageCost: new Decimal(0),
      fillQuantity: opening,
      fillPrice: fill.price,
      commission: new Decimal(0),
      side: fill.side,
    }),
  );
}

/**
 * A fill that crosses zero is booked as a close of the held quantity plus an open at the fill price:
 * the commission lands wholly on the closing part, and the new position starts at the fill price.
 */
export async function applyFillToPosition(
  client: PositionClient,
  held: HeldPosition,
  fill: PositionFill,
): Promise<PositionFillResult> {
  const split = splitCrossingFill(held.quantity, fill.side, fill.quantity);
  const closing = new Decimal(split.closingQty);
  const opening = new Decimal(split.openingQty);
  const signed = fill.side === "BUY" ? fill.quantity : fill.quantity.negated();
  const quantityAfter = held.quantity.plus(signed);

  const realizedPnl = closing.isZero()
    ? null
    : new Decimal(
        realizedPnlFor({
          direction: held.quantity.greaterThan(0) ? 1 : -1,
          fillPrice: fill.price,
          averageCost: held.averageCost,
          fillQuantity: closing,
          commission: fill.commission,
        }),
      );

  const quantity = toApiString(quantityAfter, QUANTITY_PLACES);
  const averageCost = toApiString(costAfterFill(held, fill, opening, closing), AVERAGE_COST_PLACES);
  const totalRealized = toApiString(
    held.realizedPnl.plus(realizedPnl ?? new Decimal(0)),
    MONEY_PLACES,
  );
  const closedAt = quantityAfter.isZero() ? fill.at : null;
  const reopened = held.quantity.isZero();

  const record = await client.position.upsert({
    where: { accountId_symbol: { accountId: fill.accountId, symbol: fill.symbol } },
    create: {
      accountId: fill.accountId,
      symbol: fill.symbol,
      quantity,
      averageCost,
      realizedPnl: totalRealized,
      openedAt: fill.at,
      closedAt,
    },
    update: {
      quantity,
      averageCost,
      realizedPnl: totalRealized,
      closedAt,
      ...(reopened ? { openedAt: fill.at } : {}),
    },
  });

  return { record, realizedPnl, quantityAfter };
}
