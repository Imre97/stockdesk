import { createServer } from "node:http";
import type { ServerMessage } from "@stockdesk/shared";
import { createApp } from "./app.js";
import { runBootTasks } from "./boot.js";
import { getConfig } from "./lib/config.js";
import { attachWebSocketServer } from "./ws/auth-handshake.js";
import { createUserRegistry } from "./ws/user-registry.js";

const config = getConfig();
const registry = createUserRegistry();

const broadcast = (userId: string, message: ServerMessage): void => {
  registry.broadcastToUser(userId, message);
};

const server = createServer(createApp({ config, deps: { broadcast } }));

attachWebSocketServer(server, config, { registry });

server.listen(config.port, () => {
  process.stdout.write(`StockDesk API listening on port ${config.port}\n`);
});

runBootTasks(config, { broadcast }).catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Starting the boot tasks failed: ${reason}\n`);
});
