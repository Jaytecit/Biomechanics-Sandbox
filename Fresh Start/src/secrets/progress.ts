/**
 * E5.4 — Persistent secret-goal discovery ledger (localStorage).
 */
import type { TaskId } from '../brain/types';
import type { SecretGoalId } from './definitions';

export interface SecretGoalDiscovery {
  secretGoalId: SecretGoalId;
  discoveredAt: string;
  modelName: string;
  activeTask: TaskId;
  context: 'evolve' | 'replay';
  generation?: number;
}

const STORAGE_KEY = 'freshstart_secret_discoveries_v1';

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

export function saveSecretDiscoveries(
  discoveries: Record<string, SecretGoalDiscovery>,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(discoveries));
  } catch {
    /* quota */
  }
}

export function discoveryCount(
  discoveries?: Record<string, SecretGoalDiscovery>,
): number {
  return Object.keys(discoveries ?? loadSecretDiscoveries()).length;
}

export function isSecretDiscovered(
  id: SecretGoalId,
  discoveries?: Record<string, SecretGoalDiscovery>,
): boolean {
  return id in (discoveries ?? loadSecretDiscoveries());
}

/** Returns true if newly recorded. */
export function recordDiscovery(entry: SecretGoalDiscovery): boolean {
  const ledger = loadSecretDiscoveries();
  if (ledger[entry.secretGoalId]) return false;
  ledger[entry.secretGoalId] = entry;
  saveSecretDiscoveries(ledger);
  return true;
}

export function clearSecretDiscoveries(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function listDiscoveries(): SecretGoalDiscovery[] {
  return Object.values(loadSecretDiscoveries()).sort((a, b) =>
    a.discoveredAt.localeCompare(b.discoveredAt),
  );
}
