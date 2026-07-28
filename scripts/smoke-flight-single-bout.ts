/**
 * D113: flight / glide / parachute goals score one uninterrupted airborne bout.
 * Landing (any body part grounded) ends the attempt; hop stacking cannot accumulate.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, spawnCreature } from '../src/physics';
import { paraRampFitness } from '../src/paraPilot';
import { CREATURE_TEMPLATES } from '../src/templates';
import { EvolutionGoal, genomeIOForBlueprint } from '../src/types';

const blueprint = CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(blueprint);

function make(goal: EvolutionGoal, id: string) {
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

// Stay Aloft: inflated episode totals must not score without a bout.
const stay = make(EvolutionGoal.FLIGHT_TIME, 'stay-legacy');
Object.assign(stay, {
  flightTimeBestBoutScore: 0,
  flightTimeBoutFrames: 0,
  flightFrames: 10_000,
  flightLongestStreak: 10_000,
  flightPeakClearance: 200,
  flightHeightIntegral: 500_000,
  wingFlapFrames: 500,
  wingFlapWork: 500,
  currentX: stay.startX + 5_000,
});
assert.equal(
  calculateFitness(stay, EvolutionGoal.FLIGHT_TIME),
  0,
  'Stay Aloft must ignore episode airtime totals'
);

Object.assign(stay, {
  flightTimeBestBoutScore: 80,
  flightTimeBoutFrames: 40,
  flightTimeBoutPeak: 30,
  flightTimeBoutIntegral: 800,
  flightTimeBoutFlapBase: 0,
  flightTimeBoutWorkBase: 0,
  wingFlapFrames: 20,
  wingFlapWork: 10,
});
const stayActive = calculateFitness(stay, EvolutionGoal.FLIGHT_TIME);
assert.ok(stayActive > 80, 'active Stay Aloft bout can beat a stored short attempt');
Object.assign(stay, {
  flightTimeBestBoutScore: stayActive,
  flightTimeBoutFrames: 0,
  flightTimeBoutPeak: 0,
  flightTimeBoutIntegral: 0,
  // Imitate many later hops via episode totals.
  flightFrames: 50_000,
  flightLongestStreak: 40,
});
assert.equal(
  calculateFitness(stay, EvolutionGoal.FLIGHT_TIME),
  stayActive,
  'later Stay Aloft hops must not accumulate through episode totals'
);

// Airspeed: peak/frame/distance must be bout-local.
const airspeed = make(EvolutionGoal.FLIGHT_AIRSPEED, 'airspeed-legacy');
Object.assign(airspeed, {
  flightAirspeedBestBoutScore: 0,
  flightAirspeedBoutFrames: 0,
  peakAirSpeed: 40,
  flightFrames: 10_000,
  flightDistance: 10_000,
  flightDistanceLeft: 10_000,
});
assert.equal(
  calculateFitness(airspeed, EvolutionGoal.FLIGHT_AIRSPEED),
  0,
  'Airspeed must ignore episode peak/distance without a bout'
);
Object.assign(airspeed, {
  flightAirspeedBoutPeak: 8,
  flightAirspeedBoutFrames: 40,
  flightAirspeedBoutDist: 120,
  flightAirspeedBoutPeakClearance: 40,
});
const airspeedScore = calculateFitness(airspeed, EvolutionGoal.FLIGHT_AIRSPEED);
assert.ok(airspeedScore > 400, 'one real Airspeed bout must score');
Object.assign(airspeed, {
  flightAirspeedBestBoutScore: airspeedScore,
  flightAirspeedBoutFrames: 0,
  peakAirSpeed: 100,
  flightFrames: 50_000,
  flightDistance: 50_000,
});
assert.equal(
  calculateFitness(airspeed, EvolutionGoal.FLIGHT_AIRSPEED),
  airspeedScore,
  'Airspeed hop stacking via episode totals must not raise the score'
);

// Aerial Crossing: episode flight totals cannot grow shaping.
const cross = make(EvolutionGoal.AERIAL_CROSSING, 'cross-legacy');
Object.assign(cross, {
  aerialCrossingLanded: false,
  aerialCrossingBestShaping: 55,
  attemptBoutFrames: 0,
  flightDistance: 10_000,
  flightFrames: 10_000,
});
assert.equal(
  calculateFitness(cross, EvolutionGoal.AERIAL_CROSSING),
  55,
  'Aerial Crossing shaping must keep the best single bout only'
);

// Para Ramp: glide air terms ignore episode flight totals after landing.
const para = make(EvolutionGoal.PARA_RAMP_GLIDE, 'para-legacy');
Object.assign(para, {
  paraLaunchSpeed: 20,
  gapCleared: true,
  paraAirBestBoutScore: 200,
  glideBoutFrames: 0,
  flightDistance: 10_000,
  flightFrames: 10_000,
  sailOpenGlideDist: 10_000,
  glideCorridorFrames: 10_000,
  glideCorridorDist: 10_000,
  flightLongestStreak: 10_000,
  flightPeakClearance: 200,
});
const paraScore = paraRampFitness(para, 'glide');
assert.ok(
  paraScore < 450,
  `Para Ramp must not farm episode glide totals after landing (got ${paraScore.toFixed(1)})`
);
Object.assign(para, {
  glideBoutFrames: 200,
  glideBoutDistance: 400,
  glideBoutOpenDist: 350,
  glideBoutCorridorFrames: 120,
  glideBoutCorridorDist: 280,
  glideBoutPeakClearance: 80,
  glideBoutHeightIntegral: 12_000,
});
assert.ok(
  paraRampFitness(para, 'glide') > paraScore,
  'one longer Para Ramp airborne bout must beat a stored short air component'
);

  // Stay Aloft: matched L/R flap must score above unmatched flap effort.
  const staySym = make(EvolutionGoal.FLIGHT_TIME, 'stay-sym');
  Object.assign(staySym, {
    flightTimeBoutFrames: 80,
    flightTimeBoutPeak: 40,
    flightTimeBoutIntegral: 2400,
    flightTimeBoutFlapBase: 0,
    flightTimeBoutWorkBase: 0,
    wingFlapFrames: 50,
    wingFlapWork: 40,
    wingSymFlapFrames: 40,
    wingSymFlapQuality: 32,
  });
  const stayAsym = make(EvolutionGoal.FLIGHT_TIME, 'stay-asym');
  Object.assign(stayAsym, {
    flightTimeBoutFrames: 80,
    flightTimeBoutPeak: 40,
    flightTimeBoutIntegral: 2400,
    flightTimeBoutFlapBase: 0,
    flightTimeBoutWorkBase: 0,
    wingFlapFrames: 50,
    wingFlapWork: 40,
    wingSymFlapFrames: 0,
    wingSymFlapQuality: 0,
  });
  assert.ok(
    calculateFitness(staySym, EvolutionGoal.FLIGHT_TIME) >
      calculateFitness(stayAsym, EvolutionGoal.FLIGHT_TIME),
    'Stay Aloft must reward bird-like symmetrical flap over unmatched thrashing'
  );

  console.log(
  'smoke-flight-single-bout: PASS (Stay Aloft / Airspeed / Aerial Crossing / Para Ramp ignore hop-accumulated episode totals)'
);
