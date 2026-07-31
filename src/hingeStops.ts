/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * D138 — Right-angle hinge stops.
 *
 * A hinge-stop node clamps the angle between every pair of hard links
 * (bone / piston) that meet there to ≤ 90°. Soft muscles do not define the limit.
 *
 * Stability (physics 4.25.0):
 * - Gradual angular correction so relaxation passes cannot whip a limb in one frame.
 * - Grounded ends are pinned (correction goes to the free spoke) so foot plants
 *   cannot convert the stop into a launch.
 * - World velocity is preserved through the position snap, then opening angular
 *   rate about the hinge is removed (inelastic unilateral stop).
 * - Length corrections preserve Verlet velocity while any hinge stop is active.
 */

import type { PhysicsMuscle, PhysicsNode } from './types';
import { isHardLengthConstraint } from './types';

/** Maximum allowed angle between two hard bones at a hinge-stop joint. */
export const HINGE_STOP_MAX_ANGLE = Math.PI / 2;

/**
 * Cap per-end angular correction per projection call. Hinge+bone settle runs
 * ~10 passes/frame, so ~8° converges a bad obtuse pose without a single-frame whip.
 */
export const HINGE_STOP_MAX_CORRECT_RAD = (8 * Math.PI) / 180;

function rotateAround(
  px: number,
  py: number,
  ox: number,
  oy: number,
  theta: number
): { x: number; y: number } {
  const dx = px - ox;
  const dy = py - oy;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: ox + dx * c - dy * s, y: oy + dx * s + dy * c };
}

/**
 * If angle A–H–B exceeds maxAngle, rotate free ends around H toward each other.
 * Grounded ends stay planted. Length constraints re-settle bone lengths afterward.
 */
export function enforcePairMaxAngle(
  hinge: PhysicsNode,
  endA: PhysicsNode,
  endB: PhysicsNode,
  maxAngle: number = HINGE_STOP_MAX_ANGLE
): boolean {
  const vHx = hinge.x - hinge.oldX;
  const vHy = hinge.y - hinge.oldY;

  const uax = endA.x - hinge.x;
  const uay = endA.y - hinge.y;
  const ubx = endB.x - hinge.x;
  const uby = endB.y - hinge.y;
  const lenA = Math.hypot(uax, uay);
  const lenB = Math.hypot(ubx, uby);
  if (lenA < 1e-6 || lenB < 1e-6) return false;

  const dot = uax * ubx + uay * uby;
  const cross = uax * uby - uay * ubx;
  const angle = Math.atan2(Math.abs(cross), dot); // [0, π]
  const sign = cross >= 0 ? 1 : -1;

  const pinA = !!endA.isGround;
  const pinB = !!endB.isGround;

  if (angle <= maxAngle + 1e-5) {
    if (angle >= maxAngle - 1e-3) {
      // At the stop: fully kill angle rate on free spokes (no bounce through the limit).
      weldAngleRate(hinge, endA, endB, vHx, vHy, pinA, pinB);
    }
    return false;
  }

  // Both feet planted: only weld angle rate — do not yank plants.
  if (pinA && pinB) {
    weldAngleRate(hinge, endA, endB, vHx, vHy, pinA, pinB);
    return false;
  }

  const excess = angle - maxAngle;
  const step = Math.min(excess, HINGE_STOP_MAX_CORRECT_RAD * (pinA || pinB ? 1 : 2));

  const prevAx = endA.x;
  const prevAy = endA.y;
  const prevBx = endB.x;
  const prevBy = endB.y;

  if (pinA) {
    const nextB = rotateAround(endB.x, endB.y, hinge.x, hinge.y, -sign * step);
    endB.x = nextB.x;
    endB.y = nextB.y;
    endB.oldX += endB.x - prevBx;
    endB.oldY += endB.y - prevBy;
  } else if (pinB) {
    const nextA = rotateAround(endA.x, endA.y, hinge.x, hinge.y, sign * step);
    endA.x = nextA.x;
    endA.y = nextA.y;
    endA.oldX += endA.x - prevAx;
    endA.oldY += endA.y - prevAy;
  } else {
    const half = step * 0.5;
    const nextA = rotateAround(endA.x, endA.y, hinge.x, hinge.y, sign * half);
    const nextB = rotateAround(endB.x, endB.y, hinge.x, hinge.y, -sign * half);
    endA.x = nextA.x;
    endA.y = nextA.y;
    endB.x = nextB.x;
    endB.y = nextB.y;
    endA.oldX += endA.x - prevAx;
    endA.oldY += endA.y - prevAy;
    endB.oldX += endB.x - prevBx;
    endB.oldY += endB.y - prevBy;
  }

  weldAngleRate(hinge, endA, endB, vHx, vHy, pinA, pinB);
  return true;
}

/**
 * Zero angular rate of free ends about H (keep radial / hinge translation).
 * Used at the stop so actuators cannot bounce through the unilateral limit.
 */
