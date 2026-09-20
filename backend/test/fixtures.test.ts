import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildMadringFixtures } from '../fixtures/madring.ts';
import { createFixtureState, type FixtureName } from '../../frontend/src/domain/fixtures.ts';

const { seed, manifest, fixtures, world } = buildMadringFixtures();
const guestById = new Map(seed.guests.map((g) => [g.id, g]));
const expectedCoverage = { calm: 600, normal: 600, crisis: 0, proposal: 0, recovered: 600, lounge_unavailable: 450, pabellon_b_400: 550 };

test('roster conserves 600 people across groups, buses and overlapping needs', () => {
  assert.equal(seed.guests.length, 600);
  assert.equal(guestById.size, 600);
  assert.equal(new Set(seed.guests.map((g) => g.contactRef)).size, 600);
  assert.deepEqual(['g-acceso', 'g-shuttles', 'g-propios'].map((id) => seed.guests.filter((g) => g.groupId === id).length), [90, 180, 330]);
  assert.equal(seed.shuttles.length, 4);
  for (const bus of seed.shuttles) {
    assert.equal(bus.guestIds.length, 45);
    assert.equal(bus.occupiedSeats, bus.capacity);
    assert.ok(bus.guestIds.every((id) => guestById.get(id)?.shuttleId === bus.id));
  }
  const onBuses = seed.shuttles.flatMap((b) => b.guestIds);
  assert.equal(new Set(onBuses).size, 180);
  assert.ok(seed.guests.filter((g) => g.groupId !== 'g-shuttles').every((g) => g.shuttleId === null));
  assert.equal(seed.guests.filter((g) => g.accessibility).length, 12);
  assert.equal(seed.guests.filter((g) => g.dietaryRequirement).length, 38);
  assert.equal(seed.guests.filter((g) => g.accessibility && g.dietaryRequirement).length, 4);
  assert.ok(seed.guests.filter((g) => g.accessibility || g.dietaryRequirement).every((g) => g.groupId === 'g-propios'));
});

test('seed has test-only contacts and does not invent North access or spare transport', () => {
  assert.equal(seed.synthetic, true);
  assert.ok(seed.contacts.every((c) => c.id.startsWith('test-') && c.phone === null && c.email === null));
  assert.ok(seed.guests.every((g) => g.contactRef.startsWith('test-') && g.passZone === 'sur' && !g.northAccessConfirmed));
  for (const transfer of seed.transfers) {
    assert.equal(transfer.via, 'external');
    assert.equal(transfer.requiresNorthAccess, true);
    assert.equal(transfer.status, 'unconfirmed');
    assert.deepEqual(transfer.confirmedTrips, []);
    assert.equal(transfer.driveMinutes + transfer.boardingMinutes + transfer.alightingMinutes, 30);
  }
  assert.equal(seed.receptionStaff.length, 6);
  assert.equal(new Set(seed.receptionStaff.map((s) => s.id)).size, 6);
  const contacts = new Set(seed.contacts.map((c) => c.id));
  assert.ok([...seed.resources, ...seed.shuttles, ...seed.deliveries].every((r) => contacts.has(r.contactRef)));
});

