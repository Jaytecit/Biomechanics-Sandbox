/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persistent secret-goal discovery ledger (localStorage).
 */

import { EvolutionGoal } from './types';
import type { SecretGoalId } from './secretGoals';

export interface SecretGoalDiscovery {
  secretGoalId: SecretGoalId;
  discoveredAt: string;
  modelName: string;
  activeGoal: EvolutionGoal;
  context: 'sandbox' | 'arena';
  generation?: number;
}

const STORAGE_KEY = 'biomech_secret_discoveries_v1';

export function loadSecretDiscoveries(): Record<string, SecretGoalDiscovery> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SecretGoalDiscovery>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSecretDiscoveries(discoveries: Record<string, SecretGoalDiscovery>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(discoveries));
  } catch {
    // ignore quota errors
  }
}

export function hasAnyDiscovery(discoveries?: Record<string, SecretGoalDiscovery>): boolean {
  const ledger = discoveries ?? loadSecretDiscoveries();
  return Object.keys(ledger).length > 0;
}

export function discoveryCount(discoveries?: Record<string, SecretGoalDiscovery>): number {
  const ledger = discoveries ?? loadSecretDiscoveries();
  return Object.keys(ledger).length;
}

export function isSecretDiscovered(
  id: SecretGoalId,
  discoveries?: Record<string, SecretGoalDiscovery>
): boolean {
  const ledger = discoveries ?? loadSecretDiscoveries();
  return id in ledger;
}

export function recordDiscovery(entry: SecretGoalDiscovery): boolean {
  const ledger = loadSecretDiscoveries();
  if (ledger[entry.secretGoalId]) return false;
  ledger[entry.secretGoalId] = entry;
  saveSecretDiscoveries(ledger);
  return true;
}

export function hasSandboxDiscovery(discoveries?: Record<string, SecretGoalDiscovery>): boolean {
  const ledger = discoveries ?? loadSecretDiscoveries();
  return Object.values(ledger).some(d => d.context === 'sandbox');
}

export function hasArenaDiscovery(discoveries?: Record<string, SecretGoalDiscovery>): boolean {
  const ledger = discoveries ?? loadSecretDiscoveries();
  return Object.values(ledger).some(d => d.context === 'arena');
}

/** Wipe all secret discoveries (does not change secret definitions). */
export function clearSecretDiscoveries(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
