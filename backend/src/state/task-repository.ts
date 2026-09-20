import { randomUUID } from "node:crypto";

import type { DatabaseSync } from "node:sqlite";

import { notifyRemote } from "./database.js";

import { ContractError } from "../contracts/api.js";
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
  status: TaskStatus;
  current_plan_version: number;
  state_json: string;
}

// Las condiciones que hacen reclamable una tarea. Viven en un sitio para que reclamar la
// siguiente y reclamar una concreta no puedan divergir.
const CLAIMABLE = `
  task.status = 'pending'
  AND run.active = 1
  AND COALESCE(json_extract(run.state_json, '$.agentsPaused'), 0) = 0
  AND COALESCE(json_extract(run.state_json, '$.rejectedPlanVersion'), -1) != task.plan_version
  AND task.plan_version = json_extract(run.state_json, '$.planVersion')
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(task.payload_json, '$.dependsOnKeys') AS dependency
    WHERE NOT EXISTS (
      SELECT 1 FROM dispatch_tasks AS required
      WHERE required.run_id = task.run_id
        AND required.idempotency_key IN (dependency.value, dependency.value || ':retry')
        AND required.status = 'completed'
    )
  )
`;

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
    notifyRemote(this.database);
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
    if (result.changes === 1) notifyRemote(this.database);
    return result.changes === 1;
  }

  carryToPlan(taskId: string, planVersion: number): boolean {
    const result = this.database
      .prepare(`
        UPDATE dispatch_tasks
        SET plan_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status IN ('pending', 'dispatching', 'dispatched')
      `)
      .run(planVersion, taskId);
    if (result.changes === 1) notifyRemote(this.database);
    return result.changes === 1;
  }

  claimNext(): DispatchTask | undefined {
    return this.claimWhere(`${CLAIMABLE} ORDER BY task.created_at, task.id LIMIT 1`);
  }

  /** Reclama una tarea concreta, con los mismos requisitos que la siguiente de la cola. */
  claim(taskId: string): DispatchTask | undefined {
    return this.claimWhere(`task.id = ? AND ${CLAIMABLE}`, taskId);
  }

  private claimWhere(condition: string, ...params: string[]): DispatchTask | undefined {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare(`
          SELECT task.*
          FROM dispatch_tasks AS task
          JOIN demo_runs AS run ON run.id = task.run_id
          WHERE ${condition}
        `)
        .get(...params) as TaskRow | undefined;

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
      notifyRemote(this.database);
      return { ...this.toTask(row), status: "dispatching", attempts: row.attempts + 1 };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Reescribe el encargo de una tarea que todavía no ha salido. El coordinador puede afinar el
   * objetivo entre que el plan crea la acción y él pide la llamada.
   */
  updatePayload(taskId: string, payload: unknown): boolean {
    const result = this.database
      .prepare(`
        UPDATE dispatch_tasks
        SET payload_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
      `)
      .run(encodeJson(payload), taskId);
    if (result.changes === 1) notifyRemote(this.database);
    return result.changes === 1;
  }

  release(taskId: string): boolean {
    const result = this.database
      .prepare(`
        UPDATE dispatch_tasks
        SET status = 'pending', attempts = attempts - 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'dispatching'
      `)
      .run(taskId);
    if (result.changes === 1) notifyRemote(this.database);
    return result.changes === 1;
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
    notifyRemote(this.database);
  }

  dependenciesSatisfied(taskId: string): boolean {
    const row = this.database.prepare(`
      SELECT task.id FROM dispatch_tasks AS task
      WHERE task.id = ? AND NOT EXISTS (
        SELECT 1 FROM json_each(task.payload_json, '$.dependsOnKeys') AS dependency
        WHERE NOT EXISTS (
          SELECT 1 FROM dispatch_tasks AS required
          JOIN task_results AS result ON result.task_id = required.id
          WHERE required.run_id = task.run_id
            AND required.idempotency_key IN (dependency.value, dependency.value || ':retry')
            AND required.plan_version = task.plan_version
            AND required.status = 'completed'
            AND result.applied = 1
            AND json_extract(result.payload_json, '$.status') = 'completed'
            AND json_extract(result.payload_json, '$.result.outcome') = 'accepted'
            AND json_array_length(result.payload_json, '$.result.conditions') = 0
        )
      )
    `).get(taskId);
    return row !== undefined;
  }

  cancelBlocked(runId: string): DispatchTask[] {
    const rows = this.database.prepare(`
      SELECT task.* FROM dispatch_tasks AS task
      WHERE task.run_id = ? AND task.status = 'pending' AND EXISTS (
        SELECT 1 FROM json_each(task.payload_json, '$.dependsOnKeys') AS dependency
        WHERE NOT EXISTS (
          SELECT 1 FROM dispatch_tasks AS required
          WHERE required.run_id = task.run_id
            AND required.idempotency_key IN (dependency.value, dependency.value || ':retry')
            AND required.status IN ('pending', 'dispatching', 'dispatched', 'unknown', 'completed')
        )
      )
      ORDER BY task.created_at, task.id
    `).all(runId) as unknown as TaskRow[];
    const cancelled = rows.filter((row) => this.cancel(row.id, "dependency failed"));
    return cancelled.map((row) => ({ ...this.toTask(row), status: "cancelled" }));
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
        .prepare("SELECT applied, task_id FROM task_results WHERE external_event_id = ?")
        .get(externalEventId) as { applied: number; task_id: string } | undefined;
      if (duplicate) {
        if (duplicate.task_id !== taskId) throw new ContractError("Result eventId belongs to another task", 409);
        this.database.exec("COMMIT");
        return { applied: duplicate.applied === 1, duplicate: true };
      }

      const context = this.database
        .prepare(`
          SELECT
            run.id AS run_id,
            task.plan_version,
            task.status,
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
        context.active === 1 && context.plan_version === context.current_plan_version &&
        !["completed", "failed", "cancelled"].includes(context.status);
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
          WHERE id = ? AND status NOT IN ('completed', 'failed', 'cancelled')
        `)
        .run(terminalStatus, taskId);
      this.database.exec("COMMIT");
      notifyRemote(this.database);
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
