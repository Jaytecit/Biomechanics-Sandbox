/**
 * Task fitness adapters (E6.*) — Fresh Start Rapier state only.
 */
import { avgJointX, minJointY } from './observations';
import type { SpawnedCreature } from '../physics/spawn';
import {
  FALL_PENALTY,
  JUMP_HEIGHT_SCALE,
  FLIGHT_AIR_SCALE,
  FLIGHT_HEIGHT_SCALE,
  MIN_DESIGNED_HEAD_Y,
  MOTOR_DIST_SCALE,
  CLIMB_HEIGHT_SCALE,
} from './constants';
import {
  runUprightQuality,
  scoreRunPerformance,
  type EpisodeResult,
  updateFallState,
} from './fitness';
import type { TaskId } from './types';

export interface TaskEpisodeMetrics extends EpisodeResult {
  peakHeight: number;
  airTime: number;
}

export function emptyMetrics(): TaskEpisodeMetrics {
  return {
    fitness: 0,
    distance: 0,
    fell: false,
    footLifts: 0,
    uprightQuality: 1,
    peakHeight: 0,
    airTime: 0,
  };
}

function applyUprightGate(
  creature: SpawnedCreature,
  task: TaskId,
  baseFitness: number,
  uprightMean: number,
): { fitness: number; uprightQuality: number } {
  // Flight often wants non-vertical postures; skip upright gate there.
  if (task === 'flight' || creature.designedHeadY < MIN_DESIGNED_HEAD_Y) {
    return { fitness: baseFitness, uprightQuality: 1 };
  }
  const uprightQuality = runUprightQuality(uprightMean);
  return { fitness: baseFitness * uprightQuality, uprightQuality };
}

export function scoreTaskPerformance(
  task: TaskId,
  creature: SpawnedCreature,
  startX: number,
  fell: boolean,
  footLifts: number,
  peakHeight: number,
  airTime: number,
  uprightMean = 1,
): TaskEpisodeMetrics {
  if (task === 'run') {
    const r = scoreRunPerformance(creature, startX, fell, footLifts, uprightMean);
    return { ...r, peakHeight, airTime };
  }

  if (task === 'jump') {
    const heightScore = Math.max(0, peakHeight) / JUMP_HEIGHT_SCALE;
    const airScore = airTime * 0.15;
    const base = heightScore + airScore - (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return {
      fitness: Math.max(0, gated.fitness),
      distance: avgJointX(creature) - startX,
      fell,
      footLifts,
      uprightQuality: gated.uprightQuality,
      peakHeight,
      airTime,
    };
  }

  if (task === 'climb') {
    const height = Math.max(0, peakHeight) / CLIMB_HEIGHT_SCALE;
    const forward = Math.max(0, avgJointX(creature) - startX) * 0.05;
    const base = height + forward - (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return {
      fitness: Math.max(0, gated.fitness),
      distance: avgJointX(creature) - startX,
      fell,
      footLifts,
      uprightQuality: gated.uprightQuality,
      peakHeight,
      airTime,
    };
  }

  if (task === 'motor') {
    const distance = avgJointX(creature) - startX;
    const base = Math.max(0, distance) / MOTOR_DIST_SCALE - (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return {
      fitness: Math.max(0, gated.fitness),
      distance,
      fell,
      footLifts,
      uprightQuality: gated.uprightQuality,
      peakHeight,
      airTime,
    };
  }

  // flight — upright gate skipped
  const heightScore = Math.max(0, peakHeight) / FLIGHT_HEIGHT_SCALE;
  const airScore = airTime / FLIGHT_AIR_SCALE;
  const fitness = heightScore * 0.6 + airScore * 0.4 - (fell ? FALL_PENALTY * 0.5 : 0);
  return {
    fitness: Math.max(0, fitness),
    distance: avgJointX(creature) - startX,
    fell,
    footLifts,
    uprightQuality: 1,
    peakHeight,
    airTime,
  };
}

/** Track peak min-joint height and airborne time (all joints above ground contact). */
export function updateJumpFlightTrackers(
  creature: SpawnedCreature,
  dt: number,
  peakHeight: number,
  airTime: number,
  airborneY = 0.55,
): { peakHeight: number; airTime: number } {
  const y = minJointY(creature);
  const nextPeak = Math.max(peakHeight, y);
  const airborne = creature.joints.every((j) => j.body.translation().y > airborneY);
  return {
    peakHeight: nextPeak,
    airTime: airTime + (airborne ? dt : 0),
  };
}

export { updateFallState };
