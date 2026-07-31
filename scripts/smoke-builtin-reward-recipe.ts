/**
 * Phase 22A / D148: built-in reward recipe defaults, overrides, fingerprint,
 * and fitness ↔ breakdown alignment for SPEED + JUMP_SPEED.
 */
import assert from 'node:assert/strict';
import {
  BuiltInRewardRecipe,
  DEFAULT_BUILTIN_REWARD_RECIPE,
  DEFAULT_REWARD_RECIPE_FINGERPRINT,
  isDefaultRewardRecipe,
  rewardRecipeFingerprint,
} from '../src/builtInRewardCoeffs';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, spawnCreature } from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import { calculateRewardBreakdown } from '../src/rewardBreakdown';
import { bestEverStorageKey } from '../src/savedModels';
import {
  CreatureBlueprint,
  EvolutionGoal,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Recipe probe',
  nodes: [
    { id: 0, mass: 1, radius: 8, friction: 0.9 },
    { id: 1, mass: 1, radius: 8, friction: 0.9 },
  ],
  relativePositions: [
    { x: -10, y: 0 },
    { x: 10, y: 0 },
  ],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);

function makeCreature(id: string, goal: EvolutionGoal) {
  return spawnCreature(
    { id, generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
    100,
    GROUND_Y - 8,
    goal,
    1
  );
}

// --- Fingerprint helpers ---
assert.equal(
  rewardRecipeFingerprint(undefined),
  DEFAULT_REWARD_RECIPE_FINGERPRINT
);
assert.equal(
  rewardRecipeFingerprint(DEFAULT_BUILTIN_REWARD_RECIPE),
  DEFAULT_REWARD_RECIPE_FINGERPRINT
);
assert.ok(isDefaultRewardRecipe(undefined));
assert.ok(isDefaultRewardRecipe(DEFAULT_BUILTIN_REWARD_RECIPE));

const boosted: BuiltInRewardRecipe = {
  ...DEFAULT_BUILTIN_REWARD_RECIPE,
  speed: { ...DEFAULT_BUILTIN_REWARD_RECIPE.speed, peak: 90 },
};
assert.ok(!isDefaultRewardRecipe(boosted));
const boostedFp = rewardRecipeFingerprint(boosted);
assert.notEqual(boostedFp, DEFAULT_REWARD_RECIPE_FINGERPRINT);
assert.equal(bestEverStorageKey(EvolutionGoal.SPEED), EvolutionGoal.SPEED);
assert.equal(
  bestEverStorageKey(EvolutionGoal.SPEED, boostedFp),
  `${EvolutionGoal.SPEED}::${boostedFp}`
);

// --- SPEED default parity + override ---
const runner = makeCreature('speed-runner', EvolutionGoal.SPEED);
runner.peakSupportedSpeed = 4.5;
runner.currentX = runner.startX + 120;

const defaultScore = calculateFitness(runner, EvolutionGoal.SPEED);
const defaultViaRecipe = calculateFitness(
  runner,
  EvolutionGoal.SPEED,
  [],
  undefined,
  [],
  undefined,
  DEFAULT_BUILTIN_REWARD_RECIPE
);
assert.equal(defaultScore, defaultViaRecipe, 'omit recipe ≡ default recipe');

const boostedScore = calculateFitness(
  runner,
  EvolutionGoal.SPEED,
  [],
  undefined,
  [],
  undefined,
  boosted
);
assert.ok(
  boostedScore > defaultScore + 100,
  `boosted peak must raise SPEED score (${boostedScore} vs ${defaultScore})`
);

const breakdown = calculateRewardBreakdown(
  runner,
  EvolutionGoal.SPEED,
  [],
  undefined,
  [],
  undefined,
  boosted
);
const termSum = breakdown.components.reduce((s, c) => s + c.value, 0);
assert.ok(
  Math.abs(termSum - boostedScore) < 1e-6,
  `breakdown terms must sum to fitness (${termSum} vs ${boostedScore})`
);
assert.ok(
  Math.abs(breakdown.total - boostedScore) < 1e-6,
  `breakdown total must match fitness (${breakdown.total} vs ${boostedScore})`
);

// --- JUMP_SPEED override ---
const jumper = makeCreature('jump-speed', EvolutionGoal.JUMP_SPEED);
jumper.restBodyHeight = 20;
jumper.jumpSpeedBestBoutMetrics = {
  peakSpeed: 3,
  frames: 20,
  peakClearance: 12,
};
jumper.jumpSpeedBestBoutScore = 3 * 50 + Math.min(12, jumpMinCap(20)) * 0.3 + Math.min(20, 80) * 0.35;

function jumpMinCap(restHeight: number): number {
  // match jumpRewardMinClearance: max(2, height * 0.18)
  return Math.max(2, restHeight * 0.18);
}

const jumpDefault = calculateFitness(jumper, EvolutionGoal.JUMP_SPEED);
const jumpBoostedRecipe: BuiltInRewardRecipe = {
  ...DEFAULT_BUILTIN_REWARD_RECIPE,
  jumpSpeed: { ...DEFAULT_BUILTIN_REWARD_RECIPE.jumpSpeed, peakSpeed: 100 },
};
const jumpBoosted = calculateFitness(
  jumper,
  EvolutionGoal.JUMP_SPEED,
  [],
  undefined,
  [],
  undefined,
  jumpBoostedRecipe
);
assert.ok(
  jumpBoosted > jumpDefault + 50,
  `boosted JUMP_SPEED peakSpeed must raise score (${jumpBoosted} vs ${jumpDefault})`
);

const jumpBreakdown = calculateRewardBreakdown(
  jumper,
  EvolutionGoal.JUMP_SPEED,
  [],
  undefined,
  [],
  undefined,
  jumpBoostedRecipe
);
const jumpTermSum = jumpBreakdown.components.reduce((s, c) => s + c.value, 0);
assert.ok(
  Math.abs(jumpTermSum - jumpBoosted) < 1e-6,
  `JUMP_SPEED breakdown must align (${jumpTermSum} vs ${jumpBoosted})`
);

console.log(
  `smoke-builtin-reward-recipe: PASS speed ${defaultScore.toFixed(2)}→${boostedScore.toFixed(2)} jump ${jumpDefault.toFixed(2)}→${jumpBoosted.toFixed(2)} fp=${boostedFp}`
);
