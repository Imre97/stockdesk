import { Decimal, type MarketStatus } from "@stockdesk/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/lib/config.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createOrderEngine,
  type EnginePrices,
  type OrderEngine,
} from "../src/modules/orders/engine.js";
import { executeFill, type FillContext } from "../src/modules/orders/fill.js";
import {
  cancelRestingOrder,
  markTriggered,
  reduceOrderQuantity,
} from "../src/modules/orders/order-writes.js";
import { truncateAll } from "./db.js";
import { mainAccount, registerUser, type RegisteredUser } from "./helpers.js";
import { seedSymbols } from "./market-helpers.js";
import {
  createOrdersTestContext,
  postOrder,
  seedOrder,
  seedPosition,
  type OrdersTestContext,
} from "./orders-helpers.js";

const WEDNESDAY_15_00_NY = new Date("2026-09-09T19:00:00.000Z");
const SYMBOL = "TSLA";
const OTHER = "AAPL";
const HELD = "MSFT";
const LAST = "250.0000";
const OPEN_MARKET: MarketStatus = { status: "open", nextOpenAt: null, nextCloseAt: null };

let context: OrdersTestContext;
let owner: RegisteredUser;
let accountId: string;

function fillContextOf(): FillContext {
  return {
    config: context.config,
    accounts: context.accounts,
    index: { add: () => undefined, remove: () => undefined },
    log: (message) => context.logs.push(message),
  };
}

function recordingPrices(streamed: string[][]): EnginePrices {
  return {
    onTrade: () => () => undefined,
    getLastPrice: async () => null,
    getMarketStatus: () => OPEN_MARKET,
    ensureStreaming: async (symbols: string[]) => {
      streamed.push([...symbols].sort());
    },
  };
}

async function restingLimitBuy(): Promise<string> {
  const response = await postOrder(context.app, owner.accessToken, accountId, {
    symbol: SYMBOL,
    side: "BUY",
    type: "LIMIT",
    quantity: "10",
    limitPrice: "240.0000",
  });

  expect(response.status).toBe(201);

  return (response.body as { order: { id: string; status: string } }).order.id;
}

describe("order engine", () => {
  beforeEach(async () => {
    await truncateAll();
    context = await createOrdersTestContext({ now: WEDNESDAY_15_00_NY });
    await seedSymbols({ provider: context.simulated });
    await context.ensureStreaming([SYMBOL]);
    context.provider.emit({ symbol: SYMBOL, price: LAST });

    owner = await registerUser(context.app);
    accountId = (await mainAccount(context.app, owner.accessToken)).id;
    context.broadcasts.length = 0;
  });

  afterEach(async () => {
    await context.close();
  });

  it("never double-fills an order when two ticks of one symbol run concurrently", async () => {
    const orderId = await restingLimitBuy();
    const trade = { symbol: SYMBOL, price: new Decimal("239.0000"), at: context.now() };

    await Promise.all([context.engine.processTick(trade), context.engine.processTick(trade)]);
    await context.engine.flush();

    const filled = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    expect(filled.status).toBe("FILLED");
    expect(await prisma.trade.count({ where: { accountId } })).toBe(1);
  });

  it("books exactly one trade when two fill transactions race on one order", async () => {
    const orderId = await restingLimitBuy();
    const attempt = { orderId, price: new Decimal("239.0000"), at: context.now() };
    const fillContext = fillContextOf();

    const outcomes = await Promise.all([
      executeFill(attempt, fillContext),
      executeFill(attempt, fillContext),
    ]);

    expect(outcomes.filter((won) => won)).toHaveLength(1);
    expect(await prisma.trade.count({ where: { accountId } })).toBe(1);
    expect(await prisma.cashTransaction.count({ where: { accountId, type: "TRADE" } })).toBe(1);
  });

  it("lets one writer win a concurrent trigger, cancel and quantity reduction", async () => {
    const stop = await seedOrder(accountId, {
      symbol: SYMBOL,
      side: "BUY",
      type: "STOP_LIMIT",
      status: "OPEN",
      quantity: "10",
      stopPrice: "260.0000",
      limitPrice: "260.0000",
    });

    const cancellable = await seedOrder(accountId, {
      symbol: SYMBOL,
      side: "SELL",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "260.0000",
    });

    const reducible = await seedOrder(accountId, {
      symbol: SYMBOL,
      side: "SELL",
      type: "STOP",
      status: "OPEN",
      quantity: "10",
      stopPrice: "240.0000",
    });

    const at = context.now();

    const triggers = await Promise.all([
      markTriggered(prisma, stop.id, at),
      markTriggered(prisma, stop.id, at),
    ]);

    const cancels = await Promise.all([
      cancelRestingOrder(prisma, cancellable.id, "OCO_SIBLING_FILLED", at),
      cancelRestingOrder(prisma, cancellable.id, "POSITION_CLOSED", at),
    ]);

    const reductions = await Promise.all([
      reduceOrderQuantity(prisma, reducible.id, "6.000000"),
      reduceOrderQuantity(prisma, reducible.id, "6.000000"),
    ]);

    expect(triggers.sort()).toEqual([0, 1]);
    expect(cancels.sort()).toEqual([0, 1]);
    expect(reductions.sort()).toEqual([0, 1]);

    const reduced = await prisma.order.findUniqueOrThrow({ where: { id: reducible.id } });

    expect(reduced.quantity.toString()).toBe("6");
    expect(reduced.version).toBe(2);
  });

  it("rebuilds the index from resting rows and streams their symbols on start", async () => {
    await seedOrder(accountId, {
      symbol: SYMBOL,
      side: "BUY",
      type: "LIMIT",
      status: "OPEN",
      quantity: "10",
      limitPrice: "240.0000",
    });
    await seedOrder(accountId, {
      symbol: OTHER,
      side: "BUY",
      type: "STOP_LIMIT",
      status: "TRIGGERED",
      quantity: "5",
      stopPrice: "100.0000",
      limitPrice: "100.0000",
    });
    await seedOrder(accountId, {
      symbol: "NVDA",
      side: "BUY",
      type: "LIMIT",
      status: "CANCELLED",
      quantity: "1",
      limitPrice: "10.0000",
    });
    await seedPosition(accountId, { symbol: HELD, quantity: "3", averageCost: "400" });

    const streamed: string[][] = [];
    const engine: OrderEngine = createOrderEngine({
      config: loadConfig(process.env),
      prices: recordingPrices(streamed),
      accounts: context.accounts,
      log: (message) => context.logs.push(message),
    });

    await engine.start();

    try {
      expect(streamed).toEqual([[OTHER, HELD, SYMBOL]]);

      await engine.processTick({ symbol: OTHER, price: new Decimal("99.0000"), at: context.now() });
      await engine.flush();

      const filled = await prisma.order.count({ where: { accountId, status: "FILLED" } });

      expect(filled).toBe(1);
    } finally {
      await engine.stop();
    }
  });

  it("awaits the work still in flight when it stops", async () => {
    const orderId = await restingLimitBuy();

    const pending = context.engine.processTick({
      symbol: SYMBOL,
      price: new Decimal("239.0000"),
      at: context.now(),
    });

    await context.engine.stop();
    await pending;

    const filled = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

    expect(filled.status).toBe("FILLED");
    expect(await prisma.trade.count({ where: { accountId } })).toBe(1);
  });
});
