import type { CreatureDesign } from '../creature/types';
import { shapeForDesign, Simulation } from '../sim/simulation';
import {
  MAX_GENERATIONS,
  POPULATION_SIZE,
} from './constants';
import { breedNextGeneration, meanFitness } from './ga';
import {
  cloneWeights,
  createRng,
  randomWeights,
} from './network';
import { evaluateRunEpisode } from './tasks';
import type { EvolutionProgress, Genome, NetworkShape } from './types';

export interface EvolveOptions {
  design: CreatureDesign;
  populationSize?: number;
  maxGenerations?: number;
  seed?: number;
  /** Called after each genome / generation for UI progress. */
  onProgress?: (p: EvolutionProgress) => void;
  /** Return false to stop after the current genome. */
  shouldContinue?: () => boolean;
}

export interface EvolveResult {
  shape: NetworkShape;
  best: Genome;
  generation: number;
  history: { generation: number; best: number; mean: number }[];
}

export { breedNextGeneration, meanFitness, mutate, tournamentPick } from './ga';

/**
 * Yield a macrotask so the browser can paint and handle clicks.
 * `Promise.resolve()` is not enough — it only drains microtasks and the UI stays frozen.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout === 'function') {
      setTimeout(resolve, 0);
      return;
    }
    resolve();
  });
}

/**
 * Serial generational GA over network weights for the run task.
 * Used by headless smoke tests. UI uses Simulation.startLiveEvolve instead.
 */
export async function evolveRun(options: EvolveOptions): Promise<EvolveResult> {
  const popSize = options.populationSize ?? POPULATION_SIZE;
  const maxGen = options.maxGenerations ?? MAX_GENERATIONS;
  const rng = createRng(options.seed ?? 1);
  const design = options.design;
  if (design.muscles.length === 0) {
    throw new Error('Design has no muscles to control');
  }

  const shape = shapeForDesign(design);
  const sim = new Simulation();
  await sim.init();

  let population: Genome[] = [];
  for (let i = 0; i < popSize; i++) {
    population.push({ weights: randomWeights(shape, rng), fitness: 0 });
  }

  let bestOverall: Genome = {
    weights: cloneWeights(population[0].weights),
    fitness: -Infinity,
  };
  const history: EvolveResult['history'] = [];

  const report = (
    generation: number,
    evaluated: number,
    running: boolean,
    status: string,
  ) => {
    options.onProgress?.({
      generation,
      evaluated,
      populationSize: popSize,
      bestFitness: bestOverall.fitness === -Infinity ? 0 : bestOverall.fitness,
      meanFitness: meanFitness(population),
      running,
      status,
    });
  };

  for (let gen = 0; gen < maxGen; gen++) {
    for (let i = 0; i < population.length; i++) {
      if (options.shouldContinue && !options.shouldContinue()) {
        report(gen, i, false, 'Stopped');
        return {
          shape,
          best: bestOverall,
          generation: gen,
          history,
        };
      }

      const result = evaluateRunEpisode(sim, design, shape, population[i].weights);
      population[i].fitness = result.fitness;
      if (result.fitness > bestOverall.fitness) {
        bestOverall = {
          weights: cloneWeights(population[i].weights),
          fitness: result.fitness,
        };
      }
      report(gen, i + 1, true, `Gen ${gen} · genome ${i + 1}/${popSize}`);

      await yieldToBrowser();
    }

    population.sort((a, b) => b.fitness - a.fitness);
    const best = population[0].fitness;
    const mean = meanFitness(population);
    history.push({ generation: gen, best, mean });
    report(gen, popSize, true, `Gen ${gen} done · best ${best.toFixed(3)}`);

    if (gen === maxGen - 1) break;
    if (options.shouldContinue && !options.shouldContinue()) {
      report(gen, popSize, false, 'Stopped');
      break;
    }

    population = breedNextGeneration(population, popSize, rng);
  }

  report(history.length > 0 ? history[history.length - 1].generation : 0, popSize, false, 'Done');
  return { shape, best: bestOverall, generation: history.length, history };
}