for (const [name, expected] of Object.entries(expectedCoverage)) {
  test(`${name}: allocations, capacities, accessibility and group counters agree`, () => {
    const { state, allocations } = fixtures[name]!;
    const entry = manifest.fixtures[name]!;
    const assigned = allocations.flatMap((a) => a.guestIds);
    assert.equal(assigned.length, new Set(assigned).size, 'A guest cannot occupy two venues');
    assert.ok(assigned.every((id) => guestById.has(id)));
    const confirmed = new Set(allocations.filter((a) => a.status === 'confirmed').flatMap((a) => a.guestIds));
    assert.equal(confirmed.size, expected);
    assert.equal(entry.confirmedGuests, expected);
    assert.equal(entry.unassignedGuestIds.length + confirmed.size, 600);
    assert.deepEqual(new Set(entry.unassignedGuestIds), new Set(seed.guests.filter((g) => !confirmed.has(g.id)).map((g) => g.id)));
    for (const space of state.spaces) {
      const atSpace = allocations.filter((a) => a.spaceId === space.id).flatMap((a) => a.guestIds);
      if (atSpace.length) {
        assert.ok(space.kind === 'pabellon' || space.kind === 'lounge', 'Waiting areas do not count as hospitality coverage');
        assert.ok(atSpace.length <= space.capacity!);
        assert.equal(space.zone, 'sur', 'No North permit or transfer is confirmed in these fixtures');
      }
    }
    for (const allocation of allocations) {
      const space = state.spaces.find((s) => s.id === allocation.spaceId);
      assert.ok(space, 'Allocation must reference a real resource');
      if (allocation.status === 'confirmed') {
        assert.equal(space.status, 'confirmado');
        if (allocation.guestIds.some((id) => guestById.get(id)?.accessibility)) {
          assert.ok(entry.accessibilityVerifiedSpaceIds.includes(space.id));
        }
        if (space.readyAt && space.readyAt > state.clock.openingAt) {
          const waiting = state.spaces.find((s) => s.id === 'esperaSur')!;
          assert.equal(waiting.status, 'confirmado');
          assert.ok(waiting.capacity! >= allocation.guestIds.length);
          assert.equal(state.commitments.find((c) => c.id === 'c-espera')?.status, 'confirmado');
          assert.equal(state.decisions.find((d) => d.id === 'd-plan-sur')?.status, 'aprobada');
        }
      }
    }
    for (const group of state.guestGroups) {
      const members = seed.guests.filter((g) => g.groupId === group.id);
      assert.equal(group.count, members.length);
      assert.equal(group.confirmedCount, members.filter((g) => confirmed.has(g.id)).length);
      assert.ok(group.acceptedCount >= 0 && group.acceptedCount <= group.informedCount && group.informedCount <= group.count);
      if (group.assignedSpaceId) assert.ok(state.spaces.some((s) => s.id === group.assignedSpaceId));
    }
    assert.equal(state.guestGroups.reduce((sum, g) => sum + g.confirmedCount, 0), expected);
    if (expected < 600) assert.equal(state.resolved, false);
  });

  test(`${name}: JSON and frontend loader preserve the typed state without sharing mutations`, async () => {
    const state = fixtures[name]!.state;
    const json = JSON.parse(await readFile(new URL(`../fixtures/madring/states/${name}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(json, state);
    const loaded = createFixtureState(name as FixtureName);
    assert.deepEqual(loaded, json);
    loaded.spaces[0]!.capacity = 1;
    loaded.shuttles[0]!.route[0]![0] = 0;
    assert.deepEqual(createFixtureState(name as FixtureName), json);
    assert.equal(state.clock.paused, true);
    if (name === 'calm') assert.deepEqual(state.events, []);
    assert.ok(state.events.every((e) => e.time <= state.clock.simSeconds));
    assert.ok(state.commitments.every((c) => c.updatedAt <= state.clock.simSeconds && c.planVersion <= state.planVersion));
    assert.equal(state.deliveries.reduce((sum, d) => sum + d.services, 0), 600);
    for (const d of state.deliveries) {
      assert.ok(d.departAt < d.arriveAt && d.arriveAt < state.clock.lunchAt);
      assert.notEqual(d.status, 'entregada', 'No delivery has arrived at snapshot time');
      const dock = state.spaces.find((s) => s.id === d.dockId)!;
      assert.equal(dock.kind, 'muelle');
      assert.deepEqual(d.route.at(-1), dock.pos);
      if (d.status === 'confirmada') assert.ok(['confirmado', 'operativo'].includes(dock.status));
    }
    for (const bus of state.shuttles) {
      assert.deepEqual(bus.route.at(-1), state.spaces.find((s) => s.id === bus.destinationId)!.pos);
      if (name === 'calm') {
        assert.ok(state.clock.simSeconds < bus.arriveAt);
      } else {
        assert.ok(bus.departAt < state.clock.simSeconds && state.clock.simSeconds < bus.arriveAt);
      }
    }
  });
}

test('approval, later incident and delivery commitments do not fabricate coverage or refunds', () => {
  const proposal = fixtures.proposal!.state;
  const recovered = fixtures.recovered!.state;
  assert.equal(Object.values(seed.budget.proposedSurBreakdown).reduce((a, b) => a + b, 0), 3200);
  assert.equal(proposal.decisions[0]!.cost, 3200);
  assert.equal(proposal.decisions[0]!.kind, 'operational');
  assert.equal(proposal.budget.forecast, 3200);
  assert.equal(proposal.budget.authorized, 1500);
  assert.equal(proposal.budget.committed, 0);
  assert.equal(proposal.waitingForDecision, proposal.decisions[0]!.id);
  assert.equal(recovered.budget.committed, 3200);
  assert.equal(recovered.budget.authorized, proposal.budget.authorized);
  assert.equal(recovered.guestGroups.reduce((sum, g) => sum + g.informedCount, 0), 480);
  assert.equal(recovered.resolved, false, '120 recipients are still uncontacted');
  for (const name of ['lounge_unavailable', 'pabellon_b_400']) {
    const state = fixtures[name]!.state;
    assert.equal(state.planVersion, recovered.planVersion + 1);
    assert.equal(state.budget.committed, recovered.budget.committed);
    assert.ok(state.budget.committed > state.budget.authorized);
    assert.equal(state.budget.forecast, 3200);
    assert.ok(state.guestGroups.every((g) => g.informedCount === 0 && g.acceptedCount === 0));
    assert.ok(state.commitments.filter((c) => c.area === 'catering').every((c) => c.status === 'aceptado_condiciones'));
  }
});

test('building or mutating a fixture cannot change a subsequent seed', () => {
  const first = buildMadringFixtures();
  first.fixtures.normal!.state.shuttles[0]!.route[0]![0] = 0;
  first.seed.resources[0]!.pos[0] = 0;
  assert.deepEqual(buildMadringFixtures(), { seed, manifest, fixtures, world });
});

test('world.json covers places, Sur/Norte polygons and transfer links', () => {
  assert.ok(world.places.some((place: { id: string }) => place.id === 'chamartin'));
  assert.ok(world.places.some((place: { kind: string }) => place.kind === 'puerta'));
  assert.ok(world.links.some((link: { kind: string }) => link.kind === 'external_transfer'));
  assert.ok(world.zones.sur.length > 3 && world.zones.norte.length > 3);
});
