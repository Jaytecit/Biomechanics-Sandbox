/**
 * Smoke: Jump & Land scores best single return-to-takeoff hop (not sum of hops).
 */
import assert from 'node:assert/strict';
import {
  JUMP_LAND_MIN_HEIGHT,
  JUMP_LAND_RETURN_TOLERANCE,
} from '../src/physicsConstants';
import { EvolutionGoal } from '../src/types';
import { calculateFitness } from '../src/physics';

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

// Fitness is exactly the best-attempt field
const best = fakeCreature({ uprightLandingScore: 88.5 });
assert.equal(
  calculateFitness(best, EvolutionGoal.JUMP_LAND_UPRIGHT),
  88.5
);

// Zero / missing → 0
assert.equal(
  calculateFitness(fakeCreature({}), EvolutionGoal.JUMP_LAND_UPRIGHT),
  0
);

// Constants exist and are sensible for non-flight hops
assert.ok(JUMP_LAND_MIN_HEIGHT >= 16 && JUMP_LAND_MIN_HEIGHT <= 40);
assert.ok(JUMP_LAND_RETURN_TOLERANCE >= 20 && JUMP_LAND_RETURN_TOLERANCE <= 80);

console.log('smoke-jump-land: PASS');
