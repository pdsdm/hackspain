import assert from "node:assert/strict";
import test from "node:test";

import { buildReplan } from "../src/agents/coordinator/replan.js";
import { liveCoordinatorInput } from "../src/agents/coordinator/scenario.js";
import type { CoordinatorOutput } from "../src/agents/coordinator/types.js";
import { validateOutput } from "../src/agents/coordinator/validate.js";
import type { InitialFixture } from "../src/config.js";
import { ControlService } from "../src/domain/control-service.js";
import { Engine } from "../src/domain/engine.js";
import { WorkflowService } from "../src/domain/workflow-service.js";
import { openDatabase } from "../src/state/database.js";
import { EventRepository } from "../src/state/event-repository.js";
import { StateRepository } from "../src/state/state-repository.js";
import { TaskRepository } from "../src/state/task-repository.js";
import { WorkflowEventRepository } from "../src/state/workflow-event-repository.js";
import { loadWorld } from "../src/world/world.js";
import type { TwistId } from "../src/contracts/api.js";

function harness(fixture: InitialFixture = "recovered") {
  const database = openDatabase(":memory:");
  const states = new StateRepository(database.connection);
  const tasks = new TaskRepository(database.connection);
  const events = new EventRepository(database.connection);
  const control = new ControlService(states);
  const workflows = new WorkflowService(states, tasks, new WorkflowEventRepository(database.connection));
  const instance = new Engine(
    states,
    control,
    events,
    tasks,
    { states, tasks, workflows },
    { mode: "rules", world: loadWorld() },
  );
  states.reset(fixture);
  return { database, states, tasks, control, instance };
}

function afterTwist(
  twist: TwistId,
  fixture: InitialFixture = "recovered",
): { output: CoordinatorOutput; state: ReturnType<StateRepository["ensureActiveRun"]>["state"] } {
  const { database, states, tasks, control } = harness(fixture);
  try {
    const before = states.ensureActiveRun();
    tasks.enqueue({
      runId: before.id,
      planVersion: before.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "Confirmar Lounge Sur", counterpart: "Recinto" },
      idempotencyKey: "old-lounge",
    });
    control.applyTwist(twist);
    const run = states.ensureActiveRun();
    const output = buildReplan(run.state, twist, tasks.listOpen(run.id));
    assert.ok(output, `expected a replan for ${twist}`);
    return { output, state: run.state };
  } finally {
    database.close();
  }
}

function recontact(output: CoordinatorOutput) {
  return output.actions.filter((action) => action.area === "asistentes");
}

test("lounge_unavailable invalidates Lounge Sur commitments and bumps planVersion", () => {
  const { output, state } = afterTwist("lounge_unavailable");
  assert.equal(state.planVersion, 3);
  assert.equal(state.commitments.find((item) => item.id === "c-lounge")?.status, "invalidado");
  assert.ok(output.planVersion >= 3);
  assert.equal(output.commitments.some((item) => item.id === "c-lounge" && item.status === "invalidado"), true);
});

test("lounge_unavailable lists only informed groups whose assigned space changes, with a channel", () => {
  const { output, state } = afterTwist("lounge_unavailable");
  const notices = recontact(output);
  assert.ok(notices.length > 0);
  assert.ok(notices.every((action) => action.channel === "sms" || action.channel === "email"));
  assert.ok(notices.some((action) => action.objective.includes("g-propios") || action.counterpart.includes("Por sus medios")));
  assert.equal(
    notices.some((action) => action.objective.includes("g-acceso") || action.counterpart.includes("acceso Sur")),
    false,
  );
  const acceso = (state.guestGroups as Array<Record<string, unknown>>).find((group) => group.id === "g-acceso");
  assert.equal(acceso?.assignedSpaceId, "pabellonB");
  assert.ok(Number(acceso?.informedCount) > 0);
});

test("lounge_unavailable states the incomplete coverage with numbers and leaves resolved false", () => {
  const { output, state } = afterTwist("lounge_unavailable");
  assert.match(output.reading, /450/);
  assert.match(output.reading, /150/);
  assert.equal(state.resolved, false);
  assert.notEqual(output.coordinatorStatus, "estable");
});

