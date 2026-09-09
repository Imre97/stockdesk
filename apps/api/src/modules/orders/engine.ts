import { Decimal, type MarketStatus } from "@stockdesk/shared";
import type { AppConfig } from "../../lib/config.js";
import { prisma } from "../../lib/prisma.js";
import { currentTime, type AccountsDependencies } from "../accounts/snapshot-writer.js";
import { publishOrderUpdate } from "./engine-events.js";
import { decideFill } from "./evaluation.js";
import { executeFill, type FillContext, type FillIndex } from "./fill.js";
import { markTriggered } from "./order-writes.js";
import { listOpenPositionSymbols } from "./positions-repository.js";
import {
  findOrderById,
  isRestingStatus,
  listRestingOrders,
  listRestingOrdersByIds,
  type OrderRow,
} from "./repository.js";
import { toOrderDto } from "./serializers.js";
import { createSymbolQueue } from "./symbol-queue.js";

const OPEN = "open";

export interface EngineTrade {
  symbol: string;
  price: Decimal;
  at: Date;
}

export interface EnginePrices {
  onTrade: (handler: (trade: EngineTrade) => void) => () => void;
  getLastPrice: (symbol: string) => Promise<Decimal | null>;
  getMarketStatus: () => MarketStatus;
  ensureStreaming: (symbols: string[]) => Promise<void>;
}

export interface OrderEngineOptions {
  config: AppConfig;
  prices: EnginePrices;
  accounts: AccountsDependencies;
  log?: ((message: string) => void) | undefined;
}

export interface OrderEngine {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  processTick: (trade: EngineTrade) => Promise<void>;
  evaluateOrder: (orderId: string) => Promise<void>;
  flush: () => Promise<void>;
  indexAdd: (order: OrderRow) => void;
  indexRemove: (orderId: string) => void;
}

interface OrderIndex extends FillIndex {
  idsFor: (symbol: string) => string[];
  symbols: () => string[];
  clear: () => void;
}

function defaultLog(message: string): void {
  process.stderr.write(`${message}\n`);
}

function createOrderIndex(): OrderIndex {
  const bySymbol = new Map<string, Set<string>>();
  const symbolOf = new Map<string, string>();

  function remove(orderId: string): void {
    const symbol = symbolOf.get(orderId);
    if (symbol === undefined) return;

    symbolOf.delete(orderId);
    const owned = bySymbol.get(symbol);
    if (owned === undefined) return;

    owned.delete(orderId);
    if (owned.size === 0) bySymbol.delete(symbol);
  }

  return {
    add(order: OrderRow): void {
      if (!isRestingStatus(order.status)) {
        remove(order.id);
        return;
      }

      const owned = bySymbol.get(order.symbol) ?? new Set<string>();
      owned.add(order.id);
      bySymbol.set(order.symbol, owned);
      symbolOf.set(order.id, order.symbol);
    },

    remove,
    idsFor: (symbol: string) => [...(bySymbol.get(symbol) ?? [])],
    symbols: () => [...bySymbol.keys()],

    clear(): void {
      bySymbol.clear();
      symbolOf.clear();
    },
  };
}

/**
 * The index is a hint that bounds the per-tick query; the rows it points at are re-read from the
 * database on every pass and once more inside the fill transaction, which is the only authority.
 */
export function createOrderEngine(options: OrderEngineOptions): OrderEngine {
  const { config, prices, accounts } = options;
  const log = options.log ?? defaultLog;
  const index = createOrderIndex();
  const queue = createSymbolQueue(log);
  const fillContext: FillContext = { config, accounts, index, log };

  let detach: (() => void) | null = null;

  async function ownerOf(accountId: string): Promise<string | null> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { userId: true },
    });

    return account?.userId ?? null;
  }

  async function persistTrigger(order: OrderRow, at: Date): Promise<void> {
    if ((await markTriggered(prisma, order.id, at)) === 0) return;

    const [triggered, userId] = await Promise.all([
      findOrderById(prisma, order.id),
      ownerOf(order.accountId),
    ]);

    if (triggered === null || userId === null) return;

    publishOrderUpdate(accounts, userId, toOrderDto(triggered));
  }

  async function handleOrder(order: OrderRow, price: Decimal, at: Date): Promise<void> {
    const decision = decideFill(
      {
        side: order.side,
        type: order.type,
        status: order.status,
        limitPrice: order.limitPrice === null ? null : new Decimal(order.limitPrice.toString()),
        stopPrice: order.stopPrice === null ? null : new Decimal(order.stopPrice.toString()),
      },
      price,
    );

    if (decision.kind === "none") return;
    if (decision.kind === "trigger") {
      await persistTrigger(order, at);
      return;
    }

    await executeFill({ orderId: order.id, price, at }, fillContext);
  }

  async function evaluateSymbol(symbol: string, price: Decimal, at: Date): Promise<void> {
    const ids = index.idsFor(symbol);
    if (ids.length === 0) return;

    const orders = await listRestingOrdersByIds(ids);
    const resting = new Set(orders.map((order) => order.id));

    for (const id of ids) {
      if (!resting.has(id)) index.remove(id);
    }

    for (const order of orders) await handleOrder(order, price, at);
  }

  return {
    async start(): Promise<void> {
      if (detach !== null) return;

      for (const order of await listRestingOrders()) index.add(order);

      const streamed = new Set([...index.symbols(), ...(await listOpenPositionSymbols())]);
      await prices.ensureStreaming([...streamed]);

      detach = prices.onTrade((trade) => {
        void queue.run(trade.symbol, async () =>
          await evaluateSymbol(trade.symbol, trade.price, trade.at),
        );
      });
    },

    async stop(): Promise<void> {
      detach?.();
      detach = null;
      await queue.flush();
      index.clear();
    },

    async processTick(trade: EngineTrade): Promise<void> {
      await queue.run(trade.symbol, async () =>
        await evaluateSymbol(trade.symbol, trade.price, trade.at),
      );
    },

    async evaluateOrder(orderId: string): Promise<void> {
      const order = await findOrderById(prisma, orderId);
      if (order === null || !isRestingStatus(order.status)) return;
      if (prices.getMarketStatus().status !== OPEN) return;

      const price = await prices.getLastPrice(order.symbol);
      if (price === null) return;

      await queue.run(order.symbol, async () =>
        await handleOrder(order, price, currentTime(accounts)),
      );
    },

    flush: queue.flush,
    indexAdd: index.add,
    indexRemove: index.remove,
  };
}
