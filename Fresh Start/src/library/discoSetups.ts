/**
 * H8 — named Disco stage setups (tuning, routing, puppet, slots, optional dance brain).
 * Audio files / playlist blobs / record buffers are not persisted.
 */
import type {
  DiscoAutoFlags,
  DiscoBandRouting,
  DiscoMotionControls,
  DiscoReactivityGains,
  DiscoRouteBand,
  DiscoRouteTarget,
} from '../audio/audioAnalysis';
import {
  DEFAULT_DISCO_AUTO,
  DEFAULT_DISCO_MOTION,
  DEFAULT_DISCO_REACTIVITY,
  DEFAULT_DISCO_ROUTING,
} from '../audio/audioAnalysis';
import type { NetworkShape } from '../brain/types';
import { cloneDesign, type CreatureDesign } from '../creature/types';
import {
  DEFAULT_DISCO_BALL_X,
  DEFAULT_DISCO_BALL_Y,
  DEFAULT_DISCO_PUPPET_MODE,
  DISCO_FOOT_MASS_DEFAULT,
  DISCO_FOOT_MASS_MAX,
  DISCO_FOOT_MASS_MIN,
  DISCO_PUPPET_MODES,
  type DiscoPuppetMode,
} from '../physics/constants';
import { clampDiscoBallPos } from '../sim/discoFx';
import { decodeWeights, encodeWeights } from './savedModels';

export const DISCO_SETUP_VERSION = 1 as const;
export const DISCO_SETUP_SLOT_COUNT = 6;

const STORAGE_KEY = 'freshstart_disco_setups_v1';
const MAX_SETUPS = 40;

const ROUTE_BANDS: readonly DiscoRouteBand[] = [
  'bass',
  'lowMid',
  'highMid',
  'treble',
  'onset',
];

export interface DiscoSetupSlot {
  design: CreatureDesign;
  label: string;
  offsetX?: number;
}

export interface DiscoSetupDanceBrain {
  shape: NetworkShape;
  weightsB64: string;
  fitness: number;
  stage: 'imitate' | 'refine';
}

/** Durable Disco stage snapshot. */
export interface DiscoSetup {
  kind: 'disco_setup';
  version: typeof DISCO_SETUP_VERSION;
  id: string;
  name: string;
  createdAt: number;
  gains: DiscoReactivityGains;
  motion: DiscoMotionControls;
  auto: DiscoAutoFlags;
  routing: DiscoBandRouting;
  puppetMode: DiscoPuppetMode;
  footMass: number;
  hideMuscles: boolean;
  hideBones: boolean;
  greenscreen: boolean;
  ballX: number;
  ballY: number;
  /** Length 6; null = empty slot. */
  slots: (DiscoSetupSlot | null)[];
  danceBrain?: DiscoSetupDanceBrain;
  /** Reminder only — audio is not embedded. */
  trackHint?: string;
}

