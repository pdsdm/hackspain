import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SimulationClock } from "./domain/clock.js";
import { openDatabase } from "./state/database.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);

const app = createApp(database, { workflowToken: config.workflowToken, config });
const executor = app.locals.executor;
const clock = new SimulationClock(app.locals.stateRepository, executor, config.clockSpeed, config.simSeed);
clock.attachEngine(app.locals.engine);
if (config.simIncidents) clock.enableLiveOnStart(config.simSeed ?? 1, config.simIncidentsMode ?? "open");

const server = app.listen(config.port, config.host, () => {
  console.log(`Backend listening on http://${config.host}:${config.port}`);
  clock.start();
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  clock.stop();
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
