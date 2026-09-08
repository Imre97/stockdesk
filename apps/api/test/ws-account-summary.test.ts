import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { accountSummaryMessageSchema, type ServerMessage } from "@stockdesk/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WebSocket, type WebSocketServer } from "ws";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/lib/config.js";
import { createUserRegistry } from "../src/ws/user-registry.js";
import { attachWebSocketServer } from "../src/ws/auth-handshake.js";
import { truncateAll } from "./db.js";
import { createAccount, deposit, mainAccount, registerUser } from "./helpers.js";

const config = loadConfig(process.env);
const registry = createUserRegistry();
const app = createApp({
  config,
  rateLimit: { enabled: false },
  deps: { broadcast: (userId: string, message: ServerMessage) => registry.broadcastToUser(userId, message) },
});

let server: Server;
let wss: WebSocketServer;
let url: string;
const sockets: WebSocket[] = [];

interface Client {
  socket: WebSocket;
  messages: ServerMessage[];
}

async function connectAuthenticated(token: string): Promise<Client> {
  const socket = new WebSocket(url);
  sockets.push(socket);
  const messages: ServerMessage[] = [];

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

  return { socket, messages };
}

async function waitForMessage(client: Client): Promise<ServerMessage> {
  const started = Date.now();

  while (client.messages.length === 0) {
    if (Date.now() - started > 2000) throw new Error("No WebSocket message arrived in time.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  const [message] = client.messages;
  if (message === undefined) throw new Error("No WebSocket message arrived in time.");
  return message;
}

beforeAll(async () => {
  server = createServer(app);
  wss = attachWebSocketServer(server, config, { registry });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
});

afterAll(async () => {
  for (const socket of sockets) socket.close();

  await new Promise<void>((resolve) => {
    wss.close(() => {
      server.close(() => resolve());
    });
  });
});

describe("account_summary broadcast", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("reaches the sockets of the owner only", async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const account = await mainAccount(app, owner.accessToken);
    expect((await createAccount(app, owner.accessToken, "Savings")).status).toBe(201);

    const ownerClient = await connectAuthenticated(owner.accessToken);
    const otherClient = await connectAuthenticated(other.accessToken);

    expect((await deposit(app, owner.accessToken, account.id, "5000.00")).status).toBe(201);

    const message = await waitForMessage(ownerClient);
    const parsed = accountSummaryMessageSchema.parse(message);

    expect(parsed.accounts.map((item) => item.name)).toEqual(["Main", "Savings"]);
    expect(parsed.accounts.map((item) => item.cash)).toEqual(["105000.00", "0.00"]);
    expect(otherClient.messages).toHaveLength(0);
  });

  it("ignores an unknown message after the handshake and keeps the socket open", async () => {
    const registered = await registerUser(app);
    const account = await mainAccount(app, registered.accessToken);
    const client = await connectAuthenticated(registered.accessToken);

    client.socket.send(JSON.stringify({ type: "subscribe", channel: "quotes" }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(client.socket.readyState).toBe(WebSocket.OPEN);

    expect((await deposit(app, registered.accessToken, account.id, "1.00")).status).toBe(201);
    const message = await waitForMessage(client);

    expect(message.type).toBe("account_summary");
  });
});
