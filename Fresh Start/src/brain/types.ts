export type TaskId = 'run' | 'jump' | 'climb' | 'motor' | 'flight';

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
