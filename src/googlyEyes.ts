/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cosmetic googly-eye pair: pupils slide inside domes under inertia + world gravity.
 * Anchored centrally on a node (face-on, above a joint pad).
 */

import { AppearancePrimitive } from './creaturePackages';
import { CREATURE_WORLD_SCALE, creatureDrawPx } from './creatureScale';

/** Visual scale for googly-eye domes, pupils, and spacing (cosmetic only). */
export const GOOGLY_EYE_SIZE_SCALE = 3;
const GOOGLY_WORLD_SCALE = GOOGLY_EYE_SIZE_SCALE * CREATURE_WORLD_SCALE;

export type GooglyEyeSide = 'L' | 'R';

export type GooglyEyeState = {
  px: number;
  py: number;
  vx: number;
  vy: number;
  prevAnchorVx: number;
  prevAnchorVy: number;
};

const stateByKey = new Map<string, GooglyEyeState>();

export function googlyEyeStateKey(
  creatureKey: string,
  partId: string,
  side: GooglyEyeSide
): string {
  return `${creatureKey}:${partId}:${side}`;
}

export function getGooglyEyeState(
  creatureKey: string,
  partId: string,
  side: GooglyEyeSide
): GooglyEyeState {
  const key = googlyEyeStateKey(creatureKey, partId, side);
  let state = stateByKey.get(key);
  if (!state) {
    state = { px: 0, py: 0, vx: 0, vy: 0, prevAnchorVx: 0, prevAnchorVy: 0 };
    stateByKey.set(key, state);
  }
  return state;
}

export function resetGooglyEyeStates(creatureKey?: string): void {
  if (!creatureKey) {
    stateByKey.clear();
    return;
  }
  const prefix = `${creatureKey}:`;
  for (const key of stateByKey.keys()) {
    if (key.startsWith(prefix)) stateByKey.delete(key);
  }
}

export type GooglyEyePairMetrics = {
  /** Pair centre offset from the anchor node (same frame as joint pad: node-centred). */
  offsetX: number;
  offsetY: number;
  domeRadius: number;
  pupilRadius: number;
  /** Horizontal distance from pair centre to each eye centre. */
  halfSpacing: number;
};

export function parseGooglyEyePairMetrics(
  part: AppearancePrimitive,
  anchorRadius: number
): GooglyEyePairMetrics {
  const centre = part.points[0] ?? { x: 0, y: 0 };
  const size = part.points[1];
  const spacing = part.points[2];
  const domeRadius =
    Math.max(4 * GOOGLY_WORLD_SCALE, Math.abs(size?.x ?? anchorRadius * 0.52 * GOOGLY_WORLD_SCALE));
  const pupilRadius = Math.max(
    1.5 * GOOGLY_WORLD_SCALE,
    Math.min(domeRadius * 0.42, Math.abs(size?.y ?? domeRadius * 0.36))
  );
  const halfSpacing = Math.max(
    domeRadius * 0.85,
    Math.abs(spacing?.x ?? domeRadius * 1.08)
  );
  return {
    offsetX: centre.x,
    offsetY: centre.y,
    domeRadius,
    pupilRadius,
    halfSpacing,
  };
}

/**
 * Advance pupil kinematics for one physics/render tick.
 * Pupil offset is in world space relative to the dome centre so eyes stay gravity-aligned.
 */
export function stepGooglyEye(
  state: GooglyEyeState,
  anchorVx: number,
  anchorVy: number,
  domeRadius: number,
  pupilRadius: number
): void {
  const maxOffset = Math.max(0.5, domeRadius - pupilRadius - 0.75);
  const anchorAx = anchorVx - state.prevAnchorVx;
  const anchorAy = anchorVy - state.prevAnchorVy;
  state.prevAnchorVx = anchorVx;
  state.prevAnchorVy = anchorVy;

  const gravityTargetY = maxOffset * 0.55;
  const gravityPull = 0.14;
  state.vx += (0 - state.px) * gravityPull * 0.35;
  state.vy += (gravityTargetY - state.py) * gravityPull;

  state.vx += -anchorAx * 0.85;
  state.vy += -anchorAy * 0.85;

  const damping = 0.82;
  state.vx *= damping;
  state.vy *= damping;
  state.px += state.vx;
  state.py += state.vy;

  const dist = Math.hypot(state.px, state.py);
  if (dist > maxOffset) {
    const nx = state.px / dist;
    const ny = state.py / dist;
    state.px = nx * maxOffset;
    state.py = ny * maxOffset;
    const vn = state.vx * nx + state.vy * ny;
    state.vx -= nx * vn * 1.35;
    state.vy -= ny * vn * 1.35;
  }
}

