/**
 * Hit Target: approach gradient before first hit; circle-aligned targets.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, generateObstacles, spawnCreature } from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  genomeIOForBlueprint,
} from '../src/types';
import { buildGoalWorldObjects } from '../src/arenas';

const blueprint: CreatureBlueprint = {
  name: 'Target probe',
  nodes: [{ id: 0, mass: 1, radius: 8, friction: 0.9 }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const obstacles = generateObstacles(EvolutionGoal.HIT_TARGET, {
  ...DEFAULT_ARENA_MODIFIERS,
  terrainEnabled: false,
});
const objects = buildGoalWorldObjects(EvolutionGoal.HIT_TARGET, blueprint, 1);
const ball = objects.find(o => o.type === 'ball')!;
const targets = obstacles.filter(o => o.type === 'target');
assert.ok(targets.length >= 1);

function makeCreature(id: string) {
  return spawnCreature(
    { id, generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
    100,
    GROUND_Y - 8,
    EvolutionGoal.HIT_TARGET,
    1
  );
}

const inert = makeCreature('target-inert');
assert.equal(calculateFitness(inert, EvolutionGoal.HIT_TARGET, objects, undefined, obstacles), 0);

const approaching = makeCreature('target-approach');
ball.x = targets[0].x + targets[0].width / 2 + 80;
ball.y = GROUND_Y - ball.radius;
approaching.ballContactFrame = 0;
approaching.episodeFrames = 0;
approaching.targetApproachBest = 12;
const approachScore = calculateFitness(approaching, EvolutionGoal.HIT_TARGET, objects, undefined, obstacles);
assert.ok(approachScore > 0 && approachScore < 120, 'approach shaping must precede first hit');

const hit = makeCreature('target-hit');
hit.targetHits = 1;
hit.targetHitMask = 1;
hit.ballContactFrame = 0;
hit.episodeFrames = 0;
const hitScore = calculateFitness(hit, EvolutionGoal.HIT_TARGET, objects, undefined, obstacles);
assert.ok(hitScore >= 120, 'registered hit must dominate approach-only score');

console.log(
  `smoke-hit-target: PASS inert=0 approach=${approachScore.toFixed(2)} hit=${hitScore.toFixed(2)}`
);
