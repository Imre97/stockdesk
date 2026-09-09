import {
  Decimal,
  positionEffect,
  referencePrice,
  reservationFor,
  splitCrossingFill,
  type DecimalInput,
  type ServerMessage,
} from "@stockdesk/shared";
import type { Express } from "express";
import request from "supertest";
import { expect } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/lib/config.js";
import { prisma } from "../src/lib/prisma.js";
import {
  createSimulatedProvider,
  type SimulatedProvider,
} from "../src/modules/market/providers/simulated/provider.js";
import { createMarketRuntime, type MarketRuntime } from "../src/modules/market/runtime.js";
import { authHeader } from "./helpers.js";
import { createFakeProvider, type FakeProvider } from "./market-fakes.js";
import { IDLE_AGGREGATOR_TIMERS, MARKET_NOW, MARKET_SEED } from "./market-helpers.js";

const RESTING_STATUSES = ["OPEN", "TRIGGERED"] as const;

export interface BroadcastRecord {
  userId: string;
  message: ServerMessage;
}

export interface OrdersTestContextOptions {
  now?: Date;
  seed?: number;
}

export interface OrdersTestContext {
  app: Express;
  config: AppConfig;
  runtime: MarketRuntime;
  provider: FakeProvider;
  simulated: SimulatedProvider;
  broadcasts: BroadcastRecord[];
  logs: string[];
  setNow: (at: Date) => void;
  ensureStreaming: (symbols: string[]) => Promise<void>;
  close: () => Promise<void>;
}

export async function createOrdersTestContext(
  options: OrdersTestContextOptions = {},
): Promise<OrdersTestContext> {
  const config = loadConfig(process.env);
  let instant = options.now ?? MARKET_NOW;
  const now = (): Date => instant;

  const simulated = createSimulatedProvider({ seed: options.seed ?? MARKET_SEED, now });
  const provider = createFakeProvider({
    name: "alpaca",
    capabilities: ["stream", "bars"],
    now,
    getBars: async () => [],
  });

  const logs: string[] = [];
  const broadcasts: BroadcastRecord[] = [];

  const runtime = createMarketRuntime({
    config,
    providers: [provider, simulated],
    now,
    log: (message) => logs.push(message),
    aggregatorTimers: IDLE_AGGREGATOR_TIMERS,
  });

  const app = createApp({
    config,
    rateLimit: { enabled: false },
    market: runtime,
    deps: {
      now,
      broadcast: (userId, message) => {
        broadcasts.push({ userId, message });
      },
    },
  });

  return {
    app,
    config,
    runtime,
    provider,
    simulated,
    broadcasts,
    logs,

    setNow: (at: Date) => {
      instant = at;
    },

    ensureStreaming: async (symbols: string[]) => {
      await runtime.priceService.ensureStreaming(symbols);
    },

    close: async () => {
      await runtime.stop();
    },
  };
}

export interface PositionSeed {
  symbol: string;
  quantity: string;
  averageCost: string;
  realizedPnl?: string;
  openedAt?: Date;
  closedAt?: Date | null;
}

export interface SeededPosition {
  id: string;
  symbol: string;
}

export async function seedPosition(accountId: string, seed: PositionSeed): Promise<SeededPosition> {
  const row = await prisma.position.create({
    data: {
      accountId,
      symbol: seed.symbol,
      quantity: seed.quantity,
      averageCost: seed.averageCost,
      realizedPnl: seed.realizedPnl ?? "0",
      ...(seed.openedAt === undefined ? {} : { openedAt: seed.openedAt }),
      closedAt: seed.closedAt ?? null,
    },
  });

  return { id: row.id, symbol: row.symbol };
}

export interface OrderSeed {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT";
  status: "PENDING" | "OPEN" | "TRIGGERED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";
  quantity: string;
  reservedCash?: string;
  limitPrice?: string | null;
  stopPrice?: string | null;
  role?: "ENTRY" | "STOP_LOSS" | "TAKE_PROFIT";
  timeInForce?: "GTC" | "DAY";
  commission?: string;
}

export async function seedOrder(accountId: string, seed: OrderSeed): Promise<{ id: string }> {
  const row = await prisma.order.create({
    data: {
      accountId,
      symbol: seed.symbol,
      side: seed.side,
      type: seed.type,
      status: seed.status,
      role: seed.role ?? "ENTRY",
      timeInForce: seed.timeInForce ?? "GTC",
      quantity: seed.quantity,
      reservedCash: seed.reservedCash ?? "0",
      commission: seed.commission ?? "0",
      limitPrice: seed.limitPrice ?? null,
      stopPrice: seed.stopPrice ?? null,
    },
  });

  return { id: row.id };
}

/**
 * The reference price of a resting MARKET order is not stored on the row, so the caller passes the
 * last price its scenario placed the order at; every other type reserves from its own prices.
 */
export async function expectReservationInvariant(
  accountId: string,
  lastPrices: Map<string, DecimalInput> = new Map(),
): Promise<void> {
  const config = loadConfig(process.env);

  const orders = await prisma.order.findMany({
    where: { accountId, status: { in: [...RESTING_STATUSES] } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const positions = await prisma.position.findMany({ where: { accountId, closedAt: null } });
  const held = new Map(
    positions.map((position) => [position.symbol, new Decimal(position.quantity.toString())]),
  );

  let stored = new Decimal(0);
  let recomputed = new Decimal(0);

  for (const order of orders) {
    stored = stored.plus(order.reservedCash.toString());

    const quantity = new Decimal(order.quantity.toString());
    const current = held.get(order.symbol) ?? new Decimal(0);
    const reference = referencePrice(
      order.type,
      order.limitPrice?.toString() ?? null,
      order.stopPrice?.toString() ?? null,
      lastPrices.get(order.symbol) ?? null,
      config.marketOrderBuffer,
    );

    if (reference === null) {
      throw new Error(`No reference price is known for the resting ${order.type} order ${order.id}.`);
    }

    recomputed = recomputed.plus(
      reservationFor({
        side: order.side,
        effect: positionEffect(current, order.side, quantity),
        quantity,
        openingQuantity: splitCrossingFill(current, order.side, quantity).openingQty,
        referencePrice: reference,
        shortMarginRate: config.shortMarginRate,
        commission: new Decimal(order.commission.toString()),
        role: order.role,
      }),
    );
  }

  expect(stored.toString()).toBe(recomputed.toString());
}

export async function postOrder(
  app: Express,
  token: string,
  accountId: string,
  body: object,
): Promise<request.Response> {
  return await request(app)
    .post(`/api/v1/accounts/${accountId}/orders`)
    .set(authHeader(token))
    .send(body);
}

export async function postOrderPreview(
  app: Express,
  token: string,
  accountId: string,
  body: object,
): Promise<request.Response> {
  return await request(app)
    .post(`/api/v1/accounts/${accountId}/orders/preview`)
    .set(authHeader(token))
    .send(body);
}
