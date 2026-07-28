/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * D138 — Right-angle hinge stops.
 *
 * A hinge-stop node clamps the angle between every pair of hard links
 * (bone / telescope / piston) that meet there to ≤ 90°. Soft muscles do not
 * define the limit. Projections always preserve Verlet velocity so residual
 * corrections cannot invent kinetic energy (D133 lesson).
 */

import type { PhysicsMuscle, PhysicsNode } from './types';
import { isHardLengthConstraint } from './types';

/** Maximum allowed angle between two hard bones at a hinge-stop joint. */
export const HINGE_STOP_MAX_ANGLE = Math.PI / 2;

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
 * If angle A–H–B exceeds maxAngle, rotate A and B around H toward each other
 * by half the excess each. Length constraints re-settle bone lengths afterward.
 */
export function enforcePairMaxAngle(
  hinge: PhysicsNode,
  endA: PhysicsNode,
  endB: PhysicsNode,
  maxAngle: number = HINGE_STOP_MAX_ANGLE
): boolean {
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
  if (angle <= maxAngle + 1e-5) return false;

  const excess = angle - maxAngle;
  const half = excess * 0.5;
  const sign = cross >= 0 ? 1 : -1;

  const nextA = rotateAround(endA.x, endA.y, hinge.x, hinge.y, sign * half);
  const nextB = rotateAround(endB.x, endB.y, hinge.x, hinge.y, -sign * half);

  const dAx = nextA.x - endA.x;
  const dAy = nextA.y - endA.y;
  const dBx = nextB.x - endB.x;
  const dBy = nextB.y - endB.y;

  endA.x = nextA.x;
  endA.y = nextA.y;
  endB.x = nextB.x;
  endB.y = nextB.y;
  // Always preserve Verlet velocity — never inject energy from the stop.
  endA.oldX += dAx;
  endA.oldY += dAy;
  endB.oldX += dBx;
  endB.oldY += dBy;
  return true;
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

    // Temporary PhysicsNode-shaped views so we can reuse enforcePairMaxAngle.
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
        if (!enforcePairMaxAngle(hingeNode, endA, endB)) continue;
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
