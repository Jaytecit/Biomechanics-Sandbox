/**
 * Disco mode helpers (H2) — maps audio frames onto muscle drives.
 * Does not touch Rapier; simulation applies drives via existing muscle path.
 */
import type { DriveGroupFields } from '../brain/driveGroups';
import type { CreatureDesign } from '../creature/types';
import type { DiscoAudioPlayer } from './audioAnalysis';
import {
  DEFAULT_DISCO_MOTION,
  DEFAULT_DISCO_REACTIVITY,
  DEFAULT_DISCO_ROUTING,
  type DiscoBandRouting,
  type DiscoMotionControls,
  type DiscoReactivityGains,
} from './audioAnalysis';

export interface DiscoDriveOptions {
  player: DiscoAudioPlayer;
  muscleCount: number;
  muscles?: DriveGroupFields[];
  design?: CreatureDesign;
  gains?: DiscoReactivityGains;
  motion?: DiscoMotionControls;
  routing?: DiscoBandRouting;
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
    routing: opts.routing ?? DEFAULT_DISCO_ROUTING,
    timeSec: opts.timeSec,
    muscles: opts.muscles,
    design: opts.design,
  });
}

/** Even lateral offsets for up to six disco dancers. */
export function discoDancerOffsets(count: number, spacing = 3.5): number[] {
  const n = Math.max(1, Math.min(6, count));
  if (n === 1) return [0];
  const total = (n - 1) * spacing;
  return Array.from({ length: n }, (_, i) => -total / 2 + i * spacing);
}
