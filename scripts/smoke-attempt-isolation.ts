/**
 * D106 R2 adversarial ledger: episode-wide totals cannot combine separate
 * attempts for directional jump/flight, landing, or acrobatics goals.
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

const cases: Array<{
  goal: EvolutionGoal;
  bestField:
    | 'jumpRightBestBoutScore'
    | 'jumpLeftBestBoutScore'
    | 'flightRightBestBoutScore'
    | 'flightLeftBestBoutScore'
    | 'jumpAcrobaticsBestBoutScore'
    | 'flightAcrobaticsBestBoutScore';
}> = [
  { goal: EvolutionGoal.LONG_JUMP, bestField: 'jumpRightBestBoutScore' },
  { goal: EvolutionGoal.JUMP_LEFT, bestField: 'jumpLeftBestBoutScore' },
  { goal: EvolutionGoal.FLIGHT_RIGHT, bestField: 'flightRightBestBoutScore' },
  { goal: EvolutionGoal.FLIGHT_LEFT, bestField: 'flightLeftBestBoutScore' },
  { goal: EvolutionGoal.JUMP_ACROBATICS, bestField: 'jumpAcrobaticsBestBoutScore' },
  { goal: EvolutionGoal.FLIGHT_ACROBATICS, bestField: 'flightAcrobaticsBestBoutScore' },
];

for (const { goal, bestField } of cases) {
  const creature = make(goal, `attempt-${goal}`);
  Object.assign(creature, {
    [bestField]: 123,
    attemptBoutFrames: 0,
    attemptBoutRight: 0,
    attemptBoutLeft: 0,
    attemptBoutPeakClearance: 0,
    attemptBoutRotation: 0,
    // Deliberately inflated legacy episode totals imitate many separate bouts.
    flightFrames: 10_000,
    flightDistance: 10_000,
    flightDistanceLeft: 10_000,
    flightPeakClearance: 500,
    airborneRotation: Math.PI * 100,
    highestY: 0,
    currentX: goal === EvolutionGoal.JUMP_LEFT ||
      goal === EvolutionGoal.FLIGHT_LEFT
      ? -10_000
      : 10_000,
  });
  assert.equal(
    calculateFitness(creature, goal),
    123,
    `${goal}: legacy totals must not combine separate attempts`
  );
}

const flightLand = make(EvolutionGoal.FLIGHT_LAND, 'attempt-flight-land');
Object.assign(flightLand, {
  flightLandBestBoutScore: 321,
  flightLandScore: 0,
  landClimbScore: 0,
  landDescentScore: 0,
  landOvershootPenalty: 0,
  attemptBoutFrames: 0,
  flightLongestStreak: 10_000,
  currentY: 0,
});
assert.equal(
  calculateFitness(flightLand, EvolutionGoal.FLIGHT_LAND),
  321,
  'Flight Land must ignore episode-wide streak and final pose'
);

const activeLongJump = make(EvolutionGoal.LONG_JUMP, 'attempt-active-long-jump');
Object.assign(activeLongJump, {
  jumpRightBestBoutScore: 50,
  attemptBoutFrames: 60,
  attemptBoutRight: 200,
  attemptBoutPeakClearance: 50,
});
assert.ok(
  calculateFitness(activeLongJump, EvolutionGoal.LONG_JUMP) > 300,
  'one longer active attempt must beat the stored shorter attempt'
);

console.log(
  `smoke-attempt-isolation: PASS (${cases.length} directional/acro goals + Flight Land ignore inflated episode totals; longer single bout wins)`
);
