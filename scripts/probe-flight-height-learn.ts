/**
 * Quick cold-start learning probe: Stay Aloft vs Flight Height
 * on the exported Bird morphology (weight-only NEAT, 3 seeds).
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

const modelPath =
  process.argv[2] ??
  path.join(process.env.USERPROFILE ?? '', 'Downloads', 'Bird_elite_gen46.json');
const model = JSON.parse(fs.readFileSync(modelPath, 'utf8')) as {
  blueprint: CreatureBlueprint;
};

const POP = 12;
const GENERATIONS = 10;
const EPISODE_FRAMES = 480;
const SEEDS = [11, 22, 33];

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
  return spawnCreature(
    { id, generation: 0, blueprint, genome },
    120,
    spawnY,
    goal,
    1
  );
}

function tournament(sorted: Creature[]): Creature {
  const picks = [0, 1, 2].map(
    () => sorted[Math.floor(Math.random() * sorted.length)]
  );
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

function runTrack(goal: EvolutionGoal, seed: number) {
  return withRng(seed * 9973 + 17, () => {
    const blueprint = model.blueprint;
    const io = genomeIOForBlueprint(blueprint);
    const config = cfg(goal);
    let genomes: Genome[] = Array.from({ length: POP }, () =>
      createBaseGenome(io.inputs, io.outputs)
    );
    const history: number[] = [];
    let gen0 = 0;
    let final = 0;
    let finalStreak = 0;
    let finalPeak = 0;

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
      const best = pop[0];
      history.push(Number(best.fitness.toFixed(2)));
      if (gen === 0) gen0 = best.fitness;
      final = best.fitness;
      finalStreak = best.flightLongestStreak ?? 0;
      finalPeak = best.flightPeakClearance ?? 0;
      genomes = breed(pop, config);
    }

    return {
      seed,
      goal,
      gen0: Number(gen0.toFixed(2)),
      final: Number(final.toFixed(2)),
      rise: Number((final - gen0).toFixed(2)),
      riseRatio: gen0 > 0 ? Number((final / gen0).toFixed(3)) : null,
      finalStreak,
      finalPeak: Number(finalPeak.toFixed(1)),
      history,
    };
  });
}

const results = [];
for (const goal of [EvolutionGoal.FLIGHT_TIME, EvolutionGoal.FLIGHT_HEIGHT]) {
  for (const seed of SEEDS) {
    const r = runTrack(goal, seed);
    results.push(r);
    console.log(
      `${goal} seed=${seed} gen0=${r.gen0} final=${r.final} rise=${r.rise} streak=${r.finalStreak} peak=${r.finalPeak}`
    );
  }
}

const out = path.join(process.cwd(), 'scripts', 'FLIGHT_HEIGHT_LEARN_PROBE.json');
fs.writeFileSync(out, JSON.stringify({ generations: GENERATIONS, pop: POP, results }, null, 2));
console.log(`Wrote ${out}`);