export interface DiscoSetupCapture {
  name: string;
  gains: DiscoReactivityGains;
  motion: DiscoMotionControls;
  auto: DiscoAutoFlags;
  routing: DiscoBandRouting;
  puppetMode: DiscoPuppetMode;
  footMass: number;
  hideMuscles: boolean;
  hideBones: boolean;
  greenscreen: boolean;
  ballX: number;
  ballY: number;
  slots: (DiscoSetupSlot | null)[];
  danceBrain?: {
    shape: NetworkShape;
    weights: Float32Array;
    fitness: number;
    stage: 'imitate' | 'refine';
  };
  trackHint?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPuppetMode(v: unknown): v is DiscoPuppetMode {
  return typeof v === 'string' && v in DISCO_PUPPET_MODES;
}

function clampFootMass(n: number): number {
  if (!Number.isFinite(n)) return DISCO_FOOT_MASS_DEFAULT;
  return Math.max(DISCO_FOOT_MASS_MIN, Math.min(DISCO_FOOT_MASS_MAX, n));
}

function parseRouteTarget(raw: unknown): DiscoRouteTarget {
  if (!isRecord(raw) || typeof raw.kind !== 'string') return { kind: 'auto' };
  if (raw.kind === 'auto') return { kind: 'auto' };
  if (raw.kind === 'muscle' && typeof raw.muscleId === 'number') {
    return { kind: 'muscle', muscleId: raw.muscleId };
  }
  if (raw.kind === 'group' && typeof raw.group === 'number') {
    return { kind: 'group', group: raw.group };
  }
  return { kind: 'auto' };
}

function parseRouting(raw: unknown): DiscoBandRouting {
  const base = { ...DEFAULT_DISCO_ROUTING };
  if (!isRecord(raw)) return base;
  for (const band of ROUTE_BANDS) {
    base[band] = parseRouteTarget(raw[band]);
  }
  return base;
}

function parseGains(raw: unknown): DiscoReactivityGains {
  const base = { ...DEFAULT_DISCO_REACTIVITY };
  if (!isRecord(raw)) return base;
  for (const key of Object.keys(base) as (keyof DiscoReactivityGains)[]) {
    const n = raw[key];
    if (typeof n === 'number' && Number.isFinite(n)) base[key] = n;
  }
  return base;
}

function parseMotion(raw: unknown): DiscoMotionControls {
  const base = { ...DEFAULT_DISCO_MOTION };
  if (!isRecord(raw)) return base;
  if (typeof raw.range === 'number' && Number.isFinite(raw.range)) {
    base.range = raw.range;
  }
  if (typeof raw.frequency === 'number' && Number.isFinite(raw.frequency)) {
    base.frequency = raw.frequency;
  }
  return base;
}

function parseAuto(raw: unknown): DiscoAutoFlags {
  const base = { ...DEFAULT_DISCO_AUTO };
  if (!isRecord(raw)) return base;
  for (const key of Object.keys(base) as (keyof DiscoAutoFlags)[]) {
    if (typeof raw[key] === 'boolean') base[key] = raw[key];
  }
  return base;
}

function parseDesign(raw: unknown): CreatureDesign | null {
  if (!isRecord(raw)) return null;
  if (!Array.isArray(raw.joints) || !Array.isArray(raw.bones) || !Array.isArray(raw.muscles)) {
    return null;
  }
  if (typeof raw.name !== 'string') return null;
  try {
    return cloneDesign(raw as unknown as CreatureDesign);
  } catch {
    return null;
  }
}

function parseSlot(raw: unknown): DiscoSetupSlot | null {
  if (raw === null) return null;
  if (!isRecord(raw)) return null;
  const design = parseDesign(raw.design);
  if (!design) return null;
  const label =
    typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim()
      : design.name || 'Dancer';
  const slot: DiscoSetupSlot = { design, label };
  if (typeof raw.offsetX === 'number' && Number.isFinite(raw.offsetX)) {
    slot.offsetX = raw.offsetX;
  }
  return slot;
}

function parseSlots(raw: unknown): (DiscoSetupSlot | null)[] {
  const out: (DiscoSetupSlot | null)[] = Array.from(
    { length: DISCO_SETUP_SLOT_COUNT },
    () => null,
  );
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < DISCO_SETUP_SLOT_COUNT; i++) {
    out[i] = parseSlot(raw[i]);
  }
  return out;
}

function parseShape(raw: unknown): NetworkShape | null {
  if (!isRecord(raw)) return null;
  const {
    inputCount,
    hiddenCount,
    outputCount,
    weightCount,
  } = raw;
  if (
    typeof inputCount !== 'number' ||
    typeof hiddenCount !== 'number' ||
    typeof outputCount !== 'number' ||
    typeof weightCount !== 'number'
  ) {
    return null;
  }
  return { inputCount, hiddenCount, outputCount, weightCount };
}

function parseDanceBrain(raw: unknown): DiscoSetupDanceBrain | undefined {
  if (!isRecord(raw)) return undefined;
  const shape = parseShape(raw.shape);
  if (!shape || typeof raw.weightsB64 !== 'string') return undefined;
  try {
    const weights = decodeWeights(raw.weightsB64);
    if (weights.length !== shape.weightCount) return undefined;
  } catch {
    return undefined;
  }
  const stage = raw.stage === 'refine' ? 'refine' : 'imitate';
  return {
    shape,
    weightsB64: raw.weightsB64,
    fitness: typeof raw.fitness === 'number' ? raw.fitness : 0,
    stage,
  };
}

