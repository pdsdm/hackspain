import type { DatabaseSync } from "node:sqlite";

import { ContractError, type HappyRobotIncidentEnvelope } from "../contracts/api.js";
import { notifyRemote } from "./database.js";

interface HappyRobotEventRow {
  request_json: string;
  response_json: string | null;
}

export class HappyRobotEventRepository {
  constructor(private readonly database: DatabaseSync) {}

  reserve(event: HappyRobotIncidentEnvelope): { duplicate: boolean; pending?: boolean; response?: Record<string, unknown> } {
    const requestJson = JSON.stringify(event);
    const row = this.database
      .prepare("SELECT request_json, response_json FROM happyrobot_incident_events WHERE event_id = ?")
      .get(event.eventId) as HappyRobotEventRow | undefined;
    if (row) {
      if (row.request_json !== requestJson) throw new ContractError(`eventId conflicts with a previous request: ${event.eventId}`, 409);
      if (row.response_json === null) return { duplicate: true, pending: true };
      return { duplicate: true, response: JSON.parse(row.response_json) as Record<string, unknown> };
    }
    this.database
      .prepare("INSERT INTO happyrobot_incident_events (event_id, request_json) VALUES (?, ?)")
      .run(event.eventId, requestJson);
    notifyRemote(this.database);
    return { duplicate: false };
  }

  complete(eventId: string, response: Record<string, unknown>): void {
    this.database
      .prepare("UPDATE happyrobot_incident_events SET response_json = ?, completed_at = CURRENT_TIMESTAMP WHERE event_id = ?")
      .run(JSON.stringify(response), eventId);
    notifyRemote(this.database);
  }

  release(eventId: string): void {
    this.database.prepare("DELETE FROM happyrobot_incident_events WHERE event_id = ? AND response_json IS NULL").run(eventId);
    notifyRemote(this.database);
  }
}
