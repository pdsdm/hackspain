import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { applyOperation, hasNorthAccess } from "../src/domain/apply-coordinator.js";
import { parseCrisisState, type CrisisStateDocument } from "../src/domain/crisis-state.js";
import { clearLocateCache, findPlaceInWorld, setLocateFetch } from "../src/world/locate.js";
import { loadWorld } from "../src/world/world.js";

function crisis(): CrisisStateDocument {
  return parseCrisisState(
    JSON.parse(readFileSync(new URL("../fixtures/madring/states/crisis.json", import.meta.url), "utf8")),
  );
}

test("set_place rejects confirmado and accepts cerrado", async () => {
  const world = loadWorld();
  const draft = crisis();
  const denied = await applyOperation(
    draft,
    world,
    { op: "set_place", id: "accesoSur", status: "confirmado" },
    new Set(),
  );
  assert.equal(denied.ok, false);
  const ok = await applyOperation(draft, world, { op: "set_place", id: "accesoSur", status: "cerrado" }, new Set());
  assert.equal(ok.ok, true);
  assert.equal(draft.spaces.find((space) => space.id === "accesoSur")?.status, "cerrado");
});

test("reroute_shuttle to Norte without access is rejected", async () => {
  const world = loadWorld();
  const draft = crisis();
  assert.equal(hasNorthAccess(draft), false);
  const denied = await applyOperation(
    draft,
    world,
    { op: "reroute_shuttle", id: "BUS-01", destinationId: "accesoNorte" },
    new Set(),
  );
  assert.equal(denied.ok, false);
  const ok = await applyOperation(
    draft,
    world,
    { op: "reroute_shuttle", id: "BUS-01", destinationId: "esperaSur" },
    new Set(),
  );
  assert.equal(ok.ok, true);
  const shuttle = (draft.shuttles as Array<Record<string, unknown>>).find((item) => item.id === "BUS-01");
  assert.equal(shuttle?.destinationId, "esperaSur");
});

test("redirect_delivery rejects a closed dock", async () => {
  const world = loadWorld();
  const draft = crisis();
  const denied = await applyOperation(
    draft,
    world,
    { op: "redirect_delivery", id: "CAT-01", dockId: "muelleSur" },
    new Set(),
  );
  assert.equal(denied.ok, false);
});

test("cancel_action requires an open task id", async () => {
  const world = loadWorld();
  const draft = crisis();
  const denied = await applyOperation(
    draft,
    world,
    { op: "cancel_action", taskId: "missing", reason: "obsoleto" },
    new Set(),
  );
  assert.equal(denied.ok, false);
  const ok = await applyOperation(
    draft,
    world,
    { op: "cancel_action", taskId: "task-1", reason: "obsoleto" },
    new Set(["task-1"]),
  );
  assert.equal(ok.ok, true);
});

test("redirect_vehicle moves a courier to an open dock and rejects a closed one", async () => {
  const world = loadWorld();
  const draft = crisis();
  const courier = (draft.vehicles as Array<Record<string, unknown>>).find((item) => item.id === "REP-01")!;
  assert.equal(courier.destinationId, "muelleSur");
  const denied = await applyOperation(draft, world, { op: "redirect_vehicle", id: "REP-01", destinationId: "muelleSur" }, new Set());
  assert.equal(denied.ok, false);
  const ok = await applyOperation(draft, world, { op: "redirect_vehicle", id: "REP-01", destinationId: "muelleEste", note: "Muelle Sur cerrado" }, new Set());
  assert.equal(ok.ok, true);
  assert.equal(courier.destinationId, "muelleEste");
  assert.equal(courier.status, "desviado");
  assert.equal(courier.note, "Muelle Sur cerrado");
  assert.ok(Number(courier.arriveAt) > Number(draft.clock.simSeconds));
  const unknown = await applyOperation(draft, world, { op: "redirect_vehicle", id: "TX-99", destinationId: "muelleEste" }, new Set());
  assert.equal(unknown.ok, false);
});

test("findPlaceInWorld matches names without a hardcoded alias map", () => {
  const world = loadWorld();
  assert.equal(findPlaceInWorld(world, "Chamartín")?.id, "chamartin");
  assert.equal(findPlaceInWorld(world, "plaza de castilla")?.id, "castilla");
  assert.equal(findPlaceInWorld(world, "Aeropuerto T4")?.id, "t4");
});

test("spawn_vehicle creates a trip from a named world origin", async () => {
  const world = loadWorld();
  const draft = crisis();
  const ok = await applyOperation(
    draft,
    world,
    {
      op: "spawn_vehicle",
      id: "MOV-TEST",
      who: "Recogida de prueba",
      from: "Chamartín",
      destinationId: "esperaSur",
      counterpart: "Transportista",
    },
    new Set(),
  );
  assert.equal(ok.ok, true);
  const spawned = (draft.vehicles as Array<Record<string, unknown>>).find((item) => item.id === "MOV-TEST");
  assert.equal(spawned?.from, "chamartin");
  assert.equal(spawned?.destinationId, "esperaSur");
  assert.equal(spawned?.status, "en_ruta");
  assert.ok(Array.isArray(spawned?.route) && (spawned.route as unknown[]).length >= 2);
});

test("spawn_vehicle geocodes an origin that is not in the world", async () => {
  clearLocateCache();
  setLocateFetch(async (input) => {
    const url = String(input);
    if (url.includes("nominatim")) {
      return new Response(JSON.stringify([{ lat: "40.42", lon: "-3.70", display_name: "Taller de prueba, Madrid" }]), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        routes: [{ duration: 1500, geometry: { coordinates: [[-3.7, 40.42], [-3.6165, 40.464]] } }],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  const world = loadWorld();
  const draft = crisis();
  const ok = await applyOperation(
    draft,
    world,
    {
      op: "spawn_vehicle",
      id: "MOV-GEO",
      who: "Pieza de motor",
      from: "taller de prueba inventado en madrid",
      destinationId: "paddockNorte",
      counterpart: "Mensajería",
    },
    new Set(),
  );
  assert.equal(ok.ok, true);
  const spawned = (draft.vehicles as Array<Record<string, unknown>>).find((item) => item.id === "MOV-GEO");
  assert.equal(spawned?.origin, "Taller de prueba, Madrid");
  assert.equal(spawned?.destinationId, "paddockNorte");
  assert.deepEqual(spawned?.originPos, [40.42, -3.7]);
  clearLocateCache();
  setLocateFetch(globalThis.fetch.bind(globalThis));
});
