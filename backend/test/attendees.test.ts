import assert from "node:assert/strict";
import test from "node:test";

import { extract, guessGroupId, toResultData } from "../src/agents/attendees/extract.js";
import { SMS_MAX_CHARS, buildMessage, buildNeedsMessage } from "../src/agents/attendees/templates.js";
import type { AttendeesBrief } from "../src/agents/attendees/types.js";
import { ActionExecutor } from "../src/actions/executor.js";
import { loadConfig } from "../src/config.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

const brief = (groupId: string, extra: Partial<AttendeesBrief> = {}): AttendeesBrief => ({
  groupId,
  groupName: groupId,
  count: 100,
  where: "En ruta",
  assignedSpaceName: "Pabellón B",
  zone: "sur",
  openingAt: 46800,
  ...extra,
});

test("every segment has an SMS under the limit that names the destination and warns about Norte", () => {
  for (const id of ["g-acceso", "g-shuttles", "g-propios"]) {
    const sms = buildMessage(brief(id), "sms");
    assert(sms.length <= SMS_MAX_CHARS, `${id}: ${sms.length} caracteres`);
    assert(sms.includes("Pabellón B"));
    if (id !== "g-acceso") assert(sms.includes("Norte"));
    assert(buildMessage(brief(id), "email").includes(sms.split(".")[0] ?? ""));
  }
  const needs = buildNeedsMessage(brief("g-propios", { needs: "12 accesibilidad" }));
  assert(needs.length <= SMS_MAX_CHARS);
  assert(needs.includes("12 accesibilidad"));
});

test("without a confirmed destination the message promises it later instead of inventing one", () => {
  const sms = buildMessage(brief("g-propios", { assignedSpaceName: undefined }), "sms");
  assert(sms.includes("cuando quede confirmado"));
  assert(!sms.includes("Pabellón"));
});

test("extract keeps sent, delivered and accepted apart and rejects impossible counts", () => {
  const known = new Map([["g-shuttles", 180], ["g-propios", 330]]);
  const ok = extract({ groups: [{ id: "g-shuttles", sent: 180, delivered: 170, accepted: 120 }] }, known);
  assert.deepEqual(ok.issues, []);
  assert.deepEqual(ok.updates, [{ id: "g-shuttles", informedCount: 170, acceptedCount: 120 }]);

  const bad = extract({ groups: [
    { id: "g-shuttles", sent: 180, delivered: 190, accepted: 10 },
    { id: "g-otro", sent: 1, delivered: 1, accepted: 1 },
    { id: "g-propios", sent: 330, delivered: 300, accepted: 12, needsCovered: false, pending: "12 accesibilidad" },
  ] }, known);
  assert.deepEqual(bad.issues.map((issue) => issue.code), ["cuenta_invalida", "grupo_desconocido"]);
  assert.equal(bad.updates[0]?.needs, "12 accesibilidad · pendiente");
  assert.deepEqual(toResultData(bad.updates).guestGroups.length, 1);
  assert.equal(guessGroupId("Avisar a g-shuttles (180 informados)"), "g-shuttles");
});

test("a completed asistentes result moves informedCount and acceptedCount in /state", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
    const config = { ...loadConfig(), coordinatorMode: "rules" as const, hooks: {}, happyrobotApiKey: undefined };
    const executor = new ActionExecutor(states, tasks, workflows, config);
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    const groups = state.guestGroups as Array<Record<string, unknown>>;
    const shuttles = groups.find((group) => group.id === "g-shuttles")!;
    shuttles.informedCount = 0;
    shuttles.acceptedCount = 0;
    states.saveState(run.id, state);

    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "asistentes",
      kind: "sms",
      payload: { objective: "Avisar del nuevo destino", counterpart: "g-shuttles (180 en ruta)" },
      idempotencyKey: "sms-shuttles",
    });
    executor.pump();
    executor.fireDue(Number(run.state.clock.simSeconds) + 60);

    const after = (states.ensureActiveRun().state.guestGroups as Array<Record<string, unknown>>).find((group) => group.id === "g-shuttles")!;
    assert(Number(after.informedCount) > 0);
    assert(Number(after.informedCount) <= Number(after.count));
    assert.equal(after.acceptedCount, after.informedCount);
    const call = (states.ensureActiveRun().state.calls as Array<Record<string, unknown>>)[0]!;
    assert.equal(call.channel, "sms");
    assert.equal(call.simulated, true);
  } finally {
    database.close();
  }
});
