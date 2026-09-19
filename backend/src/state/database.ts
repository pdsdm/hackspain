import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface CrisisRemote {
  hydrate: (connection: DatabaseSync) => Promise<void>;
  scheduleSync: (connection: DatabaseSync) => void;
  flush: () => Promise<void>;
}

export interface CrisisDatabase {
  connection: DatabaseSync;
  close: () => void;
}

const remotes = new WeakMap<DatabaseSync, CrisisRemote>();

export function bindRemote(connection: DatabaseSync, remote: CrisisRemote): void {
  remotes.set(connection, remote);
}

export function notifyRemote(connection: DatabaseSync): void {
  remotes.get(connection)?.scheduleSync(connection);
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;

  CREATE TABLE IF NOT EXISTS demo_runs (
    id TEXT PRIMARY KEY,
    scenario_id TEXT NOT NULL,
    state_json TEXT NOT NULL CHECK (json_valid(state_json)),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;

  CREATE UNIQUE INDEX IF NOT EXISTS one_active_demo_run
    ON demo_runs(active)
    WHERE active = 1;

  CREATE TABLE IF NOT EXISTS allocations (
    run_id TEXT NOT NULL REFERENCES demo_runs(id) ON DELETE CASCADE,
    guest_id TEXT NOT NULL,
    space_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
    plan_version INTEGER NOT NULL,
    PRIMARY KEY (run_id, guest_id)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS dispatch_tasks (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES demo_runs(id) ON DELETE CASCADE,
    plan_version INTEGER NOT NULL,
    area TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'dispatching', 'dispatched', 'unknown', 'completed', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (run_id, idempotency_key)
  ) STRICT;

  CREATE TABLE IF NOT EXISTS task_results (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES dispatch_tasks(id) ON DELETE CASCADE,
    external_event_id TEXT NOT NULL UNIQUE,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    applied INTEGER NOT NULL CHECK (applied IN (0, 1)),
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;

  CREATE TABLE IF NOT EXISTS workflow_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL CHECK (event_type = 'coordinator'),
    run_id TEXT NOT NULL,
    plan_version INTEGER NOT NULL,
    request_json TEXT NOT NULL CHECK (json_valid(request_json)),
    response_json TEXT CHECK (response_json IS NULL OR json_valid(response_json)),
    received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
  ) STRICT;

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES demo_runs(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT,
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    actor_id TEXT,
    sim_seconds INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('llm', 'rules', 'none')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) STRICT;
`;

export function openDatabase(path: string): CrisisDatabase {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }

  const connection = new DatabaseSync(path);
  connection.exec("PRAGMA busy_timeout = 5000;");
  connection.exec("PRAGMA foreign_keys = ON;");
  if (path !== ":memory:") {
    connection.exec("PRAGMA journal_mode = WAL;");
  }
  connection.exec(SCHEMA);
  connection
    .prepare(`
      INSERT INTO app_metadata (key, value)
      VALUES ('schema_version', '4')
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
