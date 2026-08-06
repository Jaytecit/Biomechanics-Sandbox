import type { EnvTerrain } from '../env/types';
import { sampleTerrainHeight } from '../env/terrainMath';
import type { SpawnedCreature } from '../physics/spawn';
import {
  DISTANCE_PER_LIFT,
  FALL_PENALTY,
  FALL_TIME_LIMIT,
  FALL_Y_THRESHOLD,
  LIFT_Y,
  MIN_DESIGNED_HEAD_Y,
  MIN_FOOT_LIFTS,
  MIN_STEP_PROGRESS,
  PLANT_Y,
  UPRIGHT_QUALITY_FLOOR,
} from './constants';
import {
  avgJointX,
  footJointIndices,
  maxHeadY,
  minJointClearance,
} from './observations';

export interface EpisodeResult {
  fitness: number;
  distance: number;
  fell: boolean;
  footLifts: number;
  /** Episode-mean upright quality in [0, 1]; 1 when upright scoring inactive. */
  uprightQuality: number;
}

/** Per-joint plant/lift tracking for run legitimacy (indexed by joint array). */
export interface FootLiftState {
  planted: boolean[];
  /** Plant-entry X for the current ground contact. */
  currentPlantX: number[];
  /** X of last counted plant (baseline after first contact). */
  lastPlantX: number[];
  /** True after at least one plant recorded for that joint. */
  hasPlantX: boolean[];
}

export function createFootLiftState(jointCount: number): FootLiftState {
  return {
    planted: new Array(jointCount).fill(false),
    currentPlantX: new Array(jointCount).fill(0),
    lastPlantX: new Array(jointCount).fill(0),
    hasPlantX: new Array(jointCount).fill(false),
  };
}

/**
 * Update planted flags; return how many new forward plant→clear lifts occurred this step.
 * Uses marked feet when present; otherwise all joints (C1.1).
 * Hysteresis: planted when clearance < PLANT_Y; clear when clearance > LIFT_Y.
 * Clearance is jointY − terrain surface (absolute Y on flat ground).
 * A clear counts only if this contact's plant X advanced ≥ MIN_STEP_PROGRESS
 * since the last counted plant (or first baseline plant).
 */
export function updateFootLiftState(
  creature: SpawnedCreature,
  state: FootLiftState,
  terrain?: EnvTerrain | null,
): number {
  const joints = creature.joints;
  const indices = footJointIndices(creature);
  let lifts = 0;
  for (const i of indices) {
    const t = joints[i].body.translation();
    const x = t.x;
    const clearance = t.y - sampleTerrainHeight(terrain, x);
    if (clearance < PLANT_Y) {
      if (!state.planted[i]) {
        state.planted[i] = true;
        state.currentPlantX[i] = x;
        if (!state.hasPlantX[i]) {
          state.lastPlantX[i] = x;
          state.hasPlantX[i] = true;
        }
      }
    } else if (state.planted[i] && clearance > LIFT_Y) {
      state.planted[i] = false;
      if (
        state.hasPlantX[i] &&
        state.currentPlantX[i] >= state.lastPlantX[i] + MIN_STEP_PROGRESS
      ) {
        lifts++;
        state.lastPlantX[i] = state.currentPlantX[i];
      }
    }
  }
  return lifts;
}

/** Required lifts for full distance credit (continuous anti-scoot). */
export function requiredFootLifts(distance: number): number {
  return Math.max(MIN_FOOT_LIFTS, Math.max(0, distance) / DISTANCE_PER_LIFT);
}

/** Lift-density quality in [0, 1] for a run distance. */
export function runLiftQuality(distance: number, footLifts: number): number {
  const needed = requiredFootLifts(distance);
  return Math.min(1, Math.max(0, footLifts) / needed);
}

/**
 * Instant upright quality vs designed head height.
 * Returns 1 when no usable head mark (opt-in; unmarked models unchanged).
 */
export function instantUprightQuality(creature: SpawnedCreature): number {
  const target = creature.designedHeadY;
  if (target < MIN_DESIGNED_HEAD_Y) return 1;
  const headY = maxHeadY(creature);
  if (headY === null) return 1;
  return Math.min(1, Math.max(0, headY / target));
}

/** Map raw upright mean through a floor so brief dips do not wipe fitness. */
export function runUprightQuality(rawMean: number): number {
  const q = Math.min(1, Math.max(0, rawMean));
  return UPRIGHT_QUALITY_FLOOR + (1 - UPRIGHT_QUALITY_FLOOR) * q;
}

/** Run-task fitness: forward distance × lift × upright quality − fall penalty. */
export function scoreRunPerformance(
  creature: SpawnedCreature,
  startX: number,
  fell: boolean,
  footLifts: number,
  uprightMean = 1,
): EpisodeResult {
  const endX = avgJointX(creature);
  const distance = endX - startX;
  const liftQuality = runLiftQuality(distance, footLifts);
  const uprightQuality =
    creature.designedHeadY >= MIN_DESIGNED_HEAD_Y
      ? runUprightQuality(uprightMean)
      : 1;
  const fitness =
    Math.max(0, distance) * liftQuality * uprightQuality - (fell ? FALL_PENALTY : 0);
  return { fitness, distance, fell, footLifts, uprightQuality };
}

/** Update fall timer; returns new fallTime and whether the creature has fallen. */
export function updateFallState(
  creature: SpawnedCreature,
  fallTime: number,
  dt: number,
  terrain?: EnvTerrain | null,
): { fallTime: number; fell: boolean } {
  const clearance = minJointClearance(creature, terrain);
  if (clearance < FALL_Y_THRESHOLD) {
    const next = fallTime + dt;
    return { fallTime: next, fell: next >= FALL_TIME_LIMIT };
  }
  return { fallTime: 0, fell: false };
}
