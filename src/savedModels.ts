/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  Genome,
  ParaPilot,
  genomeIOForBlueprint,
  isRigidBone,
} from './types';
import { getGoalInfo } from './goalCatalog';
import { formatBestEver } from './formatGoal';
import {
  DEFAULT_FINISHED_MODEL_IDS,
  DEFAULT_MODEL_SEEDS,
} from './defaultModels';

const STORAGE_KEY = 'biomech_finished_models_v1';
/** Permanent all-time Best Ever per goal — survives resets, goal switches, and shelf deletes. */
const BEST_EVER_STORAGE_KEY = 'biomech_goal_best_ever_v1';

/**
 * Soft-body Verlet + private worlds get expensive with heterogeneous morphologies.
 * Evolution already runs larger homogeneous packs; competition caps mixed bodies for
 * stable frame time and readable on-screen labels.
 */
export const MAX_COMPETITORS = 8;

export type BodyTrait =
  | 'wheeled'
  | 'motor-drive'
  | 'winged'
  | 'paraglider'
  | 'parachute'
  | 'soft-muscles'
  | 'rigid-bones'
  | 'multi-head';

export interface ModelTraits {
  bodyTraits: BodyTrait[];
  nodeCount: number;
  muscleCount: number;
  motorWheels: number;
  aeroSurfaces: number;
  rigidBones: number;
  softMuscles: number;
  brainInputs: number;
  brainOutputs: number;
  hiddenNodes: number;
  trainedGoalLabel: string;
}

export interface FinishedModel {
  id: string;
  name: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  generation: number;
  fitness: number;
  trainedGoal: EvolutionGoal;
  /**
   * Episode / generation length (seconds) when this fitness was earned.
   * Longer generations can inflate time-integrated scores; optional on legacy saves.
   */
  generationDurationSec?: number;
  blueprint: CreatureBlueprint;
  genome: Genome;
  /** Present when the product was trained on Para Ramp (three specialist heads). */
  paraPilot?: ParaPilot;
  traits: ModelTraits;
}

