import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { CrisisRemote } from "./database.js";

const SYNC_MS = 400;

type JsonRow = Record<string, unknown>;

function asJson(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function asTextJson(value: unknown): string {
  if (typeof value === "string") return value;
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("Value must be JSON serializable");
  return json;
}

function cell(value: unknown): string | number {
  if (typeof value === "number") return value;
  return String(value);
}

function cellNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

function fail(table: string, error: { message: string } | null): void {
  if (error) throw new Error(`Supabase ${table}: ${error.message}`);
}

export function createSupabaseRemote(url: string, serviceRoleKey: string): CrisisRemote {
  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: DatabaseSync | undefined;
  let pushing = Promise.resolve();

  const push = (connection: DatabaseSync): Promise<void> => {
    pushing = pushing.then(async () => {
      try {
        await pushAll(client, connection);
      } catch (error) {
        console.error("[supabase] sync failed", error);
      }
    });
    return pushing;
  };

  return {
    async hydrate(connection) {
      await pullingIntoSqlite(client, connection);
    },
    scheduleSync(connection) {
      pending = connection;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        const db = pending;
        pending = undefined;
        if (db) void push(db);
      }, SYNC_MS);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      const db = pending;
      pending = undefined;
      if (db) await push(db);
      else await pushing;
    },
  };
}

