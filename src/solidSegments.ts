/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * D136 — Solid segments: compound rigid bodies for soft-body creatures.
 *
 * A solid is a disjoint set of nodes simulated as one rigid plate via
 * mass-weighted shape matching. Soft/hard length constraints that lie wholly
 * inside a solid are skipped (the plate owns relative geometry). External
 * links may hinge on boundary members. No hard angle locks are used.
 */

import type {
  PhysicsMuscle,
  PhysicsNode,
  RuntimeSolidBody,
  SolidSegmentSpec,
} from './types';
import { resolveLinkKind } from './types';

export const MAX_SOLID_SEGMENTS = 4;
export const MIN_SOLID_NODES = 3;
export const MAX_SOLID_NODES = 64;

/** Authoring / blueprint solid plate. */
export type SolidSegment = SolidSegmentSpec;

export function normalizeSolidSegments(
  raw: unknown
): SolidSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: SolidSegment[] = [];
  const claimed = new Set<number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof (entry as SolidSegment).id === 'string'
      ? (entry as SolidSegment).id.trim()
      : '';
    const nodeIdsRaw = (entry as SolidSegment).nodeIds;
    if (!id || !Array.isArray(nodeIdsRaw)) continue;
    const nodeIds: number[] = [];
    for (const n of nodeIdsRaw) {
      if (typeof n !== 'number' || !Number.isFinite(n)) continue;
      const idNum = Math.trunc(n);
      if (claimed.has(idNum)) continue;
      if (nodeIds.includes(idNum)) continue;
      nodeIds.push(idNum);
    }
    if (nodeIds.length < MIN_SOLID_NODES) continue;
    if (nodeIds.length > MAX_SOLID_NODES) nodeIds.length = MAX_SOLID_NODES;
    for (const n of nodeIds) claimed.add(n);
    out.push({ id, nodeIds });
    if (out.length >= MAX_SOLID_SEGMENTS) break;
  }
  return out;
}

/** Map node id → solid id for O(1) membership tests. */
export function solidMembership(solids: SolidSegment[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const solid of solids) {
    for (const id of solid.nodeIds) map.set(id, solid.id);
  }
  return map;
}

export function isLinkWhollyInsideSolid(
  nodeA: number,
  nodeB: number,
  membership: Map<number, string>
): boolean {
  const sa = membership.get(nodeA);
  const sb = membership.get(nodeB);
  return sa !== undefined && sa === sb;
}

export function softLinksInsideSolid(
  muscles: Array<Pick<PhysicsMuscle, 'id' | 'nodeA' | 'nodeB' | 'linkKind' | 'strength' | 'minLength' | 'maxLength'>>,
  solids: SolidSegment[]
): number[] {
  const membership = solidMembership(solids);
  const bad: number[] = [];
  for (const m of muscles) {
    if (resolveLinkKind(m) !== 'muscle') continue;
    if (isLinkWhollyInsideSolid(m.nodeA, m.nodeB, membership)) bad.push(m.id);
  }
  return bad;
}

export function validateSolidSegments(
  solids: SolidSegment[],
  nodeIds: Iterable<number>,
  muscles: Array<Pick<PhysicsMuscle, 'id' | 'nodeA' | 'nodeB' | 'linkKind' | 'strength' | 'minLength' | 'maxLength'>>
): string | null {
  const known = new Set(nodeIds);
  if (solids.length > MAX_SOLID_SEGMENTS) {
    return `At most ${MAX_SOLID_SEGMENTS} solid segments are allowed.`;
  }
  const claimed = new Set<number>();
  for (const solid of solids) {
    if (solid.nodeIds.length < MIN_SOLID_NODES) {
      return `Solid "${solid.id}" needs at least ${MIN_SOLID_NODES} nodes.`;
    }
    if (solid.nodeIds.length > MAX_SOLID_NODES) {
      return `Solid "${solid.id}" exceeds ${MAX_SOLID_NODES} nodes.`;
    }
    for (const id of solid.nodeIds) {
      if (!known.has(id)) return `Solid "${solid.id}" references missing node ${id}.`;
      if (claimed.has(id)) return `Node ${id} belongs to more than one solid.`;
      claimed.add(id);
    }
  }
  const softInside = softLinksInsideSolid(muscles, solids);
  if (softInside.length > 0) {
    return 'Soft muscles cannot span two nodes inside the same solid. Remove them or unlock the solid.';
  }
  return null;
}

