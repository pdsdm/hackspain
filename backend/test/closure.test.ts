import assert from "node:assert/strict";
import test from "node:test";

import { applyClosure, evaluateClosure } from "../src/domain/closure.js";
import { commitmentIdForAction } from "../src/domain/commitment-link.js";
import { ControlService } from "../src/domain/control-service.js";
import { Engine } from "../src/domain/engine.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { operationReady } from "../src/agents/coordinator/validate.js";
import { openDatabase } from "../src/state/database.js";
import { EventRepository } from "../src/state/event-repository.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";
import { loadWorld } from "../src/world/world.js";
import type { CrisisStateDocument } from "../src/domain/crisis-state.js";

function closedState(): CrisisStateDocument {
  return {
    clock: { simSeconds: 44_400 },
    planVersion: 3,
    spaces: [
      { id: "pabellonB", kind: "pabellon", zone: "sur", capacity: 450, status: "confirmado" },
      { id: "principal", kind: "pabellon", zone: "sur", capacity: 600, status: "cerrado" },
      { id: "accesoSur", kind: "acceso", zone: "sur", status: "operativo" },
    ],
    commitments: [
      { id: "c-pabB", area: "espacios", status: "confirmado", planVersion: 3, updatedAt: 44_300, conditions: [] },
      { id: "c-viejo", area: "espacios", status: "invalidado", planVersion: 2, updatedAt: 44_100, conditions: [] },
    ],
    decisions: [],
    budget: { autonomousLimit: 0, authorized: 0, committed: 0, forecast: 12_150 },
    scriptId: "main",
    scriptCursor: 0,
    nextScriptAt: null,
    guestGroups: [{ id: "g-propios", count: 450, assignedSpaceId: "pabellonB", confirmedCount: 450 }],
    calls: [{ id: "call-1", status: "terminada" }],
    events: [],
    agentsPaused: false,
    waitingForDecision: null,
    resolved: false,
  } as unknown as CrisisStateDocument;
}

test("la crisis se da por cerrada con plazas confirmadas, condiciones resueltas, aforo y acceso", () => {
  const report = evaluateClosure(closedState(), 0);
  assert.equal(report.closed, true);
  assert.equal(report.seated, 450);
  assert.equal(report.agreed, 1);
  assert.equal(report.pendingConditions, 0);
  assert.match(report.summary, /450 de 450 invitados con plaza confirmada/);
});

test("una sede propuesta o pendiente y una condición crítica dejan un desenlace condicionado", () => {
  for (const status of ["propuesto", "pendiente"]) {
    const state = closedState();
    state.spaces[0]!.status = status;
    state.commitments[0]!.status = "aceptado_condiciones";
    state.commitments[0]!.conditions = ["El recinto todavía no autoriza el uso"];
    (state.guestGroups as Array<Record<string, unknown>>)[0]!.confirmedCount = 0;
    const report = evaluateClosure(state, 0);
    assert.equal(report.closed, false, status);
    assert.equal(report.stalled, true, status);
    assert.match(report.gap, /450 invitados sin plaza confirmada/);
    assert.match(report.gap, /1 condición abierta/);
  }
});

test("no cierra con aforo insuficiente o sin acceso operativo a la zona", () => {
  const capacity = closedState();
  capacity.spaces[0]!.capacity = 400;
  assert.equal(evaluateClosure(capacity, 0).closed, false);
  assert.match(evaluateClosure(capacity, 0).gap, /aforo insuficiente/);

  const access = closedState();
  access.spaces[2]!.status = "cerrado";
  assert.equal(evaluateClosure(access, 0).closed, false);
  assert.match(evaluateClosure(access, 0).gap, /acceso Sur no operativo/);
});

