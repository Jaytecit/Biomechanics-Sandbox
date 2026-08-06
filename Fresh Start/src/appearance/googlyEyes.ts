/**
 * Cosmetic googly-eye pupil motion (A1.2 / A4).
 * Bead-in-dome sim uses joint world velocity for inertia only — never writes to Rapier.
 */

import type { AppearanceRig, GooglyEyeDef } from './types';

/** Dome radius in world units (2× the prior default of 0.18). */
export const GOOGLY_DOME_RADIUS = 0.36;

/** Half-spacing between a centred pair (pair midpoint = joint center). */
export const GOOGLY_PAIR_HALF_SPACING = 0.48;

/** Bead radius as a fraction of dome radius (smaller → more free travel). */
export const GOOGLY_BEAD_FRAC = 0.32;

export interface GooglyEyeState {
  px: number;
  py: number;
  vx: number;
  vy: number;
  prevAx: number;
  prevAy: number;
}

export interface GooglyPupilPose {
  px: number;
  py: number;
  pupilRadius: number;
  domeRadius: number;
}

const states = new Map<string, GooglyEyeState>();

export function resetGooglyEyeStates(prefix?: string): void {
  if (!prefix) {
    states.clear();
    return;
  }
  for (const key of [...states.keys()]) {
    if (key.startsWith(prefix)) states.delete(key);
  }
}

function getState(key: string): GooglyEyeState {
  let s = states.get(key);
  if (!s) {
    s = { px: 0, py: 0, vx: 0, vy: 0, prevAx: 0, prevAy: 0 };
    states.set(key, s);
  }
  return s;
}

export function makeGooglyEyePair(jointId: number): GooglyEyeDef[] {
  return [
    {
      jointId,
      domeRadius: GOOGLY_DOME_RADIUS,
      offsetX: -GOOGLY_PAIR_HALF_SPACING,
      offsetY: 0,
    },
    {
      jointId,
      domeRadius: GOOGLY_DOME_RADIUS,
      offsetX: GOOGLY_PAIR_HALF_SPACING,
      offsetY: 0,
    },
  ];
}

/**
 * Resolve pair spacing from the current constant using the stored offset sign,
 * so legacy ±0.24 eyes pick up wider spacing without a re-toggle.
 */
export function resolveGooglyEyeOffset(eye: GooglyEyeDef): {
  x: number;
  y: number;
} {
  const ox = eye.offsetX ?? 0;
  const x =
    ox === 0 ? 0 : Math.sign(ox) * GOOGLY_PAIR_HALF_SPACING;
  return { x, y: eye.offsetY ?? 0 };
}

export function jointHasGooglyEyes(
  appearance: AppearanceRig | undefined,
  jointId: number,
): boolean {
  return (appearance?.googlyEyes ?? []).some((e) => e.jointId === jointId);
}

/** Enable/disable a centred eye pair on `jointId`; other joints unchanged. */
export function setJointGooglyEyes(
  appearance: AppearanceRig,
  jointId: number,
  enabled: boolean,
): AppearanceRig {
  const rest = appearance.googlyEyes.filter((e) => e.jointId !== jointId);
  return {
    ...appearance,
    googlyEyes: enabled ? [...rest, ...makeGooglyEyePair(jointId)] : rest,
  };
}

/** Rest pose: bead settled at the bottom of the dome (edit preview). */
export function restGooglyPupil(domeRadius: number): GooglyPupilPose {
  const pupilRadius = domeRadius * GOOGLY_BEAD_FRAC;
  const maxR = Math.max(0.01, domeRadius - pupilRadius);
  return { px: 0, py: -maxR * 0.92, pupilRadius, domeRadius };
}

/**
 * Step bead in local dome space.
 * Gravity pulls toward −Y (screen-down after draw flip); inertia reacts to anchor accel.
 */
