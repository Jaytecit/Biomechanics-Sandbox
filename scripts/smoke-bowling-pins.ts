/**
 * Pin Smash (Bowling): body displacement counts; no ball fantasy.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, spawnCreature } from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  EvolutionGoal,
  genomeIOForBlueprint,
} from '../src/types';
import { buildGoalWorldObjects } from '../src/arenas';

const blueprint: CreatureBlueprint = {
  name: 'Pin smash probe',
  nodes: [{ id: 0, mass: 2, radius: 12, friction: 0.2 }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const objects = buildGoalWorldObjects(EvolutionGoal.BOWLING_PINS, blueprint, 1);
assert.ok(objects.every(o => o.type !== 'ball'), 'Pin Smash must not spawn a ball');

const inert = spawnCreature(
  { id: 'pin-inert', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  100,
  GROUND_Y - 12,
  EvolutionGoal.BOWLING_PINS,
  1
);
assert.equal(calculateFitness(inert, EvolutionGoal.BOWLING_PINS, objects, undefined, []), 0);

const smasher = spawnCreature(
  { id: 'pin-smasher', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  100,
  GROUND_Y - 12,
  EvolutionGoal.BOWLING_PINS,
  1
);
objects[0].x = objects[0].startX + 30;
smasher.pinsDown = 1;
smasher.currentX = smasher.startX + 200;
const score = calculateFitness(smasher, EvolutionGoal.BOWLING_PINS, objects, undefined, []);
assert.ok(score >= 40, 'displaced pin must score');

console.log(`smoke-bowling-pins: PASS score=${score.toFixed(2)}`);
