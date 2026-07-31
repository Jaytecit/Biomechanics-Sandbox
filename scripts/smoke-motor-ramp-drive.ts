/**
 * D142 — Motor Cart must climb the Motor Ramp incline under constant drive.
 * Reconstructable authority check after Verlet actuation coupling repair.
 *
 * Run: npx tsx scripts/smoke-motor-ramp-drive.ts
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  spawnCreature,
  updateCreaturePhysics,
  GROUND_Y,
} from '../src/physics';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import { CREATURE_TEMPLATES } from '../src/templates';
import { buildGoalArena } from '../src/arenas';
import {
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
  countMotorWheels,
  countFlexibleMuscles,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0');

const cart = CREATURE_TEMPLATES.find(t => t.name === 'Motor Cart');
assert.ok(cart, 'Motor Cart template required');
assert.ok(countMotorWheels(cart.nodes) >= 2, 'Motor Cart needs powered wheels');

const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 800,
  simulationSpeed: 1,
  mutationRate: 0,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.MOTOR_RAMP,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: DEFAULT_CUSTOM_GOAL,
};

const obstacles = buildGoalArena(EvolutionGoal.MOTOR_RAMP, config.arena);
const ramp = obstacles.find(o => o.type === 'ramp');
assert.ok(ramp, 'Motor Ramp arena must include a ramp');

const io = genomeIOForBlueprint(cart);
const genome = createBaseGenome(io.inputs, io.outputs);
for (const c of genome.connections) c.weight = 0;

const creature = spawnCreature(
  {
    id: 'smoke_motor_ramp',
    generation: 0,
    blueprint: cart,
    genome,
  },
  160,
  GROUND_Y - 40,
  EvolutionGoal.MOTOR_RAMP,
  1
);

const motorCount = countMotorWheels(creature.nodes);
const muscleActs = countFlexibleMuscles(creature.muscles);
const fullDrive = [
  ...Array(Math.max(0, muscleActs)).fill(0),
  ...Array(motorCount).fill(1),
];

const startX = creature.currentX;
const startClearance = Math.min(
  ...creature.nodes.map(n => GROUND_Y - (n.y + n.radius))
);
let maxX = startX;
let maxClearance = startClearance;
let endX = startX;
for (let frame = 0; frame < 420; frame += 1) {
  updateCreaturePhysics(creature, obstacles, frame, config, [], fullDrive);
  endX = creature.currentX;
  maxX = Math.max(maxX, creature.currentX);
  for (const n of creature.nodes) {
    maxClearance = Math.max(maxClearance, GROUND_Y - (n.y + n.radius));
  }
}

const travel = maxX - startX;
const climb = maxClearance - startClearance;
assert.ok(
  travel > Math.min(180, ramp.width * 0.35),
  `Motor Cart must advance onto/along the ramp (travel=${travel.toFixed(1)}, rampW=${ramp.width})`
);
assert.ok(
  climb > Math.max(18, ramp.height * 0.08),
  `Motor Cart must climb the incline (climb=${climb.toFixed(1)}, rampH=${ramp.height}, startClr=${startClearance.toFixed(1)})`
);

console.log(
  `smoke-motor-ramp-drive: PASS travel=${travel.toFixed(1)} climb=${climb.toFixed(1)} endX=${endX.toFixed(1)} ramp=${ramp.width}x${ramp.height}`
);
