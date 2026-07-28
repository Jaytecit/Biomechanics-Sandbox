/**
 * Inspect bout shape of Flight Height cold-start champions vs Stay Aloft.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome, mutateWeights, cloneGenome } from '../src/neat';
import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  Genome,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
} from '../src/types';

const model = JSON.parse(
  fs.readFileSync(
    process.argv[2] ??
      path.join(process.env.USERPROFILE ?? '', 'Downloads', 'Bird_elite_gen46.json'),
    'utf8'
  )
) as { blueprint: CreatureBlueprint };

const POP = 12;
const GENERATIONS = 10;
const EPISODE_FRAMES = 480;

function cfg(goal: EvolutionGoal): SimulationConfig {
  return {
    populationSize: POP,
    generationDuration: EPISODE_FRAMES,
    simulationSpeed: 1,
    mutationRate: 0.3,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS, windEnabled: false },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

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

function spawnGrounded(
  blueprint: CreatureBlueprint,
  genome: Genome,
  id: string,
  goal: EvolutionGoal
): Creature {
  let best = -Infinity;
  let spawnY = GROUND_Y - 50;
  for (let i = 0; i < blueprint.nodes.length; i++) {
    const contact = blueprint.relativePositions[i].y + blueprint.nodes[i].radius;
    if (contact > best) {
      best = contact;
      spawnY = GROUND_Y - contact;
    }
  }
  return spawnCreature({ id, generation: 0, blueprint, genome }, 120, spawnY, goal, 1);
}

function tournament(sorted: Creature[]): Creature {
  const picks = [0, 1, 2].map(() => sorted[Math.floor(Math.random() * sorted.length)]);
  return picks.reduce((b, x) => (x.fitness > b.fitness ? x : b));
}

function breed(pop: Creature[], config: SimulationConfig): Genome[] {
  const sorted = [...pop].sort((a, b) => b.fitness - a.fitness);
  const next: Genome[] = [];
  const elite = Math.max(1, Math.floor(POP * 0.15));
  for (let i = 0; i < elite; i++) next.push(cloneGenome(sorted[i].genome));
  while (next.length < POP) {
    next.push(mutateWeights(cloneGenome(tournament(sorted).genome), config.mutationRate));
  }
  return next;
}

function boutStats(c: Creature, goal: EvolutionGoal) {
  if (goal === EvolutionGoal.FLIGHT_HEIGHT) {
    const frames = c.flightHeightBoutFrames ?? 0;
    const integral = c.flightHeightBoutIntegral ?? 0;
    const peak = c.flightHeightBoutPeak ?? 0;
    const mean = frames > 0 ? integral / frames : 0;
    const takeoff = c.flightHeightBoutTakeoffClear ?? 0;
    const climb = c.flightHeightBoutPoweredClimb ?? 0;
    const leapiness =
      peak > 35 ? Math.max(0, peak / Math.max(12, mean) - 1.65) : 0;
    return {
      fitness: Number(c.fitness.toFixed(2)),
      bestStored: Number((c.flightHeightBestBoutScore ?? 0).toFixed(2)),
      activeFrames: frames,
      longestStreak: c.flightLongestStreak ?? 0,
      peak: Number(peak.toFixed(1)),
      mean: Number(mean.toFixed(1)),
      takeoff: Number(takeoff.toFixed(1)),
      poweredClimb: Number(climb.toFixed(1)),
      peakMeanRatio: mean > 0 ? Number((peak / mean).toFixed(2)) : null,
      leapiness: Number(leapiness.toFixed(2)),
      flap: c.wingFlapFrames ?? 0,
    };
  }
  const frames = c.flightTimeBoutFrames ?? 0;
  const integral = c.flightTimeBoutIntegral ?? 0;
  const peak = c.flightTimeBoutPeak ?? 0;
  const mean = frames > 0 ? integral / frames : 0;
  const leapiness =
    peak > 40 ? Math.max(0, peak / Math.max(16, mean) - 1.75) : 0;
  return {
    fitness: Number(c.fitness.toFixed(2)),
    bestStored: Number((c.flightTimeBestBoutScore ?? 0).toFixed(2)),
    activeFrames: frames,
    longestStreak: c.flightLongestStreak ?? 0,
    peak: Number(peak.toFixed(1)),
    mean: Number(mean.toFixed(1)),
    takeoff: null,
    poweredClimb: null,
    peakMeanRatio: mean > 0 ? Number((peak / mean).toFixed(2)) : null,
    leapiness: Number(leapiness.toFixed(2)),
    flap: c.wingFlapFrames ?? 0,
  };
}

function train(goal: EvolutionGoal, seed: number) {
  return withRng(seed * 9973 + 17, () => {
    const blueprint = model.blueprint;
    const io = genomeIOForBlueprint(blueprint);
    const config = cfg(goal);
    let genomes: Genome[] = Array.from({ length: POP }, () =>
      createBaseGenome(io.inputs, io.outputs)
    );
    let champ: Creature | null = null;
    for (let gen = 0; gen < GENERATIONS; gen++) {
      const pop = genomes.map((genome, i) =>
        spawnGrounded(blueprint, genome, `g${gen}_${i}`, goal)
      );
      for (const c of pop) {
        for (let t = 0; t < EPISODE_FRAMES; t++) {
          updateCreaturePhysics(c, [], t, config, []);
        }
      }
      pop.sort((a, b) => b.fitness - a.fitness);
      champ = pop[0];
      genomes = breed(pop, config);
    }
    return boutStats(champ!, goal);
  });
}

const rows = [];
for (const goal of [EvolutionGoal.FLIGHT_TIME, EvolutionGoal.FLIGHT_HEIGHT]) {
  for (const seed of [11, 22, 33]) {
    const stats = train(goal, seed);
    rows.push({ goal, seed, ...stats });
    console.log(JSON.stringify({ goal, seed, ...stats }));
  }
}

fs.writeFileSync(
  path.join(process.cwd(), 'scripts', 'FLIGHT_HEIGHT_BOUT_SHAPE.json'),
  JSON.stringify(rows, null, 2)
);
