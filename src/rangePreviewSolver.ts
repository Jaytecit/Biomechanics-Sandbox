/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Quasi-static range-preview pose solver, shared by the Studio "Range"
 * preview and the Model Picker RangePreviewVisualizer.
 *
 * The pose for a given wave phase is solved fresh from the authored rest pose
 * every frame (cold start) and the residual rigid transform is removed with a
 * mass-weighted 2D shape match against the rest pose. The preview is therefore
 * a pure function of the cycle phase: it loops exactly, cannot accumulate
 * orientation drift, and cannot wander off-canvas.
 *
 * (The previous implementation warm-started each frame from the prior frame's
 * pose with a translation-only anchor. Constraint projection has no unique
 * solution, so per-cycle rotation residue accumulated and creatures tumbled
 * and wandered during piston/muscle range previews.)
 */

import {
  SolidSegment,
  isLinkWhollyInsideSolid,
  projectSolidBodiesOnMap,
  solidMembership,
} from './solidSegments';

export interface PreviewEndWeight {
  nodeId: number;
  w: number;
}

export interface PreviewLink {
  id: number;
  nodeA: number;
  nodeB: number;
  /** Endpoint node weights (sum 1). Lever ends interpolate a host bone. */
  endA: PreviewEndWeight[];
  endB: PreviewEndWeight[];
  /** Fixed-length bone (never animates). */
  isBone: boolean;
  /** Hard distance constraint (bone or piston): full-step projection. */
  isHard: boolean;
  originalLength: number;
  minLength: number;
  maxLength: number;
  strength: number;
  phaseOffset: number;
}

export interface PreviewBody {
  /** Authored rest pose (Studio coordinates: y-down, ground at groundY). */
  rest: Map<number, { x: number; y: number; radius: number }>;
  masses: Map<number, number>;
  links: PreviewLink[];
  solids: SolidSegment[];
  solidRest: Map<string, { x: number; y: number }[]>;
  groundY: number;
}

const RELAX_ITERS = 24;
const HARD_EXTRA_ITERS = 8;
/** Rest nodes whose bottom edge is within this of the ground act as anchors. */
const GROUND_CONTACT_EPS = 0.75;

/** Single-node link end. */
export function nodeEndWeights(nodeId: number): PreviewEndWeight[] {
  return [{ nodeId, w: 1 }];
}

/** Lever end riding a host bone at parametric position t along A→B. */
export function leverEndWeights(
  bone: { nodeA: number; nodeB: number },
  t: number
): PreviewEndWeight[] {
  return [
    { nodeId: bone.nodeA, w: 1 - t },
    { nodeId: bone.nodeB, w: t },
  ];
}

/** Wave phase 0(min)→1(max) for a link at cycle fraction `cycleT`. */
export function previewWave(cycleT: number, phaseOffset: number): number {
  const phase = (phaseOffset || 0) * Math.PI * 2;
  return (Math.sin(cycleT * Math.PI * 2 + phase) + 1) / 2;
}

type MutablePos = { x: number; y: number };

function endPoint(
  weights: PreviewEndWeight[],
  pos: Map<number, MutablePos>
): MutablePos | null {
  let x = 0;
  let y = 0;
  for (const { nodeId, w } of weights) {
    const p = pos.get(nodeId);
    if (!p) return null;
    x += p.x * w;
    y += p.y * w;
  }
  return { x, y };
}

/**
 * Solve the preview pose for one animation frame.
 *
 * @param body    Topology + rest pose (rebuild cheaply when authoring changes).
 * @param cycleT  Cycle fraction; 1.0 = one full compress→expand period.
 * @param focusLinkId  When set, only this actuator animates (inspector focus);
 *                     all other non-bone links hold their rest length.
 */
