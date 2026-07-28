/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Creature, EvolutionGoal } from './types';
import { getGoalInfo } from './goalCatalog';

export interface BestEverPresentation {
  label: string;
  value: string;
  unit: string;
}

/** Retained for call-site compatibility; scores always display as fitness points. */
export interface BestEverContext {
  peakSpeed?: number;
  peakLandSpeed?: number;
  jumpHeight?: number;
  distance?: number;
}

/** Every goal score is presented as points (the episode fitness). */
export function formatPoints(score: number): string {
  const v = Number.isFinite(score) ? score : 0;
  return `${v.toFixed(1)} pts`;
}

export function formatBestEver(
  goal: EvolutionGoal,
  bestFitness: number,
  _ctx: BestEverContext = {}
): BestEverPresentation {
  const title = getGoalInfo(goal).shortLabel;
  return {
    label: `Best ${title}`,
    value: formatPoints(bestFitness),
    unit: 'pts',
  };
}

/**
 * Live primary metric for the current generation leader (or any creature).
 * Always the episode fitness in points — never raw px / px/frame.
 */
export function formatLiveLeader(
  goal: EvolutionGoal,
  creature: Creature | null | undefined
): BestEverPresentation {
  const title = getGoalInfo(goal).shortLabel;
  if (!creature) {
    return { label: `Leader ${title}`, value: '—', unit: '' };
  }
  const fitness = Number.isFinite(creature.fitness) ? creature.fitness : 0;
  return {
    label: `Leader ${title}`,
    value: formatPoints(fitness),
    unit: 'pts',
  };
}
