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

void runBootTasks(config);
