import type { Order, Trade } from "@stockdesk/shared";

import { toTradeRow, type TradeRowView } from "../market/panel-mappers";
import { selectChildren } from "./list-selectors";
import { toOrderRow, type OrderRowView } from "./row-mappers";

const NAMESPACE = "orders";

export interface OrderGroupView {
  row: OrderRowView;
  children: OrderRowView[];
  expanded: boolean;
}

export interface OrderGroupContext {
  accountNames: Record<string, string>;
  expanded: Record<string, boolean>;
  locale: string;
}

/**
 * A child whose entry is out of the current filter becomes a top-level row of its own, so the
 * active filter still lists the live bracket legs of an entry that already filled.
 */
export function toOrderGroups(
  orders: Order[],
  ordersById: Record<string, Order>,
  context: OrderGroupContext,
): OrderGroupView[] {
  const visible = new Set(orders.map((order) => order.id));

  return orders
    .filter((order) => order.parentOrderId === null || !visible.has(order.parentOrderId))
    .map((order) => {
      const children = selectChildren(ordersById, order.id);

      return {
        row: row(order, children.length, context),
        children: children.map((child) => row(child, 0, context)),
        expanded: context.expanded[order.id] === true,
      };
    });
}

function row(order: Order, childCount: number, context: OrderGroupContext): OrderRowView {
  return toOrderRow(order, context.locale, {
    accountName: context.accountNames[order.accountId] ?? null,
    childCount,
  });
}

export function toOrderTradeRow(trade: Trade, locale: string): TradeRowView {
  return { ...toTradeRow(trade, locale), sideKey: `${NAMESPACE}:side.${trade.side}` };
}
