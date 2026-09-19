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
