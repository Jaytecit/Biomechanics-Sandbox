import {
  CreatureBlueprint,
  Genome,
  ParaPilot,
  genomeIOForBlueprint,
} from './types';
import { SOFT_BODY_PHYSICS_VERSION } from './physicsConstants';
import { stableHash } from './determinism';
import { CREATURE_TEMPLATES } from './templates';

export const CREATURE_PACKAGE_SCHEMA = 2;
export const CREATURE_REPOSITORY_KEY = 'biomech_creature_packages_v2';
export const LEGACY_CREATURE_KEY = 'biomech_saved_creatures_v1';
export const STUDIO_DRAFT_KEY = 'biomech_studio_draft_v2';
export const SKELETON_VISIBLE_MIGRATION_KEY =
  'biomech_collision_skeleton_visible_default_v1';

export type AppearancePrimitive = {
  id: string;
  kind:
    | 'ellipse'
    | 'capsule'
    | 'polygon'
    | 'stroke'
    | 'eye'
    | 'fin'
    | 'ear'
    | 'tail'
    | 'patch'
    | 'rigidPlate';
  anchorNode?: number;
  anchorMuscle?: number;
  /** Rigid lock group id for kind rigidPlate (D130). */
  rigidGroupId?: string;
  layer: 'behind' | 'front';
  z: number;
  fill: string;
  stroke: string;
  opacity: number;
  mirror?: boolean;
  points: Array<{
    x: number;
    y: number;
    weights?: Array<{
      muscle: number;
      weight: number;
      /** Per-influence rest-space coordinates for multi-link sheet skinning. */
      x?: number;
      y?: number;
    }>;
  }>;
};

export interface AppearanceRig {
  version: 1;
  hideSkeleton: boolean;
  primitives: AppearancePrimitive[];
}

export interface ControllerSnapshot {
  id: string;
  createdAt: string;
  label: string;
  genome: Genome;
  paraPilot?: ParaPilot;
  bodyFingerprint: string;
  physicsVersion: string;
  inputs: number;
  outputs: number;
  source: 'studio-draft' | 'live-selected' | 'generation-leader' | 'finished-champion' | 'import';
}

export interface CreaturePackage {
  schemaVersion: 2;
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  displayName: string;
  blueprint: CreatureBlueprint;
  appearance?: AppearanceRig;
  controllers: ControllerSnapshot[];
  bodyFingerprint: string;
  physicsVersion: string;
  source: ControllerSnapshot['source'] | 'legacy-migration';
  notes?: string;
}

export interface RepositoryResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

function storage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function now(): string {
  return new Date().toISOString();
}

