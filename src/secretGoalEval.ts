/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure secret-goal evaluator — no UI, no persistence side effects.
 */

import { EvolutionGoal } from './types';
import {
  SECRET_GOALS,
  SecretGoalDefinition,
  SecretGoalEvalContext,
  SecretGoalId,
} from './secretGoals';
import { isSecretDiscovered, loadSecretDiscoveries } from './secretGoalProgress';
import { secretEligible } from './secretGoalEligibility';

const MIN_EPISODE_FRAMES = 60;

export interface SecretGoalEvalInput {
  creature: import('./types').Creature;
  activeGoal: EvolutionGoal;
  arena: import('./types').ArenaModifiers;
  modelName: string;
  context: 'sandbox' | 'arena';
  generation?: number;
  isLowestFitnessInHeat?: boolean;
}

function passesAccidentGate(def: SecretGoalDefinition, activeGoal: EvolutionGoal): boolean {
  return !def.blockedGoals.includes(activeGoal);
}

function buildContext(
  input: SecretGoalEvalInput,
  discoveredIds: Set<string>,
  priorDiscoveryCount: number,
  accidentalNonCustomMatch: boolean
): SecretGoalEvalContext {
  return {
    creature: input.creature,
    activeGoal: input.activeGoal,
    arena: input.arena,
    modelName: input.modelName,
    context: input.context,
    generation: input.generation,
    discoveredIds,
    priorDiscoveryCount,
    isLowestFitnessInHeat: input.isLowestFitnessInHeat,
    accidentalNonCustomMatch,
  };
}

/**
 * Returns newly triggerable secret goal ids (not yet in persistent ledger).
 * Meta goals may append when their ledger conditions are met in the same pass.
 */
export function evaluateSecretGoals(input: SecretGoalEvalInput): SecretGoalId[] {
  const creature = input.creature;
  if ((creature.episodeFrames ?? 0) < MIN_EPISODE_FRAMES) return [];

  const ledger = loadSecretDiscoveries();
  const discoveredIds = new Set(Object.keys(ledger));
  const priorDiscoveryCount = discoveredIds.size;

  const baseCtx = buildContext(input, discoveredIds, priorDiscoveryCount, false);

  // Detect accidental non-custom matches for Accidental Genius
  let accidentalNonCustomMatch = false;
  for (const def of SECRET_GOALS) {
    if (def.isMeta || def.category === 'custom') continue;
    if (discoveredIds.has(def.id)) continue;
    if (!passesAccidentGate(def, input.activeGoal)) continue;
    if (!secretEligible(creature, def, input.context)) continue;
    if (def.check(baseCtx)) {
      accidentalNonCustomMatch = true;
      break;
    }
  }

  const ctx = buildContext(
    input,
    discoveredIds,
    priorDiscoveryCount,
    accidentalNonCustomMatch
  );

  const pending: SecretGoalId[] = [];

  for (const def of SECRET_GOALS) {
    if (discoveredIds.has(def.id)) continue;
    if (!passesAccidentGate(def, input.activeGoal)) continue;
    if (!secretEligible(creature, def, input.context)) continue;
    if (!def.check(ctx)) continue;
    pending.push(def.id);
  }

  // Morph lottery: gen-1 sandbox when any non-meta secret triggers
  if (
    input.context === 'sandbox' &&
    input.generation === 1 &&
    pending.some(id => !SECRET_GOALS.find(d => d.id === id)?.isMeta) &&
    !discoveredIds.has('custom_morph_lottery')
  ) {
    if (!pending.includes('custom_morph_lottery')) {
      pending.push('custom_morph_lottery');
    }
  }

  // Arena wanderer: first arena discovery (any secret in arena)
  const hadArenaBefore = Object.values(ledger).some(d => d.context === 'arena');
  if (
    input.context === 'arena' &&
    !hadArenaBefore &&
    pending.length > 0 &&
    !discoveredIds.has('custom_arena_wanderer')
  ) {
    if (!pending.includes('custom_arena_wanderer')) {
      pending.push('custom_arena_wanderer');
    }
  }

  // Sandbox explorer: first discovery ever from sandbox
  if (
    input.context === 'sandbox' &&
    priorDiscoveryCount === 0 &&
    pending.length > 0 &&
    !discoveredIds.has('custom_sandbox_explorer')
  ) {
    if (!pending.includes('custom_sandbox_explorer')) {
      pending.push('custom_sandbox_explorer');
    }
  }

  // Trophy hunter at 10 total (9 prior + at least one new non-collector)
  const newNonCollector = pending.filter(id => id !== 'custom_collector');
  if (
    priorDiscoveryCount >= 9 &&
    newNonCollector.length > 0 &&
    !discoveredIds.has('custom_collector')
  ) {
    if (!pending.includes('custom_collector')) {
      pending.push('custom_collector');
    }
  }

  return pending;
}

/** Test helper: evaluate a single definition ignoring persistence */
export function evaluateSingleSecret(
  def: SecretGoalDefinition,
  input: SecretGoalEvalInput,
  discoveredIds: Set<string> = new Set()
): boolean {
  const ctx = buildContext(input, discoveredIds, discoveredIds.size, false);
  if (!passesAccidentGate(def, input.activeGoal)) return false;
  if (!secretEligible(input.creature, def, input.context)) return false;
  return def.check(ctx);
}

export function isAlreadyDiscovered(id: SecretGoalId): boolean {
  return isSecretDiscovered(id);
}
