/**
 * Smoke: lofted hoop travel must score far worse than grounded rolling.
 * Run: npx tsx scripts/smoke-hoop-loft.ts
 */
import { spawnCreature, updateCreaturePhysics, generateObstacles, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
} from '../src/types';

function cfg(): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 3000,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.MOTOR_LOOP,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS, terrainEnabled: true, terrainSeed: 7, difficulty: 1 },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

const biped = CREATURE_TEMPLATES.find(t => t.name === 'Biped') ?? CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(biped);
const genome = createBaseGenome(io.inputs, io.outputs);
for (const c of genome.connections) c.weight = 0;

const creature = spawnCreature(
  { id: 'hoop_loft', generation: 0, blueprint: biped, genome },
  120,
  GROUND_Y - 50,
  EvolutionGoal.MOTOR_LOOP,
  1
);

const c = cfg();
const obstacles = generateObstacles(EvolutionGoal.MOTOR_LOOP, c.arena);
const hoop = creature.privateWorld.find(o => o.type === 'hoop');
if (!hoop) throw new Error('No hoop');

// Simulate a ballistic loft: move hoop far right while high in the air
hoop.x = hoop.startX + 800;
hoop.oldX = hoop.x;
hoop.y = GROUND_Y - 500;
hoop.oldY = hoop.y;
creature.hoopTravel = 800;
creature.hoopPeakLoft = 400;
creature.hoopLoftFrames = 120;
creature.hoopGroundedTravel = 40;
creature.fitness = 0;

// One physics tick to recompute fitness via calculateFitness path
updateCreaturePhysics(creature, obstacles, 1, c, creature.privateWorld, []);

const fit = creature.fitness;
console.log(
  `loft fitness=${fit.toFixed(1)} grounded=${creature.hoopGroundedTravel} ` +
    `rawTravel=${creature.hoopTravel} loftFrames=${creature.hoopLoftFrames} peakLoft=${creature.hoopPeakLoft}`
);

if (fit > 200) {
  console.error('FAILED: lofted hoop still scores too high');
  process.exit(1);
}
if ((creature.hoopGroundedTravel ?? 0) > 100) {
  console.error('FAILED: grounded travel should stay low for loft scenario');
  process.exit(1);
}
console.log('PASSED: lofted hoop travel is heavily penalized');
