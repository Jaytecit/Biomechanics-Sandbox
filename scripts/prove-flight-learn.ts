/**
 * Phase 5 / D078 — Fixed-morphology Flapper learning gate.
 *
 * Weight-only NEAT (addNodeRate=0) on stock Flapper + Stay Aloft fitness.
 * Multi-seed: gen-0 → gen-N fitness rise, then held-out airborne drop vs inert hold.
 *
 * Run: npx tsx scripts/prove-flight-learn.ts
 */
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome, mutateWeights, cloneGenome } from '../src/neat';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  Genome,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  FLIGHT_SENSOR_COUNT,
  OBJECT_SENSOR_COUNT,
} from '../src/types';

const POP = 18;
const GENERATIONS = 18;
const EPISODE_FRAMES = 420;
const HOLDOUT_FRAMES = 180;
/** Air drop clearance in world px (legacy used 150 on pre-scale bodies). */
const SPAWN_CLEARANCE = 40;
/** Seeds that must each show learning + held-out sink beat. */
const SEEDS = [11, 22, 33, 44, 55];
const REQUIRED_PASS_SEEDS = 2;
const FIT_IMPROVE_RATIO = 1.12;
const FIT_IMPROVE_ABS = 18;
const SINK_IMPROVE_FRAC = 0.1;
const SINK_IMPROVE_ABS = 1.2;