test("no cierra si queda una llamada en vuelo, una tarea abierta o un acuerdo sin respuesta", () => {
  const inFlight = closedState();
  inFlight.calls = [{ id: "call-1", status: "en_curso" }] as unknown as CrisisStateDocument["calls"];
  assert.equal(evaluateClosure(inFlight, 0).closed, false);

  assert.equal(evaluateClosure(closedState(), 1).closed, false);

  const waiting = closedState();
  waiting.commitments[0]!.status = "en_consulta";
  const waitingReport = evaluateClosure(waiting, 0);
  assert.equal(waitingReport.closed, false);
  assert.equal(waitingReport.stalled, true);
  assert.match(waitingReport.gap, /compromiso sin consulta activa/);

  // El Principal está cerrado: un grupo asignado ahí no tiene sede.
  const homeless = closedState();
  (homeless.guestGroups as Array<Record<string, unknown>>)[0]!.assignedSpaceId = "principal";
  assert.equal(evaluateClosure(homeless, 0).closed, false);
});

test("al cerrar deja el coordinador estable y una línea de resumen en la cronología", () => {
  const next = applyClosure(closedState(), 0);
  assert(next);
  assert.equal(next.resolved, true);
  assert.equal(next.coordinatorStatus, "estable");
  const last = (next.events as Array<Record<string, unknown>>).at(-1);
  assert.equal(last?.kind, "acuerdo");
  assert.match(String(last?.text), /Plan cerrado/);
  // Ya cerrado, no vuelve a escribir el mismo resumen en cada evento.
  assert.equal(applyClosure(next, 0), undefined);
});

test("sin nada en marcha y con invitados sin sede el plan queda atascado, no «replanificando»", () => {
  const stuck = closedState();
  (stuck.guestGroups as Array<Record<string, unknown>>)[0]!.assignedSpaceId = "principal";
  const report = evaluateClosure(stuck, 0);
  assert.equal(report.stalled, true);
  assert.match(report.gap, /450 invitados sin sede/);

  stuck.coordinatorStatus = "replanificando";
  const next = applyClosure(stuck, 0);
  assert(next);
  assert.equal(next.coordinatorStatus, "atascado");
  assert.equal(next.resolved, false);
  assert.equal(next.closureSummary, report.gap);
  assert.equal((next.events as Array<Record<string, unknown>>).at(-1)?.kind, "espera");
  // Ya está dicho: no repite la línea en cada evento.
  assert.equal(applyClosure(next, 0), undefined);

  // Un giro reabre la crisis: el resumen del cierre anterior no puede quedarse en pantalla.
  const reopened = closedState();
  reopened.closureSummary = "Plan cerrado a las 12:02 · 600 de 600 invitados con sede";
  reopened.resolved = false;
  reopened.commitments[0]!.status = "en_consulta";
  const cleaned = applyClosure(reopened, 1);
  assert(cleaned);
  assert.equal(cleaned.closureSummary, undefined);

  // Con una llamada en marcha no está atascado, está trabajando.
  const working = closedState();
  (working.guestGroups as Array<Record<string, unknown>>)[0]!.assignedSpaceId = "principal";
  working.calls = [{ id: "call-1", status: "en_curso" }] as unknown as CrisisStateDocument["calls"];
  assert.equal(evaluateClosure(working, 0).stalled, false);
});

test("una acción se enlaza con el compromiso de su contraparte, y no adivina si hay empate", () => {
  const state = closedState();
  state.commitments = [
    { id: "c-pabB", area: "espacios", status: "en_consulta", planVersion: 3, updatedAt: 0, counterpart: "Recinto", conditions: [] },
    { id: "c-lounge", area: "espacios", status: "en_consulta", planVersion: 3, updatedAt: 0, counterpart: "Fan Zone Sur", conditions: [] },
  ] as unknown as CrisisStateDocument["commitments"];
  assert.equal(commitmentIdForAction(state, { area: "espacios", counterpart: "Fan Zone Sur" }), "c-lounge");
  assert.equal(commitmentIdForAction(state, { area: "espacios", counterpart: "Nadie conocido" }), undefined);
  assert.equal(commitmentIdForAction(state, { area: "catering", counterpart: "Catering" }), undefined);

  // Caso real del coordinador: no repite el nombre de la contraparte palabra por palabra.
  state.commitments[0]!.counterpart = "Recinto / Pabellón B";
  state.commitments[0]!.title = "Reserva de Pabellón B · 450 plazas";
  state.commitments[1]!.title = "Apertura Lounge Fan Zone Sur · 150 plazas";
  assert.equal(
    commitmentIdForAction(state, {
      area: "espacios",
      counterpart: "Responsable de Pabellón B / Recinto Ferial",
      objective: "Confirmar la reserva del Pabellón B para 450 invitados",
    }),
    "c-pabB",
  );

  state.commitments = [state.commitments[0]!];
  assert.equal(commitmentIdForAction(state, { area: "espacios", counterpart: "Otro nombre" }), "c-pabB");
});

