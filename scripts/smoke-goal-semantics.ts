import assert from 'node:assert/strict';
import { generateObstacles, createWorldObjects, calculateFitness, spawnCreature } from '../src/physics';
import { GOAL_ORDER, getGoalInfo } from '../src/goalCatalog';
import { GOAL_SEMANTIC_DECISIONS, validateGoalSemanticMatrix } from '../src/goalSemantics';
import { canonicalizeObstacles } from '../src/canonicalGeometry';
import { CREATURE_TEMPLATES } from '../src/templates';
import { createBaseGenome } from '../src/neat';
import {
  DEFAULT_ARENA_MODIFIERS,
  EvolutionGoal,
  genomeIOForBlueprint,
} from '../src/types';

assert.deepEqual(validateGoalSemanticMatrix(), []);
assert.equal(new Set(GOAL_ORDER).size, Object.values(EvolutionGoal).length - 1);
assert.ok(!GOAL_ORDER.includes(EvolutionGoal.MOTOR_BRIDGE));
assert.equal(
  GOAL_SEMANTIC_DECISIONS[EvolutionGoal.MOTOR_BRIDGE].decision,
  'remove'
);

const blueprint = CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(blueprint);
for (const goal of GOAL_ORDER) {
  const arena = { ...DEFAULT_ARENA_MODIFIERS, courseSeed: 12345, terrainSeed: 67890 };
  const first = generateObstacles(goal, arena);
  const second = generateObstacles(goal, arena);
  assert.deepEqual(first, second, `${goal}: authored geometry must be deterministic`);
  for (const obstacle of first) {
    assert.ok(Number.isFinite(obstacle.x) && Number.isFinite(obstacle.y), `${goal}: finite position`);
    assert.ok(obstacle.width >= 0 && obstacle.height >= 0, `${goal}: non-negative geometry`);
  }
  canonicalizeObstacles(first);
  const creature = spawnCreature({
    id: `semantic-${goal}`, generation: 0, blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, 380, goal, arena.difficulty);
  const score = calculateFitness(creature, goal, createWorldObjects(goal, arena.difficulty), undefined, first);
  assert.ok(Number.isFinite(score), `${goal}: score must be finite`);
  const decision = GOAL_SEMANTIC_DECISIONS[goal];
  assert.equal(decision.goal, goal);
  assert.ok(getGoalInfo(goal).description.length > 8);
}

assert.match(getGoalInfo(EvolutionGoal.MOTOR_SLALOM).title, /Technical Course/);
assert.doesNotMatch(getGoalInfo(EvolutionGoal.MOTOR_SLALOM).description, /weave|depth/i);
assert.match(getGoalInfo(EvolutionGoal.BOWLING_PINS).title, /Pin Smash/);
assert.match(getGoalInfo(EvolutionGoal.DODGEBALL).title, /Hazard Dash/);

const glideBlueprint =
  CREATURE_TEMPLATES.find(template => template.name === 'Glide Cart') ??
  blueprint;
const glideIo = genomeIOForBlueprint(glideBlueprint);
const makeGlider = (id: string) =>
  spawnCreature(
    {
      id,
      generation: 0,
      blueprint: glideBlueprint,
      genome: createBaseGenome(glideIo.inputs, glideIo.outputs),
    },
    100,
    380,
    EvolutionGoal.GLIDE_RANGE,
    1
  );

const continuousGlider = makeGlider('semantic-glide-continuous');
Object.assign(continuousGlider, {
  glideBoutFrames: 180,
  glideBoutDistance: 900,
  glideBoutHeightIntegral: 18_000,
  glideBoutPeakClearance: 120,
  glideBoutCorridorFrames: 150,
  glideBoutCorridorDist: 750,
  glideBoutOpenDist: 900,
  glideBoutTechniqueBonus: 100,
});
const continuousGlideScore = calculateFitness(
  continuousGlider,
  EvolutionGoal.GLIDE_RANGE
);

const hoppingGlider = makeGlider('semantic-glide-hops');
Object.assign(hoppingGlider, {
  glideBoutFrames: 70,
  glideBoutDistance: 350,
  glideBoutHeightIntegral: 7_000,
  glideBoutPeakClearance: 120,
  glideBoutCorridorFrames: 60,
  glideBoutCorridorDist: 300,
  glideBoutOpenDist: 350,
  glideBoutTechniqueBonus: 100,
});
const oneShortHopScore = calculateFitness(
  hoppingGlider,
  EvolutionGoal.GLIDE_RANGE
);
Object.assign(hoppingGlider, {
  glideBestBoutScore: oneShortHopScore,
  glideBoutFrames: 0,
  glideBoutDistance: 0,
  glideBoutHeightIntegral: 0,
  glideBoutPeakClearance: 0,
  glideBoutCorridorFrames: 0,
  glideBoutCorridorDist: 0,
  glideBoutOpenDist: 0,
  glideBoutTechniqueBonus: 0,
  // Legacy episode totals deliberately imitate several accumulated hops.
  flightFrames: 350,
  flightDistance: 1_750,
  flightHeightIntegral: 35_000,
  flightPeakClearance: 120,
  flightLongestStreak: 70,
  glideCorridorFrames: 300,
  glideCorridorDist: 1_500,
  sailOpenGlideDist: 1_750,
});
const repeatedHopScore = calculateFitness(
  hoppingGlider,
  EvolutionGoal.GLIDE_RANGE
);
assert.equal(
  repeatedHopScore,
  oneShortHopScore,
  'landing and taking off again must not accumulate Glide Range score'
);
assert.ok(
  continuousGlideScore > repeatedHopScore,
  'one longer uninterrupted glide must beat repeated shorter hops'
);

const hangTimeCreature = spawnCreature({
  id: 'semantic-hang-time',
  generation: 0,
  blueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380, EvolutionGoal.JUMP_HANG_TIME, 1);
Object.assign(hangTimeCreature, {
  jumpHangBestBoutScore: 24,
  jumpHangBoutFrames: 0,
  jumpHangBoutPeakClearance: 0,
  // Legacy episode totals imitate many short hops and must be irrelevant.
  flightFrames: 600,
  flightLongestStreak: 12,
  flightPeakClearance: 180,
  highestY: 100,
});
const repeatedShortHopScore = calculateFitness(
  hangTimeCreature,
  EvolutionGoal.JUMP_HANG_TIME
);
assert.equal(
  repeatedShortHopScore,
  24,
  'separate Hang Time hops must not accumulate through legacy episode totals'
);
Object.assign(hangTimeCreature, {
  jumpHangBoutFrames: 60,
  jumpHangBoutPeakClearance: 40,
});
assert.ok(
  calculateFitness(hangTimeCreature, EvolutionGoal.JUMP_HANG_TIME) >
    repeatedShortHopScore,
  'one longer supported-takeoff Hang Time bout must beat repeated short hops'
);

const finalPoseRecovery = spawnCreature({
  id: 'semantic-stay-tall-final-pose',
  generation: 0,
  blueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380, EvolutionGoal.STAY_UPRIGHT, 1);
Object.assign(finalPoseRecovery, {
  currentY: 250,
  stayTallIntegral: 0,
  stayTallSupportedFrames: 0,
  stayTallFallFrames: 0,
});
assert.equal(
  calculateFitness(finalPoseRecovery, EvolutionGoal.STAY_UPRIGHT),
  0,
  'an upright final pose without sustained supported posture must not score'
);
Object.assign(finalPoseRecovery, {
  stayTallIntegral: 180,
  stayTallSupportedFrames: 240,
  stayTallFallFrames: 20,
});
assert.equal(
  calculateFitness(finalPoseRecovery, EvolutionGoal.STAY_UPRIGHT),
  173,
  'Stay Tall must integrate posture and retain fall penalties'
);

const obstacleClimber = spawnCreature({
  id: 'semantic-obstacle-climber',
  generation: 0,
  blueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380, EvolutionGoal.OBSTACLE_CLIMB, 1);
Object.assign(obstacleClimber, {
  currentX: obstacleClimber.startX + 4_000,
  highestY: obstacleClimber.startY - 500,
});
assert.equal(
  calculateFitness(obstacleClimber, EvolutionGoal.OBSTACLE_CLIMB),
  0,
  'free jumps and unsupported forward bypass must not score Obstacle Climb'
);
Object.assign(obstacleClimber, {
  obstacleClimbMountCount: 2,
  obstacleClimbSupportedHeight: 104,
  obstacleClimbSupportedX: obstacleClimber.startX + 440,
});
assert.ok(
  calculateFitness(obstacleClimber, EvolutionGoal.OBSTACLE_CLIMB) > 600,
  'ordered supported box mounts must dominate unsupported shaping'
);

const carryCreature = spawnCreature({
  id: 'semantic-carry-ball',
  generation: 0,
  blueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380, EvolutionGoal.CARRY_BALL, 1);
const carryBall = carryCreature.privateWorld?.find(object => object.type === 'ball');
assert.ok(carryBall, 'Carry Ball must create a private ball');
Object.assign(carryBall, {
  x: carryBall.startX + 500,
  y: carryBall.startY - 200,
});
assert.equal(
  calculateFitness(
    carryCreature,
    EvolutionGoal.CARRY_BALL,
    carryCreature.privateWorld
  ),
  0,
  'uncontacted ball motion and proximity-free displacement must score zero'
);
Object.assign(carryCreature, {
  carryBallContactChainFrames: 40,
  carryBallBestContactChainFrames: 40,
  carryBallTransportDistance: 90,
  carryBallTransportPeakLift: 45,
});
assert.ok(
  calculateFitness(
    carryCreature,
    EvolutionGoal.CARRY_BALL,
    carryCreature.privateWorld
  ) > 180,
  'collision-proven lifted transport must score'
);

const hazardRunner = spawnCreature({
  id: 'semantic-hazard-dash',
  generation: 0,
  blueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380, EvolutionGoal.DODGEBALL, 1);
Object.assign(hazardRunner, {
  uprightFrames: 10_000,
  currentX: hazardRunner.startX,
  hazardProgressCount: 0,
  hazardUprightProgress: 0,
});
assert.equal(
  calculateFitness(hazardRunner, EvolutionGoal.DODGEBALL),
  0,
  'episode-wide upright camping must not score Hazard Dash'
);
Object.assign(hazardRunner, {
  currentX: hazardRunner.startX + 5_000,
  hazardUprightProgress: 50,
});
assert.equal(
  calculateFitness(hazardRunner, EvolutionGoal.DODGEBALL),
  50,
  'endpoint travel without ordered hazard provenance must not score sections'
);
Object.assign(hazardRunner, {
  hazardProgressCount: 3,
  crossedFinish: true,
});
assert.equal(
  calculateFitness(hazardRunner, EvolutionGoal.DODGEBALL),
  800,
  'ordered traversal plus supported finish must dominate bounded shaping'
);

const beamWalker = spawnCreature({
  id: 'semantic-balance-beam',
  generation: 0,
  blueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380, EvolutionGoal.BALANCE_BEAM, 1);
Object.assign(beamWalker, {
  currentX: beamWalker.startX + 5_000,
  beamSupportedDistance: 0,
  beamSupportedFrames: 0,
  beamSupportedPosture: 0,
  beamCompleted: false,
});
assert.equal(
  calculateFitness(beamWalker, EvolutionGoal.BALANCE_BEAM),
  0,
  'endpoint travel and final pose must not score Balance Beam'
);
Object.assign(beamWalker, {
  beamSupportedDistance: 420,
  beamSupportedFrames: 90,
  beamSupportedPosture: 70,
  beamCompleted: true,
});
assert.ok(
  calculateFitness(beamWalker, EvolutionGoal.BALANCE_BEAM) > 750,
  'continuous supported traversal plus completion must dominate shortcuts'
);

const technicalDriver = spawnCreature({
  id: 'semantic-motor-technical',
  generation: 0,
  blueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380, EvolutionGoal.MOTOR_SLALOM, 1);
Object.assign(technicalDriver, {
  currentX: technicalDriver.startX + 5_000,
  technicalSupportedDistance: 1_000,
  checkpointReached: -1,
  crossedFinish: false,
});
assert.equal(
  calculateFitness(technicalDriver, EvolutionGoal.MOTOR_SLALOM),
  100,
  'endpoint bypass must receive only bounded supported shaping'
);
Object.assign(technicalDriver, {
  checkpointReached: 1,
  crossedFinish: true,
});
assert.equal(
  calculateFitness(technicalDriver, EvolutionGoal.MOTOR_SLALOM),
  1_100,
  'two ordered checkpoints plus supported finish must dominate shaping'
);

console.log(
  `smoke-goal-semantics: PASS (${GOAL_ORDER.length} goals, deterministic geometry, finite scoring, Hang Time/Glide bouts, sustained Stay Tall, ordered Obstacle Climb mounts, collision-proven Carry Ball, ordered Hazard Dash, supported Balance Beam, gated Motor Technical Course)`
);
