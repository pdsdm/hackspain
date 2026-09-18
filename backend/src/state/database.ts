import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface CrisisDatabase {
  connection: DatabaseSync;
  close: () => void;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
`;

export function openDatabase(path: string): CrisisDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const connection = new DatabaseSync(path);
  connection.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") {
    connection.exec("PRAGMA journal_mode = WAL;");
  }
  connection.exec(SCHEMA);
  connection
    .prepare(`
      INSERT INTO app_metadata (key, value)
      VALUES ('schema_version', '1')
      ON CONFLICT (key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run();

  return {
    connection,
    close: () => connection.close(),
  };
}