function cfg(): SimulationConfig {
  return {
    populationSize: POP,
    generationDuration: EPISODE_FRAMES,
    simulationSpeed: 1,
    mutationRate: 0.3,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.FLIGHT_TIME,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS, windEnabled: false },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function flapper(): CreatureBlueprint {
  const t =
    CREATURE_TEMPLATES.find(b => b.name === 'Flapper') ??
    CREATURE_TEMPLATES.find(b => b.name === 'RoboBird');
  if (!t) throw new Error('Missing Flapper/RoboBird');
  return t;
}

/** Mulberry32 — deterministic per seed for multi-seed gates. */
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

function spawnGrounded(blueprint: CreatureBlueprint, genome: Genome, id: string): Creature {
  let best = -Infinity;
  let spawnY = GROUND_Y - 50;
  for (let i = 0; i < blueprint.nodes.length; i++) {
    const contact = blueprint.relativePositions[i].y + blueprint.nodes[i].radius;
    if (contact > best) {
      best = contact;
      spawnY = GROUND_Y - contact;
    }
  }
  return spawnCreature(
    { id, generation: 0, blueprint, genome },
    120,
    spawnY,
    EvolutionGoal.FLIGHT_TIME,
    1
  );
}

function spawnDrop(blueprint: CreatureBlueprint, genome: Genome, id: string): Creature {
  const lowestRel = Math.max(
    ...blueprint.relativePositions.map((p, i) => p.y + blueprint.nodes[i].radius)
  );
  const spawnY = GROUND_Y - SPAWN_CLEARANCE - lowestRel;
  const creature = spawnCreature(
    { id, generation: 0, blueprint, genome },
    140,
    spawnY,
    EvolutionGoal.FLIGHT_TIME,
    1
  );
  for (const n of creature.nodes) {
    n.oldX = n.x;
    n.oldY = n.y;
  }
  return creature;
}

function comY(c: Creature) {
  return c.nodes.reduce((s, n) => s + n.y, 0) / c.nodes.length;
}

function evaluateEpisode(creature: Creature, frames: number, config: SimulationConfig) {
  for (let t = 0; t < frames; t++) {
    updateCreaturePhysics(creature, [], t, config, []);
  }
  return creature.fitness;
}

function tournament(sorted: Creature[]): Creature {
  const a = sorted[Math.floor(Math.random() * sorted.length)];
  const b = sorted[Math.floor(Math.random() * sorted.length)];
  const c = sorted[Math.floor(Math.random() * sorted.length)];
  return [a, b, c].reduce((best, x) => (x.fitness > best.fitness ? x : best));
}

function breed(pop: Creature[], blueprint: CreatureBlueprint, gen: number, config: SimulationConfig): Genome[] {
  const sorted = [...pop].sort((a, b) => b.fitness - a.fitness);
  const next: Genome[] = [];
  const elite = Math.max(1, Math.floor(POP * 0.15));
  for (let i = 0; i < elite; i++) next.push(cloneGenome(sorted[i].genome));
  while (next.length < POP) {
    const parent = tournament(sorted);
    next.push(mutateWeights(cloneGenome(parent.genome), config.mutationRate));
  }
  return next;
}

function holdOutputs(nOut: number): number[] {
  return Array.from({ length: nOut }, () => 0);
}

function runHoldout(blueprint: CreatureBlueprint, genome: Genome | null, frames: number): { dy: number; streak: number; flap: number; fit: number } {
  const config = cfg();
  const io = genomeIOForBlueprint(blueprint);
  const g = genome ?? createBaseGenome(io.inputs, io.outputs);
  // Zero weights ⇒ mid hold when genome is the dummy; for null we override actuators.
  if (!genome) {
    for (const c of g.connections) c.weight = 0;
  }
  const creature = spawnDrop(blueprint, g, 'holdout');
  const y0 = comY(creature);
  for (let t = 0; t < frames; t++) {
    if (!genome) {
      updateCreaturePhysics(creature, [], t, config, [], holdOutputs(io.outputs));
    } else {
      updateCreaturePhysics(creature, [], t, config, []);
    }
  }
  return {
    dy: comY(creature) - y0,
    streak: creature.flightLongestStreak ?? 0,
    flap: creature.wingFlapFrames ?? 0,
    fit: creature.fitness,
  };
}

function runSeed(seed: number): {
  seed: number;
  gen0Best: number;
  finalBest: number;
  holdDy: number;
  champDy: number;
  champStreak: number;
  champFlap: number;
  fitPass: boolean;
  holdoutPass: boolean;
} {
  return withRng(seed * 9973 + 17, () => {
    const blueprint = flapper();
    const io = genomeIOForBlueprint(blueprint);
    if (
      io.inputs !==
      2 + 3 * blueprint.nodes.length + FLIGHT_SENSOR_COUNT + OBJECT_SENSOR_COUNT
    ) {
      throw new Error(`Unexpected Flapper inputs ${io.inputs} (flight pack missing?)`);
    }
    const config = cfg();
    let genomes: Genome[] = Array.from({ length: POP }, () => createBaseGenome(io.inputs, io.outputs));

    let gen0Best = -Infinity;
    let finalBest = -Infinity;
    let champion: Genome = genomes[0];

    for (let gen = 0; gen < GENERATIONS; gen++) {
      const pop: Creature[] = genomes.map((genome, i) =>
        spawnGrounded(blueprint, genome, `s${seed}_g${gen}_${i}`)
      );
      for (const c of pop) evaluateEpisode(c, EPISODE_FRAMES, config);
      pop.sort((a, b) => b.fitness - a.fitness);
      const best = pop[0].fitness;
      if (gen === 0) gen0Best = best;
      finalBest = best;
      champion = cloneGenome(pop[0].genome);
      genomes = breed(pop, blueprint, gen, config);
    }

    const inert = runHoldout(blueprint, null, HOLDOUT_FRAMES);
    const champ = runHoldout(blueprint, champion, HOLDOUT_FRAMES);
    const gap = inert.dy - champ.dy;
    const fitPass =
      finalBest >= gen0Best * FIT_IMPROVE_RATIO || finalBest >= gen0Best + FIT_IMPROVE_ABS;
    const holdoutPass =
      gap >= SINK_IMPROVE_ABS && gap / Math.max(1, inert.dy) >= SINK_IMPROVE_FRAC;

    return {
      seed,
      gen0Best,
      finalBest,
      holdDy: inert.dy,
      champDy: champ.dy,
      champStreak: champ.streak,
      champFlap: champ.flap,
      fitPass,
      holdoutPass,
    };
  });
}

function main() {
  console.log('=== Prove Flight Learn (Phase 5 / D078) ===');
  console.log(
    `pop=${POP} gens=${GENERATIONS} episode=${EPISODE_FRAMES} holdout=${HOLDOUT_FRAMES} addNode=0`
  );
  const blueprint = flapper();
  const io = genomeIOForBlueprint(blueprint);
  console.log(`Flapper I/O ${io.inputs}/${io.outputs} (flightSensors=${FLIGHT_SENSOR_COUNT})`);

  const rows = SEEDS.map(runSeed);
  let passCount = 0;
  for (const r of rows) {
    const ok = r.fitPass && r.holdoutPass;
    if (ok) passCount += 1;
    console.log(
      `seed=${r.seed} fit ${r.gen0Best.toFixed(1)}→${r.finalBest.toFixed(1)} (${r.fitPass ? '↑' : 'flat'}) | holdout inertDy=${r.holdDy.toFixed(1)} champDy=${r.champDy.toFixed(1)} streak=${r.champStreak} flap=${r.champFlap} ${ok ? 'PASS' : 'fail'}`
    );
  }

  if (passCount < REQUIRED_PASS_SEEDS) {
    console.error(
      `\nFAIL Phase 5 — only ${passCount}/${REQUIRED_PASS_SEEDS} seeds showed fitness rise + held-out sink beat.`
    );
    process.exit(1);
  }

  console.log(
    `\nPASS Phase 5 curriculum stage A — fixed-morph Flapper learning on ${passCount}/${SEEDS.length} seeds (D078).`
  );
}

main();
