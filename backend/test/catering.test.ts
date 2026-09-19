import assert from "node:assert/strict";
import test from "node:test";

import { extract, guessDeliveryId, parseAnswer, toResultData } from "../src/agents/catering/extract.js";
import { QUESTION_ORDER, SYSTEM_PROMPT, buildUserPrompt } from "../src/agents/catering/prompt.js";
import type { CateringBrief } from "../src/agents/catering/types.js";
import { ActionExecutor } from "../src/actions/executor.js";
import { loadConfig } from "../src/config.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";

const brief: CateringBrief = {
  counterpart: "Responsable de catering",
  headcount: 600,
  openingAt: 46800,
  dietaryNeeds: "38 dieta",
  deliveries: [
    { id: "CAT-01", name: "CAT-01 · 360 servicios", services: 360, dockId: "muelleEste", dockName: "Muelle Este Sur", arriveAt: 45600 },
    { id: "CAT-02", name: "CAT-02 · 240 servicios", services: 240, dockId: "muelleEste", dockName: "Muelle Este Sur", arriveAt: 47100 },
  ],
};

test("the script asks quantities, dock, time, dietary needs, staff and cost in that order", () => {
  assert.deepEqual(QUESTION_ORDER.map((q) => q.key), ["cantidades", "muelle", "hora", "requisitos alimentarios", "personal", "coste"]);
  const positions = QUESTION_ORDER.map((q) => SYSTEM_PROMPT.indexOf(`${q.key}:`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  const user = buildUserPrompt(brief);
  assert(user.includes("CAT-02"));
  assert(user.includes("Muelle Este Sur"));
  assert(user.includes("38 dieta"));
});

test("a yes with a dock condition becomes a conditional commitment and a dependency, not a rejection", () => {
  const { result, issues } = extract(
    {
      callId: "call-catering-1",
      counterpart: "Proveedor",
      deliveries: [
        { id: "CAT-01", feasible: "si", dockId: "muelleEste", arriveAt: "12:40", services: 360, dietaryCovered: true, staffAtDock: "1 de recepción", cost: 400, conditions: [] },
        { id: "CAT-02", feasible: "condicionada", dockId: "muelleEste", arriveAt: "13:15", dietaryCovered: true, conditions: ["un miembro de recepción debe abrir el muelle este"] },
      ],
    },
    brief,
  );
  assert.deepEqual(issues, []);
  const [first, second] = result.deliveryUpdates;
  assert.equal(first?.status, "confirmada");
  assert.equal(first?.arriveAt, 45600);
  assert.equal(second?.status, "programada");
  assert.equal(second?.arriveAt, 47700);
  assert(second?.note?.includes("13:15"));
  assert.equal(result.commitments[0]?.status, "en_consulta");
  assert.equal(result.commitments[1]?.status, "aceptado_condiciones");
  assert.equal(result.commitments[1]?.conditions.length, 2);
  assert.equal(result.dependencies[0]?.owner, "recepcion");
  assert.equal(result.forecastDelta, 400);
  assert.deepEqual(result.missing, ["CAT-02: cantidades", "CAT-02: personal", "CAT-02: coste"]);
  assert.equal(toResultData(result.deliveryUpdates).deliveries[0]?.id, "CAT-01");
  assert(!("evidenceCallId" in (toResultData(result.deliveryUpdates).deliveries[0] ?? {})));
});

test("missing data stays empty, a no blocks, no answer changes nothing, and unknown ids are reported", () => {
  const { result, issues } = extract(
    {
      callId: "call-catering-2",
      counterpart: "Proveedor",
      deliveries: [
        { id: "CAT-01", feasible: "no", conditions: [] },
        { id: "CAT-02", feasible: "sin_respuesta" },
        { id: "CAT-09", feasible: "si" },
      ],
    },
    brief,
  );
  assert.deepEqual(issues.map((issue) => issue.code), ["entrega_desconocida"]);
  assert.equal(result.deliveryUpdates[0]?.status, "bloqueada");
  assert.equal(result.deliveryUpdates[1]?.status, undefined);
  assert.equal(result.deliveryUpdates[1]?.dockId, undefined);
  assert.deepEqual(result.commitments, []);
  assert.deepEqual(result.missing, []);
  assert.equal(parseAnswer("no json", brief).issues[0]?.code, "json_invalido");
  assert.equal(parseAnswer(JSON.stringify({ callId: "x", counterpart: "y", deliveries: [{ id: "CAT-01", feasible: "tal vez" }] }), brief).issues[0]?.code, "forma");
  assert.equal(guessDeliveryId("Confirmar cat-02 en el muelle este"), "CAT-02");
});

test("a dietary need not covered adds a condition even when the provider says yes", () => {
  const { result } = extract(
    { callId: "c", counterpart: "p", deliveries: [{ id: "CAT-01", feasible: "si", dietaryCovered: false }] },
    brief,
  );
  assert.equal(result.deliveryUpdates[0]?.status, "programada");
  assert.equal(result.commitments[0]?.status, "aceptado_condiciones");
});

test("a completed catering result moves the delivery in /state but never onto a closed dock", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
    const config = { ...loadConfig(), coordinatorMode: "rules" as const, hooks: {}, happyrobotApiKey: undefined };
    const executor = new ActionExecutor(states, tasks, workflows, config);
    const run = states.ensureActiveRun();
    const state = structuredClone(run.state);
    const deliveries = state.deliveries as Array<Record<string, unknown>>;
    const spaces = state.spaces as Array<Record<string, unknown>>;
    const cat02 = deliveries.find((item) => item.id === "CAT-02")!;
    cat02.dockId = "muelleEste";
    cat02.status = "programada";
    spaces.find((item) => item.id === "muelleEste")!.status = "operativo";
    spaces.find((item) => item.id === "muelleSur")!.status = "cerrado";
    states.saveState(run.id, state);

    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "catering",
      kind: "llamada",
      payload: { objective: "Confirmar CAT-02 en el muelle este", counterpart: "Responsable de catering" },
      idempotencyKey: "call-cat-02",
    });
    executor.pump();
    executor.fireDue(Number(run.state.clock.simSeconds) + 60);

    const after = (states.ensureActiveRun().state.deliveries as Array<Record<string, unknown>>).find((item) => item.id === "CAT-02")!;
    assert.equal(after.status, "confirmada");
    assert.equal(after.dockId, "muelleEste");

    const manual = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "catering",
      kind: "llamada",
      payload: { objective: "Volver al muelle Sur", counterpart: "Responsable de catering" },
      idempotencyKey: "call-cat-02-manual",
    });
    workflows.recordSpecialistResult({
      eventId: "evt-cat-1",
      taskId: manual.id,
      runId: run.id,
      planVersion: run.state.planVersion,
      status: "completed",
      result: {
        outcome: "accepted",
        summary: "Quiere volver al muelle Sur",
        conditions: [],
        evidence: {},
        data: { deliveries: [{ id: "CAT-02", dockId: "muelleSur", status: "confirmada" }, { id: "CAT-99", status: "confirmada" }] },
      },
    });
    const applied = (states.ensureActiveRun().state.deliveries as Array<Record<string, unknown>>).find((item) => item.id === "CAT-02")!;
    assert.equal(applied.dockId, "muelleEste");
    assert.equal(applied.status, "confirmada");
  } finally {
    database.close();
  }
});
