/**
 * C1 / D145 — Object-relative sensor behavioural gate.
 *
 * Two criteria (script-local approach score; no shipped reward rewrite):
 *
 * A) Reactive reference — motor drive = clamp(k · objRelX). Must close distance
 *    on held-out left/right ball placements; ablating the object pack must fail.
 * B) Learnability — fixed-morph Motor Cart, weight-only NEAT on multi-distance
 *    rightward approaches. ≥2/3 seeds: training rise + majority held-out beat
 *    of gen-0 elite and ablated champion replay.
 *
 * Run: npx tsx scripts/prove-object-sensor.ts
 */
import assert from 'node:assert/strict';
import { cloneGenome, createBaseGenome, mutateWeights } from '../src/neat';
import {
  GROUND_Y,
  spawnCreature,
  stepPrivateWorld,
  updateCreaturePhysics,
} from '../src/physics';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  Creature,
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  Genome,
  OBJECT_SENSOR_COUNT,
  OBJECT_SENSOR_RANGE_PX,
  SimulationConfig,
  genomeIOForBlueprint,
  objectRelativeSensorValues,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0');

const SEEDS = [17, 29, 41];
const REQUIRED_PASS_SEEDS = 2;
const POP = 14;
const GENERATIONS = 12;
const EPISODE_FRAMES = 400;
const SPAWN_X_LEARN = 120;
const TRAIN_BALL_X = [360, 450, 540] as const;
const HELD_OUT_LEARN_X = [400, 500, 620] as const;
const REACTIVE_SPAWN_X = 400;
const REACTIVE_HELD_OUT_X = [240, 320, 480, 580] as const;
const FIT_IMPROVE_ABS = 22;
const HOLDOUT_MARGIN = 14;
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

