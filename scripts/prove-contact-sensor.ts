/**
 * C2 / D147 — Contact / touch sensor behavioural gate.
 *
 * Script-local scores only — no shipped reward rewrite.
 * Object-class tagging is covered by `smoke-contact-sensor.ts`.
 *
 * A) Reactive wall retreat — drive into held-out box walls; latch reverse on
 *    structure class (node or link). Ablation (class stripped) must not retreat.
 * B) Learnability — fixed-morph Motor Cart, weight-only NEAT on the same retreat
 *    task. ≥2/3 seeds: training rise + majority held-out beat of gen-0 and
 *    ablation.
 *
 * Run: npx tsx scripts/prove-contact-sensor.ts
 */
import assert from 'node:assert/strict';
import { cloneGenome, createBaseGenome, mutateWeights } from '../src/neat';
import {
  GROUND_Y,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  CONTACT_SENSOR_COUNT,
  Creature,
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  Genome,
  Obstacle,
  SimulationConfig,
  contactSensorValues,
  genomeIOForBlueprint,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0');

const SEEDS = [17, 29, 41];
const REQUIRED_PASS_SEEDS = 2;
const POP = 16;
const GENERATIONS = 16;
const EPISODE_FRAMES = 320;
const SPAWN_X = 100;
const TRAIN_WALLS = [300, 380, 460] as const;
const HELD_OUT_WALLS = [340, 420, 520] as const;
const REACTIVE_WALLS = [280, 360, 440, 540] as const;
const FIT_IMPROVE_ABS = 16;
const HOLDOUT_MARGIN = 10;
const ABLATION_MARGIN = 10;
const HOLDOUT_MAJORITY = 2;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withRng<T>(seed: number, fn: () => T): T {
  const rnd = mulberry32(seed);
  const original = Math.random;
  Math.random = rnd;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function motorCart(): CreatureBlueprint {
  const t = CREATURE_TEMPLATES.find(b => b.name === 'Motor Cart');
  if (!t) throw new Error('Missing Motor Cart');
  return t;
}

function cfg(goal: EvolutionGoal): SimulationConfig {
  return {
    populationSize: POP,
    generationDuration: EPISODE_FRAMES,
    simulationSpeed: 1,
    mutationRate: 0.35,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.85,
    arena: {
      ...DEFAULT_ARENA_MODIFIERS,
      windEnabled: false,
      terrainEnabled: false,
      terrainObstaclesEnabled: false,
      rampEnabled: false,
      pitEnabled: false,
    },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function groundedSpawnY(blueprint: CreatureBlueprint): number {
  const lowest = Math.max(
    ...blueprint.nodes.map(
      (node, i) => (blueprint.relativePositions[i]?.y ?? 0) + node.radius
    )
  );
  return GROUND_Y - lowest;
}

function makeWall(faceX: number): Obstacle {
  return {
    type: 'box',
    x: faceX,
    y: GROUND_Y - 52,
    width: 20,
    height: 52,
  };
}

/**
 * Higher is better: reach the wall, then retreat after structure contact.
 * Passive blocking alone does not score — ablation keeps pressing and earns ~0 retreat.
 */
function wallParkScore(
  blueprint: CreatureBlueprint,
  wallFaceX: number,
  drive: (creature: Creature) => number[] | undefined,
  ablateContact = false
): number {
  const config = cfg(EvolutionGoal.MOTOR_DRIVE);
  const io = genomeIOForBlueprint(blueprint);
  const wall = makeWall(wallFaceX);
  const creature = spawnCreature(
    {
      id: 'wall',
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    SPAWN_X,
    groundedSpawnY(blueprint),
    EvolutionGoal.MOTOR_DRIVE,
    1
  );

  let contacted = false;
  let peakXAtContact = 0;
  let bestRetreat = 0;
  let approach = 0;
  let overshootFrames = 0;

  for (let frame = 0; frame < EPISODE_FRAMES; frame += 1) {
    const override = drive(creature);
    updateCreaturePhysics(
      creature,
      [wall],
      frame,
      config,
      [],
      override,
      { ablateContactSensors: ablateContact }
    );
    const pack = contactSensorValues(creature, false);
    const structureNow = pack[1] > 0 || pack[3] > 0;
    approach = Math.max(approach, creature.currentX - SPAWN_X);
    if (structureNow && !contacted) {
      contacted = true;
      peakXAtContact = creature.currentX;
    }
    if (contacted) {
      peakXAtContact = Math.max(peakXAtContact, creature.currentX);
      bestRetreat = Math.max(bestRetreat, peakXAtContact - creature.currentX);
    }
    if (creature.currentX > wallFaceX + 8) overshootFrames += 1;
  }

  const reachBonus = contacted ? 40 : Math.min(30, approach * 0.15);
  const retreat = Math.min(90, bestRetreat);
  return reachBonus + retreat * 2.8 - overshootFrames * 1.5;
}

function genomeDrive(genome: Genome) {
  return (creature: Creature): undefined => {
    creature.genome = genome;
    return undefined;
  };
}

function reactiveWallDrive(ablate: boolean) {
  // Latch reverse after first structure contact so retreat is decisive.
  let latched = false;
  return (creature: Creature): number[] => {
    const pack = contactSensorValues(creature, ablate);
    if (pack[1] > 0 || pack[3] > 0) latched = true;
    const drive = latched ? -1 : 1;
    const io = genomeIOForBlueprint(creature.blueprint);
    return new Array(io.outputs).fill(drive);
  };
}

function proveReactiveWall(): void {
  const blueprint = motorCart();
  let sensedWins = 0;
  let ablatedFails = 0;
  for (const face of REACTIVE_WALLS) {
    const sensed = wallParkScore(blueprint, face, reactiveWallDrive(false), false);
    const ablated = wallParkScore(blueprint, face, reactiveWallDrive(true), true);
    const ok = sensed >= 70 && sensed >= ablated + 30;
    console.log(
      `  wall x=${face}: sensed=${sensed.toFixed(1)} ablated=${ablated.toFixed(1)} ${ok ? 'OK' : 'WEAK'}`
    );
    if (sensed >= 70) sensedWins += 1;
    if (ablated <= sensed - 25) ablatedFails += 1;
  }
  assert.ok(
    sensedWins >= 3,
    `reactive structure brake must succeed on ≥3/4 held-outs (got ${sensedWins})`
  );
  assert.ok(
    ablatedFails >= 3,
    `ablated wall drive must underperform ≥3/4 held-outs (got ${ablatedFails})`
  );
  console.log('reactive wall retreat: PASS');
}

function trainSeed(seed: number): {
  seed: number;
  gen0: number;
  best: number;
  heldOut: Array<{
    wallX: number;
    sensed: number;
    ablated: number;
    gen0: number;
    beatGen0: boolean;
    beatAblation: boolean;
  }>;
  passed: boolean;
} {
  return withRng(seed, () => {
    const blueprint = motorCart();
    const io = genomeIOForBlueprint(blueprint);
    assert.ok(io.inputs >= 2 + 3 * blueprint.nodes.length + CONTACT_SENSOR_COUNT);

    let population = Array.from({ length: POP }, () =>
      createBaseGenome(io.inputs, io.outputs)
    );

    const fitnessOf = (genome: Genome) => {
      let total = 0;
      for (const x of TRAIN_WALLS) {
        total += wallParkScore(blueprint, x, genomeDrive(genome), false);
      }
      return total / TRAIN_WALLS.length;
    };

    let ranked = population
      .map(genome => ({ genome, fitness: fitnessOf(genome) }))
      .sort((a, b) => b.fitness - a.fitness);
    const gen0 = ranked[0].fitness;
    const gen0Genome = cloneGenome(ranked[0].genome);

    for (let gen = 0; gen < GENERATIONS; gen += 1) {
      const elites = ranked.slice(0, Math.max(2, Math.floor(POP / 3))).map(r => r.genome);
      const next: Genome[] = elites.map(g => cloneGenome(g));
      while (next.length < POP) {
        const parent = elites[Math.floor(Math.random() * elites.length)];
        next.push(mutateWeights(cloneGenome(parent), 0.4));
      }
      population = next;
      ranked = population
        .map(genome => ({ genome, fitness: fitnessOf(genome) }))
        .sort((a, b) => b.fitness - a.fitness);
    }

    const champion = ranked[0];
    const heldOut = HELD_OUT_WALLS.map(wallX => {
      const sensed = wallParkScore(
        blueprint,
        wallX,
        genomeDrive(champion.genome),
        false
      );
      const ablated = wallParkScore(
        blueprint,
        wallX,
        genomeDrive(champion.genome),
        true
      );
      const gen0Layout = wallParkScore(
        blueprint,
        wallX,
        genomeDrive(gen0Genome),
        false
      );
      return {
        wallX,
        sensed,
        ablated,
        gen0: gen0Layout,
        beatGen0: sensed >= gen0Layout + HOLDOUT_MARGIN,
        beatAblation: sensed >= ablated + ABLATION_MARGIN,
      };
    });

    const trainingRise = champion.fitness >= gen0 + FIT_IMPROVE_ABS;
    const heldPasses = heldOut.filter(h => h.beatGen0 && h.beatAblation).length;
    return {
      seed,
      gen0,
      best: champion.fitness,
      heldOut,
      passed: trainingRise && heldPasses >= HOLDOUT_MAJORITY,
    };
  });
}

console.log(`prove-contact-sensor (physics ${SOFT_BODY_PHYSICS_VERSION})`);
console.log(`contact pack size=${CONTACT_SENSOR_COUNT}`);

console.log('\nA) Reactive structure retreat under held-out walls');
proveReactiveWall();

console.log('\nB) Fixed-morph learnability (failed seeds retained below)');
const results = SEEDS.map(trainSeed);
let passCount = 0;
for (const result of results) {
  const hold = result.heldOut
    .map(
      h =>
        `x=${h.wallX} s=${h.sensed.toFixed(0)} a=${h.ablated.toFixed(0)} g0=${h.gen0.toFixed(0)}${h.beatGen0 && h.beatAblation ? '*' : ''}`
    )
    .join(' | ');
  console.log(
    `seed ${result.seed}: ${result.passed ? 'PASS' : 'FAIL'} train ${result.gen0.toFixed(1)}→${result.best.toFixed(1)} || ${hold}`
  );
  if (result.passed) passCount += 1;
}

assert.ok(
  passCount >= REQUIRED_PASS_SEEDS,
  `C2 learnability needs ≥${REQUIRED_PASS_SEEDS}/${SEEDS.length} seeds; got ${passCount}`
);

console.log(
  `\nPASS C2 — contact/touch sensor (reactive wall + ${passCount}/${SEEDS.length} learn seeds) (D147).`
);
