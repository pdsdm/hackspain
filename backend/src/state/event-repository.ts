import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

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
    return { ...input, id, payload: input.payload };
  }

  setMode(id: string, mode: CoordinatorRunMode): void {
    this.database.prepare("UPDATE events SET mode = ? WHERE id = ?").run(mode, id);
  }
}