function parseSetup(raw: unknown): DiscoSetup | null {
  if (!isRecord(raw)) return null;
  if (raw.kind !== 'disco_setup' || raw.version !== DISCO_SETUP_VERSION) {
    return null;
  }
  if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null;
  if (typeof raw.createdAt !== 'number') return null;
  const setup: DiscoSetup = {
    kind: 'disco_setup',
    version: DISCO_SETUP_VERSION,
    id: raw.id,
    name: raw.name.trim() || 'Untitled',
    createdAt: raw.createdAt,
    gains: parseGains(raw.gains),
    motion: parseMotion(raw.motion),
    auto: parseAuto(raw.auto),
    routing: parseRouting(raw.routing),
    puppetMode: isPuppetMode(raw.puppetMode)
      ? raw.puppetMode
      : DEFAULT_DISCO_PUPPET_MODE,
    footMass: clampFootMass(
      typeof raw.footMass === 'number' ? raw.footMass : DISCO_FOOT_MASS_DEFAULT,
    ),
    hideMuscles: !!raw.hideMuscles,
    hideBones: !!raw.hideBones,
    greenscreen: !!raw.greenscreen,
    ballX: DEFAULT_DISCO_BALL_X,
    ballY: DEFAULT_DISCO_BALL_Y,
    slots: parseSlots(raw.slots),
  };
  if (
    typeof raw.ballX === 'number' &&
    Number.isFinite(raw.ballX) &&
    typeof raw.ballY === 'number' &&
    Number.isFinite(raw.ballY)
  ) {
    const ball = clampDiscoBallPos(raw.ballX, raw.ballY);
    setup.ballX = ball.x;
    setup.ballY = ball.y;
  }
  const brain = parseDanceBrain(raw.danceBrain);
  if (brain) setup.danceBrain = brain;
  if (typeof raw.trackHint === 'string' && raw.trackHint.trim()) {
    setup.trackHint = raw.trackHint.trim();
  }
  return setup;
}

function readAll(): DiscoSetup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseSetup)
      .filter((s): s is DiscoSetup => s !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function writeAll(setups: DiscoSetup[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setups.slice(0, MAX_SETUPS)));
  } catch {
    /* ignore quota */
  }
}

export function loadDiscoSetups(): DiscoSetup[] {
  return readAll();
}

export function deleteDiscoSetup(id: string): void {
  writeAll(readAll().filter((s) => s.id !== id));
}

/** Build a setup from live Disco state (clones designs). */
export function captureDiscoSetup(opts: DiscoSetupCapture): DiscoSetup {
  const slots = Array.from({ length: DISCO_SETUP_SLOT_COUNT }, (_, i) => {
    const slot = opts.slots[i] ?? null;
    if (!slot) return null;
    const captured: DiscoSetupSlot = {
      design: cloneDesign(slot.design),
      label: slot.label,
    };
    if (typeof slot.offsetX === 'number' && Number.isFinite(slot.offsetX)) {
      captured.offsetX = slot.offsetX;
    }
    return captured;
  });

  const ball = clampDiscoBallPos(opts.ballX, opts.ballY);
  const setup: DiscoSetup = {
    kind: 'disco_setup',
    version: DISCO_SETUP_VERSION,
    id: `ds_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: opts.name.trim() || 'Untitled disco',
    createdAt: Date.now(),
    gains: { ...opts.gains },
    motion: { ...opts.motion },
    auto: { ...opts.auto },
    routing: { ...opts.routing },
    puppetMode: opts.puppetMode,
    footMass: clampFootMass(opts.footMass),
    hideMuscles: opts.hideMuscles,
    hideBones: opts.hideBones,
    greenscreen: opts.greenscreen,
    ballX: ball.x,
    ballY: ball.y,
    slots,
  };

  if (opts.danceBrain) {
    setup.danceBrain = {
      shape: { ...opts.danceBrain.shape },
      weightsB64: encodeWeights(opts.danceBrain.weights),
      fitness: opts.danceBrain.fitness,
      stage: opts.danceBrain.stage,
    };
  }
  if (opts.trackHint?.trim()) {
    setup.trackHint = opts.trackHint.trim();
  }
  return setup;
}

/** Upsert by name (replace existing with same name). */
export function saveDiscoSetup(setup: DiscoSetup): DiscoSetup {
  const list = readAll().filter(
    (s) => s.name !== setup.name && s.id !== setup.id,
  );
  list.unshift(setup);
  writeAll(list);
  return setup;
}

export function exportDiscoSetupJson(setup: DiscoSetup): string {
  return JSON.stringify(setup, null, 2);
}

export function parseDiscoSetupJson(json: string): DiscoSetup {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  const setup = parseSetup(data);
  if (!setup) {
    throw new Error('Not a Solemn Sandbox disco setup v1');
  }
  return setup;
}

export function danceBrainFromSetup(setup: DiscoSetup): {
  shape: NetworkShape;
  weights: Float32Array;
  fitness: number;
  stage: 'imitate' | 'refine';
} | null {
  if (!setup.danceBrain) return null;
  try {
    const weights = decodeWeights(setup.danceBrain.weightsB64);
    if (weights.length !== setup.danceBrain.shape.weightCount) return null;
    return {
      shape: { ...setup.danceBrain.shape },
      weights,
      fitness: setup.danceBrain.fitness,
      stage: setup.danceBrain.stage,
    };
  } catch {
    return null;
  }
}
