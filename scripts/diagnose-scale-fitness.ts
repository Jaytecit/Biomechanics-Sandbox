/**
 * Post–CREATURE_WORLD_SCALE fitness / observation diagnostic.
 * Measures body size, upright score, brain input magnitudes, and open-loop
 * fitness for key templates × goals so we can see what collapsed after 0.1×.
 *
 * Run: npx tsx scripts/diagnose-scale-fitness.ts
 */
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  getUprightScore,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import {
  UPRIGHT_SCORE_GOOD,
  measureNodeExtents,
  jumpRewardMinClearance,
  flightRewardMinClearance,
} from '../src/physicsConstants';
import {
  BODY_OBS_LENGTH_DIVISOR,
  CREATURE_WORLD_SCALE,
} from '../src/creatureScale';
import { CREATURE_TEMPLATES } from '../src/templates';
import { buildGoalArena, buildGoalWorldObjects } from '../src/arenas';
import {
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
  countMotorWheels,
  countFlexibleMuscles,
} from '../src/types';

const FRAMES = 480;

function configFor(goal: EvolutionGoal): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: FRAMES,
    simulationSpeed: 1,
    mutationRate: 0.1,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function findTemplate(name: string) {
  const t = CREATURE_TEMPLATES.find(x => x.name === name);
  if (!t) throw new Error(`missing template ${name}`);
  return t;
}

function openLoopActions(creature: ReturnType<typeof spawnCreature>, mode: 'idle' | 'drive' | 'pulse') {
  const muscleActs = countFlexibleMuscles(creature.muscles);
  const motors = countMotorWheels(creature.nodes);
  if (mode === 'idle') return Array(muscleActs + motors).fill(0);
  if (mode === 'drive') {
    return [
      ...Array(muscleActs).fill(0),
      ...Array(motors).fill(1),
    ];
  }
  // Alternating muscle pulse — crude walker/jumper probe
  return [
    ...Array(muscleActs).fill(0).map((_, i) => (i % 2 === 0 ? 1 : -1)),
    ...Array(motors).fill(0.5),
  ];
}

