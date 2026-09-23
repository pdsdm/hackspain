import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { SimulationClock } from "./domain/clock.js";
import { openDatabase } from "./state/database.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);

const app = createApp(database, { workflowToken: config.workflowToken, config });
const executor = app.locals.executor;
const clock = new SimulationClock(app.locals.stateRepository, executor, config.clockSpeed);
clock.attachEngine(app.locals.engine);

const server = app.listen(config.port, config.host, () => {
  console.log(`Backend listening on http://${config.host}:${config.port}`);
  if (config.authEnabled) {
    console.log("[auth] el panel exige código de 6 dígitos al correo");
    if (!config.brevoApiKey) console.log("[auth] sin BREVO_API_KEY: el código se imprime en este log");
  } else {
    console.log("[auth] abierto: pon AUTH_SECRET (o AUTH_REQUIRED=true) para cerrar el panel");
  }
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