export function solvePreviewPose(
  body: PreviewBody,
  cycleT: number,
  focusLinkId: number | null = null
): Map<number, { x: number; y: number }> {
  const pos = new Map<number, MutablePos & { radius: number }>();
  for (const [id, r] of body.rest) {
    pos.set(id, { x: r.x, y: r.y, radius: r.radius });
  }
  if (pos.size === 0) return pos;

  const membership = solidMembership(body.solids);
  const oldMap = new Map<number, { oldX: number; oldY: number }>();

  const projectLinks = (hardOnly: boolean) => {
    for (const m of body.links) {
      if (hardOnly && !m.isHard) continue;
      if (isLinkWhollyInsideSolid(m.nodeA, m.nodeB, membership)) continue;
      const a = endPoint(m.endA, pos);
      const b = endPoint(m.endB, pos);
      if (!a || !b) continue;
      const animate = !m.isBone && (focusLinkId === null || m.id === focusLinkId);
      const target = animate
        ? m.minLength +
          previewWave(cycleT, m.phaseOffset) * (m.maxLength - m.minLength)
        : m.originalLength;
      const strength = m.isHard ? 1.0 : Math.min(1, Math.max(0.35, m.strength));

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      // Each end takes HALF the correction so the total equals strength ×
      // error (arena mass-split parity). Applying the full offset per end
      // double-corrects: hard links then oscillate around the target
      // (dist → 2·target − dist) instead of converging.
      const diff = ((dist - target) / dist) * strength * 0.5;
      const ox = dx * diff;
      const oy = dy * diff;
      const wSumA = m.endA.reduce((s, w) => s + w.w * w.w, 0) || 1;
      const wSumB = m.endB.reduce((s, w) => s + w.w * w.w, 0) || 1;
      for (const { nodeId, w } of m.endA) {
        const p = pos.get(nodeId);
        if (p) {
          p.x += (ox * w) / wSumA;
          p.y += (oy * w) / wSumA;
        }
      }
      for (const { nodeId, w } of m.endB) {
        const p = pos.get(nodeId);
        if (p) {
          p.x -= (ox * w) / wSumB;
          p.y -= (oy * w) / wSumB;
        }
      }
    }
  };

  const projectSolids = () => {
    if (body.solids.length === 0) return;
    for (const [id, p] of pos) {
      oldMap.set(id, { oldX: p.x, oldY: p.y });
    }
    projectSolidBodiesOnMap(pos, oldMap, body.masses, body.solids, body.solidRest, {
      preserveVelocity: false,
    });
  };

  for (let iter = 0; iter < RELAX_ITERS; iter++) {
    projectLinks(false);
    projectSolids();
  }
  for (let iter = 0; iter < HARD_EXTRA_ITERS; iter++) {
    projectLinks(true);
    projectSolids();
  }

  if (process.env.PREVIEW_SOLVER_DEBUG) {
    console.log('post-solve', JSON.stringify([...pos.entries()]));
  }
  removeRigidDrift(body, pos);
  if (process.env.PREVIEW_SOLVER_DEBUG) {
    console.log('post-drift', JSON.stringify([...pos.entries()]));
  }

  // Soft ground clamp only — no bounce, no horizontal scoot.
  for (const p of pos.values()) {
    if (p.y + p.radius > body.groundY) {
      p.y = body.groundY - p.radius;
    }
  }

  return pos;
}

/**
 * Remove the residual rigid transform relative to the rest pose:
 * best-fit rotation over all nodes (mass-weighted Kabsch, 2D), then a
 * translation that re-plants the rest-grounded anchor nodes (falls back to
 * the whole-body centroid for airborne bodies).
 */
function removeRigidDrift(
  body: PreviewBody,
  pos: Map<number, MutablePos & { radius: number }>
): void {
  if (pos.size < 2) {
    // Single node: pin to rest.
    for (const [id, p] of pos) {
      const r = body.rest.get(id);
      if (r) {
        p.x = r.x;
        p.y = r.y;
      }
    }
    return;
  }

  // Mass-weighted centroids.
  let mSum = 0;
  let curX = 0;
  let curY = 0;
  let restX = 0;
  let restY = 0;
  for (const [id, p] of pos) {
    const r = body.rest.get(id);
    if (!r) continue;
    const m = Math.max(1e-6, body.masses.get(id) ?? 1);
    mSum += m;
    curX += p.x * m;
    curY += p.y * m;
    restX += r.x * m;
    restY += r.y * m;
  }
  if (mSum < 1e-8) return;
  curX /= mSum;
  curY /= mSum;
  restX /= mSum;
  restY /= mSum;

  // Optimal rotation aligning current offsets to rest offsets.
  let b = 0; // Σ m (r · p)
  let a = 0; // Σ m (r × p) with rotation applied to p
  for (const [id, p] of pos) {
    const r = body.rest.get(id);
    if (!r) continue;
    const m = Math.max(1e-6, body.masses.get(id) ?? 1);
    const px = p.x - curX;
    const py = p.y - curY;
    const rx = r.x - restX;
    const ry = r.y - restY;
    b += m * (rx * px + ry * py);
    a += m * (ry * px - rx * py);
  }
  const len = Math.hypot(a, b);
  const cos = len > 1e-8 ? b / len : 1;
  const sin = len > 1e-8 ? a / len : 0;
  for (const p of pos.values()) {
    const px = p.x - curX;
    const py = p.y - curY;
    p.x = curX + cos * px - sin * py;
    p.y = curY + sin * px + cos * py;
  }

  // Translation: keep rest-grounded feet planted (or whole-body centroid).
  const anchorIds: number[] = [];
  for (const [id, r] of body.rest) {
    if (r.y + r.radius >= body.groundY - GROUND_CONTACT_EPS) anchorIds.push(id);
  }
  const ids = anchorIds.length > 0 ? anchorIds : [...body.rest.keys()];
  let aCurX = 0;
  let aCurY = 0;
  let aRestX = 0;
  let aRestY = 0;
  let count = 0;
  for (const id of ids) {
    const p = pos.get(id);
    const r = body.rest.get(id);
    if (!p || !r) continue;
    aCurX += p.x;
    aCurY += p.y;
    aRestX += r.x;
    aRestY += r.y;
    count += 1;
  }
  if (count === 0) return;
  const dx = aRestX / count - aCurX / count;
  const dy = aRestY / count - aCurY / count;
  if (dx !== 0 || dy !== 0) {
    for (const p of pos.values()) {
      p.x += dx;
      p.y += dy;
    }
  }
}