function runEpisode(
  templateName: string,
  goal: EvolutionGoal,
  mode: 'idle' | 'drive' | 'pulse'
) {
  const blueprint = findTemplate(templateName);
  const io = genomeIOForBlueprint(blueprint);
  const config = configFor(goal);
  const obstacles = buildGoalArena(goal, config.arena);
  const objects = buildGoalWorldObjects(goal, undefined, 1);
  const creature = spawnCreature(
    {
      id: `${templateName}_${goal}`,
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    100,
    380,
    goal,
    1
  );
  const actions = openLoopActions(creature, mode);
  const extents = measureNodeExtents(creature.nodes);
  const upright0 = getUprightScore(creature);
  let maxAbsNodeInput = 0;

  for (let frame = 0; frame < FRAMES; frame += 1) {
    updateCreaturePhysics(creature, obstacles, frame, config, objects, actions);
  }

  // Observation magnitude from final pose (matches physics brain divisor)
  const cx = creature.currentX;
  const cy = creature.currentY;
  for (const n of creature.nodes) {
    maxAbsNodeInput = Math.max(
      maxAbsNodeInput,
      Math.abs((n.x - cx) / BODY_OBS_LENGTH_DIVISOR),
      Math.abs((n.y - cy) / BODY_OBS_LENGTH_DIVISOR)
    );
  }

  const fitness = calculateFitness(creature, goal, objects, undefined, obstacles);
  return {
    template: templateName,
    goal,
    mode,
    bodyW: +extents.width.toFixed(2),
    bodyH: +extents.height.toFixed(2),
    jumpMin: +jumpRewardMinClearance(extents.height).toFixed(2),
    flightMin: +flightRewardMinClearance(extents.height, extents.width).toFixed(2),
    upright0: +upright0.toFixed(2),
    uprightEnd: +getUprightScore(creature).toFixed(2),
    uprightGood: UPRIGHT_SCORE_GOOD,
    travel: +(creature.currentX - creature.startX).toFixed(2),
    peakClr: +(creature.jumpHeightBestClearance ?? creature.airbornePeakHeight ?? 0).toFixed(2),
    stepsR: creature.walkStepCountRight ?? 0,
    altR: creature.walkAlternateStepCountRight ?? 0,
    stridesR: +(creature.walkStrideDistanceRight ?? 0).toFixed(2),
    maxAbsNodeObs: +maxAbsNodeInput.toFixed(4),
    fitness: +fitness.toFixed(3),
    masses: creature.nodes.map(n => +n.mass.toFixed(5)),
    motorPower: creature.nodes.filter(n => n.isMotorWheel).map(n => n.motorPower),
  };
}

console.log('CREATURE_WORLD_SCALE =', CREATURE_WORLD_SCALE);
console.log('');

const cases: Array<[string, EvolutionGoal, 'idle' | 'drive' | 'pulse']> = [
  ['Sprongo', EvolutionGoal.LOCOMOTION_RIGHT, 'pulse'],
  ['Sprongo', EvolutionGoal.SHUFFLE_RIGHT, 'pulse'],
  ['Sprongo', EvolutionGoal.SPEED, 'pulse'],
  ['Sprongo', EvolutionGoal.STAY_UPRIGHT, 'idle'],
  ['Sprongo', EvolutionGoal.HIGH_JUMP, 'pulse'],
  ['Sprongo', EvolutionGoal.LONG_JUMP, 'pulse'],
  ['Sprongo', EvolutionGoal.JUMP_LAND_UPRIGHT, 'pulse'],
  ['Tool Eggs', EvolutionGoal.HIGH_JUMP, 'pulse'],
  ['Motor Cart', EvolutionGoal.MOTOR_DRIVE, 'drive'],
  ['Motor Cart', EvolutionGoal.MOTOR_RAMP, 'drive'],
  ['Motor Cart', EvolutionGoal.MOTOR_LANDSPEED, 'drive'],
  ['Motor Cart', EvolutionGoal.SPEED, 'drive'],
  ['RoboBird', EvolutionGoal.FLIGHT_TIME, 'pulse'],
  ['RoboBird', EvolutionGoal.FLIGHT_HEIGHT, 'pulse'],
  ['RoboBird', EvolutionGoal.FLIGHT_LAND, 'pulse'],
  ['RoboBird', EvolutionGoal.FLIGHT_RIGHT, 'pulse'],
];

const rows = cases.map(([t, g, m]) => runEpisode(t, g, m));
console.table(rows);

// Estimate legacy-equivalent upright for a standing scaled body
const sprongo = findTemplate('Sprongo');
const io = genomeIOForBlueprint(sprongo);
const c = spawnCreature(
  {
    id: 'upright_probe',
    generation: 0,
    blueprint: sprongo,
    genome: createBaseGenome(io.inputs, io.outputs),
  },
  100,
  380,
  EvolutionGoal.STAY_UPRIGHT,
  1
);
const u = getUprightScore(c);
console.log('\nSprongo standing uprightScore =', u.toFixed(2),
  '| UPRIGHT_SCORE_GOOD =', UPRIGHT_SCORE_GOOD,
  '| flight-land gate passes?', u > UPRIGHT_SCORE_GOOD,
  '| legacy-scale upright would be ~', (u / CREATURE_WORLD_SCALE).toFixed(1));

const extents = measureNodeExtents(c.nodes);
console.log('Body AABB', extents.width.toFixed(1), '×', extents.height.toFixed(1),
  '| node obs /', BODY_OBS_LENGTH_DIVISOR, 'max ~',
  (Math.max(extents.width, extents.height) / 2 / BODY_OBS_LENGTH_DIVISOR).toFixed(4),
  '| broken legacy /100 would be ~',
  (Math.max(extents.width, extents.height) / 2 / 100).toFixed(4));

