/**
 * Kick Goal: open mouth geometry, recent-contact scoring, goal bonus reachable.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  generateObstacles,
  spawnCreature,
  updateCreaturePhysics,
  stepPrivateWorld,
} from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  WorldObject,
  genomeIOForBlueprint,
} from '../src/types';
import { buildGoalWorldObjects } from '../src/arenas';

const blueprint: CreatureBlueprint = {
  name: 'Kick probe',
  nodes: [{ id: 0, mass: 1, radius: 10, friction: 0.9 }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const arena = {
  ...DEFAULT_ARENA_MODIFIERS,
  terrainEnabled: false,
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
  goal: EvolutionGoal.KICK_GOAL,
  gravity: 0.4,
  groundFriction: 0.8,
  arena,
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.KICK_GOAL, arena);
const net = obstacles.find(o => o.type === 'finish' && o.label === 'NET');
assert.ok(net?.zoneWidth, 'Kick goal must have NET zone');

function makeCreature(id: string) {
  return spawnCreature(
    {
      id,
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    100,
    GROUND_Y - 10,
    EvolutionGoal.KICK_GOAL,
    1
  );
}

function objects(): WorldObject[] {
  return buildGoalWorldObjects(EvolutionGoal.KICK_GOAL, blueprint, 1);
}

const inert = makeCreature('kick-inert');
assert.equal(calculateFitness(inert, EvolutionGoal.KICK_GOAL, objects(), undefined, obstacles), 0);

const jam = makeCreature('kick-jam');
const objs = objects();
const ball = objs.find(o => o.type === 'ball')!;
const postX = net!.x - ball.radius - 2;
ball.x = postX;
ball.y = GROUND_Y - ball.radius;
ball.oldX = postX;
ball.oldY = ball.y;
jam.ballContactFrame = 0;
jam.episodeFrames = 0;
const jamScore = calculateFitness(jam, EvolutionGoal.KICK_GOAL, objs, undefined, obstacles);
assert.ok(jamScore < 300, 'ball jammed at mouth must not score goal bonus');

const scored = makeCreature('kick-scored');
const ball2 = objs[0];
assert.equal(ball2.type, 'ball');
ball2.x = net!.x + net!.zoneWidth! / 2;
ball2.y = GROUND_Y - ball2.radius;
ball2.oldX = ball2.x;
ball2.oldY = ball2.y;
scored.ballContactFrame = 0;
scored.episodeFrames = 0;
for (let frame = 0; frame < 4; frame += 1) {
  updateCreaturePhysics(scored, obstacles, frame, config, objs, new Array(io.outputs).fill(0));
  stepPrivateWorld(objs, obstacles, config, frame);
}
assert.equal(scored.goalScored, true, 'ball in net with recent contact must score');
const scoredFitness = calculateFitness(scored, EvolutionGoal.KICK_GOAL, objs, undefined, obstacles);
assert.ok(scoredFitness >= 300, `expected goal bonus, got ${scoredFitness}`);

console.log(`smoke-kick-goal: PASS inert=0 jam=${jamScore.toFixed(2)} scored=${scoredFitness.toFixed(2)}`);
