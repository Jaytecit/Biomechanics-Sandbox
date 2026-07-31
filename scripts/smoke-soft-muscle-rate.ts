/**
 * D150: soft-muscle command rate caps + telescope→piston migration.
 * Run: npx tsx scripts/smoke-soft-muscle-rate.ts
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
  normalizeCreatureBlueprint,
  normalizeBlueprintMuscle,
  resolveLinkKind,
  resolveSoftMuscleMaxDelta,
  isPiston,
  isBrainDrivenMuscle,
  countFlexibleMuscles,
} from '../src/types';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  SOFT_BODY_PHYSICS_VERSION === '4.26.0',
  `expected physics 4.26.0, got ${SOFT_BODY_PHYSICS_VERSION}`
);

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

function softBlueprint(opts: {
  softMaxDeltaPerTick?: number;
  bodySoftMax?: number;
}): CreatureBlueprint {
  return {
    name: 'SoftRateSmoke',
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
        minLength: 50,
        maxLength: 110,
        strength: 0.6,
        phaseOffset: 0,
        linkKind: 'muscle',
        ...(opts.softMaxDeltaPerTick !== undefined
          ? { softMaxDeltaPerTick: opts.softMaxDeltaPerTick }
          : {}),
      },
    ],
    relativePositions: [
      { x: -40, y: -40 },
      { x: 40, y: -40 },
    ],
    ...(opts.bodySoftMax !== undefined
      ? { softMuscleMaxDeltaPerTick: opts.bodySoftMax }
      : {}),
  };
}

function spawnFrom(blueprint: CreatureBlueprint): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: 'soft_rate_smoke',
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

{
  // Legacy telescope JSON → piston with rates
  const legacy = normalizeBlueprintMuscle({
    id: 0,
    nodeA: 0,
    nodeB: 1,
    originalLength: 80,
    minLength: 50,
    maxLength: 110,
    strength: 1,
    phaseOffset: 0,
    linkKind: 'telescope',
  });
  assert(legacy.linkKind === 'piston', 'telescope normalizes to piston');
  assert(isPiston(legacy), 'normalized isPiston');
  assert(
    typeof legacy.extendRate === 'number' && legacy.extendRate > 0,
    'seeded extendRate'
  );
  assert(
    typeof legacy.retractRate === 'number' && legacy.retractRate > 0,
    'seeded retractRate'
  );
  console.log('ok telescope→piston normalize');
}

{
  const orphan = {
    id: 0,
    nodeA: 0,
    nodeB: 1,
    originalLength: 65,
    minLength: 40,
    maxLength: 130,
    strength: 1.0,
    phaseOffset: 0,
  };
  assert(resolveLinkKind(orphan) === 'piston', 'stiff variable span infers piston');
  assert(isBrainDrivenMuscle(orphan, [orphan]), 'inferred piston brain-driven');
  assert(countFlexibleMuscles([orphan]) === 1, 'inferred piston counts as actuator');
  console.log('ok legacy stiff range infers piston');
}

{
  const bp = normalizeCreatureBlueprint(
    softBlueprint({ bodySoftMax: 0.5 })
  );
  assert(bp.softMuscleMaxDeltaPerTick === 0.5, 'body soft cap kept');
  const budget = resolveSoftMuscleMaxDelta(bp.muscles[0], bp);
  assert(budget === 0.5, `inherit body budget got ${budget}`);
  console.log('ok resolve inherit body cap');
}

{
  const bp = softBlueprint({ bodySoftMax: 0.5, softMaxDeltaPerTick: 0 });
  assert(resolveSoftMuscleMaxDelta(bp.muscles[0], bp) === null, 'muscle 0 = unlimited override');
  console.log('ok muscle unlimited override');
}

{
  const bp = softBlueprint({ bodySoftMax: 0.5, softMaxDeltaPerTick: 2 });
  assert(resolveSoftMuscleMaxDelta(bp.muscles[0], bp) === 2, 'muscle custom overrides body');
  console.log('ok muscle custom override');
}

{
  const cfg = baseConfig();
  const creature = spawnFrom(softBlueprint({}));
  updateCreaturePhysics(creature, [], 0, cfg, [], [-1]);
  const lo = creature.muscles[0].targetLength;
  updateCreaturePhysics(creature, [], 1, cfg, [], [1]);
  const hi = creature.muscles[0].targetLength;
  assert(Math.abs(hi - lo) > 40, `unlimited soft should flip nearly full stroke (Δ=${hi - lo})`);
  console.log(`ok unlimited soft snaps (Δ=${(hi - lo).toFixed(2)})`);
}

{
  const cfg = baseConfig();
  const creature = spawnFrom(softBlueprint({ softMaxDeltaPerTick: 2 }));
  updateCreaturePhysics(creature, [], 0, cfg, [], [-1]);
  // settle near min
  for (let i = 0; i < 40; i++) updateCreaturePhysics(creature, [], i, cfg, [], [-1]);
  const before = creature.muscles[0].targetLength;
  updateCreaturePhysics(creature, [], 50, cfg, [], [1]);
  const delta = creature.muscles[0].targetLength - before;
  assert(Math.abs(delta - 2) < 0.05, `capped soft step should be ~2, got ${delta}`);
  console.log(`ok capped soft rate-limits (Δ=${delta.toFixed(2)})`);
}

{
  const cfg = baseConfig();
  const creature = spawnFrom(
    softBlueprint({ bodySoftMax: 1.5, softMaxDeltaPerTick: 0 })
  );
  updateCreaturePhysics(creature, [], 0, cfg, [], [-1]);
  for (let i = 0; i < 40; i++) updateCreaturePhysics(creature, [], i, cfg, [], [-1]);
  const before = creature.muscles[0].targetLength;
  updateCreaturePhysics(creature, [], 50, cfg, [], [1]);
  const delta = creature.muscles[0].targetLength - before;
  assert(delta > 40, `unlimited override must ignore body cap (Δ=${delta})`);
  console.log(`ok unlimited override ignores body (Δ=${delta.toFixed(2)})`);
}

console.log('smoke-soft-muscle-rate: all checks passed');
