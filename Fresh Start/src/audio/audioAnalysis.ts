/**
 * Web Audio analysis for disco (H1) — local file only, no mic/tab capture.
 * Pure DSP → band levels and actuator frames in [-1, 1].
 */
import type { DriveGroupFields } from '../brain/driveGroups';
import {
  brainActuatorChannelByMuscleId,
  countBrainActuatorChannels,
  expandChannelDrives,
  normalizeDriveGroup,
} from '../brain/driveGroups';
import type { CreatureDesign, MuscleDef } from '../creature/types';

export interface AudioBands {
  bass: number;
  lowMid: number;
  highMid: number;
  treble: number;
  onset: number;
  energy: number;
}

export interface DiscoReactivityGains {
  bass: number;
  lowMid: number;
  highMid: number;
  treble: number;
  onset: number;
  master: number;
}

export interface DiscoMotionControls {
  range: number;
  frequency: number;
}

/** Frequency bands that can be routed to muscles / drive groups. */
export type DiscoRouteBand = 'bass' | 'lowMid' | 'highMid' | 'treble' | 'onset';

/**
 * Per-band actuator target.
 * - auto: legacy stroke-biased round-robin across channels
 * - muscle: drive a single muscle id
 * - group: drive every muscle sharing that driveGroup id
 */
export type DiscoRouteTarget =
  | { kind: 'auto' }
  | { kind: 'muscle'; muscleId: number }
  | { kind: 'group'; group: number };

export type DiscoBandRouting = Record<DiscoRouteBand, DiscoRouteTarget>;

export const DEFAULT_DISCO_REACTIVITY: DiscoReactivityGains = {
  bass: 1.2,
  lowMid: 1,
  highMid: 0.9,
  treble: 0.8,
  onset: 1.1,
  master: 1,
};

export const DEFAULT_DISCO_MOTION: DiscoMotionControls = {
  range: 1,
  frequency: 2,
};

/**
 * Per-band / motion-range auto toggles (UI checkboxes).
 * When on, music changes drive the matching slider (not Master / Motion freq).
 */
export interface DiscoAutoFlags {
  bass: boolean;
  lowMid: boolean;
  highMid: boolean;
  treble: boolean;
  onset: boolean;
  motionRange: boolean;
}

export const DEFAULT_DISCO_AUTO: DiscoAutoFlags = {
  bass: false,
  lowMid: false,
  highMid: false,
  treble: false,
  onset: false,
  motionRange: false,
};

/** Per-band adaptive envelope used to detect musical changes. */
export interface DiscoAutoBandEnv {
  slow: number;
  floor: number;
  ceil: number;
}

/** Mutable tick state for music-triggered slider auto. */
export interface DiscoAutoTickState {
  prevBands: AudioBands;
  jumpCounts: Record<DiscoRouteBand, number>;
  gainTargets: Record<DiscoRouteBand, number>;
  bandEnv: Record<DiscoRouteBand, DiscoAutoBandEnv>;
  motionRangeTarget: number;
  /** Adaptive loudness floor/ceiling so quiet→drop spans the slider. */
  loudnessFloor: number;
  loudnessCeil: number;
  initialized: boolean;
}

const GAIN_SLIDER_MIN = 0;
const GAIN_SLIDER_MAX = 2;
const MOTION_RANGE_MIN = 0.2;
const MOTION_RANGE_MAX = 1.5;
/** Deviation above slow envelope that counts as a band hit. */
const AUTO_BAND_HIT = 0.035;
/** Onset level that forces a jump even without a large delta. */
const AUTO_ONSET_FIRE = 0.28;
/** Per-frame lerp toward jumped gain targets (rapid slider motion). */
const AUTO_GAIN_LERP = 0.5;
/** Gentle continuous follow so mid/treble stay music-linked between hits. */
const AUTO_GAIN_FOLLOW = 0.12;
/** Motion-range follow: fast on rises (drops), slower on falls. */
const AUTO_MOTION_ATTACK = 0.55;
const AUTO_MOTION_RELEASE = 0.18;
/** Minimum relative loudness span before AGC expands. */
const AUTO_LOUDNESS_MIN_SPAN = 0.12;
const AUTO_BAND_MIN_SPAN = 0.08;