test("un log_event sin texto no ensucia la cronología", () => {
  assert.equal(operationReady({ op: "log_event", kind: "incidencia", text: "" }), false);
  assert.equal(operationReady({ op: "log_event", kind: "incidencia", text: "   " }), false);
  assert.equal(operationReady({ op: "log_event", kind: "incidencia", text: "algo pasa" }), true);
});

test("el resultado de una llamada mueve su compromiso aunque el workflow no devuelva commitmentId", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
    const run = states.ensureActiveRun();
    const initial = structuredClone(run.state);
    initial.spaces.find((item) => item.id === "pabellonB")!.status = "pendiente";
    states.saveState(run.id, initial);
    const planVersion = initial.planVersion;

    const queued = workflows.applyCoordinatorProposal({
      eventId: "evt-cierre-1",
      runId: run.id,
      planVersion,
      reading: "Pabellón Principal cerrado; se consulta Pabellón B.",
      proposal: {
        title: "Plan Sur",
        summary: "Reubicar en Pabellón B",
        rationale: "Mismo lado del circuito",
        cost: null,
        conditions: [],
        allocations: [],
        confirmedNorthGuestIds: [],
        confirmedExternalTransferSeats: 0,
      },
      commitments: [{
        id: "c-pabB",
        title: "Reserva de Pabellón B · 450 plazas",
        area: "espacios",
        status: "en_consulta",
        counterpart: "Recinto",
        conditions: ["Confirmar apertura"],
      }],
      actions: [{
        actionId: "call-espacios",
        area: "espacios",
        kind: "call",
        objective: "Confirmar Pabellón B",
        counterpart: "Recinto",
        dueAt: 44_400,
        reason: "Sin aforo no hay plan.",
        dependsOn: [],
        payload: {},
      }],
      unverified: [],
    });
    const taskId = queued.tasks[0]!.taskId;
    assert.equal(
      (tasks.get(taskId)!.payload as { data?: { commitmentId?: string } }).data?.commitmentId,
      "c-pabB",
    );

    workflows.recordSpecialistResult({
      eventId: "res-cierre-1",
      taskId,
      runId: run.id,
      planVersion: states.ensureActiveRun().state.planVersion,
      status: "completed",
      result: {
        outcome: "accepted_with_conditions",
        summary: "El recinto limita el Pabellón B a 400 plazas y termina a las 13:15.",
        conditions: ["Montaje no termina hasta las 13:15"],
        evidence: { callId: `call-${taskId}` },
        data: {
          spaces: [
            { id: "pabellonB", capacity: 400, readyAt: "13:15" },
            { id: "loungeSur", capacity: -1, readyAt: "cuando termine" },
          ],
        },
      },
    });

    const after = states.ensureActiveRun().state;
    const commitment = after.commitments.find((item) => item.id === "c-pabB");
    assert.equal(commitment?.status, "aceptado_condiciones");
    assert.deepEqual(commitment?.conditions, ["Confirmar apertura", "Montaje no termina hasta las 13:15"]);
    assert.equal(after.spaces.find((item) => item.id === "pabellonB")?.capacity, 400);
    assert.equal(after.spaces.find((item) => item.id === "pabellonB")?.readyAt, 47_700);
    assert.equal(after.spaces.find((item) => item.id === "pabellonB")?.status, "pendiente");
    assert.equal(after.spaces.find((item) => item.id === "loungeSur")?.capacity, 150);
  } finally {
    database.close();
  }
});

