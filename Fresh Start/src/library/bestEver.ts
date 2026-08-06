/**
 * D4 — Best Ever ledger (per-task all-time best + simple recipe fingerprint).
 */
import type { TaskId } from '../brain/types';
import type { CreatureDesign } from '../creature/types';

const STORAGE_KEY = 'freshstart_best_ever_v1';

export interface BestEverEntry {
  task: TaskId;
  fitness: number;
  designName: string;
  /** Stable-ish fingerprint of body graph + task (not parent physics hash). */
  recipeFingerprint: string;
  updatedAt: number;
}

export function bodyFingerprint(design: CreatureDesign): string {
  const parts = [
    design.joints.length,
    design.bones.length,
    design.muscles.length,
    design.joints.map((j) => `${j.id}:${j.x.toFixed(2)},${j.y.toFixed(2)}`).join('|'),
    design.bones.map((b) => `${b.id}:${b.startJointId}-${b.endJointId}`).join('|'),
    design.muscles.map((m) => `${m.id}:${m.startBoneId}-${m.endBoneId}`).join('|'),
  ];
  let h = 2166136261;
  const s = parts.join(';');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function recipeFingerprint(task: TaskId, design: CreatureDesign): string {
  return `${task}:${bodyFingerprint(design)}`;
}

function readAll(): BestEverEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BestEverEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: BestEverEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function loadBestEver(): BestEverEntry[] {
  return readAll().sort((a, b) => b.fitness - a.fitness);
}

export function getBestEver(task: TaskId): BestEverEntry | undefined {
  return readAll().find((e) => e.task === task);
}

/** Record a new best if fitness beats the stored entry for this task. */
export function considerBestEver(
  task: TaskId,
  fitness: number,
  design: CreatureDesign,
): BestEverEntry | null {
  if (!Number.isFinite(fitness)) return null;
  const all = readAll();
  const idx = all.findIndex((e) => e.task === task);
  const entry: BestEverEntry = {
    task,
    fitness,
    designName: design.name,
    recipeFingerprint: recipeFingerprint(task, design),
    updatedAt: Date.now(),
  };
  if (idx < 0) {
    all.push(entry);
    writeAll(all);
    return entry;
  }
  if (fitness > all[idx].fitness) {
    all[idx] = entry;
    writeAll(all);
    return entry;
  }
  return null;
}
