import type { Server } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import type { AppConfig } from "../lib/config.js";
import { verifyAccessToken } from "../modules/auth/tokens.js";

const DEFAULT_AUTH_TIMEOUT_MS = 5000;
const UNAUTHORIZED_CODE = 4001;
const UNAUTHORIZED_REASON = "unauthorized";

const authenticatedSockets = new WeakMap<WebSocket, string>();

export interface WebSocketServerOptions {
  authTimeoutMs?: number;
}

export function wsAuthenticatedUserId(socket: WebSocket): string | undefined {
  return authenticatedSockets.get(socket);
}

function readAuthToken(raw: RawData): string | undefined {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) return undefined;

  const message = parsed as { type?: unknown; token?: unknown };
  if (message.type !== "auth" || typeof message.token !== "string") return undefined;

  return message.token;
}

export function attachWebSocketServer(
  server: Server,
  config: AppConfig,
  options: WebSocketServerOptions = {},
): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const authTimeoutMs = options.authTimeoutMs ?? DEFAULT_AUTH_TIMEOUT_MS;

  wss.on("connection", (socket) => {
    const timer = setTimeout(() => {
      socket.close(UNAUTHORIZED_CODE, UNAUTHORIZED_REASON);
    }, authTimeoutMs);

    const onFirstMessage = (raw: RawData): void => {
      clearTimeout(timer);
      socket.off("message", onFirstMessage);

      const token = readAuthToken(raw);

      if (token === undefined) {
        socket.close(UNAUTHORIZED_CODE, UNAUTHORIZED_REASON);
        return;
      }

      let userId: string;

      try {
        userId = verifyAccessToken(config, token);
      } catch {
        socket.close(UNAUTHORIZED_CODE, UNAUTHORIZED_REASON);
        return;
      }

      authenticatedSockets.set(socket, userId);
      socket.send(JSON.stringify({ type: "auth_ok", userId }));
    };

    socket.on("message", onFirstMessage);
    socket.on("close", () => {
      clearTimeout(timer);
      authenticatedSockets.delete(socket);
    });
  });

  return wss;
}