export function drawGooglyEyeDome(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  domeRadius: number,
  pupilRadius: number,
  pupilOffsetX: number,
  pupilOffsetY: number,
  stroke: string,
  opacity: number
): void {
  ctx.save();
  ctx.globalAlpha *= opacity;

  ctx.beginPath();
  ctx.arc(centerX, centerY, domeRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = Math.max(creatureDrawPx(1.2), domeRadius * 0.08);
  ctx.strokeStyle = stroke || '#94a3b8';
  ctx.stroke();

  const glossR = domeRadius * 0.28;
  ctx.beginPath();
  ctx.arc(centerX - domeRadius * 0.22, centerY - domeRadius * 0.28, glossR, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  const pupilX = centerX + pupilOffsetX;
  const pupilY = centerY + pupilOffsetY;
  ctx.beginPath();
  ctx.arc(pupilX, pupilY, pupilRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#111827';
  ctx.fill();

  const highlightR = Math.max(creatureDrawPx(0.8), pupilRadius * 0.28);
  ctx.beginPath();
  ctx.arc(
    pupilX - pupilRadius * 0.28,
    pupilY - pupilRadius * 0.32,
    highlightR,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();

  ctx.restore();
}

/** Two googly eyes centred on a node — sits on the joint pad like a face. */
export function createGooglyEyePairPrimitive(
  anchorNode: number,
  nodeRadius: number
): AppearancePrimitive {
  const radius = Math.max(creatureDrawPx(10), nodeRadius);
  const domeRadius = Math.max(5 * GOOGLY_WORLD_SCALE, radius * 0.52 * GOOGLY_WORLD_SCALE);
  const pupilRadius = Math.max(2 * GOOGLY_WORLD_SCALE, domeRadius * 0.36);
  const halfSpacing = domeRadius * 1.08;
  return {
    id: `googly-eyes-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'googlyEye',
    anchorNode,
    layer: 'front',
    z: 112,
    fill: '#ffffff',
    stroke: '#94a3b8',
    opacity: 1,
    points: [
      { x: 0, y: -radius * 0.1 },
      { x: domeRadius, y: pupilRadius },
      { x: halfSpacing, y: 0 },
    ],
  };
}

/** @deprecated use createGooglyEyePairPrimitive */
export const createGooglyEyePrimitive = createGooglyEyePairPrimitive;

export function drawGooglyEyePair(
  ctx: CanvasRenderingContext2D,
  part: AppearancePrimitive,
  anchor: {
    x: number;
    y: number;
    radius: number;
    oldX?: number;
    oldY?: number;
  },
  creatureKey: string
): void {
  const { offsetX, offsetY, domeRadius, pupilRadius, halfSpacing } =
    parseGooglyEyePairMetrics(part, anchor.radius);
  const pairX = anchor.x + offsetX;
  const pairY = anchor.y + offsetY;
  const anchorVx =
    anchor.oldX !== undefined ? anchor.x - anchor.oldX : 0;
  const anchorVy =
    anchor.oldY !== undefined ? anchor.y - anchor.oldY : 0;
  const hasMotion = anchor.oldX !== undefined && anchor.oldY !== undefined;

  for (const [side, sign] of [['L', -1], ['R', 1]] as const) {
    const state = getGooglyEyeState(creatureKey, part.id, side);
    if (hasMotion) {
      stepGooglyEye(state, anchorVx, anchorVy, domeRadius, pupilRadius);
    }
    drawGooglyEyeDome(
      ctx,
      pairX + sign * halfSpacing,
      pairY,
      domeRadius,
      pupilRadius,
      state.px,
      state.py,
      part.stroke,
      part.opacity
    );
  }
}