test("reject_split discards B + Lounge Sur and evaluates Norte C at 49500 with the delay", () => {
  const { output, state } = afterTwist("reject_split");
  assert.equal(state.spaces.find((space) => space.id === "pabellonB")?.status, "descartado");
  assert.equal(state.spaces.find((space) => space.id === "loungeSur")?.status, "descartado");
  const north = output.operations?.find((operation) => operation.op === "set_place" && operation.id === "norteC");
  assert.equal(north && "readyAt" in north ? north.readyAt : state.spaces.find((space) => space.id === "norteC")?.readyAt, 49500);
  assert.match(output.reading, /13:45|49500|45/);
  assert.equal(
    output.assignments.some((assignment) => assignment.spaceId === "norteC"),
    false,
    "Norte without an agreed transfer is evaluation, not assignment",
  );
});

test("pabellon_b_400 detects coverage of 550 and does not call the plan viable", () => {
  const { output, state } = afterTwist("pabellon_b_400");
  assert.match(output.reading, /550/);
  assert.equal(state.resolved, false);
  assert.notEqual(output.coordinatorStatus, "estable");
  const assigned = output.assignments.reduce((sum, item) => sum + item.count, 0);
  assert.ok(assigned <= 550);
});

test("a replan never assigns a Sur group to Norte as if they could walk", () => {
  for (const twist of ["lounge_unavailable", "reject_split", "pabellon_b_400"] as const) {
    const { output } = afterTwist(twist);
    assert.equal(
      output.assignments.some((assignment) => assignment.spaceId === "norteC"),
      false,
      twist,
    );
  }
});

test("rules mode after lounge_unavailable enqueues recontact tasks and cancels the old Lounge call", async () => {
  const { database, states, tasks, instance } = harness();
  try {
    const run = states.ensureActiveRun();
    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "espacios",
      kind: "call",
      payload: { objective: "Confirmar Lounge Sur", counterpart: "Recinto" },
      idempotencyKey: "old-lounge",
    });
    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "catering",
      kind: "call",
      payload: { objective: "Confirmar menús sin gluten en Pabellón B", counterpart: "Sabor Ibérico" },
      idempotencyKey: "catering-menus",
    });
    await instance.handle({
      source: "jury",
      kind: "lounge_unavailable",
      payload: { twist: "lounge_unavailable" },
    });
    const next = states.ensureActiveRun();
    assert.equal(next.state.resolved, false);
    assert.match(String(next.state.events.at(-1)?.text ?? next.state.events.map((event) => event.text).join(" ")), /450/);
    const open = tasks.listOpen(next.id);
    assert.equal(open.some((task) => task.idempotencyKey === "old-lounge"), false);
    assert.equal(
      (database.connection.prepare("SELECT status FROM dispatch_tasks WHERE idempotency_key = 'catering-menus'").get() as { status: string }).status,
      "pending",
    );
    assert.ok(open.some((task) => task.area === "asistentes" && task.kind === "sms"));
    assert.equal(open.some((task) => String((task.payload as { counterpart?: string }).counterpart ?? "").includes("acceso Sur")), false);
    const groups = next.state.guestGroups as Array<Record<string, unknown>>;
    assert.equal(groups.find((group) => group.id === "g-acceso")?.assignedSpaceId, "pabellonB");
    assert.equal(groups.find((group) => group.id === "g-shuttles")?.assignedSpaceId, "pabellonB");
    assert.equal(next.state.spaces.find((space) => space.id === "norteC")?.status, "propuesto");
    assert.equal(next.state.commitments.find((item) => item.id === "c-norte150")?.status, "propuesto");
  } finally {
    database.close();
  }
});

test("a task the replan spares is carried to the new plan and still dispatches", async () => {
  const { database, states, tasks, instance } = harness();
  try {
    const run = states.ensureActiveRun();
    tasks.enqueue({
      runId: run.id,
      planVersion: run.state.planVersion,
      area: "catering",
      kind: "call",
      payload: { objective: "Confirmar menús sin gluten en Pabellón B", counterpart: "Sabor Ibérico" },
      idempotencyKey: "catering-menus",
    });
    await instance.handle({
      source: "jury",
      kind: "lounge_unavailable",
      payload: { twist: "lounge_unavailable" },
    });
    const next = states.ensureActiveRun();
    const claimed: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const task = tasks.claimNext();
      if (!task) break;
      claimed.push(task.idempotencyKey);
      tasks.recordResult(task.id, `done-${task.idempotencyKey}`, {});
    }
    assert.ok(claimed.includes("catering-menus"), claimed.join(", "));
    const leftover = tasks.listOpen(next.id);
    assert.equal(leftover.length, 0, leftover.map((task) => task.idempotencyKey).join(", "));
  } finally {
    database.close();
  }
});

