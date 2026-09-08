import { createServer } from "node:http";
import type { ServerMessage } from "@stockdesk/shared";
import { WebSocket } from "ws";
import { createApp } from "./app.js";
import { runBootTasks } from "./boot.js";
import { getConfig } from "./lib/config.js";
import { createMarketJobs } from "./modules/market/jobs.js";
import { createAlpacaProvider } from "./modules/market/providers/alpaca/provider.js";
import { createProvidersFromConfig } from "./modules/market/providers/factory.js";
import { createFinnhubProvider } from "./modules/market/providers/finnhub/provider.js";
import type { ProviderSocketFactory } from "./modules/market/providers/reconnecting-socket.js";
import { systemTimers } from "./modules/market/providers/reconnecting-socket.js";
import { createSimulatedProvider } from "./modules/market/providers/simulated/provider.js";
import { createMarketRuntime } from "./modules/market/runtime.js";
import { createMarketGateway } from "./ws/market-gateway.js";
import { createUserRegistry } from "./ws/user-registry.js";

const SIMULATED_TICK_INTERVAL_MS = 1000;

const config = getConfig();
const registry = createUserRegistry();

const broadcast = (userId: string, message: ServerMessage): void => {
  registry.broadcastToUser(userId, message);
};

const log = (message: string): void => {
  process.stdout.write(`${message}\n`);
};

const socketFactory = WebSocket as unknown as ProviderSocketFactory;

const providers = createProvidersFromConfig(config, {
  log,
  createAlpaca: (appConfig) =>
    createAlpacaProvider({
      key: appConfig.alpacaApiKey ?? "",
      secret: appConfig.alpacaApiSecret ?? "",
      feed: appConfig.alpacaDataFeed,
      fetchImpl: fetch,
      WebSocketImpl: socketFactory,
      timers: systemTimers,
    }),
  createFinnhub: (appConfig) =>
    createFinnhubProvider({
      key: appConfig.finnhubApiKey ?? "",
      fetchImpl: fetch,
      WebSocketImpl: socketFactory,
      timers: systemTimers,
    }),
  createSimulated: (options) =>
    createSimulatedProvider({ ...options, tickIntervalMs: SIMULATED_TICK_INTERVAL_MS }),
});

const market = createMarketRuntime({ config, providers, log });

const server = createServer(createApp({ config, deps: { broadcast }, market }));

createMarketGateway({ server, config, registry, runtime: market, log });

server.listen(config.port, () => {
  process.stdout.write(`StockDesk API listening on port ${config.port}\n`);

  market.start().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Starting the market data providers failed: ${reason}\n`);
  });
});

runBootTasks(config, {
  broadcast,
  marketJobs: createMarketJobs({ config, runtime: market, log }),
}).catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Starting the boot tasks failed: ${reason}\n`);
});
