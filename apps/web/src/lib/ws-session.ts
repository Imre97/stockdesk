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
  subscribe: (key: string, subscribeMessage: ClientMessage, unsubscribeMessage: ClientMessage) => () => void;
}

interface Subscription {
  count: number;
  subscribeMessage: ClientMessage;
  unsubscribeMessage: ClientMessage;
}

export function createWsSession(options: WsSessionOptions): WsSession {
  const listeners = new Set<WsMessageListener>();
  const pending: ClientMessage[] = [];
  const subscriptions = new Map<string, Subscription>();

  function flush(): void {
    while (pending.length > 0) {
      const next = pending[0];

      if (next === undefined || !client.send(next)) return;

      pending.shift();
    }
  }

  function resendSubscriptions(): void {
    for (const subscription of subscriptions.values()) client.send(subscription.subscribeMessage);
  }

  function handleMessage(message: ServerMessage): void {
    if (message.type === "auth_ok") {
      flush();
      resendSubscriptions();
    }

    for (const listener of [...listeners]) listener(message);
  }

  function release(key: string): void {
    const subscription = subscriptions.get(key);

    if (subscription === undefined) return;

    subscription.count -= 1;

    if (subscription.count > 0) return;

    subscriptions.delete(key);
    client.send(subscription.unsubscribeMessage);
  }

  const client = createWsClient({ ...options, onMessage: handleMessage });

  return {
    connect: () => client.connect(),

    disconnect: () => {
      pending.length = 0;
      listeners.clear();
      subscriptions.clear();
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

    subscribe: (key, subscribeMessage, unsubscribeMessage) => {
      const existing = subscriptions.get(key);

      if (existing === undefined) {
        subscriptions.set(key, { count: 1, subscribeMessage, unsubscribeMessage });
        client.send(subscribeMessage);
      } else {
        existing.count += 1;
      }

      let released = false;

      return () => {
        if (released) return;

        released = true;
        release(key);
      };
    },
  };
}

export const wsSession = createWsSession({
  url: WS_PATH,
  getAccessToken: () => sessionConfig.getAccessToken(),
});
