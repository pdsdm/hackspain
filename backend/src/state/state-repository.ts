import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type { DatabaseSync } from "node:sqlite";

import { notifyRemote } from "./database.js";

import type { InitialFixture } from "../config.js";
import { ContractError, type TranscriptLine } from "../contracts/api.js";
import {
  parseCrisisState,
  toPublicState,
  type CrisisStateDocument,
} from "../domain/crisis-state.js";
import type { GuestAllocation } from "../domain/plan-rules.js";
import { mergeTranscriptLines } from "../domain/transcript.js";

function stateUrl(fixture: string): URL {
  return new URL(`../../fixtures/madring/states/${fixture}.json`, import.meta.url);
}

interface RunRow {
  id: string;
  scenario_id: string;
  state_json: string;
}

interface MetadataRow {
  value: string;
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

  initializeDeployment(deploymentId: string): DemoRun {
    const previous = this.database
      .prepare("SELECT value FROM app_metadata WHERE key = 'deployment_id'")
      .get() as MetadataRow | undefined;
    const active = this.getActiveRun();
    if (previous?.value === deploymentId && active) return active;

    const state = this.loadFixture();
    state.events = [];
    state.calls = [];
    state.decisions = [];
    state.incidentsApplied = [];
    state.incidentTexts = [];
    state.twistsApplied = [];
    state.waitingForDecision = null;
    state.agentsPaused = false;
    state.coordinatorStatus = "estable";
    state.clock.live = false;
    delete state.clock.liveSeed;
    delete state.clock.liveMode;
    delete state.clock.liveIndex;
    delete state.clock.liveLastAt;
    delete state.coordinatorBusy;

    const run = this.createRun(state);
    run.state.clock.paused = true;
    this.saveState(run.id, run.state);
    this.database
      .prepare(`
        INSERT INTO app_metadata (key, value)
        VALUES ('deployment_id', ?)
        ON CONFLICT (key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `)
      .run(deploymentId);
    return run;
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

    notifyRemote(this.database);
    return { id, scenarioId, state: parsed };
  }

  reset(fixture?: InitialFixture): DemoRun {
    return this.createRun(this.loadFixture(fixture ?? this.initialFixture));
  }

  /**
   * Sella cada línea nueva de cronología con la hora real en que se persiste.
   *
   * `time` son segundos del reloj del escenario (43200 = 12:00), que es lo que necesitan la
   * cuenta atrás y el guion. Pero el panel enseña la cronología como un registro de lo que
   * está pasando ahora, y ahí la hora del escenario despista. Se sella aquí, en el único
   * sitio por el que pasan todas las escrituras, en vez de en los doce que crean eventos.
   */
  private stampTimeline(state: CrisisStateDocument): void {
    if (!Array.isArray(state.events)) return;
    const now = Date.now();
    for (const event of state.events) {
      if (event && typeof event === "object" && !Array.isArray(event)) {
        const record = event as Record<string, unknown>;
        if (typeof record.realAt !== "number") record.realAt = now;
      }
    }
  }

  saveState(runId: string, state: CrisisStateDocument): void {
    this.stampTimeline(state);
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
    notifyRemote(this.database);
  }

  appendCallTranscript(input: {
    runId: string;
    callId: string;
    transcript: TranscriptLine[];
    sessionId?: string;
    happyrobotRunId?: string;
  }): { added: number; total: number } {
    const active = this.ensureActiveRun();
    if (active.id !== input.runId) return { added: 0, total: 0 };
    const calls = Array.isArray(active.state.calls)
      ? active.state.calls.filter((call): call is Record<string, unknown> => typeof call === "object" && call !== null)
      : [];
    const call = calls.find((candidate) => candidate.id === input.callId);
    if (!call) throw new ContractError(`Call not found: ${input.callId}`, 404);
    const currentSessionId = call._happyrobotSessionId;
    if (input.sessionId && currentSessionId && currentSessionId !== input.sessionId) {
      throw new ContractError("session_id belongs to another HappyRobot session", 409);
    }
    const currentRunId = call._happyrobotRunId;
    if (input.happyrobotRunId && currentRunId && currentRunId !== input.happyrobotRunId) {
      throw new ContractError("happyrobot_run_id belongs to another HappyRobot run", 409);
    }
    const current = Array.isArray(call.transcript) ? call.transcript as TranscriptLine[] : [];
    const merged = mergeTranscriptLines(current, input.transcript);
    call.transcript = merged.transcript;
    if (input.sessionId) call._happyrobotSessionId = input.sessionId;
    if (input.happyrobotRunId) call._happyrobotRunId = input.happyrobotRunId;
    active.state.calls = calls;
    if (merged.added > 0 || input.sessionId || input.happyrobotRunId) {
      this.saveState(active.id, active.state);
    }
    return { added: merged.added, total: merged.transcript.length };
  }

  savePlan(
    runId: string,
    expectedPlanVersion: number,
    state: CrisisStateDocument,
    allocations: GuestAllocation[],
  ): void {
    this.stampTimeline(state);
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
    notifyRemote(this.database);
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