function newId(prefix = 'creature'): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${random}`;
}

interface CreatureNameParts {
  base: string;
  version: number;
}

/** Collapse legacy "Modified Modified ..." and old "Copy" names into Base + Vn. */
export function parseCreatureVersionName(input: string): CreatureNameParts {
  let name = input.trim().replace(/\s+/g, ' ') || 'Untitled Creature';
  let modifiedCount = 0;
  while (/^modified\s+/i.test(name)) {
    name = name.replace(/^modified\s+/i, '').trim();
    modifiedCount += 1;
  }
  const versionMatch = name.match(/\s+v(\d+)$/i);
  if (versionMatch) {
    return {
      base: name.slice(0, versionMatch.index).trim() || 'Untitled Creature',
      version: Math.max(1, Number(versionMatch[1]) || 1),
    };
  }
  const copyMatch = name.match(/\s+copy(?:\s+\d+)?$/i);
  if (copyMatch) {
    name = name.slice(0, copyMatch.index).trim() || 'Untitled Creature';
    modifiedCount = Math.max(1, modifiedCount);
  }
  return {
    base: name || 'Untitled Creature',
    version: Math.max(1, modifiedCount + 1),
  };
}

function versionedName(base: string, version: number): string {
  return version <= 1 ? base : `${base} V${version}`;
}

function versionsByBase(names: Iterable<string>): Map<string, Set<number>> {
  const versions = new Map<string, Set<number>>();
  for (const name of names) {
    const parsed = parseCreatureVersionName(name);
    const key = parsed.base.toLocaleLowerCase();
    const current = versions.get(key) ?? new Set<number>();
    current.add(parsed.version);
    versions.set(key, current);
  }
  return versions;
}

/** Allocate the requested name, normalizing old prefixes and avoiding collisions. */
export function uniqueCreatureVersionName(
  requestedName: string,
  occupiedNames: Iterable<string>
): string {
  const requested = parseCreatureVersionName(requestedName);
  const versions = versionsByBase(occupiedNames);
  const used = versions.get(requested.base.toLocaleLowerCase()) ?? new Set<number>();
  let version = requested.version;
  while (used.has(version)) version += 1;
  return versionedName(requested.base, version);
}

/** Name the next edited form of a source creature. */
export function nextCreatureVersionName(
  sourceName: string,
  occupiedNames: Iterable<string>
): string {
  const source = parseCreatureVersionName(sourceName);
  const versions = versionsByBase(occupiedNames);
  const used = versions.get(source.base.toLocaleLowerCase()) ?? new Set<number>();
  let version = Math.max(2, source.version + 1);
  for (const existing of used) version = Math.max(version, existing + 1);
  return versionedName(source.base, version);
}

function mechanicalFingerprintInput(blueprint: CreatureBlueprint) {
  return {
    nodes: blueprint.nodes.map(node => ({
      id: node.id, mass: node.mass, radius: node.radius, friction: node.friction,
      isWheel: !!node.isWheel, isMotorWheel: !!node.isMotorWheel,
      motorPower: node.motorPower ?? null,
      isFoot: !!node.isFoot,
      isHingeStop: !!node.isHingeStop,
    })),
    muscles: blueprint.muscles.map(muscle => ({
      id: muscle.id, nodeA: muscle.nodeA, nodeB: muscle.nodeB,
      originalLength: muscle.originalLength, minLength: muscle.minLength,
      maxLength: muscle.maxLength, strength: muscle.strength,
      linkKind: muscle.linkKind ?? null,
      extendRate: muscle.extendRate ?? null,
      retractRate: muscle.retractRate ?? null,
      aeroType: muscle.aeroType ?? 'none', aeroArea: muscle.aeroArea ?? null,
    })),
    relativePositions: blueprint.relativePositions,
    solidSegments: (blueprint.solidSegments ?? [])
      .map(solid => ({
        id: solid.id,
        nodeIds: [...solid.nodeIds].sort((a, b) => a - b),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export function bodyFingerprint(blueprint: CreatureBlueprint): string {
  return `body-${stableHash(mechanicalFingerprintInput(blueprint))}`;
}

export function controllerCompatibility(
  snapshot: ControllerSnapshot,
  blueprint: CreatureBlueprint
): { compatible: boolean; reasons: string[] } {
  const io = genomeIOForBlueprint(blueprint);
  const reasons: string[] = [];
  if (snapshot.bodyFingerprint !== bodyFingerprint(blueprint)) reasons.push('body fingerprint changed');
  if (snapshot.physicsVersion !== SOFT_BODY_PHYSICS_VERSION) reasons.push(`physics ${snapshot.physicsVersion} is stale`);
  if (snapshot.inputs !== io.inputs) reasons.push(`input size ${snapshot.inputs} != ${io.inputs}`);
  if (snapshot.outputs !== io.outputs) reasons.push(`output size ${snapshot.outputs} != ${io.outputs}`);
  return { compatible: reasons.length === 0, reasons };
}

function validBlueprint(value: unknown): value is CreatureBlueprint {
  if (!value || typeof value !== 'object') return false;
  const blueprint = value as CreatureBlueprint;
  return typeof blueprint.name === 'string' && blueprint.name.trim().length > 0
    && Array.isArray(blueprint.nodes) && blueprint.nodes.length >= 2
    && Array.isArray(blueprint.muscles) && blueprint.muscles.length >= 1
    && Array.isArray(blueprint.relativePositions)
    && blueprint.relativePositions.length === blueprint.nodes.length;
}

function validPackage(value: unknown): value is CreaturePackage {
  const item = value as CreaturePackage;
  return !!item && item.schemaVersion === CREATURE_PACKAGE_SCHEMA
    && typeof item.id === 'string' && typeof item.revision === 'number'
    && validBlueprint(item.blueprint) && Array.isArray(item.controllers);
}

function writePackages(packages: CreaturePackage[]): RepositoryResult<CreaturePackage[]> {
  try {
    storage()?.setItem(CREATURE_REPOSITORY_KEY, JSON.stringify(packages));
    return { ok: true, value: packages };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Storage quota or access failure' };
  }
}

/**
 * Drop matching blueprints from the v1 legacy key so a later loadCreaturePackages()
 * migration cannot resurrect a permanently deleted body.
 */
export function purgeLegacyCreatures(opts: {
  names?: string[];
  fingerprints?: string[];
}): void {
  const names = new Set((opts.names ?? []).map(n => n.trim()).filter(Boolean));
  const fingerprints = new Set((opts.fingerprints ?? []).filter(Boolean));
  if (names.size === 0 && fingerprints.size === 0) return;
  const store = storage();
  if (!store) return;
  try {
    const legacy = JSON.parse(store.getItem(LEGACY_CREATURE_KEY) ?? '[]');
    if (!Array.isArray(legacy)) return;
    const next = legacy.filter(item => {
      if (!validBlueprint(item)) return true;
      if (names.has(item.name)) return false;
      if (fingerprints.has(bodyFingerprint(item))) return false;
      return true;
    });
    if (next.length !== legacy.length) {
      store.setItem(LEGACY_CREATURE_KEY, JSON.stringify(next));
    }
  } catch {
    // Malformed legacy records stay untouched; permanent delete still cleared v2.
  }
}

function duplicatePackageKey(item: CreaturePackage): string {
  const parsedName = parseCreatureVersionName(item.displayName);
  const blueprint = {
    ...item.blueprint,
    name: versionedName(parsedName.base, parsedName.version),
  };
  return stableHash({
    blueprint,
    appearance: item.appearance ?? null,
  });
}

function mergePackageControllers(
  first: ControllerSnapshot[],
  second: ControllerSnapshot[]
): ControllerSnapshot[] {
  const merged = new Map<string, ControllerSnapshot>();
  for (const controller of [...first, ...second]) {
    const key = controller.id || stableHash(controller);
    merged.set(key, controller);
  }
  return [...merged.values()];
}

/**
 * Idempotent repository repair:
 * - collapse mechanically/visually identical records;
 * - merge their controller snapshots;
 * - normalize legacy Modified/Copy names;
 * - give remaining name collisions distinct Vn suffixes.
 */
export function normalizeCreaturePackages(
  packages: CreaturePackage[]
): CreaturePackage[] {
  const ordered = [...packages].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.updatedAt.localeCompare(b.updatedAt) ||
      a.id.localeCompare(b.id)
  );
  const byDuplicateKey = new Map<string, CreaturePackage>();
  for (const item of ordered) {
    const key = duplicatePackageKey(item);
    const existing = byDuplicateKey.get(key);
    if (!existing) {
      byDuplicateKey.set(key, structuredClone(item));
      continue;
    }
    existing.controllers = mergePackageControllers(
      existing.controllers,
      item.controllers
    );
    existing.revision = Math.max(existing.revision, item.revision);
    existing.createdAt =
      existing.createdAt <= item.createdAt ? existing.createdAt : item.createdAt;
    existing.updatedAt =
      existing.updatedAt >= item.updatedAt ? existing.updatedAt : item.updatedAt;
  }

  const occupied = new Set(CREATURE_TEMPLATES.map(template => template.name));
  const normalized: CreaturePackage[] = [];
  for (const item of byDuplicateKey.values()) {
    const displayName = uniqueCreatureVersionName(item.displayName, occupied);
    occupied.add(displayName);
    normalized.push({
      ...item,
      displayName,
      blueprint: { ...item.blueprint, name: displayName },
      bodyFingerprint: bodyFingerprint(item.blueprint),
    });
  }
  return normalized;
}

export function createCreaturePackage(
  blueprint: CreatureBlueprint,
  options: Partial<Pick<CreaturePackage, 'displayName' | 'appearance' | 'controllers' | 'source' | 'notes'>> = {}
): CreaturePackage {
  const timestamp = now();
  return {
    schemaVersion: CREATURE_PACKAGE_SCHEMA,
    id: newId(),
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    displayName: (options.displayName ?? blueprint.name).trim() || 'Untitled Creature',
    blueprint: structuredClone(blueprint),
    appearance: options.appearance ? structuredClone(options.appearance) : undefined,
    controllers: structuredClone(options.controllers ?? []),
    bodyFingerprint: bodyFingerprint(blueprint),
    physicsVersion: SOFT_BODY_PHYSICS_VERSION,
    source: options.source ?? 'studio-draft',
    notes: options.notes,
  };
}

export function loadCreaturePackages(): CreaturePackage[] {
  const store = storage();
  if (!store) return [];
  let packages: CreaturePackage[] = [];
  let repositoryChanged = false;
  try {
    const parsed = JSON.parse(store.getItem(CREATURE_REPOSITORY_KEY) ?? '[]');
    if (Array.isArray(parsed)) packages = parsed.filter(validPackage);
  } catch {
    packages = [];
  }

  // Idempotent legacy migration. The v1 key is deliberately never removed.
  try {
    const legacy = JSON.parse(store.getItem(LEGACY_CREATURE_KEY) ?? '[]');
    if (Array.isArray(legacy)) {
      const knownLegacyFingerprints = new Set(
        packages.map(item => item.bodyFingerprint)
      );
      for (const blueprint of legacy.filter(validBlueprint)) {
        const fingerprint = bodyFingerprint(blueprint);
        if (knownLegacyFingerprints.has(fingerprint)) continue;
        packages.push(createCreaturePackage(blueprint, { source: 'legacy-migration' }));
        knownLegacyFingerprints.add(fingerprint);
        repositoryChanged = true;
      }
      if (repositoryChanged) writePackages(packages);
    }
  } catch {
    // Malformed legacy records remain untouched and do not hide valid v2 packages.
  }

  try {
    const makeSkeletonVisible =
      store.getItem(SKELETON_VISIBLE_MIGRATION_KEY) !== 'done';
    if (makeSkeletonVisible) {
      packages = packages.map(item =>
        item.appearance
          ? {
              ...item,
              appearance: { ...item.appearance, hideSkeleton: false },
            }
          : item
      );
      store.setItem(SKELETON_VISIBLE_MIGRATION_KEY, 'done');
      repositoryChanged = true;
    }
  } catch {
    // Storage failures must not prevent the in-memory repository from loading.
  }

  const normalized = normalizeCreaturePackages(packages);
  if (
    repositoryChanged ||
    JSON.stringify(normalized) !== JSON.stringify(packages)
  ) {
    writePackages(normalized);
  }
  return normalized;
}

export function saveNewPackage(
  blueprint: CreatureBlueprint,
  options: Parameters<typeof createCreaturePackage>[1] = {}
): RepositoryResult<CreaturePackage> {
  const all = loadCreaturePackages();
  const requestedName = options.displayName ?? blueprint.name;
  const displayName = uniqueCreatureVersionName(requestedName, [
    ...CREATURE_TEMPLATES.map(template => template.name),
    ...all.map(item => item.displayName),
  ]);
  const namedBlueprint = { ...blueprint, name: displayName };
  const item = createCreaturePackage(namedBlueprint, {
    ...options,
    displayName,
  });
  const result = writePackages([...all, item]);
  return result.ok ? { ok: true, value: item } : { ok: false, error: result.error };
}

export function savePackageRevision(
  id: string,
  update: Partial<Pick<CreaturePackage, 'displayName' | 'blueprint' | 'appearance' | 'controllers' | 'notes'>>
): RepositoryResult<CreaturePackage> {
  const all = loadCreaturePackages();
  const index = all.findIndex(item => item.id === id);
  if (index < 0) return { ok: false, error: 'Creature package not found' };
  const prior = all[index];
  const blueprint = structuredClone(update.blueprint ?? prior.blueprint);
  const next: CreaturePackage = {
    ...prior,
    ...structuredClone(update),
    blueprint,
    revision: prior.revision + 1,
    updatedAt: now(),
    bodyFingerprint: bodyFingerprint(blueprint),
    physicsVersion: SOFT_BODY_PHYSICS_VERSION,
  };
  all[index] = next;
  const result = writePackages(all);
  return result.ok ? { ok: true, value: next } : { ok: false, error: result.error };
}

export function duplicatePackage(id: string, displayName?: string): RepositoryResult<CreaturePackage> {
  const source = loadCreaturePackages().find(item => item.id === id);
  if (!source) return { ok: false, error: 'Creature package not found' };
  return saveNewPackage(source.blueprint, {
    displayName: displayName ?? source.displayName,
    appearance: source.appearance,
    controllers: source.controllers,
    source: source.source,
    notes: source.notes,
  });
}

export function renamePackage(id: string, displayName: string): RepositoryResult<CreaturePackage> {
  return savePackageRevision(id, { displayName: displayName.trim() || 'Untitled Creature' });
}

export function deletePackage(id: string): RepositoryResult<CreaturePackage[]> {
  const all = loadCreaturePackages();
  const doomed = all.find(item => item.id === id);
  const next = all.filter(item => item.id !== id);
  const result = writePackages(next);
  if (result.ok && doomed) {
    // Prevent legacy v1 migration from recreating this body on the next load.
    purgeLegacyCreatures({
      names: [doomed.displayName, doomed.blueprint.name],
      fingerprints: [doomed.bodyFingerprint, bodyFingerprint(doomed.blueprint)],
    });
  }
  return result;
}

export function exportCreaturePackage(item: CreaturePackage): string {
  return JSON.stringify(item, null, 2);
}

export function importCreaturePackage(raw: string): RepositoryResult<CreaturePackage> {
  try {
    const parsed = JSON.parse(raw);
    if (validPackage(parsed)) {
      return saveNewPackage(parsed.blueprint, {
        displayName: parsed.displayName,
        appearance: parsed.appearance,
        controllers: parsed.controllers,
        source: 'import',
        notes: parsed.notes,
      });
    }
    if (validBlueprint(parsed?.blueprint ?? parsed)) {
      const blueprint = validBlueprint(parsed) ? parsed : parsed.blueprint;
      return saveNewPackage(blueprint, { source: 'import' });
    }
    return { ok: false, error: 'Unsupported creature package or blueprint' };
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
}

export function saveStudioDraft(
  blueprint: CreatureBlueprint,
  appearance?: AppearanceRig
): RepositoryResult<true> {
  try {
    storage()?.setItem(STUDIO_DRAFT_KEY, JSON.stringify({
      schemaVersion: CREATURE_PACKAGE_SCHEMA,
      savedAt: now(),
      blueprint,
      appearance,
    }));
    return { ok: true, value: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Draft storage failure' };
  }
}

export function loadStudioDraft(): { blueprint: CreatureBlueprint; appearance?: AppearanceRig; savedAt: string } | null {
  try {
    const parsed = JSON.parse(storage()?.getItem(STUDIO_DRAFT_KEY) ?? 'null');
    return parsed && validBlueprint(parsed.blueprint) ? parsed : null;
  } catch {
    return null;
  }
}

export function builtinAndSavedBlueprints(): CreatureBlueprint[] {
  return [...CREATURE_TEMPLATES, ...loadCreaturePackages().map(item => ({
    ...structuredClone(item.blueprint),
    name: item.displayName,
  }))];
}
