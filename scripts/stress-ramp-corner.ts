/**
 * Ramp-lip stability regression.
 *
 * Drives a rigid wheeled probe over the canonical motor ramp and records
 * the two symptoms of collision/constraint energy injection: link deformation
 * and unbounded single-frame node travel.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  generateObstacles,
  GROUND_Y,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { createBaseGenome } from '../src/neat';
import {
  countFlexibleMuscles,
  countMotorWheels,
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  genomeIOForBlueprint,
  SimulationConfig,
} from '../src/types';

const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 1200,
  simulationSpeed: 1,
  mutationRate: 0,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.MOTOR_RAMP,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS, difficulty: 1 },
  customGoal: DEFAULT_CUSTOM_GOAL,
  paraStageBestHistory: [],
};

const probeCart: CreatureBlueprint = {
  name: 'Ramp Probe Cart',
  nodes: [
    { id: 0, mass: 2, radius: 11, friction: 0.2, color: '#64748b' },
    { id: 1, mass: 2, radius: 11, friction: 0.2, color: '#475569' },
    {
      id: 2,
      mass: 1.5,
      radius: 12,
      friction: 0.05,
      color: '#f59e0b',
      isWheel: true,
      isMotorWheel: true,
      motorPower: 0.55,
    },
    {
      id: 3,
      mass: 1.5,
      radius: 12,
      friction: 0.05,
      color: '#d97706',
      isWheel: true,
      isMotorWheel: true,
      motorPower: 0.55,
    },
  ],
  muscles: [
    { id: 0, nodeA: 0, nodeB: 1, originalLength: 70, minLength: 70, maxLength: 70, strength: 1, phaseOffset: 0 },
    { id: 1, nodeA: 0, nodeB: 2, originalLength: 28, minLength: 28, maxLength: 28, strength: 1, phaseOffset: 0 },
    { id: 2, nodeA: 1, nodeB: 3, originalLength: 28, minLength: 28, maxLength: 28, strength: 1, phaseOffset: 0 },
    { id: 3, nodeA: 0, nodeB: 3, originalLength: 78, minLength: 78, maxLength: 78, strength: 1, phaseOffset: 0 },
    { id: 4, nodeA: 1, nodeB: 2, originalLength: 78, minLength: 78, maxLength: 78, strength: 1, phaseOffset: 0 },
  ],
  relativePositions: [
    { x: -28, y: -38 },
    { x: 28, y: -38 },
    { x: -32, y: -12 },
    { x: 32, y: -12 },
  ],
};

const blueprint = probeCart;
const goal = EvolutionGoal.MOTOR_RAMP;
const runConfig = { ...config, goal };
const obstacles = generateObstacles(goal, runConfig.arena);
const ramp = obstacles.find(obstacle => obstacle.type === 'ramp');
assert.ok(ramp, 'ramp exists');
const io = genomeIOForBlueprint(blueprint);
const creature = spawnCreature(
  {
    id: 'ramp-stress-probe',
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  },
  100,
  GROUND_Y - 50,
  goal,
  1
);
const actuators = [
  ...Array(countFlexibleMuscles(blueprint.muscles)).fill(0),
  ...Array(countMotorWheels(blueprint.nodes)).fill(1),
];

let maxStretchRatio = 1;
let maxNodeTravel = 0;
let maxStretchFrame = -1;
let maxTravelFrame = -1;
let lipFrame = -1;
const started = performance.now();
for (let frame = 0; frame < runConfig.generationDuration; frame += 1) {
  updateCreaturePhysics(creature, obstacles, frame, runConfig, [], actuators);
  if (
    lipFrame < 0 &&
    creature.nodes.some(
      node => node.x >= ramp!.x && node.x <= ramp!.x + ramp!.width && node.y + node.radius >= ramp!.y - 2
    )
  ) {
    lipFrame = frame;
  }
  for (const muscle of creature.muscles) {
    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const maxLen = Math.max(1, muscle.maxLength);
    const ratio = len / maxLen;
    if (ratio > maxStretchRatio) {
      maxStretchRatio = ratio;
      maxStretchFrame = frame;
    }
  }
  for (const node of creature.nodes) {
    const travel = Math.hypot(node.x - node.oldX, node.y - node.oldY);
    if (travel > maxNodeTravel) {
      maxNodeTravel = travel;
      maxTravelFrame = frame;
    }
  }
  if (lipFrame >= 0 && frame > lipFrame + 90) break;
}
const elapsedMs = performance.now() - started;

console.log(
  `Ramp Probe Cart: lipFrame=${lipFrame} maxStretch=${maxStretchRatio.toFixed(3)}@${maxStretchFrame} ` +
    `maxTravel=${maxNodeTravel.toFixed(2)}@${maxTravelFrame} elapsed=${elapsedMs.toFixed(1)}ms`
);

assert.ok(lipFrame >= 0, 'probe reaches the ramp lip');
assert.ok(
  maxStretchRatio < 1.25,
  'links remain within 25% of their authored maximum at the ramp lip'
);
assert.ok(maxNodeTravel < 180, 'no catapult-scale single-frame displacement');

console.log('stress-ramp-corner: PASS (bounded lip deformation and node travel)');