/** Drop solids that lost members; prune missing node ids. */
export function pruneSolidSegments(
  solids: SolidSegment[],
  survivingNodeIds: Set<number>
): SolidSegment[] {
  return normalizeSolidSegments(
    solids.map(solid => ({
      ...solid,
      nodeIds: solid.nodeIds.filter(id => survivingNodeIds.has(id)),
    }))
  );
}

export function remapSolidSegments(
  solids: SolidSegment[],
  idMap: Map<number, number>
): SolidSegment[] {
  return normalizeSolidSegments(
    solids.map(solid => ({
      id: solid.id,
      nodeIds: solid.nodeIds
        .map(id => idMap.get(id))
        .filter((id): id is number => id !== undefined),
    }))
  );
}

export function buildRuntimeSolidBodies(
  solids: SolidSegment[] | undefined,
  nodes: PhysicsNode[]
): RuntimeSolidBody[] {
  const normalized = normalizeSolidSegments(solids);
  const byId = new Map(nodes.map((n, i) => [n.id, i]));
  const bodies: RuntimeSolidBody[] = [];
  for (const solid of normalized) {
    const nodeIndices: number[] = [];
    for (const id of solid.nodeIds) {
      const idx = byId.get(id);
      if (idx !== undefined) nodeIndices.push(idx);
    }
    if (nodeIndices.length < MIN_SOLID_NODES) continue;

    let mass = 0;
    let cx = 0;
    let cy = 0;
    for (const idx of nodeIndices) {
      const n = nodes[idx];
      const m = Math.max(1e-6, n.mass);
      mass += m;
      cx += n.x * m;
      cy += n.y * m;
    }
    cx /= mass;
    cy /= mass;
    const restOffsets = nodeIndices.map(idx => ({
      x: nodes[idx].x - cx,
      y: nodes[idx].y - cy,
    }));
    bodies.push({ id: solid.id, nodeIndices, restOffsets });
  }
  return bodies;
}

/**
 * Project solid members onto the rigid shape that best matches the spawn rest
 * pose (2D mass-weighted shape matching). When preserveVelocity is true,
 * oldX/oldY are rewritten so each particle keeps the rigid-body velocity field
 * (COM + ω × r) — never injects Verlet energy from residual fights.
 */
