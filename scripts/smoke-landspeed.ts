/**
 * Smoke: Landspeed rewards peak grounded speed (motor twin of Flight Airspeed),
 * not finish-line racing.
 */
import assert from 'node:assert/strict';
import { calculateFitness, generateObstacles } from '../src/physics';
import { DEFAULT_ARENA_MODIFIERS, EvolutionGoal } from '../src/types';
import { getGoalInfo } from '../src/goalCatalog';

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

const GOAL = EvolutionGoal.MOTOR_LANDSPEED;
const info = getGoalInfo(GOAL);
assert.equal(info.shortLabel, 'Landspeed');
assert.equal(info.category, 'motor');

const obstacles = generateObstacles(GOAL, DEFAULT_ARENA_MODIFIERS);
assert.ok(
  !obstacles.some(o => o.type === 'finish' || o.type === 'checkpoint'),
  'flat track — no finish/checkpoints'
);

// Airborne thrash (high peakSpeed, low peakLandSpeed) must lose to real land speed
const thrash = fakeCreature({
  currentX: 100 + 400,
  peakSpeed: 12,
  peakLandSpeed: 1.5,
});
const lander = fakeCreature({
  currentX: 100 + 200,
  peakSpeed: 6,
  peakLandSpeed: 6,
});

const thrashScore = calculateFitness(thrash, GOAL, [], undefined, obstacles);
const landScore = calculateFitness(lander, GOAL, [], undefined, obstacles);
assert.ok(landScore > thrashScore, `land (${landScore}) should beat thrash (${thrashScore})`);
assert.ok(landScore > 300, `peak land 6 should score ~330+, got ${landScore}`);

// Expected formula: peak*55 + min(distance,800)*0.2
const expected = 6 * 55 + Math.min(200, 800) * 0.2;
assert.ok(Math.abs(landScore - expected) < 0.01, `score ${landScore} ≠ expected ${expected}`);

console.log('smoke-landspeed PASS', { thrashScore, landScore, expected });
