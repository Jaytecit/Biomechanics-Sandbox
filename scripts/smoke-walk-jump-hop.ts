/**
 * D128: Strict walk / jump / hop contact semantics.
 * - Walk: progressive plant sequence (1–4 contact points).
 * - Jump: all points leave; any contact ends; hop chains score 0 on jump goals.
 * - High jump: lowest anatomical point clearance.
 * - Hop Right/Left/Speed: accumulate hop-chain travel / speed.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  spawnCreature,
  updateCreaturePhysics,
  updateWalkGait,
} from '../src/physics';
import {
  HOP_CHAIN_GROUND_MAX,
  SOFT_BODY_PHYSICS_VERSION,
  WALK_MAX_CONTACT_POINTS,
  WALK_STEP_POINTS,
  WALK_ALTERNATE_BONUS,
  WALK_SWING_MIN_FRAMES,
  WALK_STEP_MIN_INTERVAL,
  SHUFFLE_OSC_WEIGHT,
} from '../src/physicsConstants';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.21.0');
assert.equal(WALK_MAX_CONTACT_POINTS, 4);
assert.ok(HOP_CHAIN_GROUND_MAX >= 4);
assert.ok(WALK_SWING_MIN_FRAMES >= 4);
assert.ok(WALK_STEP_MIN_INTERVAL >= 4);
assert.ok(WALK_STEP_POINTS > 0);

const blueprint =
  CREATURE_TEMPLATES.find(item => item.name === 'Biped Walker') ??
  CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(blueprint);
const idleActions = new Array(io.outputs).fill(0);

function configFor(goal: EvolutionGoal): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 12,
    simulationSpeed: 1,
    mutationRate: 0.1,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function makeCreature(id: string, goal: EvolutionGoal) {
  return spawnCreature(
    {
      id,
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    100,
    380,
    goal,
    1
  );
}

function stepUntilSupported(
  creature: ReturnType<typeof makeCreature>,
  goal: EvolutionGoal,
  frame: number
): number {
  const config = configFor(goal);
  for (let i = 0; i < 240; i += 1) {
    updateCreaturePhysics(creature, [], frame, config, [], idleActions);
    frame += 1;
    if (creature.nodes.some(node => node.isGround)) return frame;
  }
  throw new Error(`${creature.id}: did not settle`);
}

function launch(
  creature: ReturnType<typeof makeCreature>,
  upwardSpeed: number,
  rightSpeed = 0
) {
  assert.ok(
    creature.nodes.some(node => node.isGround),
    `${creature.id}: launch must begin from support`
  );
  for (const node of creature.nodes) {
    node.oldY = node.y + upwardSpeed;
    if (rightSpeed !== 0) node.oldX = node.x - rightSpeed;
  }
}

function finishBout(
  creature: ReturnType<typeof makeCreature>,
  goal: EvolutionGoal,
  frame: number
): number {
  const config = configFor(goal);
  let sawBout = false;
  for (let i = 0; i < 300; i += 1) {
    updateCreaturePhysics(creature, [], frame, config, [], idleActions);
    frame += 1;
    sawBout ||= (creature.jumpHangBoutFrames ?? 0) > 0;
    if (
      sawBout &&
      (creature.jumpHangBoutFrames ?? 0) === 0 &&
      creature.nodes.some(node => node.isGround)
    ) {
      return frame;
    }
  }
  throw new Error(`${creature.id}: airborne bout did not finish`);
}

// --- Walk adversarial ledger (D137 step-strict Run) ---
{
  const goal = EvolutionGoal.LOCOMOTION_RIGHT;
  const slide = makeCreature('walk-slide', goal);
  slide.currentX = slide.startX + 400;
  slide.walkStrideDistanceRight = 0;
  slide.walkStepCountRight = 0;
  assert.equal(
    calculateFitness(slide, goal),
    0,
    'endpoint displacement without steps must score 0'
  );

  const walker = makeCreature('walk-plants', goal);
  walker.walkStrideDistanceRight = 180;
  walker.walkStepCountRight = 3;
  walker.walkAlternateStepCountRight = 2;
  walker.walkStepScoreRight = 3 * WALK_STEP_POINTS + 2 * WALK_ALTERNATE_BONUS;
  walker.currentX = walker.startX + 180;
  assert.equal(
    calculateFitness(walker, goal),
    180 + 2 * WALK_ALTERNATE_BONUS,
    'walk fitness must be travel + capped alternate bonus'
  );

  // Many small steps must not beat fewer steps with greater forward travel.
  const twitchy = makeCreature('walk-twitchy', goal);
  twitchy.walkStrideDistanceRight = 60;
  twitchy.walkStepCountRight = 12;
  twitchy.walkAlternateStepCountRight = 11;
  twitchy.walkStepScoreRight = 12 * WALK_STEP_POINTS + 11 * WALK_ALTERNATE_BONUS;
  twitchy.currentX = twitchy.startX + 60;
  const strider = makeCreature('walk-strider', goal);
  strider.walkStrideDistanceRight = 320;
  strider.walkStepCountRight = 4;
  strider.walkAlternateStepCountRight = 3;
  strider.walkStepScoreRight = 4 * WALK_STEP_POINTS + 3 * WALK_ALTERNATE_BONUS;
  strider.currentX = strider.startX + 320;
  const twitchyFit = calculateFitness(twitchy, goal);
  const striderFit = calculateFitness(strider, goal);
  assert.ok(
    striderFit > twitchyFit,
    `longer travel must beat step farming (${striderFit} vs ${twitchyFit})`
  );

  const noAlt = makeCreature('walk-no-alt', goal);
  noAlt.walkStrideDistanceRight = 200;
  noAlt.walkStepCountRight = 4;
  noAlt.walkAlternateStepCountRight = 0;
  noAlt.walkStepScoreRight = 4 * WALK_STEP_POINTS;
  noAlt.currentX = noAlt.startX + 200;
  assert.equal(
    calculateFitness(noAlt, goal),
    0,
    'same-foot steps without an alternate transfer must score 0'
  );

  const farmed = makeCreature('walk-farmed-ledger', goal);
  farmed.walkStrideDistanceRight = 50_000;
  farmed.walkStepCountRight = 0;
  farmed.walkStepScoreRight = 0;
  farmed.currentX = farmed.startX + 400;
  assert.equal(
    calculateFitness(farmed, goal),
    0,
    'stride ledger without discrete steps must score 0'
  );

  const setGround = (
    creature: ReturnType<typeof makeCreature>,
    nodeIndex: number | null
  ) => {
    for (let i = 0; i < creature.nodes.length; i += 1) {
      creature.nodes[i].isGround = nodeIndex !== null && i === nodeIndex;
    }
  };

  /** Lift for swing clearance, then plant. Advances episodeFrames. */
  const swingPlant = (
    creature: ReturnType<typeof makeCreature>,
    nodeIndex: number,
    dir: 1 | -1
  ) => {
    setGround(creature, null);
    for (let a = 0; a < WALK_SWING_MIN_FRAMES; a += 1) {
      creature.episodeFrames = (creature.episodeFrames ?? 0) + 1;
      updateWalkGait(creature, dir);
    }
    // Space past the minimum step interval after any prior credit.
    const last = creature.walkLastStepFrame;
    if (last !== undefined) {
      const need = WALK_STEP_MIN_INTERVAL - ((creature.episodeFrames ?? 0) - last);
      for (let s = 0; s < Math.max(0, need); s += 1) {
        creature.episodeFrames = (creature.episodeFrames ?? 0) + 1;
        updateWalkGait(creature, dir);
      }
    }
    setGround(creature, nodeIndex);
    creature.episodeFrames = (creature.episodeFrames ?? 0) + 1;
    updateWalkGait(creature, dir);
  };

  // Oscillating plants A↔B with a stationary body must not accumulate Run strides.
  const tap = makeCreature('walk-oscillate', goal);
  tap.nodes[0].x = 100;
  tap.nodes[1].x = 140;
  tap.currentX = tap.startX;
  const plantCycle = (nodeIndex: number, grounded: boolean) => {
    for (let i = 0; i < tap.nodes.length; i += 1) {
      tap.nodes[i].isGround = i === nodeIndex ? grounded : false;
    }
    tap.episodeFrames = (tap.episodeFrames ?? 0) + 1;
    updateWalkGait(tap, 1);
  };
  plantCycle(0, true);
  plantCycle(0, false);
  for (let n = 0; n < 40; n += 1) {
    plantCycle(1, true);
    plantCycle(1, false);
    plantCycle(0, true);
    plantCycle(0, false);
  }
  assert.equal(
    tap.walkStrideDistanceRight ?? 0,
    0,
    `in-place foot oscillation must not credit Run strides, got ${tap.walkStrideDistanceRight}`
  );
  assert.equal(
    tap.walkStepCountRight ?? 0,
    0,
    'in-place oscillation must not mint steps'
  );
  assert.equal(calculateFitness(tap, goal), 0, 'oscillation farm fitness must be 0');

  // Fast grounded flicker without swing clearance must not credit Run steps,
  // even when body advances (vibration scoot signature).
  const buzz = makeCreature('walk-vibrate', goal);
  const buzzL = 2;
  const buzzR = 4;
  buzz.nodes[buzzL].x = buzz.startX;
  buzz.nodes[buzzR].x = buzz.startX + 20;
  buzz.currentX = buzz.startX;
  setGround(buzz, buzzL);
  buzz.episodeFrames = 1;
  updateWalkGait(buzz, 1); // seed frontiers
  for (let n = 0; n < 60; n += 1) {
    buzz.currentX = buzz.startX + (n + 1) * 3;
    buzz.nodes[buzzR].x = buzz.startX + 20 + (n + 1) * 3;
    setGround(buzz, null);
    buzz.episodeFrames = (buzz.episodeFrames ?? 0) + 1;
    updateWalkGait(buzz, 1);
    // Only 2 airborne frames — below WALK_SWING_MIN_FRAMES
    buzz.episodeFrames = (buzz.episodeFrames ?? 0) + 1;
    updateWalkGait(buzz, 1);
    setGround(buzz, buzzR);
    buzz.episodeFrames = (buzz.episodeFrames ?? 0) + 1;
    updateWalkGait(buzz, 1);
  }
  assert.equal(
    buzz.walkStepCountRight ?? 0,
    0,
    `short-air vibration must not credit Run steps, got ${buzz.walkStepCountRight}`
  );
  assert.equal(calculateFitness(buzz, goal), 0, 'vibration scoot must score 0 on Run Right');
  assert.ok(
    (buzz.shuffleOscDistanceRight ?? 0) > 0,
    'same vibration should still feed the Shuffle oscillation ledger'
  );

  // Real swing-gated forward steps with foot transfer (authored feet 2 & 4).
  const step = makeCreature('walk-real-step', goal);
  const footL = 2;
  const footR = 4;
  assert.ok(step.nodes[footL]?.isFoot && step.nodes[footR]?.isFoot, 'Biped feet must be marked');
  step.nodes[footL].x = step.startX;
  step.nodes[footR].x = step.startX + 30;
  step.currentX = step.startX;
  swingPlant(step, footL, 1); // seed plant frontier
  step.currentX = step.startX + 25;
  step.nodes[footR].x = step.startX + 30;
  swingPlant(step, footR, 1);
  const afterFirst = step.walkStrideDistanceRight ?? 0;
  assert.ok(afterFirst >= 2, `first forward swing step must credit, got ${afterFirst}`);
  assert.ok(
    (step.walkStepCountRight ?? 0) >= 1,
    'first forward swing must mint a discrete step'
  );
  assert.equal(
    calculateFitness(step, goal),
    0,
    'first same-line step without a prior alternate transfer must still score 0'
  );
  // Advance frontiers and plant the other foot → alternate transfer unlocks score.
  step.currentX = step.startX + 55;
  step.nodes[footL].x = step.startX + 60;
  swingPlant(step, footL, 1);
  assert.ok(
    (step.walkAlternateStepCountRight ?? 0) >= 1,
    'second plant on a different foot must count as alternate'
  );
  const afterAlt = calculateFitness(step, goal);
  assert.ok(
    afterAlt >= 25 + WALK_ALTERNATE_BONUS,
    `alternating steps must unlock travel-based fitness, got ${afterAlt}`
  );

  // Knee↔knee (or hip↔knee) transfers must never unlock alternation.
  const knees = makeCreature('walk-knee-alt', goal);
  knees.nodes[1].x = knees.startX;
  knees.nodes[3].x = knees.startX + 30;
  knees.currentX = knees.startX;
  // Clear authored-feet gate by unmarking feet so knees can enter auto gait,
  // then prove even distinct non-foot plants do not alternate.
  for (const n of knees.nodes) n.isFoot = false;
  swingPlant(knees, 1, 1);
  knees.currentX = knees.startX + 25;
  knees.nodes[3].x = knees.startX + 30;
  swingPlant(knees, 3, 1);
  knees.currentX = knees.startX + 55;
  knees.nodes[1].x = knees.startX + 60;
  swingPlant(knees, 1, 1);
  assert.equal(
    knees.walkAlternateStepCountRight ?? 0,
    0,
    'non-foot contact transfers must not count as alternating steps'
  );
  assert.equal(
    calculateFitness(knees, goal),
    0,
    'knee-only gait must score 0 on Run Right'
  );
  const strideAfterAlt = step.walkStrideDistanceRight ?? 0;
  swingPlant(step, 1, 1);
  assert.equal(
    step.walkStrideDistanceRight ?? 0,
    strideAfterAlt,
    'replanting within the same frontier span must not re-credit'
  );
}