function cfg(): SimulationConfig {
  return {
    populationSize: POP,
    generationDuration: EPISODE_FRAMES,
    simulationSpeed: 1,
    mutationRate: 0.35,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.CARRY_BALL,
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

function placeBall(creature: Creature, ballX: number) {
  const ball = creature.privateWorld?.find(o => o.type === 'ball');
  if (!ball) throw new Error('expected private ball');
  const y = GROUND_Y - ball.radius;
  Object.assign(ball, { x: ballX, y, oldX: ballX, oldY: y, startX: ballX, startY: y });
}

function approachScore(
  blueprint: CreatureBlueprint,
  ballX: number,
  spawnX: number,
  drive: (creature: Creature) => number[] | undefined,
  ablateObjectSensors = false
): number {
  const config = cfg();
  const io = genomeIOForBlueprint(blueprint);
  const creature = spawnCreature(
    {
      id: 'probe',
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    spawnX,
    groundedSpawnY(blueprint),
    EvolutionGoal.CARRY_BALL,
    1
  );
  placeBall(creature, ballX);
  const ball = creature.privateWorld!.find(o => o.type === 'ball')!;
  const startDist = Math.hypot(ball.x - creature.currentX, ball.y - creature.currentY);
  let bestClose = 0;

  for (let frame = 0; frame < EPISODE_FRAMES; frame += 1) {
    stepPrivateWorld(creature.privateWorld!, [], config, frame);
    const override = drive(creature);
    updateCreaturePhysics(
      creature,
      [],
      frame,
      config,
      creature.privateWorld!,
      override,
      { ablateObjectSensors }
    );
    const dist = Math.hypot(ball.x - creature.currentX, ball.y - creature.currentY);
    bestClose = Math.max(bestClose, startDist - dist);
  }

  const finalDist = Math.hypot(ball.x - creature.currentX, ball.y - creature.currentY);
  const closed = Math.max(0, startDist - finalDist);
  return closed * 0.6 + bestClose * 0.4;
}

function genomeDrive(genome: Genome) {
  return (creature: Creature): undefined => {
    // Genome is evaluated inside updateCreaturePhysics; stash on creature.
    creature.genome = genome;
    return undefined;
  };
}

function reactiveDrive(ablate: boolean) {
  return (creature: Creature): number[] => {
    const sensed = objectRelativeSensorValues(
      creature.currentX,
      creature.currentY,
      creature.privateWorld ?? []
    );
    const relX = ablate ? 0 : sensed[0];
    const drive = Math.max(-1, Math.min(1, relX * 3.2));
    const io = genomeIOForBlueprint(creature.blueprint);
    return new Array(io.outputs).fill(drive);
  };
}

function proveReactive(): void {
  const blueprint = motorCart();
  let sensedWins = 0;
  let ablatedFails = 0;
  for (const ballX of REACTIVE_HELD_OUT_X) {
    const sensed = approachScore(
      blueprint,
      ballX,
      REACTIVE_SPAWN_X,
      reactiveDrive(false),
      false
    );
    const ablated = approachScore(
      blueprint,
      ballX,
      REACTIVE_SPAWN_X,
      reactiveDrive(true),
      true
    );
    const ok = sensed >= 40 && sensed >= ablated + 25;
    console.log(
      `  reactive x=${ballX}: sensed=${sensed.toFixed(1)} ablated=${ablated.toFixed(1)} ${ok ? 'OK' : 'WEAK'}`
    );
    if (sensed >= 40) sensedWins += 1;
    if (ablated < 15) ablatedFails += 1;
  }
  assert.ok(
    sensedWins >= 3,
    `reactive object feedback must close distance on ≥3/4 held-outs (got ${sensedWins})`
  );
  assert.ok(
    ablatedFails >= 3,
    `ablated reactive drive must fail ≥3/4 held-outs (got ${ablatedFails})`
  );
  console.log('reactive reference: PASS');
}

function trainSeed(seed: number): {
  seed: number;
  gen0: number;
  best: number;
  heldOut: Array<{
    ballX: number;
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
    assert.equal(io.inputs % 1, 0);
    assert.ok(io.inputs >= OBJECT_SENSOR_COUNT);

    let population = Array.from({ length: POP }, () => createBaseGenome(io.inputs, io.outputs));

    const fitnessOf = (genome: Genome) => {
      let total = 0;
      for (const x of TRAIN_BALL_X) {
        total += approachScore(blueprint, x, SPAWN_X_LEARN, genomeDrive(genome), false);
      }
      return total / TRAIN_BALL_X.length;
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
        next.push(mutateWeights(cloneGenome(parent), 0.35));
      }
      population = next;
      ranked = population
        .map(genome => ({ genome, fitness: fitnessOf(genome) }))
        .sort((a, b) => b.fitness - a.fitness);
    }

    const champion = ranked[0];
    const heldOut = HELD_OUT_LEARN_X.map(ballX => {
      const sensed = approachScore(
        blueprint,
        ballX,
        SPAWN_X_LEARN,
        genomeDrive(champion.genome),
        false
      );
      const ablated = approachScore(
        blueprint,
        ballX,
        SPAWN_X_LEARN,
        genomeDrive(champion.genome),
        true
      );
      const gen0Layout = approachScore(
        blueprint,
        ballX,
        SPAWN_X_LEARN,
        genomeDrive(gen0Genome),
        false
      );
      return {
        ballX,
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

console.log(`prove-object-sensor (physics ${SOFT_BODY_PHYSICS_VERSION})`);
console.log(`range=${OBJECT_SENSOR_RANGE_PX}px`);

console.log('\nA) Reactive object feedback under held-out layouts');
proveReactive();

console.log('\nB) Fixed-morph learnability (failed seeds retained below)');
const results = SEEDS.map(trainSeed);
let passCount = 0;
for (const result of results) {
  const hold = result.heldOut
    .map(
      h =>
        `x=${h.ballX} s=${h.sensed.toFixed(0)} a=${h.ablated.toFixed(0)} g0=${h.gen0.toFixed(0)}${h.beatGen0 && h.beatAblation ? '*' : ''}`
    )
    .join(' | ');
  console.log(
    `seed ${result.seed}: ${result.passed ? 'PASS' : 'FAIL'} train ${result.gen0.toFixed(1)}→${result.best.toFixed(1)} || ${hold}`
  );
  if (result.passed) passCount += 1;
}

assert.ok(
  passCount >= REQUIRED_PASS_SEEDS,
  `C1 learnability needs ≥${REQUIRED_PASS_SEEDS}/${SEEDS.length} seeds; got ${passCount}`
);

console.log(
  `\nPASS C1 — object-relative sensor (reactive + ${passCount}/${SEEDS.length} learn seeds) (D145).`
);
