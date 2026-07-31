/**
 * Stair Climb: free jumps must not credit stair height.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, generateObstacles, spawnCreature } from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  EvolutionGoal,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Stair probe',
  nodes: [{ id: 0, mass: 1, radius: 8, friction: 0.9 }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const obstacles = generateObstacles(EvolutionGoal.STAIR_CLIMB, {
  ...DEFAULT_ARENA_MODIFIERS,
  terrainEnabled: false,
});

const flyer = spawnCreature(
  { id: 'stair-fly', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  100,
  GROUND_Y - 200,
  EvolutionGoal.STAIR_CLIMB,
  1
);
flyer.highestY = GROUND_Y - 280;
const flyScore = calculateFitness(flyer, EvolutionGoal.STAIR_CLIMB, [], undefined, obstacles);
assert.equal(flyScore, 0, 'unsupported altitude must not count as stair climb');

const climber = spawnCreature(
  { id: 'stair-climber', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  100,
  GROUND_Y - 8,
  EvolutionGoal.STAIR_CLIMB,
  1
);
climber.stairPeakHeight = 26;
climber.currentX = climber.startX + 40;
const climbScore = calculateFitness(climber, EvolutionGoal.STAIR_CLIMB, [], undefined, obstacles);
assert.ok(climbScore > flyScore + 50, 'supported tread height must dominate');

console.log(`smoke-stair-climb: PASS fly=${flyScore.toFixed(2)} climb=${climbScore.toFixed(2)}`);
