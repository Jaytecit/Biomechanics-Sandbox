import {
  ELITE_COUNT,
  MUTATION_RESET_RATE,
  MUTATION_SIGMA,
  TOURNAMENT_SIZE,
  WEIGHT_INIT_SIGMA,
} from './constants';
import {
  cloneMorphGenes,
  crossoverMorphGenes,
  mutateMorphGenes,
  type MorphGenes,
} from '../creature/morphGenes';
import { cloneWeights, gaussian } from './network';
import type { Genome } from './types';

/** Optional overrides for live-evolve / recipe knobs (D10–D12). */
export interface BreedOptions {
  eliteCount?: number;
  tournamentSize?: number;
  mutationSigma?: number;
  mutationResetRate?: number;
  /** Blend two parents before mutate (D12). */
  crossover?: boolean;
  /** D17 — also breed/mutate morph genes. */
  morphEvolve?: boolean;
}

export function tournamentPick(
  pop: Genome[],
  rng: () => number,
  tournamentSize = TOURNAMENT_SIZE,
): Genome {
  const k = Math.max(1, Math.min(tournamentSize, pop.length));
  let best: Genome | null = null;
  for (let i = 0; i < k; i++) {
    const g = pop[Math.floor(rng() * pop.length)];
    if (!best || g.fitness > best.fitness) best = g;
  }
  return best!;
}

export function mutate(
  weights: Float32Array,
  rng: () => number,
  opts?: Pick<BreedOptions, 'mutationSigma' | 'mutationResetRate'>,
): Float32Array {
  const sigma = opts?.mutationSigma ?? MUTATION_SIGMA;
  const resetRate = opts?.mutationResetRate ?? MUTATION_RESET_RATE;
  const next = cloneWeights(weights);
  for (let i = 0; i < next.length; i++) {
    if (rng() < resetRate) {
      next[i] = gaussian(rng, WEIGHT_INIT_SIGMA);
    } else {
      next[i] += gaussian(rng, sigma);
    }
  }
  return next;
}

/** Uniform blend of two parent weight vectors. */
export function crossoverWeights(
  a: Float32Array,
  b: Float32Array,
  rng: () => number,
): Float32Array {
  const next = cloneWeights(a);
  const n = Math.min(next.length, b.length);
  for (let i = 0; i < n; i++) {
    if (rng() < 0.5) next[i] = b[i];
  }
  return next;
}

export function meanFitness(pop: Genome[]): number {
  if (pop.length === 0) return 0;
  let sum = 0;
  for (const g of pop) sum += g.fitness;
  return sum / pop.length;
}

function copyMorph(m: MorphGenes | undefined): MorphGenes | undefined {
  return m ? cloneMorphGenes(m) : undefined;
}

/** Elitism + tournament selection + mutation → next generation genomes. */
export function breedNextGeneration(
  population: Genome[],
  popSize: number,
  rng: () => number,
  opts?: BreedOptions,
): Genome[] {
  const eliteCount = opts?.eliteCount ?? ELITE_COUNT;
  const tournamentSize = opts?.tournamentSize ?? TOURNAMENT_SIZE;
  const useCrossover = opts?.crossover ?? false;
  const morphEvolve = opts?.morphEvolve ?? false;
  const mutOpts = {
    mutationSigma: opts?.mutationSigma,
    mutationResetRate: opts?.mutationResetRate,
  };

  const ranked = population.slice().sort((a, b) => b.fitness - a.fitness);
  const next: Genome[] = [];
  for (let e = 0; e < Math.min(eliteCount, ranked.length); e++) {
    next.push({
      weights: cloneWeights(ranked[e]!.weights),
      fitness: 0,
      morph: copyMorph(ranked[e]!.morph),
    });
  }
  while (next.length < popSize) {
    const parent = tournamentPick(ranked, rng, tournamentSize);
    let childWeights: Float32Array;
    let childMorph: MorphGenes | undefined = copyMorph(parent.morph);
    if (useCrossover && ranked.length >= 2) {
      const other = tournamentPick(ranked, rng, tournamentSize);
      childWeights = crossoverWeights(parent.weights, other.weights, rng);
      childWeights = mutate(childWeights, rng, mutOpts);
      if (morphEvolve && parent.morph && other.morph) {
        childMorph = mutateMorphGenes(
          crossoverMorphGenes(parent.morph, other.morph, rng),
          rng,
          mutOpts.mutationSigma ?? MUTATION_SIGMA,
        );
      } else if (morphEvolve && parent.morph) {
        childMorph = mutateMorphGenes(
          parent.morph,
          rng,
          mutOpts.mutationSigma ?? MUTATION_SIGMA,
        );
      }
    } else {
      childWeights = mutate(parent.weights, rng, mutOpts);
      if (morphEvolve && parent.morph) {
        childMorph = mutateMorphGenes(
          parent.morph,
          rng,
          mutOpts.mutationSigma ?? MUTATION_SIGMA,
        );
      }
    }
    next.push({ weights: childWeights, fitness: 0, morph: childMorph });
  }
  return next;
}
