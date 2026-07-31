/**
 * Motor Hurdles: supported wheeled bodies can clear low tier-0 hurdles.
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
  name: 'Hurdle cart',
  nodes: [{
    id: 0,
    mass: 1.5,
    radius: 12,
    friction: 0.05,
    isWheel: true,
    isMotorWheel: true,
    motorPower: 0.5,
  }],
  relativePositions: [{ x: 0, y: 0 }],
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
  goal: EvolutionGoal.MOTOR_HURDLES,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS, terrainEnabled: false, progressiveTier: 0 },
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.MOTOR_HURDLES, config.arena);
const hurdle = obstacles.find(o => o.hurdleIndex === 0);
assert.ok(hurdle);

const driver = spawnCreature(
  { id: 'hurdle-driver', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  hurdle!.x - 30,
  GROUND_Y - 12,
  EvolutionGoal.MOTOR_HURDLES,
  1
);
const node = driver.nodes[0];
node.isGround = true;
node.y = hurdle!.y - node.radius - 2;
node.x = hurdle!.x + hurdle!.width + 10;
driver.currentX = node.x;
updateCreaturePhysics(driver, obstacles, 0, config, [], new Array(io.outputs).fill(0));
assert.ok((driver.hurdlesCleared ?? 0) >= 1, 'supported drive-over must count at tier 0');
assert.ok(calculateFitness(driver, EvolutionGoal.MOTOR_HURDLES, [], undefined, obstacles) > 0);

console.log(`smoke-motor-hurdles: PASS cleared=${driver.hurdlesCleared}`);
