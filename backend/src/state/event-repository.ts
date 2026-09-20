import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { notifyRemote } from "./database.js";

export type EventSource = "chat" | "happyrobot" | "jury" | "human" | "clock";
export type CoordinatorRunMode = "llm" | "rules" | "none";

export interface StoredEvent {
  id: string;
  runId: string;
  source: EventSource;
  kind: string;
  text: string | undefined;
  payload: Record<string, unknown>;
  actorId: string | undefined;
  simSeconds: number;
  mode: CoordinatorRunMode;
}

export interface StoredEventRow extends StoredEvent {
  /** Hora real de registro, la que da SQLite con CURRENT_TIMESTAMP (UTC). */
  createdAt: string;
}
export class EventRepository {
  constructor(private readonly database: DatabaseSync) {}

  append(input: Omit<StoredEvent, "id"> & { id?: string }): StoredEvent {
    const id = input.id ?? randomUUID();
    this.database
      .prepare(`
        INSERT INTO events (
          id, run_id, source, kind, text, payload_json, actor_id, sim_seconds, mode
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        id,
        input.runId,
        input.source,
        input.kind,
        input.text ?? null,
        JSON.stringify(input.payload),
        input.actorId ?? null,
        input.simSeconds,
        input.mode,
      );
    notifyRemote(this.database);
    return { ...input, id, payload: input.payload };
  }

  /**
   * Histórico de eventos de entrada, incluidas ejecuciones anteriores.
   *
   * La cronología del estado solo conserva las últimas 80 y se vacía en cada despliegue;
   * esta tabla no, porque un reset desactiva la ejecución pero no la borra. Devuelve en
   * orden cronológico: se piden los N últimos por rowid (el orden de inserción, porque
   * `created_at` solo tiene resolución de segundo y empata constantemente) y se revierten.
   */
  list(options: { runId?: string; source?: string; kind?: string; limit: number }): StoredEventRow[] {
    const filters: string[] = [];
    const values: Array<string | number> = [];
    if (options.runId) { filters.push("run_id = ?"); values.push(options.runId); }
    if (options.source) { filters.push("source = ?"); values.push(options.source); }
    if (options.kind) { filters.push("kind = ?"); values.push(options.kind); }
    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = this.database
      .prepare(`
        SELECT id, run_id, source, kind, text, payload_json, actor_id, sim_seconds, mode, created_at
        FROM events
        ${where}
        ORDER BY rowid DESC
        LIMIT ?
      `)
      .all(...values, options.limit) as Array<Record<string, unknown>>;
    return rows.reverse().map((row) => ({
      id: String(row.id),
      runId: String(row.run_id),
      source: row.source as EventSource,
      kind: String(row.kind),
      text: row.text === null ? undefined : String(row.text),
      payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>,
      actorId: row.actor_id === null ? undefined : String(row.actor_id),
      simSeconds: Number(row.sim_seconds),
      mode: row.mode as CoordinatorRunMode,
      createdAt: String(row.created_at),
    }));
  }

  setMode(id: string, mode: CoordinatorRunMode): void {
    this.database.prepare("UPDATE events SET mode = ? WHERE id = ?").run(mode, id);
    notifyRemote(this.database);
  }
}