function weldAngleRate(
  hinge: PhysicsNode,
  endA: PhysicsNode,
  endB: PhysicsNode,
  vHx: number,
  vHy: number,
  pinA: boolean,
  pinB: boolean
): void {
  const weldOne = (end: PhysicsNode) => {
    const rx = end.x - hinge.x;
    const ry = end.y - hinge.y;
    const len2 = rx * rx + ry * ry;
    if (len2 < 1e-8) return;
    const relVx = end.x - end.oldX - vHx;
    const relVy = end.y - end.oldY - vHy;
    const radial = (relVx * rx + relVy * ry) / len2;
    const vxRad = radial * rx;
    const vyRad = radial * ry;
    end.oldX = end.x - (vHx + vxRad);
    end.oldY = end.y - (vHy + vyRad);
  };

  if (!pinA) weldOne(endA);
  if (!pinB) weldOne(endB);
}

/** True when any node is authored as a hinge stop. */
export function creatureHasHingeStops(
  nodes: Array<Pick<PhysicsNode, 'isHingeStop'>>
): boolean {
  return nodes.some(n => !!n.isHingeStop);
}

/**
 * Project all authored hinge stops on a creature. Call after length
 * relaxation (and solids) so hard bones define the spokes.
 */
export function projectHingeStops(
  nodes: PhysicsNode[],
  muscles: Array<Pick<PhysicsMuscle, 'nodeA' | 'nodeB' | 'linkKind' | 'minLength' | 'maxLength' | 'strength'>>
): void {
  const hardSpokes: number[][] = nodes.map(() => []);
  for (const m of muscles) {
    if (!isHardLengthConstraint(m)) continue;
    if (
      m.nodeA < 0 ||
      m.nodeB < 0 ||
      m.nodeA >= nodes.length ||
      m.nodeB >= nodes.length
    ) {
      continue;
    }
    hardSpokes[m.nodeA].push(m.nodeB);
    hardSpokes[m.nodeB].push(m.nodeA);
  }

  for (let h = 0; h < nodes.length; h += 1) {
    const hinge = nodes[h];
    if (!hinge?.isHingeStop) continue;
    const spokes = hardSpokes[h];
    if (spokes.length < 2) continue;
    for (let i = 0; i < spokes.length; i += 1) {
      for (let j = i + 1; j < spokes.length; j += 1) {
        const endA = nodes[spokes[i]];
        const endB = nodes[spokes[j]];
        if (!endA || !endB) continue;
        enforcePairMaxAngle(hinge, endA, endB);
      }
    }
  }
}

/** Studio / preview: id-keyed positions with Verlet old map. */
export function projectHingeStopsOnMap(
  pos: Map<number, { x: number; y: number }>,
  oldMap: Map<number, { oldX: number; oldY: number }>,
  muscles: Array<Pick<PhysicsMuscle, 'nodeA' | 'nodeB' | 'linkKind' | 'minLength' | 'maxLength' | 'strength'>>,
  hingeIds: ReadonlySet<number>
): void {
  if (hingeIds.size === 0) return;

  const hardSpokes = new Map<number, number[]>();
  const ensure = (id: number) => {
    let list = hardSpokes.get(id);
    if (!list) {
      list = [];
      hardSpokes.set(id, list);
    }
    return list;
  };
  for (const m of muscles) {
    if (!isHardLengthConstraint(m)) continue;
    ensure(m.nodeA).push(m.nodeB);
    ensure(m.nodeB).push(m.nodeA);
  }

  for (const hId of hingeIds) {
    const hingePos = pos.get(hId);
    const hingeOld = oldMap.get(hId);
    if (!hingePos) continue;
    const spokes = hardSpokes.get(hId);
    if (!spokes || spokes.length < 2) continue;

    const hingeNode: PhysicsNode = {
      id: hId,
      x: hingePos.x,
      y: hingePos.y,
      oldX: hingeOld?.oldX ?? hingePos.x,
      oldY: hingeOld?.oldY ?? hingePos.y,
      vx: 0,
      vy: 0,
      mass: 1,
      radius: 1,
      friction: 0,
      isGround: false,
      isHingeStop: true,
    };

    for (let i = 0; i < spokes.length; i += 1) {
      for (let j = i + 1; j < spokes.length; j += 1) {
        const aId = spokes[i];
        const bId = spokes[j];
        const aPos = pos.get(aId);
        const bPos = pos.get(bId);
        if (!aPos || !bPos) continue;
        const aOld = oldMap.get(aId);
        const bOld = oldMap.get(bId);
        const endA: PhysicsNode = {
          id: aId,
          x: aPos.x,
          y: aPos.y,
          oldX: aOld?.oldX ?? aPos.x,
          oldY: aOld?.oldY ?? aPos.y,
          vx: 0,
          vy: 0,
          mass: 1,
          radius: 1,
          friction: 0,
          isGround: false,
        };
        const endB: PhysicsNode = {
          id: bId,
          x: bPos.x,
          y: bPos.y,
          oldX: bOld?.oldX ?? bPos.x,
          oldY: bOld?.oldY ?? bPos.y,
          vx: 0,
          vy: 0,
          mass: 1,
          radius: 1,
          friction: 0,
          isGround: false,
        };
        enforcePairMaxAngle(hingeNode, endA, endB);
        aPos.x = endA.x;
        aPos.y = endA.y;
        bPos.x = endB.x;
        bPos.y = endB.y;
        if (aOld) {
          aOld.oldX = endA.oldX;
          aOld.oldY = endA.oldY;
        }
        if (bOld) {
          bOld.oldX = endB.oldX;
          bOld.oldY = endB.oldY;
        }
      }
    }
  }
}
