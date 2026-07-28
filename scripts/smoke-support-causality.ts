/**
 * D107 R3 adversarial ledger for supported completions, object causality, and
 * bounded shaping below physical completion.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, spawnCreature } from '../src/physics';
import { CREATURE_TEMPLATES } from '../src/templates';
import { EvolutionGoal, genomeIOForBlueprint } from '../src/types';

const blueprint = CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(blueprint);
function make(goal: EvolutionGoal, id: string) {
  return spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, 380, goal, 1);
}

const aerial = make(EvolutionGoal.AERIAL_CROSSING, 'r3-aerial');
Object.assign(aerial, {
  gapCleared: true,
  aerialCrossingLanded: false,
  aerialCrossingBestShaping: 0,
  attemptBoutFrames: 0,
  attemptBoutRight: 0,
  // Inflated episode totals must not create flight shaping.
  flightDistance: 10_000,
  flightFrames: 10_000,
  sailOpenGlideDist: 10_000,
});
const unlandedAerial = calculateFitness(aerial, EvolutionGoal.AERIAL_CROSSING);
assert.equal(
  unlandedAerial,
  0,
  'Aerial Crossing flight shaping must ignore episode totals without an airborne bout'
);
Object.assign(aerial, {
  attemptBoutFrames: 80,
  attemptBoutRight: 400,
});
assert.ok(
  calculateFitness(aerial, EvolutionGoal.AERIAL_CROSSING) <= 180,
  'active bout shaping stays capped below completion'
);
aerial.aerialCrossingLanded = true;
assert.ok(calculateFitness(aerial, EvolutionGoal.AERIAL_CROSSING) >= 400);

const bridge = make(EvolutionGoal.MOTOR_BRIDGE, 'r3-bridge');
bridge.currentX = bridge.startX + 5_000;
assert.equal(calculateFitness(bridge, EvolutionGoal.MOTOR_BRIDGE), 0);
Object.assign(bridge, {
  bridgeSupportedDistance: 500,
  bridgeSupportedFrames: 80,
  bridgeCompleted: true,
});
assert.ok(calculateFitness(bridge, EvolutionGoal.MOTOR_BRIDGE) > 800);

const soccer = make(EvolutionGoal.KICK_GOAL, 'r3-soccer');
const ball = soccer.privateWorld!.find(object => object.type === 'ball')!;
ball.x = ball.startX + 5_000;
ball.y = ball.startY - 500;
assert.equal(
  calculateFitness(soccer, EvolutionGoal.KICK_GOAL, soccer.privateWorld),
  0
);
soccer.ballCreatureContacted = true;
assert.equal(
  calculateFitness(soccer, EvolutionGoal.KICK_GOAL, soccer.privateWorld),
  100
);
soccer.goalScored = true;
assert.equal(
  calculateFitness(soccer, EvolutionGoal.KICK_GOAL, soccer.privateWorld),
  400
);

const targets = make(EvolutionGoal.HIT_TARGET, 'r3-targets');
const targetBall = targets.privateWorld!.find(object => object.type === 'ball')!;
targetBall.y = targetBall.startY - 1_000;
assert.equal(
  calculateFitness(targets, EvolutionGoal.HIT_TARGET, targets.privateWorld),
  0
);
Object.assign(targets, {
  ballCreatureContacted: true,
  targetHits: 1,
});
assert.equal(
  calculateFitness(targets, EvolutionGoal.HIT_TARGET, targets.privateWorld),
  160
);

console.log(
  `smoke-support-causality: PASS aerial-unlanded=${unlandedAerial.toFixed(2)} bridge-bypass=0 soccer-uncontacted=0 target-miss=0`
);
