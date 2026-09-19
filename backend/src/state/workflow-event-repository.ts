import type { DatabaseSync } from "node:sqlite";

import { notifyRemote } from "./database.js";

import { ContractError } from "../contracts/api.js";

interface WorkflowEventRow {
  run_id: string;
  plan_version: number;
  request_json: string;
  response_json: string | null;
}

export class WorkflowEventRepository {
  constructor(private readonly database: DatabaseSync) {}

  reserve(
    eventId: string,
    runId: string,
    planVersion: number,
    request: unknown,
  ): { duplicate: boolean; response?: Record<string, unknown> } {
    const requestJson = JSON.stringify(request);
    const row = this.database
      .prepare(`
        SELECT run_id, plan_version, request_json, response_json
        FROM workflow_events
        WHERE event_id = ?
      `)
      .get(eventId) as unknown as WorkflowEventRow | undefined;

    if (row) {
      if (
        row.run_id !== runId ||
        row.plan_version !== planVersion ||
        row.request_json !== requestJson
      ) {
        throw new ContractError(`eventId conflicts with a previous request: ${eventId}`, 409);
      }
      if (row.response_json === null) {
        throw new ContractError(`eventId is still being processed: ${eventId}`, 409);
      }
      return {
        duplicate: true,
        response: JSON.parse(row.response_json) as Record<string, unknown>,
      };
    }

    this.database
      .prepare(`
        INSERT INTO workflow_events (
          event_id, event_type, run_id, plan_version, request_json
        ) VALUES (?, 'coordinator', ?, ?, ?)
      `)
      .run(eventId, runId, planVersion, requestJson);
    notifyRemote(this.database);
    return { duplicate: false };
  }

  complete(eventId: string, response: Record<string, unknown>): void {
    this.database
      .prepare(`
        UPDATE workflow_events
        SET response_json = ?, completed_at = CURRENT_TIMESTAMP
        WHERE event_id = ?
      `)
      .run(JSON.stringify(response), eventId);
    notifyRemote(this.database);
  }

  release(eventId: string): void {
    this.database
      .prepare("DELETE FROM workflow_events WHERE event_id = ? AND response_json IS NULL")
      .run(eventId);
    notifyRemote(this.database);
  }
}