test("una tarea abierta del plan anterior se arrastra al plan nuevo y no queda zombi", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
    const run = states.ensureActiveRun();

    const zombie = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "asistentes",
      kind: "sms",
      payload: { objective: "Avisar a los tres grupos", counterpart: "Invitados" },
      idempotencyKey: "plan-viejo:sms-asistentes",
    });

    workflows.applyCoordinatorProposal({
      eventId: "evt-arrastre-1",
      runId: run.id,
      planVersion: run.state.planVersion,
      reading: "Plan nuevo tras el giro.",
      proposal: {
        title: "Plan Sur", summary: "Reubicar", rationale: "Misma zona", cost: null,
        conditions: [], allocations: [], confirmedNorthGuestIds: [], confirmedExternalTransferSeats: 0,
      },
      commitments: [],
      actions: [],
      unverified: [],
    });

    const after = states.ensureActiveRun();
    assert.equal(tasks.get(zombie.id)?.planVersion, after.state.planVersion);
    assert.equal(tasks.get(zombie.id)?.status, "pending");
  } finally {
    database.close();
  }
});

test("una tarea pendiente del plan anterior se cancela si el plan nuevo la reemplaza", () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
    const run = states.ensureActiveRun();
    const old = tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "asistentes",
      kind: "sms",
      payload: { objective: "Aviso antiguo", counterpart: "Invitados" },
      idempotencyKey: "plan-viejo:sms-asistentes",
    });

    workflows.applyCoordinatorProposal({
      eventId: "evt-reemplazo-1",
      runId: run.id,
      planVersion: run.state.planVersion,
      reading: "Plan nuevo con otro aviso.",
      proposal: {
        title: "Plan Sur", summary: "Reubicar", rationale: "Misma zona", cost: null,
        conditions: [], allocations: [], confirmedNorthGuestIds: [], confirmedExternalTransferSeats: 0,
      },
      commitments: [],
      actions: [{
        actionId: "sms-nuevo", area: "asistentes", kind: "sms", objective: "Aviso vigente",
        counterpart: "Invitados", dueAt: 44_400, reason: "Comunicar el plan actual", dependsOn: [], payload: {},
      }],
      unverified: [],
    });

    assert.equal(tasks.get(old.id)?.status, "cancelled");
    const open = tasks.listOpen(run.id);
    assert.equal(open.length, 1);
    assert.equal((open[0]?.payload as { objective?: string }).objective, "Aviso vigente");
  } finally {
    database.close();
  }
});

test("una intervención del responsable se aplica sin esperar a que el coordinador termine", async () => {
  const database = openDatabase(":memory:");
  try {
    const states = new StateRepository(database.connection);
    const tasks = new TaskRepository(database.connection);
    const events = new EventRepository(database.connection);
    const control = new ControlService(states);
    const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const instance = new Engine(states, control, events, tasks, { states, tasks, workflows }, {
      mode: "llm",
      world: loadWorld(),
      completeFn: async () => {
        await blocked;
        return JSON.stringify({
          reading: "ok", planVersion: 1, coordinatorStatus: "replanificando", actions: [],
          commitments: [], assignments: [], decision: null, unverified: [], operations: [], queries: [], done: true,
        });
      },
    });

    const slow = instance.handle({ source: "chat", kind: "free_text", text: "el principal se cierra" });
    const paused = instance.handle({ source: "human", kind: "pause" });
    // Sin esperar a la cola: el coordinador sigue bloqueado y la pausa ya está en el estado.
    assert.equal(states.ensureActiveRun().state.agentsPaused, true);
    release();
    await Promise.all([slow, paused]);
  } finally {
    database.close();
  }
});