// --- Shuffle rewards vibration travel that Run rejects ---
{
  const goal = EvolutionGoal.SHUFFLE_RIGHT;
  const slide = makeCreature('shuffle-slide', goal);
  slide.currentX = slide.startX + 250;
  slide.shuffleOscDistanceRight = 0;
  assert.ok(
    Math.abs(calculateFitness(slide, goal) - 250) < 1e-6,
    'Shuffle scores body travel even without oscillation plants'
  );

  const osc = makeCreature('shuffle-osc', goal);
  osc.currentX = osc.startX + 100;
  osc.shuffleOscDistanceRight = 80;
  assert.equal(
    calculateFitness(osc, goal),
    100 + SHUFFLE_OSC_WEIGHT * 80,
    'Shuffle adds weighted oscillation co-progress'
  );

  const farmed = makeCreature('shuffle-farm', goal);
  farmed.currentX = farmed.startX + 50;
  farmed.shuffleOscDistanceRight = 10_000;
  assert.equal(
    calculateFitness(farmed, goal),
    50 + SHUFFLE_OSC_WEIGHT * 50,
    'Shuffle oscillation bonus must be capped by body travel'
  );
}

// --- Jump Height: lowest anatomical point ledger ---
{
  const goal = EvolutionGoal.HIGH_JUMP;
  const comOnly = makeCreature('height-com-only', goal);
  comOnly.highestY = comOnly.startY - 120;
  comOnly.jumpHeightBestClearance = 0;
  assert.equal(
    calculateFitness(comOnly, goal),
    0,
    'COM peak alone must not score Jump Height'
  );

  const lowest = makeCreature('height-lowest', goal);
  lowest.jumpHeightBestClearance = 64;
  assert.equal(
    calculateFitness(lowest, goal),
    64,
    'lowest-point clearance ledger must drive Jump Height'
  );
}

