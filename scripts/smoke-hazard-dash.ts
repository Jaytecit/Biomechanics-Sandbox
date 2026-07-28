/**
 * D098 R1 deterministic physics smoke: Hazard Dash rewards ordered authored
 * crossings and a supported finish, never camping or endpoint bypass.
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
  Obstacle,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Hazard Dash contact probe',
  nodes: [{
    id: 0,
    mass: 1,
    radius: 8,
    friction: 0.9,
    isWheel: false,
    isMotorWheel: false,
  }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const idleActions = new Array(io.outputs).fill(0);
const arena = {
  ...DEFAULT_ARENA_MODIFIERS,
  terrainEnabled: false,
  terrainObstaclesEnabled: false,
  rampEnabled: false,
  pitEnabled: false,
};
const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.DODGEBALL,
  gravity: 0.4,
  groundFriction: 0.8,
  arena,
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.DODGEBALL, arena);
const hazards = obstacles
  .filter((obstacle): obstacle is Obstacle & { hazardOrder: number } =>
    obstacle.hazardOrder !== undefined
  )
  .sort((a, b) => a.hazardOrder - b.hazardOrder);
const finish = obstacles.find(obstacle => obstacle.type === 'finish');
assert.deepEqual(hazards.map(hazard => hazard.hazardOrder), [0, 1, 2]);
assert.ok(finish, 'Hazard Dash must have a finish');

function makeCreature(id: string) {
  return spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, GROUND_Y - 8, EvolutionGoal.DODGEBALL, 1);
}

function place(
  creature: ReturnType<typeof makeCreature>,
  x: number,
  y = GROUND_Y - creature.nodes[0].radius
) {
  const node = creature.nodes[0];
  node.x = x;
  node.y = y;
  node.oldX = x;
  node.oldY = y;
  node.isGround = false;
}

function step(creature: ReturnType<typeof makeCreature>, frame: number) {
  updateCreaturePhysics(
    creature,
    obstacles,
    frame,
    config,
    [],
    idleActions
  );
}

const camper = makeCreature('hazard-camper');
for (let frame = 0; frame < 600; frame += 1) step(camper, frame);
const camperScore = calculateFitness(camper, EvolutionGoal.DODGEBALL);
assert.equal(camperScore, 0, 'upright camping at spawn must score zero');

const endpointBypass = makeCreature('hazard-endpoint-bypass');
place(endpointBypass, finish.x + 20);
for (let frame = 0; frame < 10; frame += 1) step(endpointBypass, frame);
const bypassScore = calculateFitness(endpointBypass, EvolutionGoal.DODGEBALL);
assert.equal(endpointBypass.crossedFinish, false);
assert.equal(endpointBypass.hazardProgressCount, 1);
assert.ok(bypassScore <= 200, 'endpoint bypass must not imitate course completion');

const intended = makeCreature('hazard-intended');
let frame = 0;
for (const hazard of hazards) {
  const edge = hazard.x + hazard.width;
  place(intended, edge - 20);
  step(intended, frame++);
  place(intended, edge + intended.nodes[0].radius + 2);
  step(intended, frame++);
}
assert.equal(intended.hazardProgressCount, hazards.length);

place(intended, finish.x + 20, GROUND_Y - 80);
step(intended, frame++);
assert.equal(intended.crossedFinish, false, 'unsupported finish crossing must not complete');

place(intended, finish.x + 20);
step(intended, frame++);
assert.equal(intended.crossedFinish, true, 'supported finish after all hazards must complete');
const intendedScore = calculateFitness(intended, EvolutionGoal.DODGEBALL);
assert.ok(
  intendedScore > camperScore + 700 && intendedScore > bypassScore + 500,
  'ordered traversal and supported finish must dominate camping and bypass'
);

console.log(
  `smoke-hazard-dash: PASS camper=${camperScore.toFixed(2)} bypass=${bypassScore.toFixed(2)} intended=${intendedScore.toFixed(2)} sections=${intended.hazardProgressCount} supported-finish=${intended.crossedFinish}`
);
