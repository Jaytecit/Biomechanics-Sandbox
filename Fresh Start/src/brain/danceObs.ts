/**
 * H6/H7 — Dance observation pack: pose + audio bands + offline lookahead.
 * Locomotion evolve keeps OBS_COUNT=12; dance brains use DANCE_OBS_COUNT.
 */
import type { AudioBands } from '../audio/audioAnalysis';
import type { SpawnedCreature } from '../physics/spawn';
import { OBS_COUNT } from './constants';
import {
  buildObservations,
  type ObservationContext,
} from './observations';

/** bass, lowMid, highMid, treble, onset, energy */
export const DANCE_AUDIO_COUNT = 6;
/**
 * Lookahead block (H7): energy/onset at +0.1s, +0.2s, +0.4s.
 * Zeros when no offline analysis is available.
 */
export const DANCE_LOOKAHEAD_COUNT = 6;
/** Obs pack version for saved dance brains. */
export const DANCE_OBS_PACK_VERSION = 2;
export const DANCE_OBS_COUNT =
  OBS_COUNT + DANCE_AUDIO_COUNT + DANCE_LOOKAHEAD_COUNT;

/** Lookahead horizons in seconds (pairs of energy, onset). */
export const DANCE_LOOKAHEAD_HORIZONS_SEC = [0.1, 0.2, 0.4] as const;

export type DanceLookahead = Float32Array;

export function packAudioBands(
  bands: AudioBands | null | undefined,
  out?: Float32Array,
  offset = 0,
): Float32Array {
  const buf =
    out && out.length >= offset + DANCE_AUDIO_COUNT
      ? out
      : new Float32Array(offset + DANCE_AUDIO_COUNT);
  if (!bands) {
    for (let i = 0; i < DANCE_AUDIO_COUNT; i++) buf[offset + i] = 0;
    return buf;
  }
  buf[offset + 0] = bands.bass;
  buf[offset + 1] = bands.lowMid;
  buf[offset + 2] = bands.highMid;
  buf[offset + 3] = bands.treble;
  buf[offset + 4] = bands.onset;
  buf[offset + 5] = bands.energy;
  return buf;
}

export function packDanceLookahead(
  lookahead: ArrayLike<number> | null | undefined,
  out?: Float32Array,
  offset = 0,
): Float32Array {
  const buf =
    out && out.length >= offset + DANCE_LOOKAHEAD_COUNT
      ? out
      : new Float32Array(offset + DANCE_LOOKAHEAD_COUNT);
  for (let i = 0; i < DANCE_LOOKAHEAD_COUNT; i++) {
    buf[offset + i] = lookahead?.[i] ?? 0;
  }
  return buf;
}

/** Pose + 6 audio bands + 6 lookahead features. */
export function buildDanceObservations(
  creature: SpawnedCreature,
  bands: AudioBands | null | undefined,
  out?: Float32Array,
  ctx?: ObservationContext,
  lookahead?: ArrayLike<number> | null,
): Float32Array {
  const obs =
    out && out.length >= DANCE_OBS_COUNT
      ? out
      : new Float32Array(DANCE_OBS_COUNT);
  buildObservations(creature, obs, ctx);
  packAudioBands(bands, obs, OBS_COUNT);
  packDanceLookahead(lookahead, obs, OBS_COUNT + DANCE_AUDIO_COUNT);
  return obs;
}