export function stepGooglyEye(
  key: string,
  anchorVx: number,
  anchorVy: number,
  domeRadius: number,
  pupilRadius: number,
  dt: number,
): GooglyPupilPose {
  const s = getState(key);
  const maxR = Math.max(0.01, domeRadius - pupilRadius);
  const ax = (anchorVx - s.prevAx) / Math.max(1e-4, dt);
  const ay = (anchorVy - s.prevAy) / Math.max(1e-4, dt);
  s.prevAx = anchorVx;
  s.prevAy = anchorVy;

  // Loose bead-in-dome: weak air drag, lively rim bounce, strong inertia.
  const gravity = 16;
  const inertia = 0.11;
  const damp = 0.28;
  const restitution = 0.82;
  const rimFriction = 0.04;

  // Gravity toward dome floor (−Y). Inertia opposite joint acceleration.
  s.vx += (-inertia * ax - damp * s.vx) * dt;
  s.vy += (-gravity - inertia * ay - damp * s.vy) * dt;
  s.px += s.vx * dt;
  s.py += s.vy * dt;

  const len = Math.hypot(s.px, s.py);
  if (len > maxR && len > 1e-8) {
    const nx = s.px / len;
    const ny = s.py / len;
    s.px = nx * maxR;
    s.py = ny * maxR;
    const vn = s.vx * nx + s.vy * ny;
    // Tangential component — mostly preserved so the bead rolls around the rim.
    const tx = s.vx - vn * nx;
    const ty = s.vy - vn * ny;
    if (vn > 0) {
      s.vx = tx * (1 - rimFriction) - restitution * vn * nx;
      s.vy = ty * (1 - rimFriction) - restitution * vn * ny;
    } else {
      s.vx = tx * (1 - rimFriction) + vn * nx;
      s.vy = ty * (1 - rimFriction) + vn * ny;
    }
  }

  return { px: s.px, py: s.py, pupilRadius, domeRadius };
}

/** Clear plastic dome + black bead with specular highlights. */
export function drawGooglyEye(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  zoom: number,
  pupil: GooglyPupilPose,
): void {
  const domeR = pupil.domeRadius * zoom;
  const beadR = pupil.pupilRadius * zoom;
  const bx = sx + pupil.px * zoom;
  const by = sy - pupil.py * zoom;

  // Soft contact shadow under the dome.
  ctx.fillStyle = 'rgba(20, 28, 40, 0.18)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + domeR * 0.55, domeR * 0.85, domeR * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // Opaque white eye background.
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx, sy, domeR, 0, Math.PI * 2);
  ctx.fill();

  // Soft rim shade so the white reads as a shallow dome.
  const shade = ctx.createRadialGradient(
    sx - domeR * 0.15,
    sy - domeR * 0.2,
    domeR * 0.15,
    sx,
    sy,
    domeR,
  );
  shade.addColorStop(0, 'rgba(255, 255, 255, 0)');
  shade.addColorStop(0.7, 'rgba(235, 240, 245, 0.35)');
  shade.addColorStop(1, 'rgba(190, 205, 220, 0.55)');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(sx, sy, domeR, 0, Math.PI * 2);
  ctx.fill();

  // Rim.
  ctx.strokeStyle = 'rgba(40, 55, 75, 0.75)';
  ctx.lineWidth = Math.max(1.25, domeR * 0.06);
  ctx.stroke();

  // Black bead.
  const beadGrad = ctx.createRadialGradient(
    bx - beadR * 0.3,
    by - beadR * 0.35,
    beadR * 0.08,
    bx,
    by,
    beadR,
  );
  beadGrad.addColorStop(0, '#3a3f4a');
  beadGrad.addColorStop(0.35, '#141820');
  beadGrad.addColorStop(1, '#050608');
  ctx.fillStyle = beadGrad;
  ctx.beginPath();
  ctx.arc(bx, by, beadR, 0, Math.PI * 2);
  ctx.fill();

  // Bead specular.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.arc(bx - beadR * 0.28, by - beadR * 0.32, beadR * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Glass dome highlight over the shell.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(1.5, domeR * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(sx, sy, domeR * 0.72, -Math.PI * 0.95, -Math.PI * 0.55);
  ctx.stroke();
}