function emptyBandEnv(level = 0): DiscoAutoBandEnv {
  return {
    slow: level,
    floor: level,
    ceil: Math.max(level, level + AUTO_BAND_MIN_SPAN),
  };
}

function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function createDiscoAutoTickState(
  gains: DiscoReactivityGains = DEFAULT_DISCO_REACTIVITY,
  motion: DiscoMotionControls = DEFAULT_DISCO_MOTION,
): DiscoAutoTickState {
  return {
    prevBands: {
      bass: 0,
      lowMid: 0,
      highMid: 0,
      treble: 0,
      onset: 0,
      energy: 0,
    },
    jumpCounts: {
      bass: 0,
      lowMid: 0,
      highMid: 0,
      treble: 0,
      onset: 0,
    },
    gainTargets: {
      bass: gains.bass,
      lowMid: gains.lowMid,
      highMid: gains.highMid,
      treble: gains.treble,
      onset: gains.onset,
    },
    bandEnv: {
      bass: emptyBandEnv(),
      lowMid: emptyBandEnv(),
      highMid: emptyBandEnv(),
      treble: emptyBandEnv(),
      onset: emptyBandEnv(),
    },
    motionRangeTarget: motion.range,
    loudnessFloor: 1,
    loudnessCeil: 0,
    initialized: false,
  };
}

export function anyDiscoAutoEnabled(auto: DiscoAutoFlags): boolean {
  return (
    auto.bass ||
    auto.lowMid ||
    auto.highMid ||
    auto.treble ||
    auto.onset ||
    auto.motionRange
  );
}

/**
 * Drive auto-enabled gain / motion-range sliders from live bands.
 * Band autos jump to new positions on musical changes; motion range tracks energy.
 */
