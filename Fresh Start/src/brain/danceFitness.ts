/**
 * H7 — Disco-local dance fitness (not used by Free evolve).
 * Combines upright survival, motion energy, beat sync, and a light imitation prior.
 */
import type { OfflineTrackAnalysis } from '../audio/trackAnalysis';
import { onsetAtTime } from '../audio/trackAnalysis';
import type { SpawnedCreature } from '../physics/spawn';
import { avgJointVelX, minJointY } from './observations';
import { instantUprightQuality } from './fitness';

export interface DanceFitnessWeights {
  upright: number;
  energy: number;
  beatSync: number;
  imitation: number;
  fallPenalty: number;
}

export const DEFAULT_DANCE_FITNESS_WEIGHTS: DanceFitnessWeights = {
  upright: 1.2,
  energy: 0.45,
  beatSync: 0.8,
  imitation: 0.35,
  fallPenalty: 2.5,
};

export interface DanceFitnessAccum {
  uprightSum: number;
  steps: number;
  energySum: number;
  beatCorrSum: number;
  beatCorrCount: number;
  fell: boolean;
  imitationSum: number;
  imitationCount: number;
}

export function emptyDanceFitnessAccum(): DanceFitnessAccum {
  return {
    uprightSum: 0,
    steps: 0,
    energySum: 0,
    beatCorrSum: 0,
    beatCorrCount: 0,
    fell: false,
    imitationSum: 0,
    imitationCount: 0,
  };
}

/** Mean absolute channel drive (motion energy proxy). */
export function meanAbsDrives(drives: ArrayLike<number>): number {
  if (drives.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < drives.length; i++) s += Math.abs(drives[i] ?? 0);
  return s / drives.length;
}

/**
 * Beat sync: reward when drive energy rises with offline onset.
 * Uses product of onset × drive magnitude (not Pearson — cheap + stable).
 */
export function beatSyncStep(
  onset: number,
  driveEnergy: number,
): number {
  return onset * driveEnergy;
}

export function tickDanceFitness(
  accum: DanceFitnessAccum,
  creature: SpawnedCreature,
  channelDrives: ArrayLike<number>,
  analysis: OfflineTrackAnalysis | null,
  timeSec: number,
  teacherChannels: ArrayLike<number> | null,
  fellYThreshold = 0.12,
): void {
  accum.steps += 1;
  accum.uprightSum += instantUprightQuality(creature);
  const driveE = meanAbsDrives(channelDrives);
  const comSpeed = Math.abs(avgJointVelX(creature));
  accum.energySum += 0.6 * driveE + 0.4 * Math.min(1, comSpeed / 4);

  if (analysis) {
    const onset = onsetAtTime(analysis, timeSec);
    accum.beatCorrSum += beatSyncStep(onset, driveE);
    accum.beatCorrCount += 1;
  }

  if (teacherChannels && teacherChannels.length === channelDrives.length) {
    let err = 0;
    for (let i = 0; i < channelDrives.length; i++) {
      const d = (channelDrives[i] ?? 0) - (teacherChannels[i] ?? 0);
      err += d * d;
    }
    const mse = err / channelDrives.length;
    accum.imitationSum += 1 / (1 + mse);
    accum.imitationCount += 1;
  }

  if (minJointY(creature) < fellYThreshold) {
    accum.fell = true;
  }
}

export function finalizeDanceFitness(
  accum: DanceFitnessAccum,
  weights: DanceFitnessWeights = DEFAULT_DANCE_FITNESS_WEIGHTS,
): number {
  const upright =
    accum.steps > 0 ? accum.uprightSum / accum.steps : 0;
  const energy =
    accum.steps > 0 ? accum.energySum / accum.steps : 0;
  const beat =
    accum.beatCorrCount > 0
      ? accum.beatCorrSum / accum.beatCorrCount
      : 0;
  const imit =
    accum.imitationCount > 0
      ? accum.imitationSum / accum.imitationCount
      : 0.5;

  let fitness =
    weights.upright * upright +
    weights.energy * energy +
    weights.beatSync * beat +
    weights.imitation * imit;

  if (accum.fell) fitness -= weights.fallPenalty;
  return fitness;
}
