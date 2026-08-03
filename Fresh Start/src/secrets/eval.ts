/**
 * E5.3 — Pure secret-goal evaluator (no UI / persistence side effects).
 */
import type { TaskEpisodeMetrics } from '../brain/taskScore';
import type { TaskId } from '../brain/types';
import type { CreatureDesign } from '../creature/types';
import {
  SECRET_GOALS,
  type SecretGoalEvalContext,
  type SecretGoalId,
} from './definitions';
import { secretEligible } from './eligibility';
import { loadSecretDiscoveries } from './progress';

const MIN_EPISODE_SECONDS = 1;

export interface SecretGoalEvalInput {
  task: TaskId;
  metrics: TaskEpisodeMetrics;
  design: CreatureDesign;
  episodeSeconds: number;
  generation?: number;
}

function passesAccidentGate(
  blockedTasks: TaskId[],
  activeTask: TaskId,
): boolean {
  return !blockedTasks.includes(activeTask);
}

/**
 * Returns newly triggerable secret goal ids (not yet in persistent ledger).
 */
export function evaluateSecretGoals(input: SecretGoalEvalInput): SecretGoalId[] {
  if (input.episodeSeconds < MIN_EPISODE_SECONDS) return [];

  const ledger = loadSecretDiscoveries();
  const discoveredIds = new Set(Object.keys(ledger));
  const priorDiscoveryCount = discoveredIds.size;

  const ctx: SecretGoalEvalContext = {
    task: input.task,
    metrics: input.metrics,
    design: input.design,
    episodeSeconds: input.episodeSeconds,
    generation: input.generation,
    discoveredIds,
    priorDiscoveryCount,
  };

  const pending: SecretGoalId[] = [];

  for (const def of SECRET_GOALS) {
    if (discoveredIds.has(def.id)) continue;
    if (!passesAccidentGate(def.blockedTasks, input.task)) continue;
    if (!secretEligible(input.design, def)) continue;
    if (!def.check(ctx)) continue;
    pending.push(def.id);
  }

  return pending;
}