export function tickDiscoAuto(args: {
  bands: AudioBands;
  gains: DiscoReactivityGains;
  motion: DiscoMotionControls;
  auto: DiscoAutoFlags;
  state: DiscoAutoTickState;
  timeSec: number;
}): {
  gains: DiscoReactivityGains;
  motion: DiscoMotionControls;
  state: DiscoAutoTickState;
  changed: boolean;
} {
  const { bands, auto, timeSec } = args;
  const state = args.state;
  let gains = args.gains;
  let motion = args.motion;
  let changed = false;

  if (!state.initialized) {
    state.prevBands = { ...bands };
    state.gainTargets = {
      bass: gains.bass,
      lowMid: gains.lowMid,
      highMid: gains.highMid,
      treble: gains.treble,
      onset: gains.onset,
    };
    for (const key of DISCO_ROUTE_BANDS) {
      state.bandEnv[key] = emptyBandEnv(bands[key]);
    }
    state.motionRangeTarget = motion.range;
    state.loudnessFloor = bands.energy;
    state.loudnessCeil = Math.max(bands.energy, bands.energy + AUTO_LOUDNESS_MIN_SPAN);
    state.initialized = true;
  }

  const tBucket = Math.floor(timeSec * 8);
  const onsetEdge =
    bands.onset >= AUTO_ONSET_FIRE &&
    state.prevBands.onset < AUTO_ONSET_FIRE;
  const energyHit = bands.energy - state.prevBands.energy >= 0.04;

  for (let i = 0; i < DISCO_ROUTE_BANDS.length; i++) {
    const key = DISCO_ROUTE_BANDS[i];
    if (!auto[key]) continue;

    const level = bands[key];
    const env = state.bandEnv[key];
    // Slow envelope + AGC so sustained mid/treble still have usable dynamics.
    env.slow = lerp(env.slow, level, 0.06);
    if (level < env.floor) env.floor = lerp(env.floor, level, 0.3);
    else env.floor = lerp(env.floor, level, 0.005);
    if (level > env.ceil) env.ceil = lerp(env.ceil, level, 0.4);
    else env.ceil = lerp(env.ceil, level, 0.004);
    const span = Math.max(AUTO_BAND_MIN_SPAN, env.ceil - env.floor);
    const norm = clamp01((level - env.floor) / span);
    const musicTarget =
      GAIN_SLIDER_MIN + norm * (GAIN_SLIDER_MAX - GAIN_SLIDER_MIN);

    const bandHit = level - env.slow >= AUTO_BAND_HIT;
    const bandEdge =
      key === 'onset'
        ? onsetEdge
        : onsetEdge || energyHit || bandHit;

    if (bandEdge) {
      state.jumpCounts[key] += 1;
      // Jump hard, but bias the landing toward current band loudness.
      const h = hash01(
        state.jumpCounts[key] * 17.3 + (i + 1) * 41.7 + tBucket * 0.13,
      );
      const wild = GAIN_SLIDER_MIN + h * (GAIN_SLIDER_MAX - GAIN_SLIDER_MIN);
      state.gainTargets[key] = musicTarget * 0.35 + wild * 0.65;
    } else {
      // Between hits, keep following the band so mid/treble aren't frozen.
      state.gainTargets[key] = lerp(
        state.gainTargets[key],
        musicTarget,
        AUTO_GAIN_FOLLOW,
      );
    }

    const next = lerp(gains[key], state.gainTargets[key], AUTO_GAIN_LERP);
    if (Math.abs(next - gains[key]) > 0.0005) {
      if (gains === args.gains) gains = { ...gains };
      gains[key] = next;
      changed = true;
    }
  }

  if (auto.motionRange) {
    const raw = bands.energy;
    // Adaptive AGC: track recent quiet floor / loud ceiling so drops use full travel.
    if (raw < state.loudnessFloor) {
      state.loudnessFloor = lerp(state.loudnessFloor, raw, 0.35);
    } else {
      state.loudnessFloor = lerp(state.loudnessFloor, raw, 0.004);
    }
    if (raw > state.loudnessCeil) {
      state.loudnessCeil = lerp(state.loudnessCeil, raw, 0.45);
    } else {
      state.loudnessCeil = lerp(state.loudnessCeil, raw, 0.003);
    }
    const span = Math.max(
      AUTO_LOUDNESS_MIN_SPAN,
      state.loudnessCeil - state.loudnessFloor,
    );
    const norm = clamp01((raw - state.loudnessFloor) / span);
    // Ease toward extremes so quiet→drop reads clearly on the slider.
    const shaped = norm * norm * (3 - 2 * norm);
    state.motionRangeTarget =
      MOTION_RANGE_MIN + shaped * (MOTION_RANGE_MAX - MOTION_RANGE_MIN);
    const follow =
      state.motionRangeTarget >= motion.range
        ? AUTO_MOTION_ATTACK
        : AUTO_MOTION_RELEASE;
    const nextRange = lerp(motion.range, state.motionRangeTarget, follow);
    if (Math.abs(nextRange - motion.range) > 0.0005) {
      motion = { ...motion, range: nextRange };
      changed = true;
    }
  }

  state.prevBands = { ...bands };
  return { gains, motion, state, changed };
}

/** Default band routing for UltiGrooveBot II drive groups. */
export const DEFAULT_DISCO_ROUTING: DiscoBandRouting = {
  bass: { kind: 'group', group: 4 },
  lowMid: { kind: 'group', group: 3 },
  highMid: { kind: 'group', group: 2 },
  treble: { kind: 'group', group: 5 },
  onset: { kind: 'group', group: 1 },
};

/** Bundled default disco track (served from /public/disco/). */
export const DEFAULT_DISCO_TRACK_URL = '/disco/default-track.mp3';
export const DEFAULT_DISCO_TRACK_NAME =
  'Tita Lau LIVE — Get Closer (Tech House)';

