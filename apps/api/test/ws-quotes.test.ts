import {
  Decimal,
  QUOTE_SUBSCRIPTION_LIMIT,
  marketStatusMessageSchema,
  quoteMessageSchema,
  toApiString,
  wsErrorMessageSchema,
  type ServerMessage,
} from "@stockdesk/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import { truncateAll } from "./db.js";
import { authHeader, registerUser } from "./helpers.js";
import {
  connectMarketSocket,
  createTestMarketServer,
  seedSymbols,
  type CreateTestMarketServerOptions,
  type TestMarketServer,
  type TestSocket,
} from "./market-helpers.js";

const PRICE_PLACES = 4;
const WHOLE_PLACES = 0;
const SYNTHETIC_COUNT = 20;
const SIMULATED_IN_MESSAGE = 35;
const OVERFLOW_COUNT = 5;
const SETTLE_MS = 300;
const TICK_WINDOW_MS = 400;

const servers: TestMarketServer[] = [];
const clients: TestSocket[] = [];

function isQuote(message: ServerMessage): boolean {
  return message.type === "quote";
}

function isError(message: ServerMessage): boolean {
  return message.type === "error";
}

function quotesOf(symbols: string[]): (message: ServerMessage) => boolean {
  const wanted = new Set(symbols);

  return (message) => message.type === "quote" && wanted.has(message.symbol);
}

function syntheticSymbols(): string[] {
  return Array.from(
    { length: SYNTHETIC_COUNT },
    (_value, index) => `ZZ${String(index + 1).padStart(2, "0")}`,
  );
}

async function seedSyntheticSymbols(): Promise<string[]> {
  const symbols = syntheticSymbols();

  await prisma.symbol.createMany({
    data: symbols.map((symbol) => ({
      symbol,
      name: `Synthetic ${symbol}`,
      exchange: "NASDAQ",
      source: "test",
    })),
  });

  return symbols;
}

async function simulatedSymbols(server: TestMarketServer): Promise<string[]> {
  const assets = await server.provider.listAssets();

  return assets.map((asset) => asset.symbol);
}

async function startServer(options: CreateTestMarketServerOptions = {}): Promise<TestMarketServer> {
  const server = await createTestMarketServer(options);
  servers.push(server);
  await seedSymbols(server);

  return server;
}

async function connect(server: TestMarketServer, token: string): Promise<TestSocket> {
  const client = await connectMarketSocket(server.url, token);
  clients.push(client);

  return client;
}

async function warmDailyCandles(server: TestMarketServer, token: string): Promise<void> {
  const response = await request(server.app)
    .get("/api/v1/market/symbols/TSLA")
    .set(authHeader(token));

  expect(response.status).toBe(200);
}

function firstTrade(trades: { price: Decimal; size: Decimal }[]): { price: Decimal; size: Decimal } {
  const [trade] = trades;
  if (trade === undefined) throw new Error("The simulated provider produced no trade.");

  return trade;
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const server of servers.splice(0)) await server.close();
});

