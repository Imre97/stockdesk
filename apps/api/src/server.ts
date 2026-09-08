import { createServer } from "node:http";
import { createApp } from "./app.js";
import { getConfig } from "./lib/config.js";
import { attachWebSocketServer } from "./ws/auth-handshake.js";

const config = getConfig();
const server = createServer(createApp());

attachWebSocketServer(server);

server.listen(config.port, () => {
  process.stdout.write(`StockDesk API listening on port ${config.port}\n`);
});
