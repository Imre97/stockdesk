import type { ServerMessage } from "@stockdesk/shared";
import { WebSocket } from "ws";

export function sendMessage(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify(message));
}
