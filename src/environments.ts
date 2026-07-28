import { CustomGoalConfig, EvolutionGoal, Obstacle, WorldObject } from './types';
import { canonicalizeObstacles } from './canonicalGeometry';
import { normalizeSeed, stableHash } from './determinism';
import { AGENT_SPAWN_X, GROUND_Y } from './physicsConstants';

export const ENVIRONMENT_SCHEMA = 1;
export const ENVIRONMENT_STORAGE_KEY = 'biomech_environment_packages_v1';
export type EnvironmentTheme = 'meadow' | 'desert' | 'alpine' | 'night';
export interface EnvironmentPackage {
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  authorNotes: string;
  createdAt: string;
  updatedAt: string;
  seed: number;
  spawn: { x: number; y: number };
  cameraStart: { x: number; y: number };
  bounds: { left: number; right: number; groundY: number };
  theme: EnvironmentTheme;
  obstacles: Obstacle[];
  worldObjects: WorldObject[];
  goal?: EvolutionGoal;
  customGoal?: CustomGoalConfig;
  eligibility?: { allowMotorWheels: boolean; allowPassiveWheels: boolean; allowAero: boolean };
  fingerprint: string;
}

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}
function id(): string {
  return `environment-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}
function fingerprintInput(environment: Omit<EnvironmentPackage, 'fingerprint' | 'revision' | 'createdAt' | 'updatedAt'>) {
  return {
    schemaVersion: environment.schemaVersion, seed: environment.seed, spawn: environment.spawn,
    cameraStart: environment.cameraStart, bounds: environment.bounds, theme: environment.theme,
    obstacles: environment.obstacles, worldObjects: environment.worldObjects, goal: environment.goal ?? null,
    customGoal: environment.customGoal ?? null, eligibility: environment.eligibility ?? null,
  };
}
export function environmentFingerprint(environment: Omit<EnvironmentPackage, 'fingerprint'>): string {
  return `environment-${stableHash(fingerprintInput(environment))}`;
}
export function createEnvironmentPackage(
  name: string,
  obstacles: Obstacle[] = [],
  seed = 21005
): EnvironmentPackage {
  const timestamp = new Date().toISOString();
  const base = {
    schemaVersion: 1 as const, id: id(), revision: 1, name: name.trim() || 'Untitled Environment',
    authorNotes: '', createdAt: timestamp, updatedAt: timestamp, seed: normalizeSeed(seed, 21005),
    spawn: { x: AGENT_SPAWN_X, y: GROUND_Y - 100 },
    cameraStart: { x: 0, y: 200 }, bounds: { left: -1000, right: 12000, groundY: GROUND_Y },
    theme: 'meadow' as const, obstacles: structuredClone(obstacles),
    worldObjects: [],
    eligibility: { allowMotorWheels: true, allowPassiveWheels: true, allowAero: true },
  };
  return { ...base, fingerprint: environmentFingerprint(base) };
}
export function validateEnvironment(environment: EnvironmentPackage): string[] {
  const errors: string[] = [];
  if (environment.schemaVersion !== ENVIRONMENT_SCHEMA) errors.push('Unsupported schema version');
  if (!environment.name.trim()) errors.push('Name is required');
  if (environment.bounds.right <= environment.bounds.left) errors.push('World bounds are inverted');
  const checkpoints = environment.obstacles.filter(o => o.type === 'checkpoint')
    .map(o => o.checkpointIndex).filter((value): value is number => value !== undefined);
  if (new Set(checkpoints).size !== checkpoints.length) errors.push('Checkpoint order contains duplicates');
  for (const [index, obstacle] of environment.obstacles.entries()) {
    if (![obstacle.x, obstacle.y, obstacle.width, obstacle.height].every(Number.isFinite)) {
      errors.push(`Object ${index + 1} has non-finite geometry`);
    }
    if (obstacle.width <= 0 || obstacle.height < 0) errors.push(`Object ${index + 1} has zero/inverted size`);
  }
  const solids = environment.obstacles.filter(o => o.type === 'box' || o.type === 'stair' || o.type === 'ramp');
  if (solids.some(o =>
    environment.spawn.x >= o.x && environment.spawn.x <= o.x + o.width
    && environment.spawn.y >= o.y && environment.spawn.y <= o.y + o.height
  )) errors.push('Spawn point is inside a solid');
  const pits = environment.obstacles.filter(o => o.type === 'pit');
  for (const pit of pits) {
    if (solids.some(s => Math.max(pit.x, s.x) < Math.min(pit.x + pit.width, s.x + s.width) && s.y + s.height >= environment.bounds.groundY)) {
      errors.push('Pit overlaps a ground-connected solid');
    }
  }
  canonicalizeObstacles(environment.obstacles);
  for (const [index, object] of (environment.worldObjects ?? []).entries()) {
    if (![object.x, object.y, object.width, object.height, object.mass].every(Number.isFinite)) {
      errors.push(`World object ${index + 1} has invalid physical properties`);
    }
  }
  return errors;
}
export function loadEnvironments(): EnvironmentPackage[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(ENVIRONMENT_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item?.schemaVersion === 1 && Array.isArray(item.obstacles)) : [];
  } catch { return []; }
}
export function saveEnvironment(environment: EnvironmentPackage): { ok: boolean; value?: EnvironmentPackage; error?: string } {
  const errors = validateEnvironment(environment);
  if (errors.length) return { ok: false, error: errors.join('; ') };
  const all = loadEnvironments();
  const index = all.findIndex(item => item.id === environment.id);
  const prior = index >= 0 ? all[index] : undefined;
  const next = {
    ...structuredClone(environment),
    revision: prior ? prior.revision + 1 : environment.revision,
    updatedAt: new Date().toISOString(),
  };
  next.fingerprint = environmentFingerprint(next);
  if (index >= 0) all[index] = next; else all.push(next);
  try {
    storage()?.setItem(ENVIRONMENT_STORAGE_KEY, JSON.stringify(all));
    return { ok: true, value: next };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Environment storage failure' };
  }
}
export function exportEnvironment(environment: EnvironmentPackage): string {
  return JSON.stringify(environment, null, 2);
}
export function importEnvironment(raw: string): { ok: boolean; value?: EnvironmentPackage; error?: string } {
  try {
    const parsed = JSON.parse(raw) as EnvironmentPackage;
    const errors = validateEnvironment(parsed);
    if (errors.length) return { ok: false, error: errors.join('; ') };
    const copy = { ...structuredClone(parsed), id: id(), revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    copy.fingerprint = environmentFingerprint(copy);
    return { ok: true, value: copy };
  } catch { return { ok: false, error: 'Invalid environment JSON' }; }
}
