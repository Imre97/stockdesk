import type { ServerMessage } from "@stockdesk/shared";
import { WebSocket } from "ws";

export interface UserRegistry {
  add: (userId: string, socket: WebSocket) => void;
  remove: (userId: string, socket: WebSocket) => void;
  broadcastToUser: (userId: string, message: ServerMessage) => void;
  socketCount: (userId: string) => number;
}

export function createUserRegistry(): UserRegistry {
  const sockets = new Map<string, Set<WebSocket>>();

  function remove(userId: string, socket: WebSocket): void {
    const owned = sockets.get(userId);
    if (owned === undefined) return;

    owned.delete(socket);
    if (owned.size === 0) sockets.delete(userId);
  }

  return {
    add(userId: string, socket: WebSocket): void {
      const owned = sockets.get(userId) ?? new Set<WebSocket>();
      owned.add(socket);
      sockets.set(userId, owned);
    },

    remove,

    broadcastToUser(userId: string, message: ServerMessage): void {
      const owned = sockets.get(userId);
      if (owned === undefined) return;

      const payload = JSON.stringify(message);

      for (const socket of owned) {
        if (socket.readyState === WebSocket.OPEN) socket.send(payload);
      }
    },

    socketCount(userId: string): number {
      return sockets.get(userId)?.size ?? 0;
    },
  };
}
