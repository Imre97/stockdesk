import { createServer } from "node:http";
import { createApp } from "./app.js";
import { runBootTasks } from "./boot.js";
import { getConfig } from "./lib/config.js";
import { attachWebSocketServer } from "./ws/auth-handshake.js";

const config = getConfig();
const server = createServer(createApp({ config }));

attachWebSocketServer(server, config);

server.listen(config.port, () => {
  process.stdout.write(`StockDesk API listening on port ${config.port}\n`);
});

runBootTasks(config).catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Starting the boot tasks failed: ${reason}\n`);
});
