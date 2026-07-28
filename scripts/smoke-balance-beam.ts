/**
 * D098 R1 deterministic physics smoke: Balance Beam requires a continuous
 * authored-beam support chain and cannot be won by endpoint or airborne bypass.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  generateObstacles,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Balance Beam support probe',
  nodes: [{
    id: 0,
    mass: 1,
    radius: 8,
    friction: 0.9,
    isWheel: false,
    isMotorWheel: false,
  }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const idleActions = new Array(io.outputs).fill(0);
const arena = {
  ...DEFAULT_ARENA_MODIFIERS,
  terrainEnabled: false,
  terrainObstaclesEnabled: false,
  rampEnabled: false,
  pitEnabled: false,
};
const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.BALANCE_BEAM,
  gravity: 0.4,
  groundFriction: 0.8,
  arena,
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.BALANCE_BEAM, arena);
const beam = obstacles.find(obstacle => obstacle.label === 'beam');
assert.ok(beam, 'Balance Beam must author a labelled physical beam');

function makeCreature(id: string) {
  return spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, GROUND_Y - 8, EvolutionGoal.BALANCE_BEAM, 1);
}

function place(
  creature: ReturnType<typeof makeCreature>,
  x: number,
  y: number
) {
  const node = creature.nodes[0];
  node.x = x;
  node.y = y;
  node.oldX = x;
  node.oldY = y;
  node.isGround = false;
}

function step(creature: ReturnType<typeof makeCreature>, frame: number) {
  updateCreaturePhysics(
    creature,
    obstacles,
    frame,
    config,
    [],
    idleActions
  );
}

const endpointBypass = makeCreature('beam-endpoint-bypass');
place(endpointBypass, beam.x + beam.width + 80, GROUND_Y - 8);
for (let frame = 0; frame < 20; frame += 1) step(endpointBypass, frame);
assert.equal(
  calculateFitness(endpointBypass, EvolutionGoal.BALANCE_BEAM),
  0,
  'far endpoint without beam support must score zero'
);

const leap = makeCreature('beam-airborne-leap');
place(leap, beam.x + beam.width - 10, beam.y - 100);
for (let frame = 0; frame < 10; frame += 1) step(leap, frame);
assert.equal(leap.beamCompleted, false);
assert.equal(
  calculateFitness(leap, EvolutionGoal.BALANCE_BEAM),
  0,
  'airborne beam bypass must score zero'
);

const endCamper = makeCreature('beam-end-camper');
place(endCamper, beam.x + beam.width - 12, beam.y - 8);
for (let frame = 0; frame < 120; frame += 1) step(endCamper, frame);
const camperScore = calculateFitness(endCamper, EvolutionGoal.BALANCE_BEAM);
assert.equal(endCamper.beamCompleted, false);
assert.ok(camperScore <= 30, 'stationary far-end support must remain bounded');

const intended = makeCreature('beam-intended');
let frame = 0;
const start = beam.x + 12;
const end = beam.x + beam.width - 12;
for (let x = start; x <= end; x += 6) {
  place(intended, x, beam.y - intended.nodes[0].radius);
  step(intended, frame++);
}
const intendedScore = calculateFitness(intended, EvolutionGoal.BALANCE_BEAM);
assert.equal(intended.beamCompleted, true);
assert.ok(
  (intended.beamSupportedDistance ?? 0) >= beam.width * 0.7,
  'intended traversal must prove supported beam distance'
);
assert.ok(
  intendedScore > camperScore + 700,
  'continuous beam traversal and completion must dominate end camping'
);

console.log(
  `smoke-balance-beam: PASS endpoint=0 leap=0 camper=${camperScore.toFixed(2)} intended=${intendedScore.toFixed(2)} supported-distance=${intended.beamSupportedDistance?.toFixed(2)} completed=${intended.beamCompleted}`
);