test("the reading only calls seats confirmed when the space really is", () => {
  const confirmed = afterTwist("lounge_unavailable").output.reading;
  assert.match(confirmed, /450 plazas confirmadas/);
  const pending = afterTwist("lounge_unavailable", "proposal").output.reading;
  assert.doesNotMatch(pending, /450 plazas confirmadas/);
  assert.match(pending, /450/);
  assert.match(pending, /0 confirmadas/);
});

test("the reading names the spaces that still count, not the discarded ones", async () => {
  const { database, states, instance } = harness();
  try {
    await instance.handle({ source: "jury", kind: "lounge_unavailable", payload: { twist: "lounge_unavailable" } });
    await instance.handle({ source: "jury", kind: "pabellon_b_400", payload: { twist: "pabellon_b_400" } });
    const reading = String(states.ensureActiveRun().state.events.at(-1)?.text ?? "");
    assert.match(reading, /400 de 600/);
    assert.doesNotMatch(reading, /Lounge/);
  } finally {
    database.close();
  }
});

test("every deterministic replan passes the coordinator validator", () => {
  for (const twist of ["lounge_unavailable", "reject_split", "pabellon_b_400"] as const) {
    const { output, state } = afterTwist(twist);
    const { issues } = validateOutput(structuredClone(output), liveCoordinatorInput(state));
    assert.deepEqual(issues, [], `${twist}: ${JSON.stringify(issues)}`);
  }
});

test("a twist still replans while an escalation is pending approval", async () => {
  const { database, states, tasks, instance } = harness("proposal");
  try {
    const before = states.ensureActiveRun();
    assert.equal(before.state.waitingForDecision, "d-plan-sur");
    assert.ok(before.state.budget.forecast > before.state.budget.authorized);
    await instance.handle({
      source: "jury",
      kind: "lounge_unavailable",
      payload: { twist: "lounge_unavailable" },
    });
    const next = states.ensureActiveRun();
    assert.ok(next.state.planVersion > before.state.planVersion);
    assert.equal(next.state.spaces.find((space) => space.id === "norteC")?.status, "propuesto");
    assert.ok(tasks.listOpen(next.id).some((task) => task.area === "espacios"));
  } finally {
    database.close();
  }
});

test("reject_split recontact tasks become claimable after the Norte call completes", async () => {
  const { database, states, tasks, instance } = harness();
  try {
    await instance.handle({
      source: "jury",
      kind: "reject_split",
      payload: { twist: "reject_split" },
    });
    const run = states.ensureActiveRun();
    const groups = run.state.guestGroups as Array<Record<string, unknown>>;
    assert.equal(groups.find((group) => group.id === "g-acceso")?.assignedSpaceId ?? null, null);
    assert.equal(groups.find((group) => group.id === "g-shuttles")?.assignedSpaceId ?? null, null);

    const first = tasks.claimNext();
    assert.equal(first?.idempotencyKey, `replan-${run.state.planVersion}:a-norte`);
    tasks.recordResult(first!.id, "norte-ok", { summary: "Norte C propuesto" });

    const rest: string[] = [];
    for (let i = 0; i < 10; i += 1) {
      const next = tasks.claimNext();
      if (!next) break;
      rest.push(next.idempotencyKey);
      tasks.recordResult(next.id, `done-${next.idempotencyKey}`, {});
    }
    assert.ok(rest.some((key) => key.endsWith(":a-traslado")));
    assert.ok(rest.some((key) => key.includes("recontact-g-acceso")));
    const leftover = tasks.listOpen(run.id);
    assert.equal(leftover.length, 0, leftover.map((task) => task.idempotencyKey).join(", "));
  } finally {
    database.close();
  }
});
