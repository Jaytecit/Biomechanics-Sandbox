/**
 * D098 R1 real-physics smoke: Hang Time scores the best supported-takeoff bout.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint = CREATURE_TEMPLATES.find(item => item.name === 'Biped Walker')
  ?? CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(blueprint);
const idleActions = new Array(io.outputs).fill(0);
const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.JUMP_HANG_TIME,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: DEFAULT_CUSTOM_GOAL,
};

function makeCreature(id: string) {
  return spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, 380, EvolutionGoal.JUMP_HANG_TIME, 1);
}

function stepUntilSupported(
  creature: ReturnType<typeof makeCreature>,
  frame: number
): number {
  for (let i = 0; i < 240; i += 1) {
    updateCreaturePhysics(creature, [], frame, config, [], idleActions);
    frame += 1;
    if (creature.nodes.some(node => node.isGround)) return frame;
  }
  throw new Error(`${creature.id}: did not settle onto authoritative support`);
}

function launch(creature: ReturnType<typeof makeCreature>, upwardSpeed: number) {
  assert.ok(
    creature.nodes.some(node => node.isGround),
    `${creature.id}: launch must begin from support`
  );
  for (const node of creature.nodes) {
    node.oldY = node.y + upwardSpeed;
  }
}

function finishBout(
  creature: ReturnType<typeof makeCreature>,
  frame: number
): number {
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

const inert = makeCreature('hang-inert');
let inertFrame = stepUntilSupported(inert, 0);
for (let i = 0; i < 120; i += 1) {
  updateCreaturePhysics(inert, [], inertFrame, config, [], idleActions);
  inertFrame += 1;
}
const inertScore = calculateFitness(inert, EvolutionGoal.JUMP_HANG_TIME);

const repeated = makeCreature('hang-repeated-short');
let repeatedFrame = stepUntilSupported(repeated, 0);
for (let hop = 0; hop < 4; hop += 1) {
  launch(repeated, 3.2);
  repeatedFrame = finishBout(repeated, repeatedFrame);
  // Stay inside the hop-chain grounded window so these are hops, not jumps.
  for (let g = 0; g < 4; g += 1) {
    updateCreaturePhysics(repeated, [], repeatedFrame, config, [], idleActions);
    repeatedFrame += 1;
  }
}
const repeatedScore = calculateFitness(repeated, EvolutionGoal.JUMP_HANG_TIME);

const intended = makeCreature('hang-one-long');
let intendedFrame = stepUntilSupported(intended, 0);
launch(intended, 7.2);
intendedFrame = finishBout(intended, intendedFrame);
assert.ok(intendedFrame > 0);
const intendedScore = calculateFitness(intended, EvolutionGoal.JUMP_HANG_TIME);

assert.equal(inertScore, 0, 'settling/camping must not earn Hang Time');
assert.equal(
  repeatedScore,
  0,
  `hop-chain farming must score 0 on Hang Time, got ${repeatedScore}`
);
assert.ok(
  intendedScore > 0,
  `one isolated long jump must score Hang Time, got ${intendedScore}`
);
assert.equal(
  repeated.jumpHangBestBoutScore ?? 0,
  0,
  'hop chain must leave no Hang Time best-bout ledger'
);

console.log(
  `smoke-hang-time: PASS inert=${inertScore.toFixed(2)} repeated-short=${repeatedScore.toFixed(2)} intended-long=${intendedScore.toFixed(2)}`
);
