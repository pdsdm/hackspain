import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyOperation, hasNorthAccess } from "../src/domain/apply-coordinator.js";
import { parseCrisisState, type CrisisStateDocument } from "../src/domain/crisis-state.js";
import { loadWorld } from "../src/world/world.js";

function crisis(): CrisisStateDocument {
  return parseCrisisState(
    JSON.parse(readFileSync(new URL("../fixtures/madring/states/crisis.json", import.meta.url), "utf8")),
  );
}

test("set_place rejects confirmado and accepts cerrado", () => {
  const world = loadWorld();
  const draft = crisis();
  const denied = applyOperation(
    draft,
    world,
    { op: "set_place", id: "accesoSur", status: "confirmado" },
    new Set(),
  );
  assert.equal(denied.ok, false);
  const ok = applyOperation(draft, world, { op: "set_place", id: "accesoSur", status: "cerrado" }, new Set());
  assert.equal(ok.ok, true);
  assert.equal(draft.spaces.find((space) => space.id === "accesoSur")?.status, "cerrado");
});

test("reroute_shuttle to Norte without access is rejected", () => {
  const world = loadWorld();
  const draft = crisis();
  assert.equal(hasNorthAccess(draft), false);
  const denied = applyOperation(
    draft,
    world,
    { op: "reroute_shuttle", id: "BUS-01", destinationId: "accesoNorte" },
    new Set(),
  );
  assert.equal(denied.ok, false);
  const ok = applyOperation(
    draft,
    world,
    { op: "reroute_shuttle", id: "BUS-01", destinationId: "esperaSur" },
    new Set(),
  );
  assert.equal(ok.ok, true);
  const shuttle = (draft.shuttles as Array<Record<string, unknown>>).find((item) => item.id === "BUS-01");
  assert.equal(shuttle?.destinationId, "esperaSur");
});

test("redirect_delivery rejects a closed dock", () => {
  const world = loadWorld();
  const draft = crisis();
  const denied = applyOperation(
    draft,
    world,
    { op: "redirect_delivery", id: "CAT-01", dockId: "muelleSur" },
    new Set(),
  );
  assert.equal(denied.ok, false);
});

test("cancel_action requires an open task id", () => {
  const world = loadWorld();
  const draft = crisis();
  const denied = applyOperation(
    draft,
    world,
    { op: "cancel_action", taskId: "missing", reason: "obsoleto" },
    new Set(),
  );
  assert.equal(denied.ok, false);
  const ok = applyOperation(
    draft,
    world,
    { op: "cancel_action", taskId: "task-1", reason: "obsoleto" },
    new Set(["task-1"]),
  );
  assert.equal(ok.ok, true);
});

test("redirect_vehicle moves a courier to an open dock and rejects a closed one", () => {
  const world = loadWorld();
  const draft = crisis();
  const courier = (draft.vehicles as Array<Record<string, unknown>>).find((item) => item.id === "REP-01")!;
  assert.equal(courier.destinationId, "muelleSur");
  const denied = applyOperation(draft, world, { op: "redirect_vehicle", id: "REP-01", destinationId: "muelleSur" }, new Set());
  assert.equal(denied.ok, false);
  const ok = applyOperation(draft, world, { op: "redirect_vehicle", id: "REP-01", destinationId: "muelleEste", note: "Muelle Sur cerrado" }, new Set());
  assert.equal(ok.ok, true);
  assert.equal(courier.destinationId, "muelleEste");
  assert.equal(courier.status, "desviado");
  assert.equal(courier.note, "Muelle Sur cerrado");
  assert.ok(Number(courier.arriveAt) > Number(draft.clock.simSeconds));
  const unknown = applyOperation(draft, world, { op: "redirect_vehicle", id: "TX-99", destinationId: "muelleEste" }, new Set());
  assert.equal(unknown.ok, false);
});
