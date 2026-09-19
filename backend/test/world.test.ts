import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";

import { parseCrisisState } from "../src/domain/crisis-state.js";
import {
  affectedBy,
  alternativesFor,
  loadWorld,
  routeTo,
} from "../src/world/world.js";

const crisis = parseCrisisState(
  JSON.parse(readFileSync(new URL("../fixtures/madring/states/crisis.json", import.meta.url), "utf8")),
);

test("alternativesFor prefers the same zone and skips closed places", () => {
  const world = loadWorld();
  const options = alternativesFor(world, crisis, "muelleSur");
  assert.ok(options.some((place) => place.id === "muelleEste" && place.requiresTransfer === false));
  assert.ok(!options.some((place) => place.id === "muelleSur"));
});

test("affectedBy finds shuttles, groups and commitments tied to a place", () => {
  const world = loadWorld();
  const affected = affectedBy(crisis, world, "accesoSur");
  assert.equal(affected.shuttles.length, 4);
  assert.ok(affected.guestGroups.some((group) => group.id === "g-acceso"));
  assert.ok(affected.commitments.length >= 1);
});

test("routeTo marks the exterior transfer as crossing zones", () => {
  const world = loadWorld();
  const local = routeTo(world, "chamartin", "accesoSur");
  assert.equal(local.crossesZone, false);
  assert.ok(local.minutes > 0);
  const north = routeTo(world, "accesoSur", "accesoNorte");
  assert.equal(north.crossesZone, true);
});
