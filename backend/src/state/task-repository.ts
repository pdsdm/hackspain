import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { parseCrisisState, type CrisisStateDocument } from "../domain/crisis-state.js";

export type TaskStatus =
  | "pending"
  | "dispatching"
  | "dispatched"
  | "unknown"
  | "completed"
  | "failed"
  | "cancelled";

export interface DispatchTask {
  id: string;
  runId: string;
  planVersion: number;
  area: string;
  kind: string;
  payload: unknown;
  idempotencyKey: string;
  status: TaskStatus;
  attempts: number;
}

interface TaskRow {
  id: string;
  run_id: string;
  plan_version: number;
  area: string;
  kind: string;
  payload_json: string;
  idempotency_key: string;
  status: TaskStatus;
  attempts: number;
}

interface ResultContextRow {
  run_id: string;
  plan_version: number;
  active: number;
  current_plan_version: number;
  state_json: string;
}

function encodeJson(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new Error("Task payload must be JSON serializable");
  }
  return encoded;
}

export class TaskRepository {
  constructor(private readonly database: DatabaseSync) {}

  enqueue(input: Omit<DispatchTask, "id" | "status" | "attempts">): DispatchTask {
    const id = randomUUID();
    this.database
      .prepare(`
        INSERT INTO dispatch_tasks (
          id, run_id, plan_version, area, kind, payload_json, idempotency_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (run_id, idempotency_key) DO NOTHING
      `)
      .run(
        id,
        input.runId,
        input.planVersion,
        input.area,
        input.kind,
        encodeJson(input.payload),
        input.idempotencyKey,
      );

    const row = this.database
      .prepare("SELECT * FROM dispatch_tasks WHERE run_id = ? AND idempotency_key = ?")
      .get(input.runId, input.idempotencyKey) as unknown as TaskRow;
    return this.toTask(row);
  }

  get(taskId: string): DispatchTask | undefined {
    const row = this.database
      .prepare("SELECT * FROM dispatch_tasks WHERE id = ?")
      .get(taskId) as unknown as TaskRow | undefined;
    return row ? this.toTask(row) : undefined;
  }

  listOpen(runId: string): DispatchTask[] {
    const rows = this.database
      .prepare(`
        SELECT * FROM dispatch_tasks
        WHERE run_id = ?
          AND status IN ('pending', 'dispatching', 'dispatched')
        ORDER BY created_at, id
      `)
      .all(runId) as unknown as TaskRow[];
    return rows.map((row) => this.toTask(row));
  }

  cancel(taskId: string, _reason: string): boolean {
    const result = this.database
      .prepare(`
        UPDATE dispatch_tasks
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending', 'dispatching')
      `)
      .run(taskId);
    return result.changes === 1;
  }

  claimNext(): DispatchTask | undefined {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare(`
          SELECT task.*
          FROM dispatch_tasks AS task
          JOIN demo_runs AS run ON run.id = task.run_id
          WHERE task.status = 'pending'
            AND run.active = 1
            AND COALESCE(json_extract(run.state_json, '$.agentsPaused'), 0) = 0
            AND task.plan_version = json_extract(run.state_json, '$.planVersion')
            AND NOT EXISTS (
              SELECT 1
              FROM json_each(task.payload_json, '$.dependsOnKeys') AS dependency
              LEFT JOIN dispatch_tasks AS required
                ON required.run_id = task.run_id
                AND required.idempotency_key = dependency.value
              WHERE required.id IS NULL OR required.status != 'completed'
            )
          ORDER BY task.created_at, task.id
          LIMIT 1
        `)
        .get() as TaskRow | undefined;

      if (!row) {
        this.database.exec("COMMIT");
        return undefined;
      }

      this.database
        .prepare(`
          UPDATE dispatch_tasks
          SET status = 'dispatching', attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .run(row.id);
      this.database.exec("COMMIT");
      return { ...this.toTask(row), status: "dispatching", attempts: row.attempts + 1 };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  markDispatchOutcome(taskId: string, status: "dispatched" | "unknown" | "failed"): void {
    const result = this.database
      .prepare(`
        UPDATE dispatch_tasks
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'dispatching'
      `)
      .run(status, taskId);
    if (result.changes !== 1) {
      throw new Error(`Dispatching task not found: ${taskId}`);
    }
  }

  recordResult(
    taskId: string,
    externalEventId: string,
    payload: unknown,
    applyToState?: (
      state: CrisisStateDocument,
      payload: unknown,
    ) => CrisisStateDocument,
    terminalStatus: "completed" | "failed" = "completed",
  ): { applied: boolean; duplicate: boolean } {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const duplicate = this.database
        .prepare("SELECT applied FROM task_results WHERE external_event_id = ?")
        .get(externalEventId) as { applied: number } | undefined;
      if (duplicate) {
        this.database.exec("COMMIT");
        return { applied: duplicate.applied === 1, duplicate: true };
      }

      const context = this.database
        .prepare(`
          SELECT
            run.id AS run_id,
            task.plan_version,
            run.active,
            json_extract(run.state_json, '$.planVersion') AS current_plan_version,
            run.state_json
          FROM dispatch_tasks AS task
          JOIN demo_runs AS run ON run.id = task.run_id
          WHERE task.id = ?
        `)
        .get(taskId) as ResultContextRow | undefined;
      if (!context) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const current =
        context.active === 1 && context.plan_version === context.current_plan_version;
      const applied = current && applyToState !== undefined;
      if (applied) {
        const nextState = parseCrisisState(
          applyToState(parseCrisisState(JSON.parse(context.state_json)), payload),
        );
        if (nextState.planVersion !== context.current_plan_version) {
          throw new Error("A task result cannot change planVersion directly");
        }
        this.database
          .prepare(`
            UPDATE demo_runs
            SET state_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND active = 1
          `)
          .run(JSON.stringify(nextState), context.run_id);
      }
      this.database
        .prepare(`
          INSERT INTO task_results (id, task_id, external_event_id, payload_json, applied)
          VALUES (?, ?, ?, ?, ?)
        `)
        .run(randomUUID(), taskId, externalEventId, encodeJson(payload), applied ? 1 : 0);
      this.database
        .prepare(`
          UPDATE dispatch_tasks
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .run(terminalStatus, taskId);
      this.database.exec("COMMIT");
      return { applied, duplicate: false };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  private toTask(row: TaskRow): DispatchTask {
    return {
      id: row.id,
      runId: row.run_id,
      planVersion: row.plan_version,
      area: row.area,
      kind: row.kind,
      payload: JSON.parse(row.payload_json),
      idempotencyKey: row.idempotency_key,
      status: row.status,
      attempts: row.attempts,
    };
  }
}