// --- Hop chain zeros Hang Time / Jump Right; scores Hop Right ---
{
  const hangGoal = EvolutionGoal.JUMP_HANG_TIME;
  const hopGoal = EvolutionGoal.HOP_RIGHT;
  const rightGoal = EvolutionGoal.LONG_JUMP;

  const hopper = makeCreature('hop-chain', hopGoal);
  let frame = stepUntilSupported(hopper, hopGoal, 0);
  for (let hop = 0; hop < 4; hop += 1) {
    launch(hopper, 4.2, 2.4);
    frame = finishBout(hopper, hopGoal, frame);
    const config = configFor(hopGoal);
    for (let g = 0; g < 4; g += 1) {
      updateCreaturePhysics(hopper, [], frame, config, [], idleActions);
      frame += 1;
    }
  }
  const hopScore = calculateFitness(hopper, hopGoal);
  assert.ok(hopScore > 0, `hop chain must score Hop Right, got ${hopScore}`);
  assert.ok(
    (hopper.hopBoutCount ?? 0) >= 2,
    `expected multiple hop bouts, got ${hopper.hopBoutCount}`
  );

  const hangOnly = makeCreature('hang-vs-hop', hangGoal);
  frame = stepUntilSupported(hangOnly, hangGoal, 0);
  for (let hop = 0; hop < 4; hop += 1) {
    launch(hangOnly, 4.2, 2.4);
    frame = finishBout(hangOnly, hangGoal, frame);
    const config = configFor(hangGoal);
    for (let g = 0; g < 4; g += 1) {
      updateCreaturePhysics(hangOnly, [], frame, config, [], idleActions);
      frame += 1;
    }
  }
  const hangScore = calculateFitness(hangOnly, hangGoal);
  const rightScore = calculateFitness(hangOnly, rightGoal);
  assert.equal(
    hangScore,
    0,
    `hop chain must score 0 on Hang Time, got ${hangScore}`
  );
  assert.equal(
    rightScore,
    0,
    `hop chain must score 0 on Jump Right, got ${rightScore}`
  );
}

