/**
 * Parking Zone: low wide motor-style bodies can bank parked frames.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  generateObstacles,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Cart park probe',
  nodes: [
    { id: 0, mass: 2, radius: 11, friction: 0.2, isWheel: true, isMotorWheel: true },
    { id: 1, mass: 2, radius: 11, friction: 0.2, isWheel: true, isMotorWheel: true },
  ],
  relativePositions: [{ x: -20, y: 0 }, { x: 20, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.PARKING_ZONE,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS, terrainEnabled: false },
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.PARKING_ZONE, config.arena);
const zone = obstacles.find(o => o.label === 'PARK');
assert.ok(zone);

const creature = spawnCreature(
  { id: 'park-cart', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  zone!.x + zone!.zoneWidth! / 2,
  GROUND_Y - 11,
  EvolutionGoal.PARKING_ZONE,
  1
);
for (const node of creature.nodes) {
  node.isGround = true;
}
for (let f = 0; f < 30; f += 1) {
  updateCreaturePhysics(creature, obstacles, f, config, [], new Array(io.outputs).fill(0));
}
assert.ok((creature.parkingFrames ?? 0) > 0, 'wide motor cart should accumulate parked frames');
assert.ok(calculateFitness(creature, EvolutionGoal.PARKING_ZONE, [], undefined, obstacles) > 0);

console.log(`smoke-parking-zone: PASS frames=${creature.parkingFrames}`);
