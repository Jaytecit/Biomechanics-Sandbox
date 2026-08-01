/**
 * D161: session oscillationIgnore reverse-dwell filter.
 * Run: npx tsx scripts/smoke-oscillation-ignore.ts
 */
import assert from 'node:assert/strict';
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import {
  LENGTH_ACTUATION_EPS_PX,
  OSCILLATION_IGNORE_MAX_DWELL_TICKS,
  SOFT_BODY_PHYSICS_VERSION,
  clampOscillationIgnore,
  oscillationIgnoreDwellTicks,
} from '../src/physicsConstants';
import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0');
assert.equal(OSCILLATION_IGNORE_MAX_DWELL_TICKS, 24);
assert.equal(clampOscillationIgnore(undefined), 0);
assert.equal(clampOscillationIgnore(-1), 0);
assert.equal(clampOscillationIgnore(0), 0);
assert.equal(clampOscillationIgnore(0.5), 0.5);
assert.equal(clampOscillationIgnore(2), 1);
assert.equal(oscillationIgnoreDwellTicks(0), 0);
assert.equal(oscillationIgnoreDwellTicks(1), OSCILLATION_IGNORE_MAX_DWELL_TICKS);
assert.equal(oscillationIgnoreDwellTicks(0.5), 12);

function baseConfig(oscillationIgnore = 0): SimulationConfig {
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
    oscillationIgnore,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function duoBlueprint(): CreatureBlueprint {
  return {
    name: 'OscillationIgnoreSmoke',
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
        strength: 0.9,
        phaseOffset: 0,
        linkKind: 'muscle',
        // Unlimited soft: full-stroke snaps so reverse-dwell is unambiguous.
      },
    ],
    relativePositions: [
      { x: -40, y: -40 },
      { x: 40, y: -40 },
    ],
  };
}

function spawnFrom(): Creature {
  const blueprint = duoBlueprint();
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: 'oscillation_ignore_smoke',
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
  // Default off: every-tick full-stroke flip-flop still moves targetLength.
  const creature = spawnFrom();
  const cfg = baseConfig(0);
  for (let i = 0; i < 20; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [0]);
  }
  const m = creature.muscles[0];
  const mid = m.targetLength;
  updateCreaturePhysics(creature, [], 30, cfg, [], [1]);
  const extended = m.targetLength;
  assert.ok(extended > mid + LENGTH_ACTUATION_EPS_PX, 'off: extend must apply');
  updateCreaturePhysics(creature, [], 31, cfg, [], [-1]);
  assert.ok(
    m.targetLength < extended - LENGTH_ACTUATION_EPS_PX,
    'off: immediate reverse must apply (legacy buzz path)'
  );
  console.log('ok ignore=0 preserves immediate reverse');
}

{
  // Strength 0.5 → 12-tick dwell: reverse held until dwell met.
  const dwell = oscillationIgnoreDwellTicks(0.5);
  assert.equal(dwell, 12);
  const creature = spawnFrom();
  const cfg = baseConfig(0.5);
  for (let i = 0; i < 20; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [0]);
  }
  const m = creature.muscles[0];
  updateCreaturePhysics(creature, [], 30, cfg, [], [1]);
  const extended = m.targetLength;
  assert.ok(extended > 100, 'first extend accepted');
  // After accept: strokeTicks = 1. Reject while ticks < dwell (ticks 1…dwell-1).
  for (let i = 0; i < dwell - 1; i++) {
    updateCreaturePhysics(creature, [], 40 + i, cfg, [], [-1]);
    assert.equal(
      m.targetLength,
      extended,
      `reverse ignored while strokeTicks ${i + 1} < ${dwell}`
    );
  }
  // After (dwell-1) rejects, strokeTicks === dwell → next reverse is accepted.
  updateCreaturePhysics(creature, [], 40 + (dwell - 1), cfg, [], [-1]);
  assert.ok(
    m.targetLength < extended - LENGTH_ACTUATION_EPS_PX,
    'reverse accepted once dwell satisfied'
  );
  console.log(`ok ignore=0.5 holds reverse for ${dwell - 1} ticks then accepts`);
}

{
  // Sustained same-direction command still ramps (ignore must not freeze intentional strokes).
  const creature = spawnFrom();
  const cfg = baseConfig(1);
  for (let i = 0; i < 15; i++) {
    updateCreaturePhysics(creature, [], i, cfg, [], [0]);
  }
  const m = creature.muscles[0];
  const start = m.targetLength;
  for (let i = 0; i < 5; i++) {
    updateCreaturePhysics(creature, [], 20 + i, cfg, [], [1]);
  }
  assert.ok(
    m.targetLength > start + LENGTH_ACTUATION_EPS_PX,
    'sustained extend must still move under max ignore'
  );
  console.log('ok sustained stroke still couples under ignore=1');
}

console.log(
  `smoke-oscillation-ignore: PASS (physics ${SOFT_BODY_PHYSICS_VERSION})`
);
