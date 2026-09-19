import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./state/database.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
const app = createApp(database, { workflowToken: config.workflowToken });

const server = app.listen(config.port, config.host, () => {
  console.log(`Backend listening on http://${config.host}:${config.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