describe("quotes channel", () => {
  it("sends the market status right after the handshake", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    const message = await client.next((value) => value.type === "market_status");

    expect(marketStatusMessageSchema.parse(message)).toEqual({
      type: "market_status",
      status: "open",
      nextOpenAt: null,
      nextCloseAt: null,
    });
  });

  it("streams quotes for a subscribed symbol and stops them after unsubscribe", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    await warmDailyCandles(server, user.accessToken);

    const client = await connect(server, user.accessToken);
    await server.provider.subscribeTrades(["TSLA"]);
    const primed = firstTrade(server.provider.emitTick());

    client.send({ type: "subscribe", channel: "quotes", symbols: ["TSLA"] });

    const snapshot = quoteMessageSchema.parse(await client.next(isQuote));

    expect(snapshot.symbol).toBe("TSLA");
    expect(snapshot.price).toBe(toApiString(primed.price, PRICE_PLACES));
    expect(snapshot.size).toBe(toApiString(primed.size, WHOLE_PLACES));
    expect(snapshot.prevClose).not.toBeNull();
    expect(new Decimal(snapshot.prevClose ?? "0").greaterThan(0)).toBe(true);

    const ticked = firstTrade(server.provider.emitTick());
    const live = quoteMessageSchema.parse(await client.next(isQuote));

    expect(live.price).toBe(toApiString(ticked.price, PRICE_PLACES));

    client.send({ type: "unsubscribe", channel: "quotes", symbols: ["TSLA"] });
    client.send({ type: "subscribe", channel: "quotes", symbols: ["XXXX"] });
    await client.next((value) => value.type === "error");

    server.provider.emitTick();
    await client.none(isQuote, 400);
  });

  it("reports an unknown symbol", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    client.send({ type: "subscribe", channel: "quotes", symbols: ["XXXX"] });

    const message = await client.next((value) => value.type === "error");

    expect(wsErrorMessageSchema.parse(message)).toEqual({
      type: "error",
      code: "SYMBOL_NOT_FOUND",
      symbol: "XXXX",
    });
  });

  it("streams a symbol once for two sockets and releases it on the last close", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const subscribeTrades = vi.spyOn(server.provider, "subscribeTrades");
    const unsubscribeTrades = vi.spyOn(server.provider, "unsubscribeTrades");

    const first = await connect(server, user.accessToken);
    const second = await connect(server, user.accessToken);

    for (const client of [first, second]) {
      client.send({ type: "subscribe", channel: "quotes", symbols: ["TSLA", "XXXX"] });
      await client.next((value) => value.type === "error");
    }

    expect(subscribeTrades).toHaveBeenCalledTimes(1);
    expect(subscribeTrades).toHaveBeenCalledWith(["TSLA"]);

    await first.close();
    await second.close();

    const started = Date.now();

    while (unsubscribeTrades.mock.calls.length === 0 && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    expect(unsubscribeTrades).toHaveBeenCalledTimes(1);
    expect(unsubscribeTrades).toHaveBeenCalledWith(["TSLA"]);
  });

  it("subscribes the symbols that fit and refuses the overflow with one SUBSCRIPTION_LIMIT", async () => {
    const server = await startServer();
    const user = await registerUser(server.app);
    const synthetic = await seedSyntheticSymbols();
    const simulated = (await simulatedSymbols(server)).slice(0, SIMULATED_IN_MESSAGE);
    const accepted = simulated.slice(0, SIMULATED_IN_MESSAGE - OVERFLOW_COUNT);
    const refused = simulated.slice(SIMULATED_IN_MESSAGE - OVERFLOW_COUNT);
    const client = await connect(server, user.accessToken);

    await server.provider.subscribeTrades(simulated);

    const requested = [...synthetic, ...simulated];
    expect(requested).toHaveLength(SYNTHETIC_COUNT + SIMULATED_IN_MESSAGE);

    client.send({ type: "subscribe", channel: "quotes", symbols: requested });

    expect(wsErrorMessageSchema.parse(await client.next(isError))).toEqual({
      type: "error",
      code: "SUBSCRIPTION_LIMIT",
    });
    await client.none(isError, SETTLE_MS);

    server.provider.emitTick();

    const delivered = quoteMessageSchema.parse(await client.next(quotesOf(accepted)));

    expect(accepted).toContain(delivered.symbol);
    await client.none(quotesOf(refused), TICK_WINDOW_MS);

    client.send({ type: "subscribe", channel: "quotes", symbols: refused });

    expect(wsErrorMessageSchema.parse(await client.next(isError))).toEqual({
      type: "error",
      code: "SUBSCRIPTION_LIMIT",
    });
    await client.none(isError, SETTLE_MS);

    server.provider.emitTick();
    await client.none(quotesOf(refused), TICK_WINDOW_MS);

    expect(accepted.length + synthetic.length).toBe(QUOTE_SUBSCRIPTION_LIMIT);
  });

  it("sends at most the configured number of quotes per second", async () => {
    const server = await startServer({ quoteThrottlePerSecond: 2 });
    const user = await registerUser(server.app);
    const client = await connect(server, user.accessToken);

    await server.provider.subscribeTrades(["TSLA"]);
    server.provider.emitTick();
    client.send({ type: "subscribe", channel: "quotes", symbols: ["TSLA"] });
    await client.next(isQuote);

    let last = firstTrade(server.provider.emitTick());

    for (let index = 0; index < 9; index += 1) last = firstTrade(server.provider.emitTick());

    const flushed = quoteMessageSchema.parse(await client.next(isQuote));

    expect(flushed.price).toBe(toApiString(last.price, PRICE_PLACES));
    expect(client.count(isQuote)).toBe(2);
  });
});
