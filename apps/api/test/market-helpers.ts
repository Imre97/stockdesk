import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { ServerMessage } from "@stockdesk/shared";
import type { Express } from "express";
import { WebSocket, type WebSocketServer } from "ws";
import { createApp } from "../src/app.js";
import { loadConfig, type AppConfig } from "../src/lib/config.js";
import type { BarAggregatorTimers } from "../src/modules/market/bar-aggregator.js";
import { createMarketRuntime, type MarketRuntime } from "../src/modules/market/runtime.js";
import {
  createSimulatedProvider,
  type SimulatedProvider,
} from "../src/modules/market/providers/simulated/provider.js";
import type { MarketDataProvider } from "../src/modules/market/providers/types.js";
import { upsertSymbols } from "../src/modules/market/symbols-repository.js";
import { createMarketGateway } from "../src/ws/market-gateway.js";
import { createUserRegistry, type UserRegistry } from "../src/ws/user-registry.js";

export const MARKET_NOW = new Date("2026-09-08T18:00:00.000Z");
export const MARKET_SEED = 424242;

const IDLE_TIMERS: BarAggregatorTimers = {
  setTimeout: () => null,
  clearTimeout: () => undefined,
};

export interface TestMarket {
  config: AppConfig;
  provider: SimulatedProvider;
  runtime: MarketRuntime;
  app: Express;
  logs: string[];
}

export interface CreateTestMarketOptions {
  now?: Date;
  seed?: number;
  providers?: (simulated: SimulatedProvider) => MarketDataProvider[];
}

export function createTestMarket(options: CreateTestMarketOptions = {}): TestMarket {
  const config = loadConfig(process.env);
  const instant = options.now ?? MARKET_NOW;
  const now = (): Date => instant;
  const provider = createSimulatedProvider({ seed: options.seed ?? MARKET_SEED, now });
  const providers = options.providers === undefined ? [provider] : options.providers(provider);
  const logs: string[] = [];

  const runtime = createMarketRuntime({
    config,
    providers,
    now,
    log: (message) => logs.push(message),
    aggregatorTimers: IDLE_TIMERS,
  });

  const app = createApp({ config, rateLimit: { enabled: false }, market: runtime });

  return { config, provider, runtime, app, logs };
}

export async function seedSymbols(market: { provider: SimulatedProvider }): Promise<void> {
  await upsertSymbols(await market.provider.listAssets(), "simulated");
}

export interface CreateTestMarketServerOptions extends CreateTestMarketOptions {
  quoteThrottlePerSecond?: number;
}

export interface TestMarketServer {
  app: Express;
  config: AppConfig;
  provider: SimulatedProvider;
  runtime: MarketRuntime;
  registry: UserRegistry;
  logs: string[];
  url: string;
  setNow: (at: Date) => void;
  sweep: () => Promise<void>;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestMarketServer(
  options: CreateTestMarketServerOptions = {},
): Promise<TestMarketServer> {
  const base = loadConfig(process.env);
  const config =
    options.quoteThrottlePerSecond === undefined
      ? base
      : { ...base, quoteThrottlePerSecond: options.quoteThrottlePerSecond };

  let instant = options.now ?? MARKET_NOW;
  const now = (): Date => instant;
  const provider = createSimulatedProvider({ seed: options.seed ?? MARKET_SEED, now });
  const providers = options.providers === undefined ? [provider] : options.providers(provider);
  const logs: string[] = [];
  const registry = createUserRegistry();

  const runtime = createMarketRuntime({
    config,
    providers,
    now,
    log: (message) => logs.push(message),
    aggregatorTimers: IDLE_TIMERS,
  });

  const app = createApp({
    config,
    rateLimit: { enabled: false },
    market: runtime,
    deps: { broadcast: (userId, message) => registry.broadcastToUser(userId, message) },
  });

  const server: Server = createServer(app);
  const gateway = createMarketGateway({
    server,
    config,
    registry,
    runtime,
    log: (message) => logs.push(message),
    heartbeatIntervalMs: 0,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  return {
    app,
    config,
    provider,
    runtime,
    registry,
    logs,
    url: `ws://127.0.0.1:${port}/ws`,
    setNow: (at: Date) => {
      instant = at;
    },
    sweep: async () => {
      await runtime.aggregator.sweep(now());
    },
    flush: async () => {
      await runtime.aggregator.flush();
    },
    close: async () => {
      gateway.stop();
      await runtime.stop();
      await closeServer(gateway.wss, server);
    },
  };
}

async function closeServer(wss: WebSocketServer, server: Server): Promise<void> {
  for (const client of wss.clients) client.terminate();

  await new Promise<void>((resolve) => {
    wss.close(() => {
      server.close(() => resolve());
    });
  });
}

export interface TestSocket {
  socket: WebSocket;
  messages: ServerMessage[];
  send: (message: unknown) => void;
  next: (predicate: (message: ServerMessage) => boolean, timeoutMs?: number) => Promise<ServerMessage>;
  none: (predicate: (message: ServerMessage) => boolean, windowMs: number) => Promise<void>;
  count: (predicate: (message: ServerMessage) => boolean) => number;
  close: () => Promise<void>;
}

const DEFAULT_WAIT_MS = 3000;
const POLL_MS = 10;

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectMarketSocket(url: string, token: string): Promise<TestSocket> {
  const socket = new WebSocket(url);
  const messages: ServerMessage[] = [];
  const consumed = new Set<number>();

  await new Promise<void>((resolve, reject) => {
    socket.on("error", reject);
    socket.on("open", () => socket.send(JSON.stringify({ type: "auth", token })));
    socket.on("message", (data) => {
      const parsed = JSON.parse(data.toString()) as ServerMessage;
      if (parsed.type === "auth_ok") {
        resolve();
        return;
      }
      messages.push(parsed);
    });
  });

  function find(predicate: (message: ServerMessage) => boolean): number {
    return messages.findIndex(
      (message, index) => !consumed.has(index) && predicate(message),
    );
  }

  return {
    socket,
    messages,

    send: (message: unknown) => socket.send(JSON.stringify(message)),

    async next(
      predicate: (message: ServerMessage) => boolean,
      timeoutMs = DEFAULT_WAIT_MS,
    ): Promise<ServerMessage> {
      const started = Date.now();

      for (;;) {
        const index = find(predicate);

        if (index >= 0) {
          consumed.add(index);
          const message = messages[index];
          if (message === undefined) throw new Error("Message vanished from the socket buffer.");
          return message;
        }

        if (Date.now() - started > timeoutMs) {
          throw new Error(
            `No matching WebSocket message arrived in ${timeoutMs} ms. Seen: ${messages
              .map((message) => message.type)
              .join(", ")}`,
          );
        }

        await delay(POLL_MS);
      }
    },

    async none(predicate: (message: ServerMessage) => boolean, windowMs: number): Promise<void> {
      await delay(windowMs);

      const index = find(predicate);
      if (index >= 0) throw new Error(`An unexpected message arrived: ${messages[index]?.type}`);
    },

    count: (predicate: (message: ServerMessage) => boolean) => messages.filter(predicate).length,

    close: async () => {
      socket.close();
      const started = Date.now();

      while (socket.readyState !== WebSocket.CLOSED && Date.now() - started < 2000) {
        await delay(POLL_MS);
      }
    },
  };
}
