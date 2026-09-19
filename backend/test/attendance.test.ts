import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { SATURATION_WAITING, advanceAttendance, burstAt, profileFactor } from "../src/domain/attendance.js";
import { parseCrisisState } from "../src/domain/crisis-state.js";

function calm() {
  return parseCrisisState(JSON.parse(readFileSync(new URL("../fixtures/madring/states/calm.json", import.meta.url), "utf8")));
}

function gates(state: ReturnType<typeof calm>): Array<Record<string, unknown>> {
  return state.gates as Array<Record<string, unknown>>;
}

test("la curva tiene picos en la apertura y antes de la carrera", () => {
  const clock = { openingAt: 46800, raceAt: 54000 };
  assert.ok(profileFactor(clock, 46800 + 600) > profileFactor(clock, 46800 - 5400));
  assert.ok(profileFactor(clock, 54000 - 600) > profileFactor(clock, 50000));
  assert.ok(profileFactor(clock, 55000) < profileFactor(clock, 46800 - 5400));
});

test("misma semilla, misma serie de ráfagas y de colas", () => {
  const run = (seed: number) => {
    const state = calm();
    const bursts: string[] = [];
    for (let minute = 0; minute < 120; minute += 1) {
      const from = Number(state.clock.simSeconds) + minute * 60;
      bursts.push(...advanceAttendance(state, from, from + 60, seed).bursts.map((b) => `${b.gateId}:${b.perMin}`));
    }
    return { gates: state.gates, bursts };
  };
  assert.deepEqual(run(7), run(7));
  assert.notDeepEqual(run(7).bursts, run(8).bursts);
  assert.ok(run(7).bursts.length > 0);
});

test("burstAt es determinista por minuto", () => {
  assert.deepEqual(burstAt(3, 41, 4), burstAt(3, 41, 4));
});

test("un acceso ya saturado al arrancar no avisa hasta pasar el enfriamiento, y luego una vez", () => {
  const state = calm();
  const gate = gates(state).find((item) => item.id === "gate-sur")!;
  assert.equal(gate.status, "saturado");
  const first = advanceAttendance(state, 43200, 43260, 1);
  assert.ok(!first.saturated.some((item) => item.gateId === "gate-sur"));
  const second = advanceAttendance(state, 43260, 43320, 1);
  assert.ok(!second.saturated.some((item) => item.gateId === "gate-sur"));
  const later = advanceAttendance(state, 43320, 43200 + 900, 1);
  assert.ok(later.saturated.some((item) => item.gateId === "gate-sur"));
  assert.ok(Number(gate.waiting) > SATURATION_WAITING);
});

test("un acceso cerrado no se mueve", () => {
  const state = calm();
  const gate = gates(state).find((item) => item.id === "gate-oeste")!;
  gate.status = "cerrado";
  const before = { ...gate };
  advanceAttendance(state, 43200, 43800, 1);
  assert.equal(gate.entered, before.entered);
  assert.equal(gate.waiting, before.waiting);
  assert.equal(gate.status, "cerrado");
});

test("un reset conserva la velocidad y la semilla configuradas", async () => {
  const { ControlService } = await import("../src/domain/control-service.js");
  const { openDatabase } = await import("../src/state/database.js");
  const { StateRepository } = await import("../src/state/state-repository.js");
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    new ControlService(states, 7, 30).reset("calm");
    const state = states.ensureActiveRun().state;
    assert.equal(state.clock.seed, 7);
    assert.equal(state.clock.speed, 30);
  } finally {
    database.close();
  }
});

test("el reloj hace llegar a taxis, VIP y repartidores, y no mueve a un vehículo retenido", async () => {
  const { SimulationClock } = await import("../src/domain/clock.js");
  const { ActionExecutor } = await import("../src/actions/executor.js");
  const { loadConfig } = await import("../src/config.js");
  const { WorkflowService } = await import("../src/domain/workflow-service.js");
  const { openDatabase } = await import("../src/state/database.js");
  const { StateRepository } = await import("../src/state/state-repository.js");
  const { TaskRepository } = await import("../src/state/task-repository.js");
  const { WorkflowEventRepository } = await import("../src/state/workflow-event-repository.js");
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const config = { ...loadConfig(), coordinatorMode: "rules" as const, hooks: {}, happyrobotApiKey: undefined };
  const clock = new SimulationClock(states, new ActionExecutor(states, tasks, workflows, config), 60, 1);
  try {
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    state.clock.speed = 3600;
    const vehicles = state.vehicles as Array<Record<string, unknown>>;
    vehicles.find((item) => item.id === "TX-02")!.status = "retenido";
    states.saveState(run.id, state);
    clock.start();
    const started = structuredClone(states.ensureActiveRun().state);
    assert.equal(started.clock.seed, 1);
    started.clock.speed = 3600;
    states.saveState(run.id, started);
    clock.tick();
    const afterState = states.ensureActiveRun().state;
    assert.equal(afterState.clock.seed, 1);
    assert.equal(afterState.clock.attendanceSeed, undefined);
    const after = afterState.vehicles as Array<Record<string, unknown>>;
    assert.equal(after.find((item) => item.id === "VIP-01")!.status, "llegado");
    assert.equal(after.find((item) => item.id === "TX-01")!.status, "llegado");
    assert.equal(after.find((item) => item.id === "TX-02")!.status, "retenido");
    const events = states.ensureActiveRun().state.events as Array<{ text: string }>;
    assert.ok(events.some((event) => event.text.startsWith("VIP-01") && event.text.includes("Paddock")));
  } finally {
    clock.stop();
    database.close();
  }
});
