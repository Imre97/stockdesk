import {
  Decimal,
  marketStatusMessageSchema,
  quoteMessageSchema,
  toApiString,
  wsErrorMessageSchema,
  type ServerMessage,
} from "@stockdesk/shared";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const servers: TestMarketServer[] = [];
const clients: TestSocket[] = [];

function isQuote(message: ServerMessage): boolean {
  return message.type === "quote";
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