function newId(): string {
  return `fm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveModelTraits(
  blueprint: CreatureBlueprint,
  genome: Genome,
  trainedGoal: EvolutionGoal,
  paraPilot?: ParaPilot
): ModelTraits {
  const motorWheels = blueprint.nodes.filter(n => n.isMotorWheel).length;
  const wheeled = blueprint.nodes.filter(n => n.isWheel || n.isMotorWheel).length;
  const aeroSurfaces = blueprint.muscles.filter(
    m => m.aeroType === 'wing' || m.aeroType === 'paraglider' || m.aeroType === 'parachute'
  ).length;
  const winged = blueprint.muscles.some(m => m.aeroType === 'wing');
  const para = blueprint.muscles.some(m => m.aeroType === 'paraglider');
  const chute = blueprint.muscles.some(m => m.aeroType === 'parachute');
  const rigidBones = blueprint.muscles.filter(m => isRigidBone(m)).length;
  const softMuscles = blueprint.muscles.length - rigidBones;
  const io = genomeIOForBlueprint(blueprint);
  const hiddenNodes = genome.nodes.filter(n => n.type === 'hidden').length;

  const bodyTraits: BodyTrait[] = [];
  if (wheeled > 0) bodyTraits.push('wheeled');
  if (motorWheels > 0) bodyTraits.push('motor-drive');
  if (winged) bodyTraits.push('winged');
  if (para) bodyTraits.push('paraglider');
  if (chute) bodyTraits.push('parachute');
  if (softMuscles > 0) bodyTraits.push('soft-muscles');
  if (rigidBones > 0) bodyTraits.push('rigid-bones');
  if (paraPilot) bodyTraits.push('multi-head');

  return {
    bodyTraits,
    nodeCount: blueprint.nodes.length,
    muscleCount: blueprint.muscles.length,
    motorWheels,
    aeroSurfaces,
    rigidBones,
    softMuscles,
    brainInputs: io.inputs,
    brainOutputs: io.outputs,
    hiddenNodes,
    trainedGoalLabel: getGoalInfo(trainedGoal).shortLabel,
  };
}

function isValidGenome(g: unknown): g is Genome {
  if (!g || typeof g !== 'object') return false;
  const genome = g as Genome;
  return Array.isArray(genome.nodes) && Array.isArray(genome.connections);
}

function isValidBlueprint(b: unknown): b is CreatureBlueprint {
  if (!b || typeof b !== 'object') return false;
  const bp = b as CreatureBlueprint;
  return (
    typeof bp.name === 'string' &&
    Array.isArray(bp.nodes) &&
    bp.nodes.length >= 2 &&
    Array.isArray(bp.muscles) &&
    bp.muscles.length >= 1 &&
    Array.isArray(bp.relativePositions) &&
    bp.relativePositions.length === bp.nodes.length
  );
}

function isValidParaPilot(p: unknown): p is ParaPilot {
  if (!p || typeof p !== 'object') return false;
  const pilot = p as ParaPilot;
  return isValidGenome(pilot.runUp) && isValidGenome(pilot.deploy) && isValidGenome(pilot.glide);
}

function isValidFinishedModel(m: unknown): m is FinishedModel {
  if (!m || typeof m !== 'object') return false;
  const model = m as FinishedModel;
  return (
    typeof model.id === 'string' &&
    typeof model.name === 'string' &&
    model.name.trim().length > 0 &&
    isValidBlueprint(model.blueprint) &&
    isValidGenome(model.genome) &&
    typeof model.trainedGoal === 'string' &&
    !!model.traits &&
    typeof model.traits === 'object'
  );
}

function writeAll(models: FinishedModel[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  } catch {
    // ignore quota errors
  }
}

const SHIPPED_DEFAULTS_KEY = 'biomech_shipped_defaults_v4';

/** @deprecated Trained elites are no longer auto-seeded onto the shelf. */
export function buildDefaultFinishedModels(now = new Date().toISOString()): FinishedModel[] {
  return DEFAULT_MODEL_SEEDS.map(seed => ({
    id: seed.id,
    name: seed.name,
    notes: '',
    createdAt: seed.createdAt,
    updatedAt: now,
    generation: seed.generation,
    fitness: seed.fitness,
    trainedGoal: seed.trainedGoal,
    blueprint: structuredClone(seed.blueprint),
    genome: structuredClone(seed.genome),
    traits: deriveModelTraits(seed.blueprint, seed.genome, seed.trainedGoal),
  }));
}

function normalizeLoadedModels(parsed: unknown[]): FinishedModel[] {
  return parsed.filter(isValidFinishedModel).map(m => ({
    ...m,
    notes: typeof m.notes === 'string' ? m.notes : '',
    generationDurationSec:
      typeof m.generationDurationSec === 'number' &&
      Number.isFinite(m.generationDurationSec) &&
      m.generationDurationSec > 0
        ? m.generationDurationSec
        : undefined,
    traits: {
      ...m.traits,
      bodyTraits: Array.isArray(m.traits.bodyTraits) ? m.traits.bodyTraits : [],
    },
  }));
}

/**
 * One-time: strip previously auto-seeded trained shelf products. Body-only
 * defaults live in the Untrained package list (see creaturePackages).
 * User-created / overwritten shelf products are kept.
 */
function ensureShippedDefaults() {
  if (typeof localStorage === 'undefined') return;
  try {
    if (localStorage.getItem(SHIPPED_DEFAULTS_KEY) === 'done') return;
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const existing = Array.isArray(parsed) ? normalizeLoadedModels(parsed) : [];
    writeAll(existing.filter(m => !DEFAULT_FINISHED_MODEL_IDS.has(m.id)));
    localStorage.setItem(SHIPPED_DEFAULTS_KEY, 'done');
  } catch {
    /* ignore */
  }
}

export function loadFinishedModels(): FinishedModel[] {
  try {
    ensureShippedDefaults();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeLoadedModels(parsed);
  } catch {
    return [];
  }
}

/** Highest-fitness finished model trained on this goal, or null if none. */
export function findBestModelForGoal(
  goal: EvolutionGoal,
  models: FinishedModel[] = loadFinishedModels()
): FinishedModel | null {
  let best: FinishedModel | null = null;
  for (const model of models) {
    if (model.trainedGoal !== goal) continue;
    if (!Number.isFinite(model.fitness)) continue;
    if (!best || model.fitness > best.fitness) best = model;
  }
  return best;
}

/** Compact label for the episode length that produced a Best Ever score. */
export function formatGenLengthLabel(seconds: number | undefined | null): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return `${Math.round(seconds)}s gen`;
}

export type GoalBestEverSession = {
  fitness: number;
  generationDurationSec?: number;
  modelName?: string;
};

export type GoalBestEverRecord = {
  scoreLabel: string;
  modelName: string;
  fitness: number;
  generationDurationSec?: number;
  durationLabel: string | null;
};

/** Durable all-time score for one goal. Independent of the Models shelf. */
export type GoalBestEverEntry = {
  fitness: number;
  modelName: string;
  generationDurationSec?: number;
  updatedAt: string;
};

export type GoalBestEverCandidate = {
  fitness: number;
  modelName?: string;
  generationDurationSec?: number;
};

function isValidBestEverEntry(raw: unknown): raw is GoalBestEverEntry {
  if (!raw || typeof raw !== 'object') return false;
  const e = raw as GoalBestEverEntry;
  return (
    typeof e.fitness === 'number' &&
    Number.isFinite(e.fitness) &&
    e.fitness > 0 &&
    typeof e.modelName === 'string' &&
    e.modelName.trim().length > 0
  );
}

function normalizeBestEverEntry(e: GoalBestEverEntry): GoalBestEverEntry {
  const dur =
    typeof e.generationDurationSec === 'number' &&
    Number.isFinite(e.generationDurationSec) &&
    e.generationDurationSec > 0
      ? e.generationDurationSec
      : undefined;
  return {
    fitness: e.fitness,
    modelName: e.modelName.trim() || 'Unknown',
    generationDurationSec: dur,
    updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt : new Date().toISOString(),
  };
}

export function loadGoalBestEverMap(): Record<string, GoalBestEverEntry> {
  try {
    const raw = localStorage.getItem(BEST_EVER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, GoalBestEverEntry> = {};
    for (const [goal, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (isValidBestEverEntry(entry)) out[goal] = normalizeBestEverEntry(entry);
    }
    return out;
  } catch {
    return {};
  }
}

function writeGoalBestEverMap(map: Record<string, GoalBestEverEntry>) {
  try {
    localStorage.setItem(BEST_EVER_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota errors
  }
}

/** Current permanent Best Ever for a goal, or null if none recorded. */
export function getPersistedGoalBestEver(goal: EvolutionGoal): GoalBestEverEntry | null {
  const entry = loadGoalBestEverMap()[goal];
  return entry ?? null;
}

/**
 * Raise the permanent Best Ever when `candidate` beats it.
 * Equal fitness may only refine attribution (name / gen length) — never lowers.
 * Returns the stored entry after the attempt.
 */
export function promoteGoalBestEver(
  goal: EvolutionGoal,
  candidate: GoalBestEverCandidate
): GoalBestEverEntry | null {
  if (!Number.isFinite(candidate.fitness) || candidate.fitness <= 0) {
    return getPersistedGoalBestEver(goal);
  }
  const map = loadGoalBestEverMap();
  const existing = map[goal];
  const name =
    (typeof candidate.modelName === 'string' && candidate.modelName.trim()) ||
    'This run';
  const dur =
    typeof candidate.generationDurationSec === 'number' &&
    Number.isFinite(candidate.generationDurationSec) &&
    candidate.generationDurationSec > 0
      ? candidate.generationDurationSec
      : undefined;

  if (!existing || candidate.fitness > existing.fitness) {
    const next: GoalBestEverEntry = {
      fitness: candidate.fitness,
      modelName: name,
      generationDurationSec: dur,
      updatedAt: new Date().toISOString(),
    };
    map[goal] = next;
    writeGoalBestEverMap(map);
    return next;
  }

  // Same score: never lower the record. Only refine placeholder attribution
  // ("This run") or fill a missing generation length.
  let changed = false;
  const refined: GoalBestEverEntry = { ...existing };
  if (
    Math.abs(candidate.fitness - existing.fitness) < 1e-6 &&
    name !== 'This run' &&
    (existing.modelName === 'This run' || existing.modelName === 'Unknown')
  ) {
    refined.modelName = name;
    changed = true;
  }
  if (dur !== undefined && existing.generationDurationSec === undefined) {
    refined.generationDurationSec = dur;
    changed = true;
  }
  if (changed) {
    refined.updatedAt = new Date().toISOString();
    map[goal] = refined;
    writeGoalBestEverMap(map);
    return refined;
  }
  return existing;
}

/**
 * Clear all Best Ever traces for one goal.
 * - Removes the persisted ledger entry for that goal.
 * - Zeroes shelf model fitness trained under that goal so the score cannot
 *   immediately reappear from finished models.
 * Returns the updated finished-model list.
 */
export function clearGoalBestEver(goal: EvolutionGoal): FinishedModel[] {
  const map = loadGoalBestEverMap();
  delete map[goal];
  writeGoalBestEverMap(map);

  const models = loadFinishedModels();
  let changed = false;
  const next = models.map(model => {
    if (model.trainedGoal !== goal || !Number.isFinite(model.fitness) || model.fitness <= 0) {
      return model;
    }
    changed = true;
    return {
      ...model,
      fitness: 0,
      updatedAt: new Date().toISOString(),
    };
  });
  if (changed) writeAll(next);
  return changed ? next : models;
}

/**
 * Rename the permanent Best Ever holder when a finished product that owns the
 * current record is renamed. Score is never changed.
 */
export function relabelGoalBestEverHolder(
  goal: EvolutionGoal,
  previousName: string,
  nextName: string,
  fitness: number
): void {
  const trimmed = nextName.trim();
  if (!trimmed || !Number.isFinite(fitness)) return;
  const map = loadGoalBestEverMap();
  const existing = map[goal];
  if (!existing) return;
  if (Math.abs(existing.fitness - fitness) > 1e-6) return;
  if (existing.modelName !== previousName && existing.modelName !== 'This run') return;
  map[goal] = {
    ...existing,
    modelName: trimmed,
    updatedAt: new Date().toISOString(),
  };
  writeGoalBestEverMap(map);
}

/**
 * One-time / boot seed: lift finished-shelf champions into the permanent ledger
 * so older products are not forgotten after a refresh.
 */
export function seedGoalBestEverFromShelf(
  models: FinishedModel[] = loadFinishedModels()
): void {
  for (const model of models) {
    if (!Number.isFinite(model.fitness) || model.fitness <= 0) continue;
    promoteGoalBestEver(model.trainedGoal, {
      fitness: model.fitness,
      modelName: model.name,
      generationDurationSec: model.generationDurationSec,
    });
  }
}

/**
 * Clear all persisted score ledgers broken by lock-era physics launches.
 * Keeps creature packages and finished-model blueprints/genomes; zeroes shelf
 * fitness so they cannot re-seed Best Ever.
 */
export function clearAllRecordedScores(): {
  bestEverCleared: boolean;
  modelsZeroed: number;
} {
  let bestEverCleared = false;
  try {
    localStorage.removeItem(BEST_EVER_STORAGE_KEY);
    bestEverCleared = true;
  } catch {
    // ignore
  }

  const models = loadFinishedModels();
  let modelsZeroed = 0;
  if (models.length > 0) {
    const next = models.map(model => {
      if (!Number.isFinite(model.fitness) || model.fitness === 0) return model;
      modelsZeroed += 1;
      return { ...model, fitness: 0, updatedAt: new Date().toISOString() };
    });
    if (modelsZeroed > 0) writeAll(next);
  }

  return { bestEverCleared, modelsZeroed };
}

/** Migration flag: lock-era / broken-score wipe after D135. */
export const SCORES_CLEARED_MIGRATION_KEY = 'biomech_scores_cleared_d135_v1';

/**
 * Run once per browser profile: clear Best Ever + shelf fitness so inflated
 * lock-launch scores cannot return. Safe to call repeatedly.
 */
export function wipeBrokenScoresOnce(): boolean {
  try {
    if (localStorage.getItem(SCORES_CLEARED_MIGRATION_KEY) === '1') return false;
  } catch {
    return false;
  }
  clearAllRecordedScores();
  try {
    localStorage.setItem(SCORES_CLEARED_MIGRATION_KEY, '1');
  } catch {
    // ignore
  }
  return true;
}

/** Migration flag: clear step-point-era Run Right/Left Best Ever after D140. */
export const RUN_TRAVEL_CRITERION_MIGRATION_KEY = 'biomech_run_travel_d140_v1';

/**
 * Once per profile: drop LOCOMOTION_RIGHT/LEFT Best Ever entries recorded under
 * the D137 step-point-dominant criterion so in-place step farmers cannot remain
 * as all-time Run champions. Zero shelf fitness for those goals (products stay
 * visible). Shuffle goals are unaffected.
 */
export function wipeStepPointRunBestEverOnce(): boolean {
  try {
    if (localStorage.getItem(RUN_TRAVEL_CRITERION_MIGRATION_KEY) === '1') return false;
  } catch {
    return false;
  }
  const map = loadGoalBestEverMap();
  delete map[EvolutionGoal.LOCOMOTION_RIGHT];
  delete map[EvolutionGoal.LOCOMOTION_LEFT];
  writeGoalBestEverMap(map);
  const models = loadFinishedModels();
  let changed = false;
  const next = models.map(m => {
    if (
      (m.trainedGoal === EvolutionGoal.LOCOMOTION_RIGHT ||
        m.trainedGoal === EvolutionGoal.LOCOMOTION_LEFT) &&
      m.fitness > 0
    ) {
      changed = true;
      return { ...m, fitness: 0 };
    }
    return m;
  });
  if (changed) writeAll(next);
  try {
    localStorage.setItem(RUN_TRAVEL_CRITERION_MIGRATION_KEY, '1');
  } catch {
    // ignore
  }
  return true;
}

/** Migration flag: clear vibration-era Run Right/Left Best Ever after D137. */
export const RUN_STEP_CRITERION_MIGRATION_KEY = 'biomech_run_step_d137_v1';

/**
 * Once per profile: drop LOCOMOTION_RIGHT/LEFT Best Ever entries recorded under
 * the pre-D137 plant-distance criterion so vibration scooters cannot remain as
 * the all-time Run champions. Zero shelf fitness for those goals (products stay
 * visible). Shuffle goals are unaffected.
 */
export function wipePreStepRunBestEverOnce(): boolean {
  try {
    if (localStorage.getItem(RUN_STEP_CRITERION_MIGRATION_KEY) === '1') return false;
  } catch {
    return false;
  }
  const map = loadGoalBestEverMap();
  delete map[EvolutionGoal.LOCOMOTION_RIGHT];
  delete map[EvolutionGoal.LOCOMOTION_LEFT];
  writeGoalBestEverMap(map);
  const models = loadFinishedModels();
  let changed = false;
  const next = models.map(m => {
    if (
      (m.trainedGoal === EvolutionGoal.LOCOMOTION_RIGHT ||
        m.trainedGoal === EvolutionGoal.LOCOMOTION_LEFT) &&
      m.fitness > 0
    ) {
      changed = true;
      return { ...m, fitness: 0 };
    }
    return m;
  });
  if (changed) writeAll(next);
  try {
    localStorage.setItem(RUN_STEP_CRITERION_MIGRATION_KEY, '1');
  } catch {
    // ignore
  }
  return true;
}

/**
 * Authoritative Best Ever for the goal bar: max of the permanent ledger,
 * session high-water, and finished Models shelf. Deleting a shelf product or
 * switching bodies/goals never erases a beaten record. Generation length is
 * attached so longer episodes are not mistaken for stronger policies.
 */
export function resolveGoalBestEver(
  goal: EvolutionGoal,
  session: GoalBestEverSession,
  models: FinishedModel[] = loadFinishedModels(),
  persisted: GoalBestEverEntry | null = getPersistedGoalBestEver(goal)
): GoalBestEverRecord | null {
  const holder = findBestModelForGoal(goal, models);
  const shelfFit = holder && Number.isFinite(holder.fitness) ? holder.fitness : 0;
  const sessionFit = Number.isFinite(session.fitness) ? session.fitness : 0;
  const ledgerFit = persisted && Number.isFinite(persisted.fitness) ? persisted.fitness : 0;
  const best = Math.max(shelfFit, sessionFit, ledgerFit);
  if (best <= 0) return null;
  const scored = formatBestEver(goal, best);

  // Prefer the permanent ledger when it holds (or ties) the high score.
  if (persisted && ledgerFit >= best - 1e-9 && ledgerFit > 0) {
    return {
      scoreLabel: scored.value,
      modelName: persisted.modelName,
      fitness: best,
      generationDurationSec: persisted.generationDurationSec,
      durationLabel: formatGenLengthLabel(persisted.generationDurationSec),
    };
  }
  if (holder && shelfFit >= sessionFit && shelfFit > 0) {
    const dur = holder.generationDurationSec;
    return {
      scoreLabel: scored.value,
      modelName: holder.name,
      fitness: best,
      generationDurationSec: dur,
      durationLabel: formatGenLengthLabel(dur),
    };
  }
  return {
    scoreLabel: scored.value,
    modelName: session.modelName?.trim() || 'This run',
    fitness: best,
    generationDurationSec: session.generationDurationSec,
    durationLabel: formatGenLengthLabel(session.generationDurationSec),
  };
}

export function upsertFinishedModel(model: FinishedModel): FinishedModel[] {
  const existing = loadFinishedModels();
  const idx = existing.findIndex(m => m.id === model.id);
  const next =
    idx >= 0
      ? existing.map((m, i) => (i === idx ? model : m))
      : [...existing, model];
  writeAll(next);
  return next;
}

export function removeFinishedModel(id: string): FinishedModel[] {
  const next = loadFinishedModels().filter(m => m.id !== id);
  writeAll(next);
  return next;
}

export function renameFinishedModel(id: string, name: string, notes?: string): FinishedModel[] {
  const trimmed = name.trim();
  if (!trimmed) return loadFinishedModels();
  const existing = loadFinishedModels();
  const renamed = existing.find(m => m.id === id);
  const next = existing.map(m =>
    m.id === id
      ? {
          ...m,
          name: trimmed,
          notes: notes !== undefined ? notes : m.notes,
          updatedAt: new Date().toISOString(),
        }
      : m
  );
  writeAll(next);
  if (renamed && Number.isFinite(renamed.fitness) && renamed.fitness > 0) {
    relabelGoalBestEverHolder(renamed.trainedGoal, renamed.name, trimmed, renamed.fitness);
  }
  return next;
}

export interface SaveProductInput {
  name: string;
  notes?: string;
  creature: Creature;
  trainedGoal: EvolutionGoal;
  generation: number;
  /** Episode length (seconds) when the fitness was earned. */
  generationDurationSec?: number;
  /** Replace an existing product id when re-saving. */
  replaceId?: string;
}

/** Freeze the current creature as a named finished product.
 * Same display name replaces the existing shelf entry (update in place).
 */
export function saveCreatureAsProduct(input: SaveProductInput): FinishedModel {
  const { creature, trainedGoal, generation } = input;
  const name = input.name.trim() || `${creature.blueprint.name} Elite`;
  const now = new Date().toISOString();
  const shelf = loadFinishedModels();
  const existing = input.replaceId
    ? shelf.find(m => m.id === input.replaceId)
    : shelf.find(m => m.name.trim().toLowerCase() === name.toLowerCase());
  const duration =
    typeof input.generationDurationSec === 'number' &&
    Number.isFinite(input.generationDurationSec) &&
    input.generationDurationSec > 0
      ? input.generationDurationSec
      : existing?.generationDurationSec;

  const product: FinishedModel = {
    id: existing?.id ?? newId(),
    name,
    notes: (input.notes ?? existing?.notes ?? '').trim(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    generation,
    fitness: creature.fitness,
    trainedGoal,
    generationDurationSec: duration,
    blueprint: structuredClone(creature.blueprint),
    genome: structuredClone(creature.genome),
    paraPilot: creature.paraPilot ? structuredClone(creature.paraPilot) : undefined,
    traits: deriveModelTraits(
      creature.blueprint,
      creature.genome,
      trainedGoal,
      creature.paraPilot
    ),
  };

  upsertFinishedModel(product);
  promoteGoalBestEver(trainedGoal, {
    fitness: product.fitness,
    modelName: product.name,
    generationDurationSec: product.generationDurationSec,
  });
  return product;
}

/** Import a downloaded elite JSON (or gallery export) into the finished-product shelf.
 * Same display name replaces the existing shelf entry.
 */
export function importElitePayloadAsProduct(
  data: Record<string, unknown>,
  fallbackName?: string
): FinishedModel | null {
  if (!isValidBlueprint(data.blueprint) || !isValidGenome(data.genome)) return null;
  const goal = (typeof data.goal === 'string' ? data.goal : EvolutionGoal.LOCOMOTION_RIGHT) as EvolutionGoal;
  const paraPilot = isValidParaPilot(data.paraPilot) ? data.paraPilot : undefined;
  const name =
    (typeof data.modelName === 'string' && data.modelName.trim()) ||
    (typeof data.name === 'string' && data.name.trim()) ||
    fallbackName ||
    data.blueprint.name;

  const now = new Date().toISOString();
  const genDurationRaw = data.generationDurationSec ?? data.generationDuration;
  const generationDurationSec =
    typeof genDurationRaw === 'number' && Number.isFinite(genDurationRaw) && genDurationRaw > 0
      ? genDurationRaw
      : undefined;
  const shelf = loadFinishedModels();
  const existing = shelf.find(m => m.name.trim().toLowerCase() === name.trim().toLowerCase());
  const product: FinishedModel = {
    id: existing?.id ?? newId(),
    name,
    notes: typeof data.notes === 'string' ? data.notes : existing?.notes ?? '',
    createdAt: existing?.createdAt ?? (typeof data.timestamp === 'string' ? data.timestamp : now),
    updatedAt: now,
    generation: typeof data.generation === 'number' ? data.generation : 0,
    fitness: typeof data.fitness === 'number' ? data.fitness : 0,
    trainedGoal: goal,
    generationDurationSec: generationDurationSec ?? existing?.generationDurationSec,
    blueprint: structuredClone(data.blueprint),
    genome: structuredClone(data.genome),
    paraPilot: paraPilot ? structuredClone(paraPilot) : undefined,
    traits: deriveModelTraits(data.blueprint, data.genome, goal, paraPilot),
  };
  upsertFinishedModel(product);
  promoteGoalBestEver(goal, {
    fitness: product.fitness,
    modelName: product.name,
    generationDurationSec: product.generationDurationSec,
  });
  return product;
}

export function exportProductPayload(model: FinishedModel): Record<string, unknown> {
  return {
    modelName: model.name,
    notes: model.notes,
    timestamp: model.updatedAt,
    generation: model.generation,
    fitness: model.fitness,
    generationDurationSec: model.generationDurationSec,
    goal: model.trainedGoal,
    blueprint: model.blueprint,
    genome: model.genome,
    paraPilot: model.paraPilot,
    traits: model.traits,
    productId: model.id,
  };
}

export function traitLabel(trait: BodyTrait): string {
  switch (trait) {
    case 'wheeled':
      return 'Wheeled';
    case 'motor-drive':
      return 'Motor drive';
    case 'winged':
      return 'Winged';
    case 'paraglider':
      return 'Paraglider';
    case 'parachute':
      return 'Parachute';
    case 'soft-muscles':
      return 'Soft muscles';
    case 'rigid-bones':
      return 'Rigid bones';
    case 'multi-head':
      return 'Multi-head brain';
    default:
      return trait;
  }
}

/** Suggested Freeze name when continuing a shelf product onto a new goal. */
export function suggestTransferProductName(
  sourceName: string,
  targetGoal: EvolutionGoal
): string {
  const base = sourceName.trim() || 'Model';
  const goal = getGoalInfo(targetGoal).shortLabel;
  return `${base} → ${goal}`;
}
