import {
  orderSchema,
  tradeSchema,
  type Order,
  type OrderUpdateMessage,
  type Trade,
  type TradeMessage,
} from "@stockdesk/shared";
import { create } from "zustand";

export const TRADE_HISTORY_LIMIT = 200;

const KEY_SEPARATOR = ":";

export interface OrdersState {
  ordersById: Record<string, Order>;
  idsByAccount: Record<string, string[]>;
  idsBySymbol: Record<string, string[]>;
  tradesByAccountSymbol: Record<string, Trade[]>;
  upsertOrders: (orders: Order[]) => void;
  upsertTrade: (trade: Trade) => void;
  applyOrderUpdate: (message: OrderUpdateMessage) => void;
  applyTrade: (message: TradeMessage) => void;
  reset: () => void;
}

export function tradesKey(accountId: string, symbol: string): string {
  return `${accountId}${KEY_SEPARATOR}${symbol}`;
}

function withId(index: Record<string, string[]>, key: string, id: string): Record<string, string[]> {
  const current = index[key] ?? [];

  if (current.includes(id)) return index;

  return { ...index, [key]: [...current, id] };
}

function indexed(state: OrdersState, orders: Order[]): Partial<OrdersState> {
  let ordersById = state.ordersById;
  let idsByAccount = state.idsByAccount;
  let idsBySymbol = state.idsBySymbol;

  for (const order of orders) {
    ordersById = { ...ordersById, [order.id]: order };
    idsByAccount = withId(idsByAccount, order.accountId, order.id);
    idsBySymbol = withId(idsBySymbol, order.symbol, order.id);
  }

  return { ordersById, idsByAccount, idsBySymbol };
}

function withTrade(state: OrdersState, trade: Trade): Partial<OrdersState> {
  const key = tradesKey(trade.accountId, trade.symbol);
  const current = state.tradesByAccountSymbol[key] ?? [];

  if (current.some((existing) => existing.id === trade.id)) return state;

  return {
    tradesByAccountSymbol: {
      ...state.tradesByAccountSymbol,
      [key]: [trade, ...current].slice(0, TRADE_HISTORY_LIMIT),
    },
  };
}

export const useOrdersStore = create<OrdersState>((set) => ({
  ordersById: {},
  idsByAccount: {},
  idsBySymbol: {},
  tradesByAccountSymbol: {},

  upsertOrders: (orders) => set((state) => indexed(state, orders)),

  upsertTrade: (trade) => set((state) => withTrade(state, trade)),

  applyOrderUpdate: (message) => set((state) => indexed(state, [orderSchema.parse(message.order)])),

  applyTrade: (message) => set((state) => withTrade(state, tradeSchema.parse(message.trade))),

  reset: () => set({ ordersById: {}, idsByAccount: {}, idsBySymbol: {}, tradesByAccountSymbol: {} }),
}));
