/**
 * D13 — goal priority remapping (score mix only; no physics).
 */
import { GOAL_PRIORITY_DISTANCE_SCALE } from './constants';

export interface GoalPriorities {
  /** Emphasize forward distance. */
  distance: number;
  /** Emphasize staying upright. */
  upright: number;
  /** Emphasize not falling (penalty when fell). */
  dontFall: number;
}

export const DEFAULT_GOAL_PRIORITIES: GoalPriorities = {
  distance: 0.5,
  upright: 0.5,
  dontFall: 0.5,
};

/** Remap a scored fitness using priority sliders in [0, 1]. */
export function applyGoalPriorities(
  baseFitness: number,
  opts: {
    distance: number;
    uprightQuality: number;
    fell: boolean;
    priorities: GoalPriorities;
  },
): number {
  const { priorities } = opts;
  const d = priorities.distance;
  const u = priorities.upright;
  const f = priorities.dontFall;
  const sum = d + u + f;
  if (sum < 1e-6) return baseFitness;

  const distTerm = Math.max(0, opts.distance);
  const uprightTerm = Math.max(0, Math.min(1, opts.uprightQuality));
  const fallTerm = opts.fell ? 0 : 1;

  // Blend: keep most of base fitness, tilt with weighted components.
  const tilt =
    (d / sum) * Math.min(1, distTerm / GOAL_PRIORITY_DISTANCE_SCALE) +
    (u / sum) * uprightTerm +
    (f / sum) * fallTerm;
  const blended = baseFitness * (0.55 + 0.9 * tilt);
  return Math.max(0, blended);
}

/** D13 stage trainer — optional auto goal chain. */
export interface StageTrainerStep {
  goalId: string;
  /** Fitness threshold to advance (opt-in). */
  threshold: number;
}

export const DEFAULT_RUN_STAGES: StageTrainerStep[] = [
  { goalId: 'stay', threshold: 4 },
  { goalId: 'run', threshold: 6 },
  { goalId: 'sprint', threshold: 8 },
];