// --- Isolated long jump scores Hang Time; not Hop Right ---
{
  const hangGoal = EvolutionGoal.JUMP_HANG_TIME;
  const hopGoal = EvolutionGoal.HOP_RIGHT;
  const lone = makeCreature('isolated-jump', hangGoal);
  let frame = stepUntilSupported(lone, hangGoal, 0);
  launch(lone, 8.0);
  frame = finishBout(lone, hangGoal, frame);
  assert.ok(frame > 0);
  const hangScore = calculateFitness(lone, hangGoal);
  // Hop Right reads hop ledgers on the same creature; an isolated jump must not fill them.
  const hopScore = calculateFitness(lone, hopGoal);
  assert.ok(
    hangScore > 0,
    `isolated jump must score Hang Time, got ${hangScore} best=${lone.jumpHangBestBoutScore}`
  );
  assert.equal(
    hopScore,
    0,
    `isolated jump must not score Hop Right, got ${hopScore}`
  );
  assert.equal(lone.hopBoutCount ?? 0, 0, 'isolated jump must not increment hop bout count');
}

// --- Real physics Jump Height after isolated launch ---
{
  const goal = EvolutionGoal.HIGH_JUMP;
  const jumper = makeCreature('height-real', goal);
  let frame = stepUntilSupported(jumper, goal, 0);
  launch(jumper, 8.5);
  frame = finishBout(jumper, goal, frame);
  const score = calculateFitness(jumper, goal);
  assert.ok(score > 0, `isolated jump must score Jump Height, got ${score}`);
  assert.ok(
    (jumper.jumpHeightBestClearance ?? 0) > 0,
    'lowest-point clearance ledger must populate under real physics'
  );
}

console.log(
  'smoke-walk-jump-hop: PASS walk anti-farm frontiers, lowest-point height, hop vs jump isolation'
);
