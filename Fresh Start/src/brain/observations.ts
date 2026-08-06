import type { EnvTerrain } from '../env/types';
import {
  sampleTerrainGrade,
  sampleTerrainHeight,
} from '../env/terrainMath';
import type { SpawnedCreature } from '../physics/spawn';
import {
  ANG_VEL_SCALE,
  FOOT_CLEARANCE_SCALE,
  GROUND_CONTACT_Y,
  HEIGHT_SCALE,
  OBS_COUNT,
  PHASE_CLOCK_HZ,
  VEL_SCALE,
} from './constants';

/** Joint indices used for foot contact / lift (marked feet, else all). */
export function footJointIndices(creature: SpawnedCreature): number[] {
  const marked: number[] = [];
  for (let i = 0; i < creature.joints.length; i++) {
    if (creature.joints[i].isFoot) marked.push(i);
  }
  if (marked.length > 0) return marked;
  return creature.joints.map((_, i) => i);
}

/** Max world Y among marked head joints, or null if none marked. */
export function maxHeadY(creature: SpawnedCreature): number | null {
  let max: number | null = null;
  for (const j of creature.joints) {
    if (!j.isHead) continue;
    const y = j.body.translation().y;
    max = max === null ? y : Math.max(max, y);
  }
  return max;
}

export interface ObservationContext {
  terrain?: EnvTerrain | null;
  /** Simulated time (s) for phase clock obs. */
  timeSec?: number;
}

/**
 * Observation vector (length OBS_COUNT):
 * 0 height          — lowest joint Y / HEIGHT_SCALE
 * 1 velX            — mean joint linvel.x / VEL_SCALE
 * 2 velY            — mean joint linvel.y / VEL_SCALE
 * 3 angularVel      — mean bone angvel / ANG_VEL_SCALE
 * 4 rotation        — mean bone angle / π
 * 5 groundContacts  — fraction of joints near local surface (D7)
 * 6 footContacts    — fraction of foot joints near surface (D7)
 * 7 footClearance   — mean (footY - surfaceY) / FOOT_CLEARANCE_SCALE (D7)
 * 8 terrainGrade    — local slope / TERRAIN_GRADE_SCALE (D7 / G3)
 * 9 headHeight      — marked head Y / HEIGHT_SCALE (0 if unmarked)
 * 10 phaseSin       — sin(2π · PHASE_CLOCK_HZ · t)
 * 11 phaseCos       — cos(2π · PHASE_CLOCK_HZ · t)
 */
export function buildObservations(
  creature: SpawnedCreature,
  out?: Float32Array,
  ctx?: ObservationContext,
): Float32Array {
  const obs = out && out.length >= OBS_COUNT ? out : new Float32Array(OBS_COUNT);
  const joints = creature.joints;
  const bones = creature.bones;
  const nJ = joints.length;
  const nB = bones.length;
  const terrain = ctx?.terrain ?? null;

  if (nJ === 0) {
    obs.fill(0);
    return obs;
  }

  let minY = Infinity;
  let sumVx = 0;
  let sumVy = 0;
  let sumX = 0;
  let contacts = 0;

  for (const j of joints) {
    const t = j.body.translation();
    const v = j.body.linvel();
    if (t.y < minY) minY = t.y;
    sumVx += v.x;
    sumVy += v.y;
    sumX += t.x;
    const surface = sampleTerrainHeight(terrain, t.x);
    if (t.y < surface + GROUND_CONTACT_Y) contacts++;
  }

  let sumAng = 0;
  let sumRot = 0;
  if (nB > 0) {
    for (const b of bones) {
      sumAng += b.body.angvel();
      sumRot += b.body.rotation();
    }
  }

  const feet = footJointIndices(creature);
  let footContacts = 0;
  let sumFootClear = 0;
  for (const i of feet) {
    const t = joints[i].body.translation();
    const surface = sampleTerrainHeight(terrain, t.x);
    sumFootClear += t.y - surface;
    if (t.y < surface + GROUND_CONTACT_Y) footContacts++;
  }
  const nFeet = Math.max(1, feet.length);
  const meanX = sumX / nJ;

  obs[0] = minY / HEIGHT_SCALE;
  obs[1] = sumVx / nJ / VEL_SCALE;
  obs[2] = sumVy / nJ / VEL_SCALE;
  obs[3] = nB > 0 ? sumAng / nB / ANG_VEL_SCALE : 0;
  obs[4] = nB > 0 ? sumRot / nB / Math.PI : 0;
  obs[5] = contacts / nJ;
  obs[6] = footContacts / nFeet;
  obs[7] = sumFootClear / nFeet / FOOT_CLEARANCE_SCALE;
  obs[8] = sampleTerrainGrade(terrain, meanX);
  const headY = maxHeadY(creature);
  obs[9] = headY === null ? 0 : headY / HEIGHT_SCALE;

  const t = ctx?.timeSec ?? 0;
  const phase = 2 * Math.PI * PHASE_CLOCK_HZ * t;
  obs[10] = Math.sin(phase);
  obs[11] = Math.cos(phase);

  return obs;
}

export function avgJointX(creature: SpawnedCreature): number {
  const joints = creature.joints;
  if (joints.length === 0) return 0;
  let s = 0;
  for (const j of joints) s += j.body.translation().x;
  return s / joints.length;
}

/** Mean joint horizontal speed (m/s, signed). */
export function avgJointVelX(creature: SpawnedCreature): number {
  const joints = creature.joints;
  if (joints.length === 0) return 0;
  let s = 0;
  for (const j of joints) s += j.body.linvel().x;
  return s / joints.length;
}

export function minJointY(creature: SpawnedCreature): number {
  let min = Infinity;
  for (const j of creature.joints) {
    min = Math.min(min, j.body.translation().y);
  }
  return min;
}

/** Lowest joint clearance above local terrain surface (flat ground → absolute Y). */
export function minJointClearance(
  creature: SpawnedCreature,
  terrain?: EnvTerrain | null,
): number {
  let min = Infinity;
  for (const j of creature.joints) {
    const t = j.body.translation();
    const surface = sampleTerrainHeight(terrain, t.x);
    min = Math.min(min, t.y - surface);
  }
  return min;
}
