/**
 * D110 Flight Height: ballistic peak hops lose to sustained flap-powered climb.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  spawnCreature,
  updateCreaturePhysics,
  GROUND_Y,
} from '../src/physics';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  countFlexibleMuscles,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint =
  CREATURE_TEMPLATES.find(item => item.name === 'Flapper') ??
  CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(blueprint);
const nFlex = countFlexibleMuscles(blueprint.muscles);

const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.FLIGHT_HEIGHT,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: DEFAULT_CUSTOM_GOAL,
};

function make(id: string) {
  return spawnCreature(
    {
      id,
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    140,
    380,
    EvolutionGoal.FLIGHT_HEIGHT,
    1
  );
}

function scoreLedger(
  label: string,
  fields: Record<string, number>
): number {
  const creature = make(label);
  Object.assign(creature, fields);
  return calculateFitness(creature, EvolutionGoal.FLIGHT_HEIGHT);
}

// Adversarial ledger: legacy peak/COM totals cannot farm Flight Height.
const legacyPeakFarm = scoreLedger('legacy-peak', {
  flightHeightBestBoutScore: 0,
  flightHeightBoutFrames: 0,
  flightPeakClearance: 500,
  startY: 500,
  highestY: 0,
  flightFrames: 10_000,
  flightHeightIntegral: 500_000,
  wingFlapFrames: 0,
  wingFlapWork: 0,
});
assert.equal(
  legacyPeakFarm,
  0,
  'legacy episode peak/COM totals must not score without an active bout'
);

const ballistic = scoreLedger('ballistic', {
  flightHeightBoutFrames: 40,
  flightHeightBoutPeak: 120,
  flightHeightBoutIntegral: 2000,
  flightHeightBoutTakeoffClear: 8,
  flightHeightBoutPoweredClimb: 0,
  flightHeightBoutFlapBase: 0,
  flightHeightBoutWorkBase: 0,
  wingFlapFrames: 0,
  wingFlapWork: 0,
});

const climber = scoreLedger('climber', {
  flightHeightBoutFrames: 250,
  flightHeightBoutPeak: 110,
  flightHeightBoutIntegral: 16_000,
  flightHeightBoutTakeoffClear: 12,
  flightHeightBoutPoweredClimb: 80,
  flightHeightBoutFlapBase: 0,
  flightHeightBoutWorkBase: 0,
  wingFlapFrames: 140,
  wingFlapWork: 100,
  wingSymFlapFrames: 90,
  wingSymFlapQuality: 70,
});

const climberAsym = scoreLedger('climber-asym', {
  flightHeightBoutFrames: 250,
  flightHeightBoutPeak: 110,
  flightHeightBoutIntegral: 16_000,
  flightHeightBoutTakeoffClear: 12,
  flightHeightBoutPoweredClimb: 80,
  flightHeightBoutFlapBase: 0,
  flightHeightBoutWorkBase: 0,
  wingFlapFrames: 140,
  wingFlapWork: 100,
  wingSymFlapFrames: 0,
  wingSymFlapQuality: 0,
});

assert.ok(
  climber > ballistic * 1.8,
  `aero climber (${climber.toFixed(1)}) must dominate ballistic hop (${ballistic.toFixed(1)})`
);
assert.ok(
  climber > climberAsym,
  `bird-like symmetry (${climber.toFixed(1)}) must beat unmatched flap (${climberAsym.toFixed(1)})`
);

const shortStored = make('stored-short');
Object.assign(shortStored, {
  flightHeightBestBoutScore: 40,
  flightHeightBoutFrames: 0,
});
const longerActive = make('active-longer');
Object.assign(longerActive, {
  flightHeightBestBoutScore: 40,
  flightHeightBoutFrames: 220,
  flightHeightBoutPeak: 95,
  flightHeightBoutIntegral: 14_000,
  flightHeightBoutTakeoffClear: 15,
  flightHeightBoutPoweredClimb: 55,
  flightHeightBoutFlapBase: 0,
  flightHeightBoutWorkBase: 0,
  wingFlapFrames: 100,
  wingFlapWork: 70,
  wingSymFlapFrames: 60,
  wingSymFlapQuality: 45,
});
assert.ok(
  calculateFitness(longerActive, EvolutionGoal.FLIGHT_HEIGHT) >
    calculateFitness(shortStored, EvolutionGoal.FLIGHT_HEIGHT),
  'one longer active climb bout must beat a stored weak attempt'
);

function holdActions(): number[] {
  return new Array(nFlex).fill(0);
}

function flapActions(frame: number): number[] {
  const phase = frame * 0.4;
  const s = 0.55 * Math.sin(phase);
  const out: number[] = [];
  if (nFlex >= 1) out.push(s);
  if (nFlex >= 2) out.push(s);
  if (nFlex >= 3) out.push(-0.35);
  while (out.length < nFlex) out.push(0);
  return out;
}

function settle(creature: ReturnType<typeof make>, frame: number): number {
  for (let i = 0; i < 240; i += 1) {
    updateCreaturePhysics(creature, [], frame, config, [], holdActions());
    frame += 1;
    if (creature.nodes.some(n => n.isGround)) return frame;
  }
  throw new Error(`${creature.id}: did not settle`);
}

function launch(creature: ReturnType<typeof make>, upwardSpeed: number) {
  assert.ok(
    creature.nodes.some(n => n.isGround),
    `${creature.id}: launch must begin from support`
  );
  for (const node of creature.nodes) {
    node.oldY = node.y + upwardSpeed;
  }
}

function finishBout(
  creature: ReturnType<typeof make>,
  frame: number,
  actions: (f: number) => number[]
): number {
  let sawBout = false;
  for (let i = 0; i < 420; i += 1) {
    updateCreaturePhysics(creature, [], frame, config, [], actions(frame));
    frame += 1;
    sawBout ||= (creature.flightHeightBoutFrames ?? 0) > 0;
    if (
      sawBout &&
      (creature.flightHeightBoutFrames ?? 0) === 0 &&
      creature.nodes.some(n => n.isGround)
    ) {
      return frame;
    }
  }
  throw new Error(`${creature.id}: airborne bout did not finish`);
}

const inert = make('height-inert');
let inertFrame = settle(inert, 0);
for (let i = 0; i < 120; i += 1) {
  updateCreaturePhysics(inert, [], inertFrame, config, [], holdActions());
  inertFrame += 1;
}
const inertScore = calculateFitness(inert, EvolutionGoal.FLIGHT_HEIGHT);
assert.equal(inertScore, 0, 'grounded camping must not earn Flight Height');

const hop = make('height-ballistic-hop');
let hopFrame = settle(hop, 0);
launch(hop, 8.5);
hopFrame = finishBout(hop, hopFrame, holdActions);
const hopScore = calculateFitness(hop, EvolutionGoal.FLIGHT_HEIGHT);

// Scripted flapper: raise off the plant and flap — sustained aero work at height.
// spawnCreature always settles onto the floor; translate the whole body upward
// afterward so this criterion measures airborne flap, not ground hops.
const lowestRel = Math.max(
  ...blueprint.relativePositions.map(
    (p, i) => p.y + blueprint.nodes[i].radius
  )
);
const flapCreature = spawnCreature(
  {
    id: 'height-scripted-flap',
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  },
  140,
  GROUND_Y - 150 - lowestRel,
  EvolutionGoal.FLIGHT_HEIGHT,
  1
);
{
  const plantedClear = Math.min(
    ...flapCreature.nodes.map(n => GROUND_Y - (n.y + n.radius))
  );
  const lift = Math.max(0, 150 - plantedClear);
  for (const node of flapCreature.nodes) {
    node.y -= lift;
    node.oldY -= lift;
    node.isGround = false;
  }
}
for (let i = 0; i < 220; i += 1) {
  updateCreaturePhysics(flapCreature, [], i, config, [], flapActions(i));
}
const flapScore = calculateFitness(flapCreature, EvolutionGoal.FLIGHT_HEIGHT);

assert.ok(hopScore >= 0, 'ballistic hop remains a valid but weak attempt');
assert.ok(
  flapScore > hopScore * 1.5,
  `scripted flapper (${flapScore.toFixed(1)}) must beat ballistic hold-hop (${hopScore.toFixed(1)})`
);
assert.ok(
  flapScore > 120,
  `scripted flapper should clear challenge band (got ${flapScore.toFixed(1)})`
);

console.log(
  `smoke-flight-height: PASS inert=${inertScore.toFixed(2)} ballistic-ledger=${ballistic.toFixed(2)} climber-ledger=${climber.toFixed(2)} hop=${hopScore.toFixed(2)} flapper=${flapScore.toFixed(2)}`
);
