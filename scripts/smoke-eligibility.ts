import assert from 'node:assert/strict';
import { evaluateEligibility } from '../src/eligibility';
import { CREATURE_TEMPLATES } from '../src/templates';
import { ARENA_ZONES, ArenaZoneId, goalsForZone } from '../src/zones';
import { EvolutionGoal } from '../src/types';

const motor = CREATURE_TEMPLATES.find(item => item.name === 'Motor Cart');
const walker = CREATURE_TEMPLATES.find(
  item =>
    !item.nodes.some(node => node.isMotorWheel) &&
    !item.muscles.some(m => m.aeroType && m.aeroType !== 'none')
);
const glider = CREATURE_TEMPLATES.find(item =>
  item.muscles.some(m => m.aeroType === 'paraglider')
);
const bird = CREATURE_TEMPLATES.find(item => item.muscles.some(m => m.aeroType === 'wing'));
assert.ok(motor && walker && glider && bird);

assert.equal(
  evaluateEligibility(motor!, { zoneId: 'motor', goal: EvolutionGoal.MOTOR_DRIVE }).eligible,
  true
);
assert.equal(
  evaluateEligibility(motor!, { zoneId: 'flying', goal: EvolutionGoal.GLIDE_RANGE }).eligible,
  false
);
assert.equal(
  evaluateEligibility(motor!, { zoneId: 'walking', goal: EvolutionGoal.LOCOMOTION_RIGHT }).eligible,
  false
);
assert.equal(
  evaluateEligibility(motor!, { zoneId: 'free', goal: EvolutionGoal.MOTOR_DRIVE }).eligible,
  true
);
assert.equal(
  evaluateEligibility(walker!, { zoneId: 'walking', goal: EvolutionGoal.LOCOMOTION_RIGHT }).eligible,
  true
);
assert.equal(
  evaluateEligibility(walker!, { zoneId: 'free', goal: EvolutionGoal.MOTOR_DRIVE }).eligible,
  false
);
assert.equal(
  evaluateEligibility(bird!, { zoneId: 'free', goal: EvolutionGoal.FLIGHT_RIGHT }).eligible,
  true
);
assert.equal(
  evaluateEligibility(glider!, { zoneId: 'free', goal: EvolutionGoal.GLIDE_RANGE }).eligible,
  true
);
assert.equal(
  evaluateEligibility(glider!, { zoneId: 'free', goal: EvolutionGoal.HIGH_JUMP }).eligible,
  false
);

for (const zoneId of Object.keys(ARENA_ZONES) as ArenaZoneId[]) {
  for (const goal of goalsForZone(zoneId)) {
    const result = evaluateEligibility(walker!, { zoneId, goal });
    assert.ok(Array.isArray(result.reasons) && Array.isArray(result.allowedDestinations));
  }
}
console.log('smoke-eligibility: PASS (unrestricted library data, launch-time zone/equipment matrix)');
