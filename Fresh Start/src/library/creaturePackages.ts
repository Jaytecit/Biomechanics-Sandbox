/**
 * Creature packages repository (F1) — versioned localStorage.
 * Fresh Start schema only; no parent physics fields.
 */
import {
  cloneAppearance,
  type AppearanceRig,
} from '../appearance/types';
import { cloneDesign, type CreatureDesign } from '../creature/types';

export const CREATURE_PACKAGE_SCHEMA = 1;
const STORAGE_KEY = 'freshstart_creature_packages_v1';

export type PackageSource =
  | 'studio-draft'
  | 'preset'
  | 'import'
  | 'builtin'
  | 'user';

export interface CreaturePackage {
  schemaVersion: number;
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  displayName: string;
  design: CreatureDesign;
  appearance?: AppearanceRig;
  source: PackageSource;
  notes?: string;
}

export type RepoResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function now(): number {
  return Date.now();
}

function newId(): string {
  return `pkg_${now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAll(): CreaturePackage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CreaturePackage[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeAll(items: CreaturePackage[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function loadCreaturePackages(): CreaturePackage[] {
  return readAll().filter((p) => p.source !== 'builtin');
}

export function saveNewPackage(
  design: CreatureDesign,
  opts?: {
    displayName?: string;
    appearance?: AppearanceRig;
    source?: PackageSource;
    notes?: string;
  },
): RepoResult<CreaturePackage> {
  try {
    const t = now();
    const pkg: CreaturePackage = {
      schemaVersion: CREATURE_PACKAGE_SCHEMA,
      id: newId(),
      revision: 1,
      createdAt: t,
      updatedAt: t,
      displayName: opts?.displayName ?? design.name ?? 'Creature',
      design: cloneDesign(design),
      appearance: cloneAppearance(opts?.appearance),
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

export function savePackageRevision(
  id: string,
  update: {
    design?: CreatureDesign;
    appearance?: AppearanceRig | null;
    displayName?: string;
    notes?: string;
  },
): RepoResult<CreaturePackage> {
  const all = readAll();
  const idx = all.findIndex((p) => p.id === id);
  if (idx < 0) return { ok: false, error: 'Package not found' };
  const prev = all[idx];
  if (prev.source === 'builtin') {
    return { ok: false, error: 'Builtin packages are read-only' };
  }
  const next: CreaturePackage = {
    ...prev,
    revision: prev.revision + 1,
    updatedAt: now(),
    displayName: update.displayName ?? prev.displayName,
    design: update.design ? cloneDesign(update.design) : prev.design,
    appearance:
      update.appearance === null
        ? undefined
        : update.appearance
          ? cloneAppearance(update.appearance)
          : prev.appearance,
    notes: update.notes ?? prev.notes,
  };
  all[idx] = next;
  writeAll(all);
  return { ok: true, value: next };
}

export function renamePackage(id: string, displayName: string): RepoResult<CreaturePackage> {
  return savePackageRevision(id, { displayName });
}

export function deletePackage(id: string): RepoResult<true> {
  const all = readAll();
  const pkg = all.find((p) => p.id === id);
  if (!pkg) return { ok: false, error: 'Package not found' };
  if (pkg.source === 'builtin') {
    return { ok: false, error: 'Builtin packages are read-only' };
  }
  writeAll(all.filter((p) => p.id !== id));
  return { ok: true, value: true };
}

export function duplicatePackage(id: string, name?: string): RepoResult<CreaturePackage> {
  const all = readAll();
  const pkg = all.find((p) => p.id === id);
  if (!pkg) return { ok: false, error: 'Package not found' };
  return saveNewPackage(pkg.design, {
    displayName: name ?? `${pkg.displayName} Copy`,
    appearance: pkg.appearance,
    source: 'user',
    notes: pkg.notes,
  });
}

export function exportCreaturePackage(pkg: CreaturePackage): string {
  return JSON.stringify(pkg, null, 2);
}

export function importCreaturePackage(raw: string): RepoResult<CreaturePackage> {
  try {
    const data = JSON.parse(raw) as Partial<CreaturePackage>;
    if (!data.design || !Array.isArray(data.design.joints)) {
      return { ok: false, error: 'Invalid package: missing design' };
    }
    return saveNewPackage(data.design as CreatureDesign, {
      displayName: data.displayName ?? data.design.name,
      appearance: data.appearance,
      source: 'import',
      notes: data.notes,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
