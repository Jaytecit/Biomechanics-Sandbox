/**
 * D127 authorable-rate piston bone smoke.
 * Run: npx tsx scripts/smoke-piston.ts
 */
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  countFlexibleMuscles,
  isBrainDrivenMuscle,
  isPiston,
  isHardLengthConstraint,
  resolveLinkKind,
  pistonRates,
} from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function baseConfig(): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 600,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function pistonBlueprint(opts: {
  extendRate: number;
  retractRate: number;
  minLength?: number;
  maxLength?: number;
}): CreatureBlueprint {
  const minLength = opts.minLength ?? 50;
  const maxLength = opts.maxLength ?? 110;
  return {
    name: 'PistonSmoke',
    nodes: [
      { id: 0, mass: 1, radius: 10, friction: 0.5 },
      { id: 1, mass: 1, radius: 10, friction: 0.5 },
    ],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 80,
        minLength,
        maxLength,
        strength: 1.0,
        phaseOffset: 0,
        linkKind: 'piston',
        extendRate: opts.extendRate,
        retractRate: opts.retractRate,
      },
    ],
    relativePositions: [
      { x: -40, y: -40 },
      { x: 40, y: -40 },
    ],
  };
}

function spawnFrom(blueprint: CreatureBlueprint): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: 'piston_smoke',
      generation: 0,
      blueprint,
      genome,
    },
    200,
    GROUND_Y - 80,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
}

function strutLength(creature: Creature): number {
  const a = creature.nodes[0];
  const b = creature.nodes[1];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

assert(SOFT_BODY_PHYSICS_VERSION === '4.21.0', `expected physics 4.21.0, got ${SOFT_BODY_PHYSICS_VERSION}`);

{
  const blueprint = pistonBlueprint({ extendRate: 2, retractRate: 2 });
  assert(resolveLinkKind(blueprint.muscles[0]) === 'piston', 'linkKind piston');
  assert(isPiston(blueprint.muscles[0]), 'isPiston');
  assert(isHardLengthConstraint(blueprint.muscles[0]), 'hard constraint');
  assert(countFlexibleMuscles(blueprint.muscles) === 1, 'lone piston is an actuator');
  assert(isBrainDrivenMuscle(blueprint.muscles[0], blueprint.muscles), 'brain-driven');
  const rates = pistonRates(blueprint.muscles[0]);
  assert(rates.extendRate === 2 && rates.retractRate === 2, 'authored rates resolve');
  console.log('ok piston identity + rates');
}

{
  const cfg = baseConfig();
  const blueprint = pistonBlueprint({ extendRate: 2, retractRate: 2 });
  const creature = spawnFrom(blueprint);
  const lengths: number[] = [];
  for (let i = 0; i < 12; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [1]);
    lengths.push(creature.muscles[0].targetLength);
  }
  const step = lengths[1] - lengths[0];
  assert(Math.abs(step - 2) < 0.05, `slow extend step should be ~2, got ${step}`);
  assert(lengths[11] < 110 - 1, `slow piston should not finish stroke in 12 ticks (len=${lengths[11]})`);
  console.log(`ok slow piston rate-limits extend (Δ=${step.toFixed(2)})`);
}

{
  const cfg = baseConfig();
  const blueprint = pistonBlueprint({ extendRate: 60, retractRate: 60 });
  const creature = spawnFrom(blueprint);
  for (let i = 0; i < 8; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [1]);
  }
  assert(
    Math.abs(creature.muscles[0].targetLength - 110) < 0.5,
    `fast piston should hit max quickly (target=${creature.muscles[0].targetLength})`
  );
  for (let i = 0; i < 40; i++) {
    updateCreaturePhysics(creature, [], 100 + i, cfg, [], [1]);
  }
  const len = strutLength(creature);
  assert(Math.abs(len - 110) < 5, `fast piston geometry should hold max (len=${len})`);
  console.log('ok fast piston reaches max');
}

{
  const cfg = baseConfig();
  const blueprint = pistonBlueprint({ extendRate: 30, retractRate: 1 });
  const creature = spawnFrom(blueprint);
  for (let i = 0; i < 20; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [1]);
  }
  assert(creature.muscles[0].targetLength > 100, 'should be near max before retract');
  const before = creature.muscles[0].targetLength;
  updateCreaturePhysics(creature, [], 50, cfg, [], [-1]);
  const delta = before - creature.muscles[0].targetLength;
  assert(Math.abs(delta - 1) < 0.05, `retract step should be ~1, got ${delta}`);
  console.log(`ok asymmetric retract rate (Δ=${delta.toFixed(2)})`);
}

console.log('smoke-piston: all checks passed');
