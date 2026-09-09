import { Decimal, orderSchema, type OrderDto, type TradeDto } from "@stockdesk/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { orderDto, tradeDto } from "../../test/fixtures";
import { TRADE_HISTORY_LIMIT, tradesKey, useOrdersStore } from "./store";

function orderUpdate(overrides: Partial<OrderDto> = {}) {
  return { type: "order_update" as const, order: orderDto(overrides) };
}

function tradeMessage(overrides: Partial<TradeDto> = {}) {
  return { type: "trade" as const, trade: tradeDto(overrides) };
}

beforeEach(() => {
  useOrdersStore.getState().reset();
});

describe("orders store", () => {
  it("indexes upserted orders by id, account and symbol", () => {
    useOrdersStore
      .getState()
      .upsertOrders([
        orderSchema.parse(orderDto({ id: "order-1", accountId: "acc-1", symbol: "TSLA" })),
        orderSchema.parse(orderDto({ id: "order-2", accountId: "acc-1", symbol: "AAPL" })),
        orderSchema.parse(orderDto({ id: "order-3", accountId: "acc-2", symbol: "TSLA" })),
      ]);

    const state = useOrdersStore.getState();

    expect(Object.keys(state.ordersById).sort()).toEqual(["order-1", "order-2", "order-3"]);
    expect(state.ordersById["order-1"]?.quantity).toBeInstanceOf(Decimal);
    expect(state.idsByAccount["acc-1"]).toEqual(["order-1", "order-2"]);
    expect(state.idsByAccount["acc-2"]).toEqual(["order-3"]);
    expect(state.idsBySymbol.TSLA).toEqual(["order-1", "order-3"]);
    expect(state.idsBySymbol.AAPL).toEqual(["order-2"]);
  });

  it("replaces an order by id without duplicating its index entries", () => {
    useOrdersStore.getState().applyOrderUpdate(orderUpdate({ status: "OPEN", version: 1 }));
    useOrdersStore
      .getState()
      .applyOrderUpdate(orderUpdate({ status: "FILLED", version: 2, avgFillPrice: "250.0000" }));

    const state = useOrdersStore.getState();

    expect(state.ordersById["order-1"]?.status).toBe("FILLED");
    expect(state.ordersById["order-1"]?.version).toBe(2);
    expect(state.ordersById["order-1"]?.avgFillPrice?.toString()).toBe("250");
    expect(state.idsByAccount["acc-1"]).toEqual(["order-1"]);
    expect(state.idsBySymbol.TSLA).toEqual(["order-1"]);
  });

  it("keeps the trades of an account and symbol newest first", () => {
    useOrdersStore
      .getState()
      .applyTrade(tradeMessage({ id: "trade-1", executedAt: "2026-09-08T14:31:00.000Z" }));
    useOrdersStore
      .getState()
      .applyTrade(tradeMessage({ id: "trade-2", executedAt: "2026-09-08T14:32:00.000Z" }));

    const trades = useOrdersStore.getState().tradesByAccountSymbol[tradesKey("acc-1", "TSLA")] ?? [];

    expect(trades.map((trade) => trade.id)).toEqual(["trade-2", "trade-1"]);
    expect(trades[0]?.commission).toBeInstanceOf(Decimal);
  });

  it("separates the trade history per account and symbol", () => {
    useOrdersStore.getState().applyTrade(tradeMessage({ id: "trade-1", symbol: "TSLA" }));
    useOrdersStore.getState().applyTrade(tradeMessage({ id: "trade-2", symbol: "AAPL" }));
    useOrdersStore.getState().applyTrade(tradeMessage({ id: "trade-3", accountId: "acc-2" }));

    const state = useOrdersStore.getState();

    expect(state.tradesByAccountSymbol[tradesKey("acc-1", "TSLA")]?.map((trade) => trade.id)).toEqual([
      "trade-1",
    ]);
    expect(state.tradesByAccountSymbol[tradesKey("acc-1", "AAPL")]?.map((trade) => trade.id)).toEqual([
      "trade-2",
    ]);
    expect(state.tradesByAccountSymbol[tradesKey("acc-2", "TSLA")]?.map((trade) => trade.id)).toEqual([
      "trade-3",
    ]);
  });

  it("ignores a resent trade", () => {
    useOrdersStore.getState().applyTrade(tradeMessage({ id: "trade-1" }));
    useOrdersStore.getState().applyTrade(tradeMessage({ id: "trade-1" }));

    expect(useOrdersStore.getState().tradesByAccountSymbol[tradesKey("acc-1", "TSLA")]).toHaveLength(1);
  });

  it("caps the trade history of one account and symbol", () => {
    for (let index = 0; index <= TRADE_HISTORY_LIMIT; index += 1) {
      useOrdersStore.getState().applyTrade(tradeMessage({ id: `trade-${String(index)}` }));
    }

    const trades = useOrdersStore.getState().tradesByAccountSymbol[tradesKey("acc-1", "TSLA")] ?? [];

    expect(trades).toHaveLength(TRADE_HISTORY_LIMIT);
    expect(trades[0]?.id).toBe(`trade-${String(TRADE_HISTORY_LIMIT)}`);
    expect(trades[trades.length - 1]?.id).toBe("trade-1");
  });

  it("drops every order and trade on reset", () => {
    useOrdersStore.getState().applyOrderUpdate(orderUpdate());
    useOrdersStore.getState().applyTrade(tradeMessage());

    useOrdersStore.getState().reset();

    const state = useOrdersStore.getState();

    expect(state.ordersById).toEqual({});
    expect(state.idsByAccount).toEqual({});
    expect(state.idsBySymbol).toEqual({});
    expect(state.tradesByAccountSymbol).toEqual({});
  });
});
