import { createServer } from "node:http";
import { createApp } from "./app.js";
import { getConfig } from "./lib/config.js";
import { deleteExpiredRefreshTokens } from "./modules/auth/repository.js";
import { attachWebSocketServer } from "./ws/auth-handshake.js";

const config = getConfig();
const server = createServer(createApp({ config }));

attachWebSocketServer(server, config);

server.listen(config.port, () => {
  process.stdout.write(`StockDesk API listening on port ${config.port}\n`);
});

deleteExpiredRefreshTokens().catch(() => {
  process.stderr.write("Pruning expired refresh tokens at boot failed.\n");
});
