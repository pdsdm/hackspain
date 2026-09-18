// Static states for UI development. They do not dispatch calls or advance the demo script.
import normal from '../../../backend/fixtures/madring/states/normal.json';
import crisis from '../../../backend/fixtures/madring/states/crisis.json';
import proposal from '../../../backend/fixtures/madring/states/proposal.json';
import recovered from '../../../backend/fixtures/madring/states/recovered.json';
import loungeUnavailable from '../../../backend/fixtures/madring/states/lounge_unavailable.json';
import capacityReduced from '../../../backend/fixtures/madring/states/pabellon_b_400.json';
import type { CrisisState } from './types';

const fixtures = { normal, crisis, proposal, recovered, lounge_unavailable: loungeUnavailable, pabellon_b_400: capacityReduced };
export type FixtureName = keyof typeof fixtures;

export function createFixtureState(name: FixtureName): CrisisState {
  // JSON widens enums and coordinate tuples. Tests compare every file with the typed generator.
  return structuredClone(fixtures[name]) as unknown as CrisisState;
}
