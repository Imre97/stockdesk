import type { ClientMessage, ServerMessage } from "@stockdesk/shared";

import { createWsClient, type WsSocketFactory, type WsTimers } from "./ws";

const WS_PATH = "/ws";

export interface WsSessionConfig {
  getAccessToken: () => string | null;
}

let sessionConfig: WsSessionConfig = { getAccessToken: () => null };

export function configureWsSession(overrides: Partial<WsSessionConfig>): void {
  sessionConfig = { ...sessionConfig, ...overrides };
}

export type WsMessageListener = (message: ServerMessage) => void;

export interface WsSessionOptions {
  url: string;
  getAccessToken: () => string | null;
  WebSocketImpl?: WsSocketFactory;
  timers?: WsTimers;
}

export interface WsSession {
  connect: () => void;
  disconnect: () => void;
  addMessageListener: (listener: WsMessageListener) => () => void;
  send: (message: ClientMessage) => void;
}

export function createWsSession(options: WsSessionOptions): WsSession {
  const listeners = new Set<WsMessageListener>();
  const pending: ClientMessage[] = [];

  function flush(): void {
    while (pending.length > 0) {
      const next = pending[0];

      if (next === undefined || !client.send(next)) return;

      pending.shift();
    }
  }

  function handleMessage(message: ServerMessage): void {
    if (message.type === "auth_ok") flush();

    for (const listener of [...listeners]) listener(message);
  }

  const client = createWsClient({ ...options, onMessage: handleMessage });

  return {
    connect: () => client.connect(),

    disconnect: () => {
      pending.length = 0;
      listeners.clear();
      client.disconnect();
    },

    addMessageListener: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    send: (message) => {
      if (client.send(message)) return;

      pending.push(message);
    },
  };
}

export const wsSession = createWsSession({
  url: WS_PATH,
  getAccessToken: () => sessionConfig.getAccessToken(),
});