async function pullingIntoSqlite(client: SupabaseClient, connection: DatabaseSync): Promise<void> {
  const runs = await selectAll(client, "demo_runs");
  if (runs.length === 0) return;

  const metadata = await selectAll(client, "app_metadata");
  const allocations = await selectAll(client, "allocations");
  const tasks = await selectAll(client, "dispatch_tasks");
  const results = await selectAll(client, "task_results");
  const workflow = await selectAll(client, "workflow_events");
  const events = await selectAll(client, "events");

  connection.exec("PRAGMA foreign_keys = OFF");
  connection.exec("BEGIN");
  try {
    connection.exec("DELETE FROM events");
    connection.exec("DELETE FROM task_results");
    connection.exec("DELETE FROM dispatch_tasks");
    connection.exec("DELETE FROM allocations");
    connection.exec("DELETE FROM workflow_events");
    connection.exec("DELETE FROM demo_runs");
    connection.exec("DELETE FROM app_metadata");

    insertRows(
      connection,
      "INSERT INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)",
      metadata,
      (row) => [
        String(row.key),
        String(row.value),
        String(row.updated_at),
      ],
    );
    insertRows(
      connection,
      "INSERT INTO demo_runs (id, scenario_id, state_json, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      runs,
      (row) => [
        cell(row.id),
        cell(row.scenario_id),
        asTextJson(row.state_json),
        Number(row.active),
        cell(row.created_at),
        cell(row.updated_at),
      ],
    );
    insertRows(
      connection,
      "INSERT INTO allocations (run_id, guest_id, space_id, status, plan_version) VALUES (?, ?, ?, ?, ?)",
      allocations,
      (row) => [cell(row.run_id), cell(row.guest_id), cell(row.space_id), cell(row.status), Number(row.plan_version)],
    );
    insertRows(
      connection,
      `INSERT INTO dispatch_tasks (
        id, run_id, plan_version, area, kind, payload_json, idempotency_key, status, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      tasks,
      (row) => [
        cell(row.id),
        cell(row.run_id),
        Number(row.plan_version),
        cell(row.area),
        cell(row.kind),
        asTextJson(row.payload_json),
        cell(row.idempotency_key),
        cell(row.status),
        Number(row.attempts),
        cell(row.created_at),
        cell(row.updated_at),
      ],
    );
    insertRows(
      connection,
      "INSERT INTO task_results (id, task_id, external_event_id, payload_json, applied, received_at) VALUES (?, ?, ?, ?, ?, ?)",
      results,
      (row) => [
        cell(row.id),
        cell(row.task_id),
        cell(row.external_event_id),
        asTextJson(row.payload_json),
        Number(row.applied),
        cell(row.received_at),
      ],
    );
    insertRows(
      connection,
      `INSERT INTO workflow_events (
        event_id, event_type, run_id, plan_version, request_json, response_json, received_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      workflow,
      (row) => [
        cell(row.event_id),
        cell(row.event_type),
        cell(row.run_id),
        Number(row.plan_version),
        asTextJson(row.request_json),
        row.response_json == null ? null : asTextJson(row.response_json),
        cell(row.received_at),
        cellNull(row.completed_at),
      ],
    );
    insertRows(
      connection,
      `INSERT INTO events (
        id, run_id, source, kind, text, payload_json, actor_id, sim_seconds, mode, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      events,
      (row) => [
        cell(row.id),
        cell(row.run_id),
        cell(row.source),
        cell(row.kind),
        cellNull(row.text),
        asTextJson(row.payload_json),
        cellNull(row.actor_id),
        Number(row.sim_seconds),
        cell(row.mode),
        cell(row.created_at),
      ],
    );
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  } finally {
    connection.exec("PRAGMA foreign_keys = ON");
  }

  console.log(`[supabase] restored ${runs.length} demo run(s) from Postgres`);
}

function insertRows(
  connection: DatabaseSync,
  sql: string,
  rows: JsonRow[],
  values: (row: JsonRow) => SQLInputValue[],
): void {
  const statement = connection.prepare(sql);
  for (const row of rows) statement.run(...values(row));
}

async function selectAll(client: SupabaseClient, table: string): Promise<JsonRow[]> {
  const { data, error } = await client.from(table).select("*");
  fail(table, error);
  return (data ?? []) as JsonRow[];
}

async function pushAll(client: SupabaseClient, connection: DatabaseSync): Promise<void> {
  const metadata = all(connection, "SELECT * FROM app_metadata");
  const runs: JsonRow[] = all(connection, "SELECT * FROM demo_runs").map((row) => ({
    ...row,
    active: Number(row.active),
    state_json: asJson(row.state_json),
  }));
  const allocations = all(connection, "SELECT * FROM allocations");
  const tasks: JsonRow[] = all(connection, "SELECT * FROM dispatch_tasks").map((row) => ({
    ...row,
    payload_json: asJson(row.payload_json),
  }));
  const results: JsonRow[] = all(connection, "SELECT * FROM task_results").map((row) => ({
    ...row,
    applied: Number(row.applied),
    payload_json: asJson(row.payload_json),
  }));
  const workflow: JsonRow[] = all(connection, "SELECT * FROM workflow_events").map((row) => ({
    ...row,
    request_json: asJson(row.request_json),
    response_json: row.response_json == null ? null : asJson(row.response_json),
  }));
  const events: JsonRow[] = all(connection, "SELECT * FROM events").map((row) => ({
    ...row,
    payload_json: asJson(row.payload_json),
  }));

  await upsert(client, "app_metadata", metadata);
  await upsert(client, "demo_runs", runs);
  await deleteMissing(client, "demo_runs", "id", runs.map((row) => String(row.id)));
  const runIds = runs.map((row) => String(row.id));
  if (runIds.length > 0) {
    fail(
      "allocations",
      (await client.from("allocations").delete().in("run_id", runIds)).error,
    );
  }
  await upsert(client, "allocations", allocations);
  await upsert(client, "dispatch_tasks", tasks);
  await deleteMissing(client, "dispatch_tasks", "id", tasks.map((row) => String(row.id)));
  await upsert(client, "task_results", results);
  await deleteMissing(client, "task_results", "id", results.map((row) => String(row.id)));
  await upsert(client, "workflow_events", workflow);
  await deleteMissing(
    client,
    "workflow_events",
    "event_id",
    workflow.map((row) => String(row.event_id)),
  );
  await upsert(client, "events", events);
  await deleteMissing(client, "events", "id", events.map((row) => String(row.id)));
}

function all(connection: DatabaseSync, sql: string): JsonRow[] {
  return connection.prepare(sql).all() as JsonRow[];
}

async function upsert(client: SupabaseClient, table: string, rows: JsonRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows);
  fail(table, error);
}

async function deleteMissing(
  client: SupabaseClient,
  table: string,
  key: string,
  localIds: string[],
): Promise<void> {
  const { data, error } = await client.from(table).select(key);
  fail(table, error);
  const keep = new Set(localIds);
  const extra = ((data ?? []) as unknown as JsonRow[])
    .map((row) => String(row[key]))
    .filter((id) => !keep.has(id));
  if (extra.length === 0) return;
  const { error: deleteError } = await client.from(table).delete().in(key, extra);
  fail(table, deleteError);
}
