/**
 * Smoke: Clear Gap rewards partial pit span on failed jumps, not only full clear.
 * Near-lip falls must lose to deep spans; full clear must still dominate.
 * Pre-gap wheel-jump incentive (all wheels air in the 40px left of the lip)
 * must beat approach-only / lip-drive without a jump.
 * Approach speed ranks clears and jump attempts; flat sprinting away from the
 * pit must not farm the speed term.
 */
import assert from 'node:assert/strict';
import { calculateFitness } from '../src/physics';
import {
  GAP_ATTEMPT_SPEED_MUL,
  GAP_CLEAR_SPEED_MUL,
  GAP_PRE_JUMP_BONUS,
} from '../src/physicsConstants';
import { EvolutionGoal } from '../src/types';

function fakeCreature(partial: Record<string, unknown>) {
  return {
    startX: 100,
    startY: 400,
    currentX: 100,
    currentY: 400,
    highestY: 400,
    fitness: 0,
    isAlive: true,
    nodes: [],
    muscles: [],
    blueprint: { nodes: [], muscles: [], relativePositions: [] },
    genome: { nodes: [], connections: [], inputSize: 0, outputSize: 0 },
    gapCleared: false,
    fellInPit: false,
    gapSpanFraction: 0,
    gapPreJump: false,
    peakSupportedSpeed: 0,
    peakSpeed: 0,
    ...partial,
  } as any;
}

const GOAL = EvolutionGoal.MOTOR_GAP;

const approachOnly = fakeCreature({
  currentX: 100 + 80,
  gapSpanFraction: 0,
  peakSupportedSpeed: 25,
});
const lipFall = fakeCreature({
  currentX: 100 + 120,
  fellInPit: true,
  gapSpanFraction: 0.08,
});
const lipFallWithJump = fakeCreature({
  currentX: 100 + 120,
  fellInPit: true,
  gapSpanFraction: 0.08,
  gapPreJump: true,
});
const deepJumpFall = fakeCreature({
  currentX: 100 + 200,
  fellInPit: true,
  gapSpanFraction: 0.72,
  gapPreJump: true,
});
const slowDeepJump = fakeCreature({
  currentX: 100 + 200,
  fellInPit: true,
  gapSpanFraction: 0.72,
  gapPreJump: true,
  peakSupportedSpeed: 8,
});
const fastDeepJump = fakeCreature({
  currentX: 100 + 200,
  fellInPit: true,
  gapSpanFraction: 0.72,
  gapPreJump: true,
  peakSupportedSpeed: 28,
});
const slowClear = fakeCreature({
  currentX: 100 + 400,
  gapCleared: true,
  gapSpanFraction: 1,
  gapPreJump: true,
  peakSupportedSpeed: 8,
});
const fastClear = fakeCreature({
  currentX: 100 + 400,
  gapCleared: true,
  gapSpanFraction: 1,
  gapPreJump: true,
  peakSupportedSpeed: 28,
});
const cleared = fakeCreature({
  currentX: 100 + 400,
  gapCleared: true,
  gapSpanFraction: 1,
  gapPreJump: true,
});

const approachScore = calculateFitness(approachOnly, GOAL);
const lipScore = calculateFitness(lipFall, GOAL);
const lipJumpScore = calculateFitness(lipFallWithJump, GOAL);
const deepScore = calculateFitness(deepJumpFall, GOAL);
const slowDeepScore = calculateFitness(slowDeepJump, GOAL);
const fastDeepScore = calculateFitness(fastDeepJump, GOAL);
const slowClearScore = calculateFitness(slowClear, GOAL);
const fastClearScore = calculateFitness(fastClear, GOAL);
const clearScore = calculateFitness(cleared, GOAL);

assert.ok(
  deepScore > lipScore,
  `deep failed jump must beat near-lip fall (${deepScore} vs ${lipScore})`
);
assert.ok(
  deepScore > approachScore,
  `deep failed jump must beat approach-only (${deepScore} vs ${approachScore})`
);
assert.ok(
  clearScore > deepScore,
  `full clear must beat best failed span (${clearScore} vs ${deepScore})`
);
assert.ok(lipScore > 0, `near-lip fall should keep tiny span credit, got ${lipScore}`);
assert.equal(
  lipJumpScore - lipScore,
  GAP_PRE_JUMP_BONUS,
  `pre-gap jump must add exactly ${GAP_PRE_JUMP_BONUS} points`
);
assert.ok(
  lipJumpScore > approachScore,
  `lip fall with pre-gap jump must beat approach-only (${lipJumpScore} vs ${approachScore})`
);

// Speed term is gated: approach-only with high peak gets no speed credit.
const approachNoSpeed = calculateFitness(
  fakeCreature({ currentX: 100 + 80, peakSupportedSpeed: 0 }),
  GOAL
);
assert.equal(
  approachScore,
  approachNoSpeed,
  'approach-only must not farm approach speed away from the pit'
);

assert.ok(
  fastDeepScore > slowDeepScore,
  `faster failed jump must beat slower (${fastDeepScore} vs ${slowDeepScore})`
);
assert.equal(
  Math.round((fastDeepScore - slowDeepScore) * 1000) / 1000,
  (28 - 8) * GAP_ATTEMPT_SPEED_MUL,
  `failed-jump speed delta must be peak × ${GAP_ATTEMPT_SPEED_MUL}`
);
assert.ok(
  fastClearScore > slowClearScore,
  `faster clear must beat slower clear (${fastClearScore} vs ${slowClearScore})`
);
assert.equal(
  Math.round((fastClearScore - slowClearScore) * 1000) / 1000,
  (28 - 8) * GAP_CLEAR_SPEED_MUL,
  `clear speed delta must be peak × ${GAP_CLEAR_SPEED_MUL}`
);
assert.ok(
  slowClearScore > fastDeepScore,
  `slow clear must still beat fast failed jump (${slowClearScore} vs ${fastDeepScore})`
);

console.log(
  `smoke-gap: PASS approach=${approachScore.toFixed(1)} lip=${lipScore.toFixed(1)} lipJump=${lipJumpScore.toFixed(1)} deep=${deepScore.toFixed(1)} slowDeep=${slowDeepScore.toFixed(1)} fastDeep=${fastDeepScore.toFixed(1)} slowClear=${slowClearScore.toFixed(1)} fastClear=${fastClearScore.toFixed(1)} clear=${clearScore.toFixed(1)}`
);
