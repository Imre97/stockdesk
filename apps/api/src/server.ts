import { createApp } from "./app.js";
import { getConfig } from "./lib/config.js";

const config = getConfig();

createApp().listen(config.port, () => {
  process.stdout.write(`StockDesk API listening on port ${config.port}\n`);
});