export function projectSolidBodies(
  nodes: PhysicsNode[],
  solids: RuntimeSolidBody[],
  opts?: { preserveVelocity?: boolean; pinnedIds?: ReadonlySet<number> }
): void {
  if (!solids.length) return;
  const preserveVelocity = opts?.preserveVelocity !== false;
  const pinned = opts?.pinnedIds;

  for (const solid of solids) {
    if (solid.nodeIndices.length < MIN_SOLID_NODES) continue;

    let mass = 0;
    let cx = 0;
    let cy = 0;
    let movable = 0;
    for (const idx of solid.nodeIndices) {
      const n = nodes[idx];
      if (!n) continue;
      if (pinned?.has(n.id)) continue;
      const m = Math.max(1e-6, n.mass);
      mass += m;
      cx += n.x * m;
      cy += n.y * m;
      movable += 1;
    }
    if (movable < 2 || mass < 1e-8) continue;
    cx /= mass;
    cy /= mass;

    // A = Σ m p' qᵀ  →  optimal 2D rotation from rest offsets q to current p'
    let axx = 0;
    let axy = 0;
    let ayx = 0;
    let ayy = 0;
    let i = 0;
    for (const idx of solid.nodeIndices) {
      const n = nodes[idx];
      const q = solid.restOffsets[i++];
      if (!n || !q) continue;
      if (pinned?.has(n.id)) continue;
      const m = Math.max(1e-6, n.mass);
      const px = n.x - cx;
      const py = n.y - cy;
      axx += m * px * q.x;
      axy += m * px * q.y;
      ayx += m * py * q.x;
      ayy += m * py * q.y;
    }
    // Polar-decomposition shortcut for 2D: R from (Axx+Ayy, Ayx−Axy)
    let cos = axx + ayy;
    let sin = ayx - axy;
    const len = Math.hypot(cos, sin);
    if (len > 1e-8) {
      cos /= len;
      sin /= len;
    } else {
      cos = 1;
      sin = 0;
    }

    // Pre-projection rigid velocity field (from current Verlet velocities).
    let vxCom = 0;
    let vyCom = 0;
    let angMom = 0;
    let inertia = 0;
    if (preserveVelocity) {
      let vm = 0;
      i = 0;
      for (const idx of solid.nodeIndices) {
        const n = nodes[idx];
        const q = solid.restOffsets[i++];
        if (!n || !q) continue;
        if (pinned?.has(n.id)) continue;
        const m = Math.max(1e-6, n.mass);
        const vx = n.x - n.oldX;
        const vy = n.y - n.oldY;
        vm += m;
        vxCom += vx * m;
        vyCom += vy * m;
        const rx = n.x - cx;
        const ry = n.y - cy;
        angMom += m * (rx * vy - ry * vx);
        inertia += m * (rx * rx + ry * ry);
      }
      if (vm > 1e-8) {
        vxCom /= vm;
        vyCom /= vm;
      }
    }
    const omega = preserveVelocity && inertia > 1e-6 ? angMom / inertia : 0;

    i = 0;
    for (const idx of solid.nodeIndices) {
      const n = nodes[idx];
      const q = solid.restOffsets[i++];
      if (!n || !q) continue;
      if (pinned?.has(n.id)) continue;
      const gx = cx + cos * q.x - sin * q.y;
      const gy = cy + sin * q.x + cos * q.y;
      if (preserveVelocity) {
        const rx = gx - cx;
        const ry = gy - cy;
        // v = v_com + ω × r  (2D: (−ω ry, ω rx))
        const vx = vxCom - omega * ry;
        const vy = vyCom + omega * rx;
        n.x = gx;
        n.y = gy;
        n.oldX = gx - vx;
        n.oldY = gy - vy;
      } else {
        n.x = gx;
        n.y = gy;
      }
    }
  }
}

