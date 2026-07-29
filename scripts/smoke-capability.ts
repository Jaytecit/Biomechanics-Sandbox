import assert from 'node:assert/strict';
import { analyzeCapability } from '../src/capability';
import { CREATURE_TEMPLATES } from '../src/templates';
import { EvolutionGoal } from '../src/types';

const base = structuredClone(
  CREATURE_TEMPLATES.find(item => item.name === 'Glide Cart') ?? CREATURE_TEMPLATES[0]
);
const first = analyzeCapability(base, 99);
const second = analyzeCapability(base, 99);
assert.deepEqual(first, second, 'same body and seed must repeat');
const stronger = structuredClone(base);
for (const node of stronger.nodes) if (node.isMotorWheel) node.motorPower = (node.motorPower ?? 0.45) * 2;
assert.ok(analyzeCapability(stronger, 99).structural.powerToMassProxy >= first.structural.powerToMassProxy);

const bird = structuredClone(
  CREATURE_TEMPLATES.find(item => item.name === 'RoboBird') ?? CREATURE_TEMPLATES[0]
);
const noAero = structuredClone(bird);
for (const muscle of noAero.muscles) muscle.aeroType = 'none';
assert.equal(analyzeCapability(noAero).goals[EvolutionGoal.FLIGHT_TIME].status, 'missing prerequisite');

const hopper = structuredClone(
  CREATURE_TEMPLATES.find(item => item.name === 'Tool Eggs') ?? CREATURE_TEMPLATES[0]
);
const noFlex = structuredClone(hopper);
for (const muscle of noFlex.muscles) {
  muscle.minLength = muscle.originalLength;
  muscle.maxLength = muscle.originalLength;
  muscle.strength = 1;
  muscle.linkKind = 'bone';
}
assert.equal(analyzeCapability(noFlex).goals[EvolutionGoal.HIGH_JUMP].status, 'missing prerequisite');
console.log('smoke-capability: PASS (repeatability, monotonic power, aero/jump prerequisites)');
