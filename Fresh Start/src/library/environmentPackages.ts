/**
 * F4 — Environments repository (versioned localStorage).
 * Obstacles spawn via Simulation.setEnvironment when staticObstacles is on.
 */
import { BUILTIN_GAUNTLET_ENV_ID, gauntletEnv } from '../env/gauntletEnv';
import {
  cloneEnvironment,
  flatGroundEnv,
  type EnvironmentDesign,
} from '../env/types';

export const ENVIRONMENT_PACKAGE_SCHEMA = 1;
const STORAGE_KEY = 'freshstart_environment_packages_v1';

export type EnvPackageSource =
  | 'studio-draft'
  | 'import'
  | 'builtin'
  | 'user';

export interface EnvironmentPackage {
  schemaVersion: number;
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  displayName: string;
  environment: EnvironmentDesign;
  source: EnvPackageSource;
  notes?: string;
}

export { BUILTIN_GAUNTLET_ENV_ID };

export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function now(): number {
  return Date.now();
}

function newId(): string {
  return `env_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAll(): EnvironmentPackage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as EnvironmentPackage[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeAll(items: EnvironmentPackage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function builtinFlatGround(): EnvironmentPackage {
  const t = 0;
  return {
    schemaVersion: ENVIRONMENT_PACKAGE_SCHEMA,
    id: 'builtin_flat_ground',
    revision: 1,
    createdAt: t,
    updatedAt: t,
    displayName: 'Flat Ground',
    environment: flatGroundEnv(),
    source: 'builtin',
  };
}

export function builtinGauntlet(): EnvironmentPackage {
  const t = 0;
  return {
    schemaVersion: ENVIRONMENT_PACKAGE_SCHEMA,
    id: BUILTIN_GAUNTLET_ENV_ID,
    revision: 1,
    createdAt: t,
    updatedAt: t,
    displayName: 'Gauntlet',
    environment: gauntletEnv(),
    source: 'builtin',
    notes:
      'Run → climb → launch → pit. Use Sprint + course stages for training.',
  };
}

export function loadEnvironmentPackages(): EnvironmentPackage[] {
  return readAll().filter((p) => p.source !== 'builtin');
}

/** User packages plus builtin courses for UI pickers. */
export function listEnvironmentsForUi(): EnvironmentPackage[] {
  return [builtinFlatGround(), builtinGauntlet(), ...loadEnvironmentPackages()];
}

export function saveNewEnvironmentPackage(
  environment: EnvironmentDesign,
  opts?: {
    displayName?: string;
    source?: EnvPackageSource;
    notes?: string;
  },
): RepoResult<EnvironmentPackage> {
  try {
    const t = now();
    const pkg: EnvironmentPackage = {
      schemaVersion: ENVIRONMENT_PACKAGE_SCHEMA,
      id: newId(),
      revision: 1,
      createdAt: t,
      updatedAt: t,
      displayName: opts?.displayName ?? environment.name ?? 'Environment',
      environment: cloneEnvironment(environment),
      source: opts?.source ?? 'user',
      notes: opts?.notes,
    };
    const all = readAll();
    all.push(pkg);
    writeAll(all);
    return { ok: true, value: pkg };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function saveEnvironmentRevision(
  id: string,
  update: {
    environment?: EnvironmentDesign;
    displayName?: string;
    notes?: string;
  },
): RepoResult<EnvironmentPackage> {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, error: 'Package not found' };
  const prev = all[idx];
  if (prev.source === 'builtin') {
    return { ok: false, error: 'Builtin packages are read-only' };
  }
  const next: EnvironmentPackage = {
    ...prev,
    revision: prev.revision + 1,
    updatedAt: now(),
    displayName: update.displayName ?? prev.displayName,
    environment: update.environment
      ? cloneEnvironment(update.environment)
      : prev.environment,
    notes: update.notes ?? prev.notes,
  };
  all[idx] = next;
  writeAll(all);
  return { ok: true, value: next };
}

export function deleteEnvironmentPackage(id: string): RepoResult<true> {
  const all = readAll();
  const pkg = all.find((p) => p.id === id);
  if (!pkg) return { ok: false, error: 'Package not found' };
  if (pkg.source === 'builtin') {
    return { ok: false, error: 'Builtin packages are read-only' };
  }
  writeAll(all.filter((p) => p.id !== id));
  return { ok: true, value: true };
}

export function duplicateEnvironmentPackage(
  id: string,
  name?: string,
): RepoResult<EnvironmentPackage> {
  if (id === 'builtin_flat_ground') {
    return saveNewEnvironmentPackage(flatGroundEnv(), {
      displayName: name ?? 'Flat Ground Copy',
      source: 'user',
    });
  }
  if (id === BUILTIN_GAUNTLET_ENV_ID) {
    return saveNewEnvironmentPackage(gauntletEnv(), {
      displayName: name ?? 'Gauntlet Copy',
      source: 'user',
    });
  }
  const all = readAll();
  const pkg = all.find((p) => p.id === id);
  if (!pkg) return { ok: false, error: 'Package not found' };
  return saveNewEnvironmentPackage(pkg.environment, {
    displayName: name ?? `${pkg.displayName} Copy`,
    source: 'user',
    notes: pkg.notes,
  });
}
