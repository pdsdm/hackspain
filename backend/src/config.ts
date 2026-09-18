import { resolve } from "node:path";

const DEFAULT_PORT = 8000;

export interface AppConfig {
  databasePath: string;
  host: string;
  port: number;
}

function readPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, received "${value}"`);
  }

  return port;
}

function readDatabasePath(value: string | undefined): string {
  const path = value?.trim();
  if (!path) {
    return resolve("data", "crisis.db");
  }

  return path === ":memory:" ? path : resolve(path);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    databasePath: readDatabasePath(env.DATABASE_URL),
    host: env.HOST?.trim() || "0.0.0.0",
    port: readPort(env.PORT),
  };
}
