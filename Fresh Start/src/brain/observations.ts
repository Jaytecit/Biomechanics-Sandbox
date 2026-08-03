import type { SpawnedCreature } from '../physics/spawn';
import {
  ANG_VEL_SCALE,
  FOOT_CLEARANCE_SCALE,
  GROUND_CONTACT_Y,
  HEIGHT_SCALE,
  OBS_COUNT,
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

/**
 * Observation vector (length OBS_COUNT):
 * 0 height          — lowest joint Y / HEIGHT_SCALE
 * 1 velX            — mean joint linvel.x / VEL_SCALE
 * 2 velY            — mean joint linvel.y / VEL_SCALE
 * 3 angularVel      — mean bone angvel / ANG_VEL_SCALE
 * 4 rotation        — mean bone angle / π
 * 5 groundContacts  — fraction of all joints with Y < GROUND_CONTACT_Y
 * 6 footContacts    — fraction of foot joints near ground (D7)
 * 7 footClearance   — mean foot Y / FOOT_CLEARANCE_SCALE (D7)
 * 8 terrainGrade    — stub 0 until heightfields (D7 / Wave 3)
 * 9 headHeight      — marked head Y / HEIGHT_SCALE (0 if unmarked)
 */
export function buildObservations(
  creature: SpawnedCreature,
  out?: Float32Array,
): Float32Array {
  const obs = out && out.length >= OBS_COUNT ? out : new Float32Array(OBS_COUNT);
  const joints = creature.joints;
  const bones = creature.bones;
  const nJ = joints.length;
  const nB = bones.length;

  if (nJ === 0) {
    obs.fill(0);
    return obs;
  }

  let minY = Infinity;
  let sumVx = 0;
  let sumVy = 0;
  let contacts = 0;

  for (const j of joints) {
    const t = j.body.translation();
    const v = j.body.linvel();
    if (t.y < minY) minY = t.y;
    sumVx += v.x;
    sumVy += v.y;
    if (t.y < GROUND_CONTACT_Y) contacts++;
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
  let sumFootY = 0;
  for (const i of feet) {
    const y = joints[i].body.translation().y;
    sumFootY += y;
    if (y < GROUND_CONTACT_Y) footContacts++;
  }
  const nFeet = Math.max(1, feet.length);

  obs[0] = minY / HEIGHT_SCALE;
  obs[1] = sumVx / nJ / VEL_SCALE;
  obs[2] = sumVy / nJ / VEL_SCALE;
  obs[3] = nB > 0 ? sumAng / nB / ANG_VEL_SCALE : 0;
  obs[4] = nB > 0 ? sumRot / nB / Math.PI : 0;
  obs[5] = contacts / nJ;
  obs[6] = footContacts / nFeet;
  obs[7] = sumFootY / nFeet / FOOT_CLEARANCE_SCALE;
  obs[8] = 0; // terrain grade stub
  const headY = maxHeadY(creature);
  obs[9] = headY === null ? 0 : headY / HEIGHT_SCALE;

  return obs;
}

export function avgJointX(creature: SpawnedCreature): number {
  const joints = creature.joints;
  if (joints.length === 0) return 0;
  let sum = 0;
  for (const j of joints) sum += j.body.translation().x;
  return sum / joints.length;
}

export function minJointY(creature: SpawnedCreature): number {
  let min = Infinity;
  for (const j of creature.joints) {
    min = Math.min(min, j.body.translation().y);
  }
  return min;
}
