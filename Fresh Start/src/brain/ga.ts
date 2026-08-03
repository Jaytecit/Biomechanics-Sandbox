import {
  ELITE_COUNT,
  MUTATION_RESET_RATE,
  MUTATION_SIGMA,
  TOURNAMENT_SIZE,
  WEIGHT_INIT_SIGMA,
} from './constants';
import { cloneWeights, gaussian } from './network';
import type { Genome } from './types';

export function tournamentPick(pop: Genome[], rng: () => number): Genome {
  let best: Genome | null = null;
  for (let i = 0; i < TOURNAMENT_SIZE; i++) {
    const g = pop[Math.floor(rng() * pop.length)];
    if (!best || g.fitness > best.fitness) best = g;
  }
  return best!;
}

export function mutate(weights: Float32Array, rng: () => number): Float32Array {
  const next = cloneWeights(weights);
  for (let i = 0; i < next.length; i++) {
    if (rng() < MUTATION_RESET_RATE) {
      next[i] = gaussian(rng, WEIGHT_INIT_SIGMA);
    } else {
      next[i] += gaussian(rng, MUTATION_SIGMA);
    }
  }
  return next;
}

export function meanFitness(pop: Genome[]): number {
  if (pop.length === 0) return 0;
  let sum = 0;
  for (const g of pop) sum += g.fitness;
  return sum / pop.length;
}

/** Elitism + tournament selection + mutation → next generation genomes. */
export function breedNextGeneration(
  population: Genome[],
  popSize: number,
  rng: () => number,
): Genome[] {
  const ranked = population.slice().sort((a, b) => b.fitness - a.fitness);
  const next: Genome[] = [];
  for (let e = 0; e < Math.min(ELITE_COUNT, ranked.length); e++) {
    next.push({
      weights: cloneWeights(ranked[e].weights),
      fitness: 0,
    });
  }
  while (next.length < popSize) {
    const parent = tournamentPick(ranked, rng);
    next.push({ weights: mutate(parent.weights, rng), fitness: 0 });
  }
  return next;
}
