/**
 * H7 — Disco-local dance refine (seeded GA, not Free evolve).
 */
import type { OfflineTrackAnalysis } from '../audio/trackAnalysis';
import {
  bandsAtTime,
  lookaheadAtTime,
} from '../audio/trackAnalysis';
import type { CreatureDesign } from '../creature/types';
import { FIXED_DT } from '../physics/constants';
import { Simulation } from '../sim/simulation';
import {
  emptyDanceFitnessAccum,
  finalizeDanceFitness,
  tickDanceFitness,
  type DanceFitnessWeights,
} from './danceFitness';
import { breedNextGeneration, mutate } from './ga';
import {
  fitImitation,
  imitationLoss,
  type DanceDataset,
  type FitImitationProgress,
} from './imitate';
import { cloneWeights, createRng } from './network';
import type { Genome, NetworkShape } from './types';

export interface DanceRefineProgress {
  generation: number;
  generations: number;
  bestFitness: number;
  meanFitness: number;
}

export interface DanceRefineOptions {
  sim: Simulation;
  design: CreatureDesign;
  shape: NetworkShape;
  seedWeights: Float32Array;
  analysis: OfflineTrackAnalysis;
  seed: number;
  generations?: number;
  populationSize?: number;
  episodeSeconds?: number;
  fitnessWeights?: DanceFitnessWeights;
  teacherDataset?: DanceDataset | null;
  onProgress?: (p: DanceRefineProgress) => void;
  yieldEvery?: number;
}

export interface DanceRefineResult {
  best: Genome;
  shape: NetworkShape;
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout === 'function') setTimeout(resolve, 0);
    else resolve();
  });
}

/**
 * Evaluate one dance genome on offline-synced audio for a fixed episode.
 */
export function evaluateDanceRollout(
  sim: Simulation,
  design: CreatureDesign,
  shape: NetworkShape,
  weights: Float32Array,
  analysis: OfflineTrackAnalysis,
  episodeSeconds: number,
  teacherDataset: DanceDataset | null | undefined,
  fitnessWeights?: DanceFitnessWeights,
): number {
  const lookBuf = new Float32Array(6);
  let sampleIdx = 0;
  const prevBands = sim.audioObsProvider;
  const prevLook = sim.audioLookaheadProvider;
  sim.audioObsProvider = () => bandsAtTime(analysis, sim.time);
  sim.audioLookaheadProvider = () =>
    lookaheadAtTime(analysis, sim.time, lookBuf);
  sim.setTask('dance');
  sim.loadDesign(design);
  sim.setDiscoPuppetMode(sim.discoPuppetMode);
  sim.setBrain(shape, weights);
  sim.driveMode = 'brain';

  const creature = sim.creature;
  if (!creature) throw new Error('dance rollout: no creature');

  const accum = emptyDanceFitnessAccum();
  const steps = Math.round(episodeSeconds / FIXED_DT);
  const brainDt = 1 / sim.brainHz;
  let brainAcc = 0;

  try {
    for (let i = 0; i < steps; i++) {
      sim.step(FIXED_DT);
      brainAcc += FIXED_DT;
      while (brainAcc >= brainDt) {
        brainAcc -= brainDt;
        const channelDrives = sim.getBrainChannelDrives();
        let teacher: Float32Array | null = null;
        if (teacherDataset && sampleIdx < teacherDataset.targets.length) {
          teacher = teacherDataset.targets[sampleIdx]!;
          sampleIdx++;
        }
        tickDanceFitness(
          accum,
          creature,
          channelDrives,
          analysis,
          sim.time,
          teacher,
        );
      }
    }
    return finalizeDanceFitness(accum, fitnessWeights);
  } finally {
    sim.audioObsProvider = prevBands;
    sim.audioLookaheadProvider = prevLook;
  }
}

/** Multi-track warm-start imitation with holdout loss reporting. */
export async function fitMultiTrackImitation(opts: {
  shape: NetworkShape;
  train: DanceDataset;
  holdout: DanceDataset;
  seed: number;
  epochs?: number;
  lr?: number;
  batchSize?: number;
  initialWeights?: Float32Array | null;
  onProgress?: (p: FitImitationProgress & { holdoutLoss?: number }) => void;
}): Promise<{ weights: Float32Array; finalLoss: number; holdoutLoss: number }> {
  const result = await fitImitation({
    shape: opts.shape,
    dataset: opts.train,
    seed: opts.seed,
    epochs: opts.epochs ?? 80,
    lr: opts.lr ?? 0.05,
    batchSize: opts.batchSize ?? 32,
    yieldEvery: 1,
    initialWeights: opts.initialWeights,
    onProgress: (p) => opts.onProgress?.(p),
  });

  const holdoutLoss =
    opts.holdout.inputs.length > 0
      ? imitationLoss(opts.shape, result.weights, opts.holdout)
      : result.finalLoss;

  opts.onProgress?.({
    epoch: opts.epochs ?? 80,
    epochs: opts.epochs ?? 80,
    loss: result.finalLoss,
    holdoutLoss,
  });

  return {
    weights: result.weights,
    finalLoss: result.finalLoss,
    holdoutLoss,
  };
}

/**
 * Disco-local GA refine. Does not call startLiveEvolve / Free zone.
 */
export async function refineDanceBrain(
  opts: DanceRefineOptions,
): Promise<DanceRefineResult> {
  const generations = opts.generations ?? 12;
  const popSize = opts.populationSize ?? 10;
  const episodeSeconds = opts.episodeSeconds ?? 8;
  const rng = createRng(opts.seed);

  const population: Genome[] = [
    { weights: cloneWeights(opts.seedWeights), fitness: 0 },
  ];
  while (population.length < popSize) {
    population.push({
      weights: mutate(cloneWeights(opts.seedWeights), rng),
      fitness: 0,
    });
  }

  let best: Genome = {
    weights: cloneWeights(opts.seedWeights),
    fitness: -Infinity,
  };

  for (let g = 1; g <= generations; g++) {
    let sum = 0;
    for (const genome of population) {
      genome.fitness = evaluateDanceRollout(
        opts.sim,
        opts.design,
        opts.shape,
        genome.weights,
        opts.analysis,
        episodeSeconds,
        opts.teacherDataset,
        opts.fitnessWeights,
      );
      sum += genome.fitness;
      if (genome.fitness > best.fitness) {
        best = {
          weights: cloneWeights(genome.weights),
          fitness: genome.fitness,
        };
      }
    }
    opts.onProgress?.({
      generation: g,
      generations,
      bestFitness: best.fitness,
      meanFitness: sum / population.length,
    });
    if (g < generations) {
      const next = breedNextGeneration(population, popSize, rng);
      for (let i = 0; i < popSize; i++) {
        population[i] = next[i]!;
      }
    }
    if ((opts.yieldEvery ?? 1) > 0 && g % (opts.yieldEvery ?? 1) === 0) {
      await yieldTick();
    }
  }

  return { best, shape: opts.shape };
}