const SILENCE = 0.02;
/** Kick fundamental window (Hz) — tighter than full bass guitar range. */
const KICK_LO_HZ = 40;
const KICK_HI_HZ = 100;
/** Just above kick body; sustained energy here rejects basslines/pads. */
const KICK_REJECT_LO_HZ = 110;
const KICK_REJECT_HI_HZ = 220;
const BAND_KEYS = ['bass', 'lowMid', 'highMid', 'treble'] as const;
export const DISCO_ROUTE_BANDS: DiscoRouteBand[] = [
  'bass',
  'lowMid',
  'highMid',
  'treble',
  'onset',
];

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampAct(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function boneMidpoint(
  design: CreatureDesign,
  boneId: number,
): { x: number; y: number } | null {
  const bone = design.bones.find((b) => b.id === boneId);
  if (!bone) return null;
  const j0 = design.joints.find((j) => j.id === bone.startJointId);
  const j1 = design.joints.find((j) => j.id === bone.endJointId);
  if (!j0 || !j1) return null;
  return { x: (j0.x + j1.x) / 2, y: (j0.y + j1.y) / 2 };
}

/** Approximate muscle span for bass → largest-stroke routing. */
export function muscleStrokeLength(
  design: CreatureDesign,
  muscle: MuscleDef,
): number {
  const a = boneMidpoint(design, muscle.startBoneId);
  const b = boneMidpoint(design, muscle.endBoneId);
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function channelStrokeWeights(
  muscles: DriveGroupFields[],
  design: CreatureDesign | undefined,
  channelCount: number,
): number[] {
  const weights = new Array(channelCount).fill(0);
  if (!design || muscles.length === 0) return weights;
  const byChannel = brainActuatorChannelByMuscleId(muscles);
  for (let i = 0; i < muscles.length; i++) {
    const ch = byChannel.get(muscles[i].id) ?? i;
    if (ch < 0 || ch >= channelCount) continue;
    weights[ch] = Math.max(
      weights[ch],
      muscleStrokeLength(design, muscles[i] as MuscleDef),
    );
  }
  const max = Math.max(...weights, 1e-6);
  return weights.map((w) => w / max);
}

function bandLevels(
  bands: AudioBands,
  gains: DiscoReactivityGains,
): [number, number, number, number] {
  // Kick/bass uses a punchier curve so isolated hits stay sharp as drives.
  return [
    Math.pow(clamp01(bands.bass * gains.bass * gains.master), 0.5),
    Math.pow(clamp01(bands.lowMid * gains.lowMid * gains.master), 0.65),
    Math.pow(clamp01(bands.highMid * gains.highMid * gains.master), 0.65),
    Math.pow(clamp01(bands.treble * gains.treble * gains.master), 0.65),
  ];
}

/** True when any band has a non-auto route. */
export function hasManualDiscoRouting(routing: DiscoBandRouting | undefined): boolean {
  if (!routing) return false;
  return DISCO_ROUTE_BANDS.some((b) => routing[b].kind !== 'auto');
}

/** Stable sign for a drive group (from the first member's index). */
function driveGroupSign(
  muscles: DriveGroupFields[],
  groupId: number,
): number {
  for (let i = 0; i < muscles.length; i++) {
    if (normalizeDriveGroup(muscles[i].driveGroup) === groupId) {
      return i % 2 === 0 ? 1 : -1;
    }
  }
  return 1;
}

/**
 * Apply explicit band → muscle / drive-group routing.
 * Auto bands contribute via the legacy channel path; manual bands add energy
 * onto matching muscles only. Group targets apply the same signed drive to
 * every muscle that shares that driveGroup (drive-group channel semantics).
 */
function applyManualBandRouting(
  out: number[],
  bands: AudioBands,
  gains: DiscoReactivityGains,
  routing: DiscoBandRouting,
  muscles: DriveGroupFields[],
): void {
  const onset = clamp01(bands.onset * gains.onset * gains.master);
  const onsetPunch = Math.pow(onset, 0.45);
  const levels = bandLevels(bands, gains);
  const add = new Array(muscles.length).fill(0);

  const addToTarget = (target: DiscoRouteTarget, amount: number) => {
    if (target.kind === 'auto' || Math.abs(amount) < SILENCE) return;
    if (target.kind === 'group') {
      const sign = driveGroupSign(muscles, target.group);
      const delta = sign * amount;
      for (let i = 0; i < muscles.length; i++) {
        if (normalizeDriveGroup(muscles[i].driveGroup) === target.group) {
          add[i] += delta;
        }
      }
      return;
    }
    for (let i = 0; i < muscles.length; i++) {
      if (muscles[i].id !== target.muscleId) continue;
      const sign = i % 2 === 0 ? 1 : -1;
      add[i] += sign * amount;
      break;
    }
  };

  for (let bi = 0; bi < BAND_KEYS.length; bi++) {
    addToTarget(routing[BAND_KEYS[bi]], levels[bi]);
  }
  addToTarget(routing.onset, onsetPunch * 0.9);

  for (let i = 0; i < muscles.length; i++) {
    if (Math.abs(add[i]) < SILENCE) continue;
    out[i] = clampAct((out[i] ?? 0) + add[i]);
  }
}

/** Map audio bands → channel or per-muscle drives with bass stroke bias + onset punch. */
export function bandsToActuators(
  bands: AudioBands,
  muscleCount: number,
  gains: DiscoReactivityGains,
  options?: {
    muscles?: DriveGroupFields[];
    design?: CreatureDesign;
    routing?: DiscoBandRouting;
  },
): number[] {
  const muscles = options?.muscles;
  const design = options?.design;
  const routing = options?.routing ?? DEFAULT_DISCO_ROUTING;
  const manual = hasManualDiscoRouting(routing);

  const useGroups =
    muscles !== undefined &&
    muscles.length > 0 &&
    countBrainActuatorChannels(muscles) < muscles.length;
  const channelCount = useGroups
    ? countBrainActuatorChannels(muscles)
    : Math.max(muscleCount, 1);
  const levels = bandLevels(bands, gains);
  const strokeW = channelStrokeWeights(muscles ?? [], design, channelCount);
  const onset = clamp01(bands.onset * gains.onset * gains.master);
  const onsetPunch = Math.pow(onset, 0.45);

  // When every band is manually routed, skip auto distribution.
  const allManual =
    manual &&
    BAND_KEYS.every((k) => routing[k].kind !== 'auto') &&
    routing.onset.kind !== 'auto';

  const channelDrives = new Array(channelCount).fill(0);
  if (!allManual) {
    for (let ch = 0; ch < channelCount; ch++) {
      const bandKey = BAND_KEYS[ch % BAND_KEYS.length];
      // Skip auto contribution for bands that have explicit targets.
      const primary =
        routing[bandKey].kind === 'auto' ? levels[ch % levels.length] : 0;
      const bassBoost =
        routing.bass.kind === 'auto'
          ? levels[0] * (0.35 + 0.65 * strokeW[ch])
          : 0;
      const level = clamp01(primary * 0.55 + bassBoost * 0.45);
      const onsetContrib =
        routing.onset.kind === 'auto' ? onsetPunch : 0;
      if (level < SILENCE && onsetContrib < SILENCE) continue;
      const sign = ch % 2 === 0 ? 1 : -1;
      const drive =
        sign * level +
        sign * onsetContrib * 0.55 * (0.4 + strokeW[ch] * 0.6);
      channelDrives[ch] = clampAct(drive);
    }
  }

  let out: number[];
  if (useGroups && muscles) {
    out = expandChannelDrives(muscles, channelDrives);
  } else {
    out = new Array(muscleCount).fill(0);
    for (let i = 0; i < muscleCount; i++) {
      const ch = i % channelCount;
      out[i] = channelDrives[ch] ?? 0;
    }
  }

  if (manual && muscles && muscles.length > 0) {
    applyManualBandRouting(out, bands, gains, routing, muscles);
  }

  return out;
}

export function applyDiscoMotion(
  actuators: number[],
  motion: DiscoMotionControls,
  timeSec: number,
  muscles?: DriveGroupFields[],
): number[] {
  /** Drive-group members share one motion phase so they stay synchronized. */
  const groupPhaseIndex = new Map<number, number>();
  if (muscles) {
    for (let i = 0; i < muscles.length; i++) {
      const g = normalizeDriveGroup(muscles[i].driveGroup);
      if (g !== undefined && !groupPhaseIndex.has(g)) {
        groupPhaseIndex.set(g, i);
      }
    }
  }

  return actuators.map((a, i) => {
    if (Math.abs(a) < SILENCE) return 0;
    const g = muscles
      ? normalizeDriveGroup(muscles[i]?.driveGroup)
      : undefined;
    const phaseIndex =
      g !== undefined ? (groupPhaseIndex.get(g) ?? i) : i;
    const phase = timeSec * motion.frequency * Math.PI * 2 + phaseIndex * 0.7;
    const wave = Math.sin(phase);
    const lean = Math.sign(a) * Math.abs(a);
    return clampAct(lean * (0.55 + 0.45 * wave) * motion.range);
  });
}

export interface DiscoAudioPlayer {
  loadFile(file: File): Promise<void>;
  /** Load a same-origin URL (e.g. bundled /disco/default-track.mp3). */
  loadUrl(url: string, displayName: string): Promise<void>;
  play(): void;
  pause(): void;
  seek(seconds: number): void;
  dispose(): void;
  isPlaying(): boolean;
  hasTrack(): boolean;
  duration(): number;
  currentTime(): number;
  trackName(): string;
  getBands(): AudioBands;
  getActuatorFrame(
    muscleCount: number,
    options?: {
      gains?: DiscoReactivityGains;
      motion?: DiscoMotionControls;
      timeSec?: number;
      muscles?: DriveGroupFields[];
      design?: CreatureDesign;
      routing?: DiscoBandRouting;
    },
  ): number[];
}

export function createDiscoAudioPlayer(): DiscoAudioPlayer {
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let audio: HTMLAudioElement | null = null;
  let objectUrl: string | null = null;
  let trackName = '';
  let prevSpectrum: Float32Array | null = null;
  let timeDomain: Float32Array | null = null;
  /** Same-frame cache so UI auto + actuator drives share one analysis read. */
  let bandsCache: AudioBands | null = null;
  let bandsCacheInvalidate: number | null = null;
  /** Slow sub envelope — sustained bass floor to subtract from kick hits. */
  let kickSlow = 0;
  let smooth: AudioBands = {
    bass: 0,
    lowMid: 0,
    highMid: 0,
    treble: 0,
    onset: 0,
    energy: 0,
  };

  function ensureGraph(): void {
    if (!audio) return;
    if (!ctx) ctx = new AudioContext();
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      // Slightly less analyser lag so kick transients stay readable.
      analyser.smoothingTimeConstant = 0.55;
    }
    if (!source) {
      source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
    }
  }

  function getBandsMemoized(): AudioBands {
    if (bandsCache) return bandsCache;
    bandsCache = readBandsFresh();
    if (bandsCacheInvalidate == null) {
      bandsCacheInvalidate = requestAnimationFrame(() => {
        bandsCache = null;
        bandsCacheInvalidate = null;
      });
    }
    return bandsCache;
  }

  /**
   * Overall track loudness from time-domain RMS (not peak band averages,
   * which sit near-constant on compressed dance masters).
   */
  function readLoudnessRms(): number {
    if (!analyser) return 0;
    if (!timeDomain || timeDomain.length !== analyser.fftSize) {
      timeDomain = new Float32Array(analyser.fftSize);
    }
    analyser.getFloatTimeDomainData(timeDomain);
    let sum = 0;
    for (let i = 0; i < timeDomain.length; i++) {
      const v = timeDomain[i];
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeDomain.length);
    const db = 20 * Math.log10(rms + 1e-6);
    // Map roughly −50 dBFS (near silence) → 0, −8 dBFS (hot) → 1.
    return clamp01((db + 50) / 42);
  }

  function bandEnergy(spectrum: Float32Array, sampleRate: number, lo: number, hi: number): number {
    if (!analyser) return 0;
    const binHz = sampleRate / analyser.fftSize;
    let peak = -Infinity;
    let linSum = 0;
    let n = 0;
    const i0 = Math.max(0, Math.floor(lo / binHz));
    const i1 = Math.min(spectrum.length - 1, Math.ceil(hi / binHz));
    for (let i = i0; i <= i1; i++) {
      const db = spectrum[i];
      if (db > peak) peak = db;
      linSum += 10 ** (db / 20);
      n++;
    }
    if (n <= 0 || !Number.isFinite(peak)) return 0;
    const peakN = clamp01((peak + 100) / 70);
    const meanDb = 20 * Math.log10(linSum / n + 1e-8);
    const meanN = clamp01((meanDb + 100) / 70);
    // Mean power tracks arrangement changes; peak alone sticks on compressed masters.
    return clamp01(peakN * 0.35 + meanN * 0.65);
  }

  /** Mean positive spectral flux in [lo, hi] Hz (kick attack cue). */
  function bandFlux(
    spectrum: Float32Array,
    prev: Float32Array | null,
    sampleRate: number,
    lo: number,
    hi: number,
  ): number {
    if (!analyser || !prev) return 0;
    const binHz = sampleRate / analyser.fftSize;
    const i0 = Math.max(0, Math.floor(lo / binHz));
    const i1 = Math.min(spectrum.length - 1, Math.ceil(hi / binHz));
    let flux = 0;
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      const d = spectrum[i] - prev[i];
      if (d > 0) flux += d;
      n++;
    }
    if (n <= 0) return 0;
    return clamp01(flux / (n * 8));
  }

  /**
   * Isolate kick / bass-drum hits into the `bass` band:
   * narrow sub window + sub-band flux + subtract sustained sub floor.
   */
  function kickEnergy(
    spectrum: Float32Array,
    prev: Float32Array | null,
    sampleRate: number,
  ): number {
    const sub = bandEnergy(spectrum, sampleRate, KICK_LO_HZ, KICK_HI_HZ);
    const reject = bandEnergy(
      spectrum,
      sampleRate,
      KICK_REJECT_LO_HZ,
      KICK_REJECT_HI_HZ,
    );
    const flux = bandFlux(spectrum, prev, sampleRate, KICK_LO_HZ, KICK_HI_HZ);
    // Prefer impulsive sub over sustained bassline / pad in the reject band.
    const subBias = clamp01(sub - reject * 0.55);
    const transient = clamp01(subBias * (0.25 + 0.75 * flux));
    kickSlow = kickSlow * 0.94 + transient * 0.06;
    const punched = clamp01((transient - kickSlow * 0.75) * 1.85);
    // Keep a little body so held kicks still register, but favor the hit.
    return clamp01(punched * 0.85 + transient * 0.15);
  }

  function readBandsFresh(): AudioBands {
    if (!analyser || !ctx) {
      return { bass: 0, lowMid: 0, highMid: 0, treble: 0, onset: 0, energy: 0 };
    }
    const spectrum = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(spectrum);
    const sr = ctx.sampleRate;
    const bass = kickEnergy(spectrum, prevSpectrum, sr);
    const lowMid = bandEnergy(spectrum, sr, 150, 500);
    const highMid = bandEnergy(spectrum, sr, 500, 2000);
    const treble = bandEnergy(spectrum, sr, 2000, 8000);
    let flux = 0;
    if (prevSpectrum) {
      for (let i = 0; i < spectrum.length; i++) {
        const d = spectrum[i] - prevSpectrum[i];
        if (d > 0) flux += d;
      }
      flux = clamp01(flux / (spectrum.length * 6));
    }
    // Weight broadband onset toward low-end attacks (kick) vs hi-hat chatter.
    const kickFlux = bandFlux(spectrum, prevSpectrum, sr, KICK_LO_HZ, KICK_HI_HZ);
    const midFlux = bandFlux(spectrum, prevSpectrum, sr, 150, 2000);
    const trebleFlux = bandFlux(spectrum, prevSpectrum, sr, 2000, 8000);
    const onsetRaw = clamp01(
      flux * 0.3 + kickFlux * 0.35 + midFlux * 0.2 + trebleFlux * 0.15,
    );
    prevSpectrum = spectrum.slice() as Float32Array;
    const energy = readLoudnessRms();
    // Mid/treble: slightly snappier so arrangement changes reach Auto sooner.
    const midAlpha = 0.45;
    // Loudness: faster attack so drops punch the motion-range slider.
    const energyAlpha = energy > smooth.energy ? 0.55 : 0.22;
    // Faster attack / release on bass so kick hits don't smear.
    const bassAlpha = bass > smooth.bass ? 0.62 : 0.28;
    const onsetAlpha = onsetRaw > smooth.onset ? 0.55 : 0.3;
    smooth = {
      bass: smooth.bass * (1 - bassAlpha) + bass * bassAlpha,
      lowMid: smooth.lowMid * (1 - midAlpha) + lowMid * midAlpha,
      highMid: smooth.highMid * (1 - midAlpha) + highMid * midAlpha,
      treble: smooth.treble * (1 - midAlpha) + treble * midAlpha,
      onset: smooth.onset * (1 - onsetAlpha) + onsetRaw * onsetAlpha,
      energy: smooth.energy * (1 - energyAlpha) + energy * energyAlpha,
    };
    return { ...smooth };
  }

  function resetAnalysis(): void {
    prevSpectrum = null;
    kickSlow = 0;
    timeDomain = null;
    bandsCache = null;
    if (bandsCacheInvalidate != null) {
      cancelAnimationFrame(bandsCacheInvalidate);
      bandsCacheInvalidate = null;
    }
    smooth = {
      bass: 0,
      lowMid: 0,
      highMid: 0,
      treble: 0,
      onset: 0,
      energy: 0,
    };
  }

  async function attachSrc(src: string, name: string): Promise<void> {
    trackName = name;
    if (!audio) audio = new Audio();
    const el = audio;
    el.crossOrigin = 'anonymous';
    el.src = src;
    await new Promise<void>((resolve, reject) => {
      const onOk = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error(`Failed to load audio: ${name}`));
      };
      const cleanup = () => {
        el.removeEventListener('loadedmetadata', onOk);
        el.removeEventListener('error', onErr);
      };
      if (el.readyState >= 1) {
        resolve();
        return;
      }
      el.addEventListener('loadedmetadata', onOk);
      el.addEventListener('error', onErr);
    });
    // dispose() may have run during await (React Strict Mode remount).
    if (audio !== el) return;
    el.pause();
    el.currentTime = 0;
    resetAnalysis();
    ensureGraph();
    if (ctx?.state === 'suspended') await ctx.resume();
  }

  return {
    async loadFile(file: File) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      await attachSrc(objectUrl, file.name);
    },
    async loadUrl(url: string, displayName: string) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      await attachSrc(url, displayName);
    },
    play() {
      ensureGraph();
      void ctx?.resume();
      void audio?.play();
    },
    pause() {
      audio?.pause();
    },
    seek(seconds: number) {
      if (!audio) return;
      const max = Number.isFinite(audio.duration) ? audio.duration : seconds;
      audio.currentTime = Math.max(0, Math.min(seconds, max));
    },
    dispose() {
      audio?.pause();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {
        /* ignore */
      }
      source = null;
      analyser = null;
      void ctx?.close();
      ctx = null;
      audio = null;
    },
    isPlaying() {
      return !!audio && !audio.paused && !audio.ended;
    },
    hasTrack() {
      return !!audio?.src;
    },
    duration() {
      return audio?.duration || 0;
    },
    currentTime() {
      return audio?.currentTime || 0;
    },
    trackName() {
      return trackName;
    },
    getBands: getBandsMemoized,
    getActuatorFrame(muscleCount, options) {
      const bands = getBandsMemoized();
      const gains = options?.gains ?? DEFAULT_DISCO_REACTIVITY;
      const motion = options?.motion ?? DEFAULT_DISCO_MOTION;
      const t = options?.timeSec ?? audio?.currentTime ?? 0;
      const raw = bandsToActuators(bands, muscleCount, gains, {
        muscles: options?.muscles,
        design: options?.design,
        routing: options?.routing,
      });
      return applyDiscoMotion(raw, motion, t, options?.muscles);
    },
  };
}

/** Band key labels for UI sliders. */
export const DISCO_GAIN_LABELS: { key: keyof DiscoReactivityGains; label: string }[] = [
  { key: 'bass', label: 'Kick' },
  { key: 'lowMid', label: 'Low mid' },
  { key: 'highMid', label: 'High mid' },
  { key: 'treble', label: 'Treble' },
  { key: 'onset', label: 'Onset' },
  { key: 'master', label: 'Master' },
];

export const DISCO_ROUTE_LABELS: { key: DiscoRouteBand; label: string }[] = [
  { key: 'bass', label: 'Kick' },
  { key: 'lowMid', label: 'Low mid' },
  { key: 'highMid', label: 'High mid' },
  { key: 'treble', label: 'Treble' },
  { key: 'onset', label: 'Onset' },
];

export { BAND_KEYS };
