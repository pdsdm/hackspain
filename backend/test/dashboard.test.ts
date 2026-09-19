import assert from 'node:assert/strict'
import test from 'node:test'
import { compareStates } from '../../frontend/src/domain/changes.ts'
import { createFixtureState } from '../../frontend/src/domain/fixtures.ts'

test('clock, selection and heartbeat updates produce no operational delta', () => {
  const before = createFixtureState('recovered')
  const after = structuredClone(before)
  after.clock.simSeconds += 60
  after.selectedId = 'loungeSur'
  after.commitments.forEach((c) => { c.updatedAt += 60 })
  assert.deepEqual(compareStates(before, after), [])
})

test('losing Lounge keeps an explicit before/after and changes the affected guest group', () => {
  const before = createFixtureState('recovered')
  const after = createFixtureState('lounge_unavailable')
  const changes = compareStates(before, after)
  const lounge = changes.find((c) => c.resourceId === 'loungeSur')!
  assert.match(lounge.before, /confirmado/)
  assert.match(lounge.after, /descartado/)
  assert.ok(changes.some((c) => c.resourceId === 'c-lounge' && c.after.includes('invalidado')))
  assert.ok(changes.some((c) => c.resourceId === 'g-propios' && c.before.includes('330/330') && c.after.includes('180/330')))
  assert.ok(!changes.some((c) => c.id === 'budget'), 'The incident does not refund already committed money')
  after.clock.simSeconds += 100
  assert.deepEqual(compareStates(before, after), changes, 'Changes remain visible while time advances')
  assert.deepEqual(compareStates(after, after), [], 'Acknowledging a reference clears only the comparison')
})

test('capacity reduction distinguishes 450 to 400 even when resource stays confirmed', () => {
  const changes = compareStates(createFixtureState('recovered'), createFixtureState('pabellon_b_400'))
  const space = changes.find((c) => c.resourceId === 'pabellonB')!
  assert.match(space.before, /450 plazas/)
  assert.match(space.after, /400 plazas/)
  assert.match(space.before, /confirmado/)
  assert.match(space.after, /confirmado/)
})

test('route, ETA, quantities and removed resources are included without changing the snapshots', () => {
  const before = createFixtureState('proposal')
  const copy = structuredClone(before)
  const after = structuredClone(before)
  after.shuttles[0]!.destinationId = 'accesoNorte'
  after.shuttles[0]!.arriveAt += 1200
  after.deliveries[0]!.services -= 100
  after.spaces = after.spaces.filter((s) => s.id !== 'loungeSur')
  const changes = compareStates(before, after)
  assert.match(changes.find((c) => c.resourceId === 'BUS-01')!.after, /Acceso Norte · 13:00/)
  assert.match(changes.find((c) => c.resourceId === 'CAT-01')!.after, /260 servicios/)
  const removed = changes.find((c) => c.title === 'Lounge Fan Zone Sur')!
  assert.equal(removed.after, 'Retirado del estado')
  assert.equal(removed.resourceId, null)
  assert.deepEqual(before, copy)
})

test('approval and spending remain distinct from physical execution', () => {
  const changes = compareStates(createFixtureState('proposal'), createFixtureState('recovered'))
  const decision = changes.find((c) => c.resourceId === 'd-plan-sur')!
  assert.match(decision.before, /pendiente/)
  assert.match(decision.after, /aprobada/)
  assert.ok(changes.some((c) => c.id === 'budget'))
  assert.match(changes.find((c) => c.resourceId === 'CAT-01')!.after, /^confirmada/)
})
