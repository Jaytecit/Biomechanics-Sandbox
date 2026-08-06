import type { MorphGenes } from '../creature/morphGenes';

export type TaskId =
  | 'run'
  | 'jump'
  | 'climb'
  | 'motor'
  | 'flight'
  | 'rough'
  /** Timed course via C2.10 markers. */
  | 'sprint'
  /** Peak burst + travel. */
  | 'speed'
  /** Integrated supported upright posture. */
  | 'stay'
  /** Isolated hang-time jump. */
  | 'hang'
  /** Isolated long jump (horizontal). */
  | 'longjump'
  /** H6 — disco imitation / freestyle (not GA-evolved). */
  | 'dance';

export interface NetworkShape {
  inputCount: number;
  hiddenCount: number;
  outputCount: number;
  /** Total weights + biases in the flat genome. */
  weightCount: number;
}

export interface Genome {
  weights: Float32Array;
  fitness: number;
  /** D17 — soft morph genes (fixed topology); omitted when morph evolve is off. */
  morph?: MorphGenes;
}

export interface EvolutionProgress {
  generation: number;
  evaluated: number;
  populationSize: number;
  bestFitness: number;
  meanFitness: number;
  running: boolean;
  status: string;
  /** 1-based batch index when simulating in batches. */
  batch?: number;
  batchCount?: number;
  focusIndex?: number;
  /** Creatures currently on screen in this batch. */
  cohortSize?: number;
  episodeT?: number;
  episodeDuration?: number;
}
