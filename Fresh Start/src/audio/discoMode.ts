/**
 * Disco mode helpers (H2) — maps audio frames onto muscle drives.
 * Does not touch Rapier; simulation applies drives via existing muscle path.
 */
import type { DiscoAudioPlayer } from './audioAnalysis';
import {
  DEFAULT_DISCO_MOTION,
  DEFAULT_DISCO_REACTIVITY,
  type DiscoMotionControls,
  type DiscoReactivityGains,
} from './audioAnalysis';

export interface DiscoDriveOptions {
  player: DiscoAudioPlayer;
  muscleCount: number;
  gains?: DiscoReactivityGains;
  motion?: DiscoMotionControls;
  timeSec?: number;
}

/** Returns drive ∈ [-1,1] per muscle from the current audio frame. */
export function resolveDiscoDrives(opts: DiscoDriveOptions): number[] {
  if (!opts.player.hasTrack() || opts.muscleCount <= 0) {
    return new Array(opts.muscleCount).fill(0);
  }
  return opts.player.getActuatorFrame(opts.muscleCount, {
    gains: opts.gains ?? DEFAULT_DISCO_REACTIVITY,
    motion: opts.motion ?? DEFAULT_DISCO_MOTION,
    timeSec: opts.timeSec,
  });
}
