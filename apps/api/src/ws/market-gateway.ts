import type { Server } from "node:http";
import type { QuoteMessage } from "@stockdesk/shared";
import type { WebSocket, WebSocketServer } from "ws";
import type { AppConfig } from "../lib/config.js";
import type { MarketRuntime } from "../modules/market/runtime.js";
import { findActiveSymbol } from "../modules/market/symbols-repository.js";
import { attachWebSocketServer } from "./auth-handshake.js";
import type { HeartbeatTimers } from "./heartbeat.js";
import { attachMarketChannels } from "./market-channels.js";
import { createMarketSubscriptions } from "./market-subscriptions.js";
import { createQuoteFeed } from "./quote-feed.js";
import { createQuoteThrottle, type ThrottleTimers } from "./quote-throttle.js";
import { sendMessage } from "./send-message.js";
import type { UserRegistry } from "./user-registry.js";

export interface MarketGatewayOptions {
  server: Server;
  config: AppConfig;
  registry: UserRegistry;
  runtime: MarketRuntime;
  log: (message: string) => void;
  heartbeatIntervalMs?: number | undefined;
  heartbeatTimers?: HeartbeatTimers | undefined;
  throttleTimers?: ThrottleTimers | undefined;
}

export interface MarketGateway {
  wss: WebSocketServer;
  stop: () => void;
}

async function symbolExists(symbol: string): Promise<boolean> {
  return (await findActiveSymbol(symbol)) !== null;
}

export function createMarketGateway(options: MarketGatewayOptions): MarketGateway {
  const { config, runtime, registry, log } = options;
  const subscriptions = createMarketSubscriptions();

  const throttle = createQuoteThrottle({
    perSecond: config.quoteThrottlePerSecond,
    timers: options.throttleTimers,
    send: (socket: object, message: QuoteMessage) => {
      sendMessage(socket as WebSocket, message);
    },
  });

  const feed = createQuoteFeed({ prices: runtime.priceService, subscriptions, throttle, log });

  const channels = attachMarketChannels({
    prices: runtime.priceService,
    aggregator: runtime.aggregator,
    subscriptions,
    throttle,
    feed,
    symbolExists,
    log,
  });

  const wss = attachWebSocketServer(options.server, config, {
    registry,
    onAuthenticated: channels.onAuthenticated,
    onMessage: channels.onMessage,
    ...(options.heartbeatIntervalMs === undefined
      ? {}
      : { heartbeatIntervalMs: options.heartbeatIntervalMs }),
    heartbeatTimers: options.heartbeatTimers,
  });

  return {
    wss,
    stop(): void {
      channels.stop();
      feed.stop();
    },
  };
}