/** Studio / preview helper: project from id-keyed positions + old map. */
export function projectSolidBodiesOnMap(
  pos: Map<number, { x: number; y: number }>,
  oldMap: Map<number, { oldX: number; oldY: number }>,
  masses: Map<number, number>,
  solids: SolidSegment[],
  restBySolid: Map<string, { x: number; y: number }[]>,
  opts?: { pinnedIds?: ReadonlySet<number>; preserveVelocity?: boolean }
): void {
  const preserveVelocity = opts?.preserveVelocity !== false;
  const pinned = opts?.pinnedIds;
  for (const solid of solids) {
    const rest = restBySolid.get(solid.id);
    if (!rest || rest.length !== solid.nodeIds.length) continue;

    let mass = 0;
    let cx = 0;
    let cy = 0;
    let movable = 0;
    for (const id of solid.nodeIds) {
      if (pinned?.has(id)) continue;
      const p = pos.get(id);
      if (!p) continue;
      const m = Math.max(1e-6, masses.get(id) ?? 1);
      mass += m;
      cx += p.x * m;
      cy += p.y * m;
      movable += 1;
    }
    if (movable < 2 || mass < 1e-8) continue;
    cx /= mass;
    cy /= mass;

    let axx = 0;
    let axy = 0;
    let ayx = 0;
    let ayy = 0;
    for (let i = 0; i < solid.nodeIds.length; i++) {
      const id = solid.nodeIds[i];
      if (pinned?.has(id)) continue;
      const p = pos.get(id);
      const q = rest[i];
      if (!p || !q) continue;
      const m = Math.max(1e-6, masses.get(id) ?? 1);
      const px = p.x - cx;
      const py = p.y - cy;
      axx += m * px * q.x;
      axy += m * px * q.y;
      ayx += m * py * q.x;
      ayy += m * py * q.y;
    }
    let cos = axx + ayy;
    let sin = ayx - axy;
    const len = Math.hypot(cos, sin);
    if (len > 1e-8) {
      cos /= len;
      sin /= len;
    } else {
      cos = 1;
      sin = 0;
    }

    let vxCom = 0;
    let vyCom = 0;
    let angMom = 0;
    let inertia = 0;
    if (preserveVelocity) {
      let vm = 0;
      for (let i = 0; i < solid.nodeIds.length; i++) {
        const id = solid.nodeIds[i];
        if (pinned?.has(id)) continue;
        const p = pos.get(id);
        const old = oldMap.get(id);
        if (!p || !old) continue;
        const m = Math.max(1e-6, masses.get(id) ?? 1);
        const vx = p.x - old.oldX;
        const vy = p.y - old.oldY;
        vm += m;
        vxCom += vx * m;
        vyCom += vy * m;
        const rx = p.x - cx;
        const ry = p.y - cy;
        angMom += m * (rx * vy - ry * vx);
        inertia += m * (rx * rx + ry * ry);
      }
      if (vm > 1e-8) {
        vxCom /= vm;
        vyCom /= vm;
      }
    }
    const omega = preserveVelocity && inertia > 1e-6 ? angMom / inertia : 0;

    for (let i = 0; i < solid.nodeIds.length; i++) {
      const id = solid.nodeIds[i];
      if (pinned?.has(id)) continue;
      const p = pos.get(id);
      const q = rest[i];
      if (!p || !q) continue;
      const gx = cx + cos * q.x - sin * q.y;
      const gy = cy + sin * q.x + cos * q.y;
      if (preserveVelocity) {
        const old = oldMap.get(id) ?? { oldX: gx, oldY: gy };
        const rx = gx - cx;
        const ry = gy - cy;
        const vx = vxCom - omega * ry;
        const vy = vyCom + omega * rx;
        p.x = gx;
        p.y = gy;
        old.oldX = gx - vx;
        old.oldY = gy - vy;
        oldMap.set(id, old);
      } else {
        p.x = gx;
        p.y = gy;
      }
    }
  }
}

/** Capture rest offsets from current Studio node positions. */
export function captureSolidRestOffsets(
  solids: SolidSegment[],
  positions: Map<number, { x: number; y: number }>,
  masses: Map<number, number>
): Map<string, { x: number; y: number }[]> {
  const out = new Map<string, { x: number; y: number }[]>();
  for (const solid of solids) {
    let mass = 0;
    let cx = 0;
    let cy = 0;
    for (const id of solid.nodeIds) {
      const p = positions.get(id);
      if (!p) continue;
      const m = Math.max(1e-6, masses.get(id) ?? 1);
      mass += m;
      cx += p.x * m;
      cy += p.y * m;
    }
    if (mass < 1e-8) continue;
    cx /= mass;
    cy /= mass;
    out.set(
      solid.id,
      solid.nodeIds.map(id => {
        const p = positions.get(id) ?? { x: cx, y: cy };
        return { x: p.x - cx, y: p.y - cy };
      })
    );
  }
  return out;
}

export function solidNodeIdSet(solids: SolidSegment[]): Set<number> {
  const set = new Set<number>();
  for (const solid of solids) {
    for (const id of solid.nodeIds) set.add(id);
  }
  return set;
}

export function newSolidId(existing: SolidSegment[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map(s => s.id));
  while (ids.has(`solid-${n}`)) n += 1;
  return `solid-${n}`;
}
