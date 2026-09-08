import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, type WebSocketServer } from "ws";
import { loadConfig } from "../lib/config.js";
import { signAccessToken } from "../modules/auth/tokens.js";
import { attachWebSocketServer } from "./auth-handshake.js";

const config = loadConfig(process.env);

interface Harness {
  url: string;
  server: Server;
  wss: WebSocketServer;
}

interface Outcome {
  message?: { type: string; userId?: string };
  closeCode?: number;
  closeReason?: string;
}

let harness: Harness | undefined;

async function startHarness(authTimeoutMs?: number): Promise<Harness> {
  const server = createServer();
  const wss = attachWebSocketServer(server, config, authTimeoutMs === undefined ? {} : { authTimeoutMs });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  const started = { url: `ws://127.0.0.1:${address.port}/ws`, server, wss };
  harness = started;
  return started;
}

async function connect(url: string, firstMessage?: string): Promise<Outcome> {
  const socket = new WebSocket(url);

  return await new Promise<Outcome>((resolve, reject) => {
    socket.on("open", () => {
      if (firstMessage !== undefined) socket.send(firstMessage);
    });

    socket.on("message", (data) => {
      resolve({ message: JSON.parse(data.toString()) as { type: string; userId?: string } });
      socket.close();
    });

    socket.on("close", (code, reason) => {
      resolve({ closeCode: code, closeReason: reason.toString() });
    });

    socket.on("error", reject);
  });
}

afterEach(async () => {
  if (harness === undefined) return;
  const current = harness;
  harness = undefined;
  await new Promise<void>((resolve) => {
    current.wss.close(() => {
      current.server.close(() => {
        resolve();
      });
    });
  });
});

describe("attachWebSocketServer", () => {
  it("accepts a valid auth message", async () => {
    const { url } = await startHarness();
    const token = signAccessToken(config, "user-7");

    const outcome = await connect(url, JSON.stringify({ type: "auth", token }));

    expect(outcome.message).toEqual({ type: "auth_ok", userId: "user-7" });
  });

  it("closes the socket when the token is invalid", async () => {
    const { url } = await startHarness();

    const outcome = await connect(url, JSON.stringify({ type: "auth", token: "not-a-jwt" }));

    expect(outcome.closeCode).toBe(4001);
    expect(outcome.closeReason).toBe("unauthorized");
  });

  it("closes the socket when the first message is not an auth message", async () => {
    const { url } = await startHarness();

    const outcome = await connect(url, JSON.stringify({ type: "subscribe", channel: "quotes" }));

    expect(outcome.closeCode).toBe(4001);
  });

  it("closes the socket on invalid JSON", async () => {
    const { url } = await startHarness();

    const outcome = await connect(url, "{not json");

    expect(outcome.closeCode).toBe(4001);
  });

  it("closes the socket when no auth message arrives in time", async () => {
    const { url } = await startHarness(50);

    const outcome = await connect(url);

    expect(outcome.closeCode).toBe(4001);
    expect(outcome.closeReason).toBe("unauthorized");
  });
});
