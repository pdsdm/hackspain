import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { DatabaseSync } from "node:sqlite";

import type { InitialFixture } from "../config.js";
import {
  parseCrisisState,
  toPublicState,
  type CrisisStateDocument,
} from "../domain/crisis-state.js";
import type { GuestAllocation } from "../domain/plan-rules.js";

function stateUrl(fixture: string): URL {
  return new URL(`../../fixtures/madring/states/${fixture}.json`, import.meta.url);
}

interface RunRow {
  id: string;
  scenario_id: string;
  state_json: string;
}

export interface DemoRun {
  id: string;
  scenarioId: string;
  state: CrisisStateDocument;
}

export class StateRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly initialFixture: InitialFixture = "calm",
  ) {}

  loadFixture(fixture: InitialFixture = this.initialFixture): CrisisStateDocument {
    return parseCrisisState(JSON.parse(readFileSync(stateUrl(fixture), "utf8")));
  }

  ensureActiveRun(): DemoRun {
    return this.getActiveRun() ?? this.createRun(this.loadFixture());
  }

  getActiveRun(): DemoRun | undefined {
    const row = this.database
      .prepare(`
        SELECT id, scenario_id, state_json
        FROM demo_runs
        WHERE active = 1
      `)
      .get() as RunRow | undefined;

    return row ? this.toRun(row) : undefined;
  }

  createRun(state: CrisisStateDocument, scenarioId = "madring-hospitality"): DemoRun {
    const id = randomUUID();
    const parsed = parseCrisisState(state);
    // Los fixtures son instantáneas pausadas; una ejecución siempre arranca con el reloj vivo.
    parsed.clock.paused = false;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("UPDATE demo_runs SET active = 0 WHERE active = 1").run();
      this.database
        .prepare(`
          INSERT INTO demo_runs (id, scenario_id, state_json)
          VALUES (?, ?, ?)
        `)
        .run(id, scenarioId, JSON.stringify(parsed));
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }

    return { id, scenarioId, state: parsed };
  }

  reset(fixture?: InitialFixture): DemoRun {
    return this.createRun(this.loadFixture(fixture ?? this.initialFixture));
  }

  saveState(runId: string, state: CrisisStateDocument): void {
    const parsed = parseCrisisState(state);
    const result = this.database
      .prepare(`
        UPDATE demo_runs
        SET state_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND active = 1
      `)
      .run(JSON.stringify(parsed), runId);

    if (result.changes !== 1) {
      throw new Error(`Active demo run not found: ${runId}`);
    }
  }

  savePlan(
    runId: string,
    expectedPlanVersion: number,
    state: CrisisStateDocument,
    allocations: GuestAllocation[],
  ): void {
    const parsed = parseCrisisState(state);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.database
        .prepare(`
          UPDATE demo_runs
          SET state_json = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND active = 1
            AND json_extract(state_json, '$.planVersion') = ?
        `)
        .run(JSON.stringify(parsed), runId, expectedPlanVersion);

      if (result.changes !== 1) {
        throw new Error(`Stale or inactive demo run: ${runId}`);
      }

      this.database.prepare("DELETE FROM allocations WHERE run_id = ?").run(runId);
      const insert = this.database.prepare(`
        INSERT INTO allocations (run_id, guest_id, space_id, status, plan_version)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const allocation of allocations) {
        insert.run(
          runId,
          allocation.guestId,
          allocation.spaceId,
          allocation.status,
          parsed.planVersion,
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getPublicState(): CrisisStateDocument {
    return toPublicState(this.ensureActiveRun().state);
  }

  private toRun(row: RunRow): DemoRun {
    return {
      id: row.id,
      scenarioId: row.scenario_id,
      state: parseCrisisState(JSON.parse(row.state_json)),
    };
  }
}
