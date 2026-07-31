/**
 * G1 Rough Terrain Traverse fixed-morph learning and held-out evaluation.
 *
 * Training and evaluation are separate. Every seed is retained, including
 * failures. Held-out variants change gravity, friction, and course length while
 * preserving the authored terrain seed so the criterion isolates locomotor
 * robustness rather than an impassable terrain draw.
 *
 * Run:
 *   npx tsx scripts/calibrate-g1-rough-terrain.ts
 *   npx tsx scripts/calibrate-g1-rough-terrain.ts --write
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { cloneGenome, createBaseGenome, mutateWeights } from '../src/neat';
import {
  generateObstacles,
  GROUND_Y,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  Genome,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const SCRIPT_VERSION = 1;
const TRAINING_SEEDS = [101, 202, 303];
const POPULATION = 12;
const GENERATIONS = 10;
const EPISODE_FRAMES = 14000;
const HELD_OUT_VARIANTS = [
  { id: 'low-friction-short', difficulty: 0.95, gravity: 0.38, groundFriction: 0.72 },
  { id: 'high-friction-long', difficulty: 1.05, gravity: 0.42, groundFriction: 0.88 },
] as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function withRandom<T>(seed: number, fn: () => T): T {
  const previous = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = previous;
  }
}

function template(name: string): CreatureBlueprint {
  const blueprint = CREATURE_TEMPLATES.find(candidate => candidate.name === name);
  if (!blueprint) throw new Error(`Missing template: ${name}`);
  return blueprint;
}

function groundedSpawnY(blueprint: CreatureBlueprint): number {
  const lowestRelative = Math.max(
    ...blueprint.nodes.map(
      (node, index) => (blueprint.relativePositions[index]?.y ?? 0) + node.radius
    )
  );
  return GROUND_Y - lowestRelative;
}

function config(
  difficulty = 1,
  gravity = 0.4,
  groundFriction = 0.8
): SimulationConfig {
  return {
    populationSize: POPULATION,
    generationDuration: EPISODE_FRAMES,
    simulationSpeed: 1,
    mutationRate: 0.35,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
    gravity,
    groundFriction,
    arena: {
      ...DEFAULT_ARENA_MODIFIERS,
      difficulty,
      terrainSeed: 42,
      terrainEnabled: false,
      terrainObstaclesEnabled: false,
      windEnabled: false,
      rampEnabled: false,
      pitEnabled: false,
    },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function runEpisode(
  blueprint: CreatureBlueprint,
  genome: Genome,
  cfg: SimulationConfig,
  id: string,
  inert = false
) {
  const creature = spawnCreature(
    { id, generation: 0, blueprint, genome },
    100,
    groundedSpawnY(blueprint),
    EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
    cfg.arena.difficulty
  );
  const obstacles = generateObstacles(
    EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
    cfg.arena
  );
  const zeroOutputs = new Array(genomeIOForBlueprint(blueprint).outputs).fill(0);
  for (let frame = 0; frame < EPISODE_FRAMES; frame += 1) {
    updateCreaturePhysics(
      creature,
      obstacles,
      frame,
      cfg,
      creature.privateWorld,
      inert ? zeroOutputs : undefined
    );
  }
  return creature;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function trainSeed(seed: number) {
  return withRandom(seed * 8191 + 17, () => {
    const blueprint = template('Motor Cart');
    const io = genomeIOForBlueprint(blueprint);
    let genomes = Array.from(
      { length: POPULATION },
      () => createBaseGenome(io.inputs, io.outputs)
    );
    let generation0Best = -Infinity;
    let trainingBest = -Infinity;
    let champion = cloneGenome(genomes[0]);

    for (let generation = 0; generation < GENERATIONS; generation += 1) {
      const evaluated = genomes.map((genome, index) => {
        const creature = runEpisode(
          blueprint,
          genome,
          config(),
          `g1-${seed}-${generation}-${index}`
        );
        return { genome, creature };
      });
      evaluated.sort((left, right) => right.creature.fitness - left.creature.fitness);
      if (generation === 0) generation0Best = evaluated[0].creature.fitness;
      if (evaluated[0].creature.fitness >= trainingBest) {
        trainingBest = evaluated[0].creature.fitness;
        champion = cloneGenome(evaluated[0].genome);
      }
      const parents = evaluated.slice(0, 3);
      genomes = [cloneGenome(parents[0].genome)];
      while (genomes.length < POPULATION) {
        const parent = parents[Math.floor(Math.random() * parents.length)];
        genomes.push(mutateWeights(cloneGenome(parent.genome), 0.35));
      }
    }

    const heldOut = HELD_OUT_VARIANTS.map(variant => {
      const heldConfig = config(
        variant.difficulty,
        variant.gravity,
        variant.groundFriction
      );
      const inert = runEpisode(
        blueprint,
        createBaseGenome(io.inputs, io.outputs),
        heldConfig,
        `g1-${seed}-${variant.id}-inert`,
        true
      );
      const evaluated = runEpisode(
        blueprint,
        champion,
        heldConfig,
        `g1-${seed}-${variant.id}-champion`
      );
      const behaviouralPass =
        evaluated.crossedFinish === true &&
        evaluated.checkpointReached === 2 &&
        evaluated.fitness >= 1200 &&
        evaluated.fitness >= inert.fitness + 1000;
      return {
        variant: variant.id,
        inert: round(inert.fitness),
        champion: round(evaluated.fitness),
        checkpoints: (evaluated.checkpointReached ?? -1) + 1,
        supportedFinish: evaluated.crossedFinish === true,
        behaviouralPass,
      };
    });

    return {
      seed,
      generation0Best: round(generation0Best),
      trainingBest: round(trainingBest),
      heldOut,
      passed: heldOut.every(result => result.behaviouralPass),
    };
  });
}

const seeds = TRAINING_SEEDS.map(trainSeed);
const report = {
  schemaVersion: 1,
  scriptVersion: SCRIPT_VERSION,
  physicsVersion: SOFT_BODY_PHYSICS_VERSION,
  generatedAt: new Date().toISOString(),
  goal: EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
  blueprint: 'Motor Cart',
  contract: {
    existingPhysicsOnly: true,
    observationActionDimensionsChanged: false,
    evaluationSeparatedFromTraining: true,
    observationNormalizationUpdatedDuringEvaluation: false,
    failedSeedsRetained: true,
    population: POPULATION,
    generations: GENERATIONS,
    episodeFrames: EPISODE_FRAMES,
    trainingSeeds: TRAINING_SEEDS,
    trainingCondition: {
      difficulty: 1,
      gravity: 0.4,
      groundFriction: 0.8,
      terrainSeed: 42,
    },
    heldOutVariants: HELD_OUT_VARIANTS,
    behaviouralCriterion:
      'Frozen champion crosses all three ordered markers and the supported finish, scores at least 1200, and beats inert by at least 1000 in both unseen physics/course-length variants.',
  },
  deterministicEvidence: {
    script: 'scripts/smoke-rough-terrain.ts',
    inert: 0,
    endpointBypass: 0,
    shapingOnly: 150,
    allCheckpointsWithoutFinish: 750,
    scriptedReferenceRange: '(1250, 1350]',
  },
  rejectedCandidateEvidence: {
    candidate: 'Shuttle Run',
    reason:
      'All three exploratory seeds stopped at the one-way 350-point ceiling because the unchanged controller has no course-phase observation; adding one would violate the old-interface boundary.',
    exploratorySeeds: [101, 202, 303],
    generation0Best: [350, 350, 350],
    trainingBest: [350, 350, 350],
  },
  seeds,
  passed: seeds.every(seed => seed.passed),
};

console.log(JSON.stringify(report, null, 2));
assert.equal(report.passed, true, 'every retained G1 seed must pass both held-out variants');

if (process.argv.includes('--write')) {
  writeFileSync(
    new URL('../G1_ROUGH_TERRAIN_RESULTS.json', import.meta.url),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  console.log('Wrote G1_ROUGH_TERRAIN_RESULTS.json');
}
