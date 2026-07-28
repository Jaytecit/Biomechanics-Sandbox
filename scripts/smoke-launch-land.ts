/**
 * Smoke: Launch & Land rewards gap clear + best both-wheel pad landing;
 * ramp camping / hop farming must not dominate.
 */
import assert from 'node:assert/strict';
import { calculateFitness } from '../src/physics';
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
    ...partial,
  } as any;
}

const GOAL = EvolutionGoal.MOTOR_LAUNCH_LAND;

// Ramp camping: lots of forward, no gap, no pad landing → near-zero
const camp = fakeCreature({
  currentX: 100 + 400,
  gapCleared: false,
  wheelLandScore: 0,
});
const campScore = calculateFitness(camp, GOAL);
assert.ok(campScore < 10, `ramp camp should be tiny, got ${campScore}`);

// Gap clear without wheeled pad landing beats camping, but is mid-tier
const clearOnly = fakeCreature({
  currentX: 100 + 700,
  gapCleared: true,
  wheelLandScore: 0,
});
const clearScore = calculateFitness(clearOnly, GOAL);
assert.ok(clearScore > campScore, 'gap clear must beat ramp camping');
assert.ok(clearScore > 200 && clearScore < 320, `gap-only expected ~220+, got ${clearScore}`);

// One-wheel consolation landing
const oneWheel = fakeCreature({
  currentX: 100 + 750,
  gapCleared: true,
  // peakAir 60 * (1.35+0.1) * 0.22 * soft0.8 ≈ 15.3
  wheelLandScore: 15,
});
const oneScore = calculateFitness(oneWheel, GOAL);
assert.ok(oneScore > clearScore, 'one-wheel pad landing should beat gap-only');

// Both-wheel soft pad landing dominates
const bothWheels = fakeCreature({
  currentX: 100 + 750,
  gapCleared: true,
  // peakAir 60 * (1.35+1.05) * 1.0 * 0.9 ≈ 129.6
  wheelLandScore: 130,
});
const bothScore = calculateFitness(bothWheels, GOAL);
assert.ok(bothScore > oneScore * 1.4, `both-wheel must dominate one-wheel (${bothScore} vs ${oneScore})`);
assert.ok(bothScore > 400, `both-wheel landing should be high, got ${bothScore}`);

// Pit fall is harshly penalized even with fake land score
const fell = fakeCreature({
  currentX: 100 + 500,
  gapCleared: false,
  fellInPit: true,
  wheelLandScore: 50,
});
const fellScore = calculateFitness(fell, GOAL);
assert.ok(fellScore < bothScore * 0.3, `pit fall must lose (${fellScore})`);

console.log('smoke-launch-land: PASS');
