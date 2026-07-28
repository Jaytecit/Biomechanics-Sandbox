/**
 * D098 R1 deterministic physics smoke: only stable, ordered support on
 * authored box tops earns Climb Obstacles fitness.
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
  name: 'Obstacle climb contact probe',
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
  courseSeed: 12_345,
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
  goal: EvolutionGoal.OBSTACLE_CLIMB,
  gravity: 0.4,
  groundFriction: 0.8,
  arena,
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.OBSTACLE_CLIMB, arena);
const authoredBoxes = obstacles
  .filter((obstacle): obstacle is Obstacle & { climbOrder: number } =>
    obstacle.type === 'box' && obstacle.climbOrder !== undefined
  )
  .sort((a, b) => a.climbOrder - b.climbOrder);

assert.ok(authoredBoxes.length > 3, 'authored climb course must expose ordered boxes');
assert.deepEqual(
  authoredBoxes.slice(0, 4).map(box => box.climbOrder),
  [0, 1, 2, 3],
  'authored climb order must be contiguous'
);

function makeCreature(id: string) {
  return spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, GROUND_Y - 8, EvolutionGoal.OBSTACLE_CLIMB, 1);
}

function place(
  creature: ReturnType<typeof makeCreature>,
  x: number,
  y: number
) {
  const node = creature.nodes[0];
  node.x = x;
  node.y = y;
  node.oldX = x;
  node.oldY = y;
  node.vx = 0;
  node.vy = 0;
  node.isGround = false;
}

function step(
  creature: ReturnType<typeof makeCreature>,
  frame: number,
  count: number
): number {
  for (let i = 0; i < count; i += 1) {
    updateCreaturePhysics(
      creature,
      obstacles,
      frame,
      config,
      [],
      idleActions
    );
    frame += 1;
  }
  return frame;
}

const freeJump = makeCreature('obstacle-free-jump');
let freeJumpFrame = step(freeJump, 0, 8);
place(freeJump, freeJump.startX, GROUND_Y - 220);
freeJumpFrame = step(freeJump, freeJumpFrame, 20);
assert.ok(freeJumpFrame > 0);
const freeJumpScore = calculateFitness(freeJump, EvolutionGoal.OBSTACLE_CLIMB);

const bypass = makeCreature('obstacle-forward-bypass');
const lastBox = authoredBoxes[authoredBoxes.length - 1];
place(bypass, lastBox.x + lastBox.width + 200, GROUND_Y - 8);
step(bypass, 0, 8);
const bypassScore = calculateFitness(bypass, EvolutionGoal.OBSTACLE_CLIMB);

const outOfOrder = makeCreature('obstacle-out-of-order');
const secondBox = authoredBoxes[1];
place(
  outOfOrder,
  secondBox.x + secondBox.width / 2,
  secondBox.y - outOfOrder.nodes[0].radius
);
step(outOfOrder, 0, 8);
const outOfOrderScore = calculateFitness(
  outOfOrder,
  EvolutionGoal.OBSTACLE_CLIMB
);

const intended = makeCreature('obstacle-ordered-mounts');
let intendedFrame = 0;
for (const box of authoredBoxes.slice(0, 3)) {
  place(
    intended,
    box.x + box.width / 2,
    box.y - intended.nodes[0].radius
  );
  intendedFrame = step(intended, intendedFrame, 8);
}
const intendedScore = calculateFitness(intended, EvolutionGoal.OBSTACLE_CLIMB);

assert.equal(freeJump.obstacleClimbMountCount, 0);
assert.equal(freeJumpScore, 0, 'a free jump must not earn climb score');
assert.equal(bypass.obstacleClimbMountCount, 0);
assert.equal(bypassScore, 0, 'forward ground bypass must not earn climb score');
assert.equal(outOfOrder.obstacleClimbMountCount, 0);
assert.equal(outOfOrderScore, 0, 'an out-of-order box landing must not earn climb score');
assert.equal(
  intended.obstacleClimbMountCount,
  3,
  'stable authored box-top contacts must advance in order'
);
assert.ok(
  intendedScore > freeJumpScore &&
    intendedScore > bypassScore &&
    intendedScore > outOfOrderScore,
  'ordered supported climb must dominate all shortcut strategies'
);

console.log(
  `smoke-obstacle-climb: PASS free-jump=${freeJumpScore.toFixed(2)} bypass=${bypassScore.toFixed(2)} out-of-order=${outOfOrderScore.toFixed(2)} intended=${intendedScore.toFixed(2)} mounts=${intended.obstacleClimbMountCount}`
);
