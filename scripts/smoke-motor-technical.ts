/**
 * D098 R1 deterministic physics smoke: the Motor Technical Course requires
 * ordered supported checkpoint crossings before a supported finish.
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
  name: 'Motor Technical checkpoint probe',
  nodes: [{
    id: 0,
    mass: 1,
    radius: 8,
    friction: 0.9,
    isWheel: true,
    isMotorWheel: true,
    motorPower: 0,
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
  goal: EvolutionGoal.MOTOR_SLALOM,
  gravity: 0.4,
  groundFriction: 0.8,
  arena,
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.MOTOR_SLALOM, arena);
const checkpoints = obstacles
  .filter((obstacle): obstacle is Obstacle & { checkpointIndex: number } =>
    obstacle.checkpointIndex !== undefined
  )
  .sort((a, b) => a.checkpointIndex - b.checkpointIndex);
const finish = obstacles.find(obstacle => obstacle.type === 'finish');
assert.deepEqual(checkpoints.map(checkpoint => checkpoint.checkpointIndex), [0, 1]);
assert.ok(finish, 'Motor Technical Course must have a finish');

function makeCreature(id: string) {
  return spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, GROUND_Y - 8, EvolutionGoal.MOTOR_SLALOM, 1);
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

const endpointBypass = makeCreature('technical-endpoint-bypass');
place(endpointBypass, finish.x + 20);
for (let frame = 0; frame < 8; frame += 1) step(endpointBypass, frame);
const bypassScore = calculateFitness(endpointBypass, EvolutionGoal.MOTOR_SLALOM);
assert.equal(endpointBypass.checkpointReached, 0);
assert.equal(endpointBypass.crossedFinish, false);
assert.ok(bypassScore <= 350, 'endpoint bypass must remain below one checkpoint plus shaping');

const unsupported = makeCreature('technical-unsupported');
let unsupportedFrame = 0;
for (const checkpoint of checkpoints) {
  place(unsupported, checkpoint.x - 10, GROUND_Y - 80);
  step(unsupported, unsupportedFrame++);
  place(unsupported, checkpoint.x + 10, GROUND_Y - 80);
  step(unsupported, unsupportedFrame++);
}
place(unsupported, finish.x + 20, GROUND_Y - 80);
step(unsupported, unsupportedFrame);
assert.equal(unsupported.checkpointReached, -1);
assert.equal(unsupported.crossedFinish, false);
assert.equal(
  calculateFitness(unsupported, EvolutionGoal.MOTOR_SLALOM),
  0,
  'unsupported checkpoint and finish crossings must score zero'
);

const intended = makeCreature('technical-intended');
let frame = 0;
for (const checkpoint of checkpoints) {
  place(intended, checkpoint.x - 10);
  step(intended, frame++);
  place(intended, checkpoint.x + 10);
  step(intended, frame++);
}
assert.equal(intended.checkpointReached, 1);
place(intended, finish.x + 20);
step(intended, frame++);
assert.equal(intended.crossedFinish, true);
const intendedScore = calculateFitness(intended, EvolutionGoal.MOTOR_SLALOM);
assert.ok(
  intendedScore >= 1_000 && intendedScore > bypassScore + 650,
  'ordered supported checkpoints and finish must dominate endpoint bypass'
);

console.log(
  `smoke-motor-technical: PASS unsupported=0 bypass=${bypassScore.toFixed(2)} intended=${intendedScore.toFixed(2)} checkpoints=${(intended.checkpointReached ?? -1) + 1} supported-finish=${intended.crossedFinish}`
);
