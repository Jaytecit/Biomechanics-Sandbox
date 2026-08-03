/**
 * Cosmetic googly-eye pupil motion (A1.2 / A4).
 * Uses joint world velocity for inertia only — never writes to Rapier.
 */

export interface GooglyEyeState {
  px: number;
  py: number;
  vx: number;
  vy: number;
  prevAx: number;
  prevAy: number;
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

/**
 * Step pupil in local dome space. Gravity bias is visual only (down = −Y screen-ish in world).
 */
export function stepGooglyEye(
  key: string,
  anchorVx: number,
  anchorVy: number,
  domeRadius: number,
  pupilRadius: number,
  dt: number,
): { px: number; py: number; pupilRadius: number; domeRadius: number } {
  const s = getState(key);
  const maxR = Math.max(0.01, domeRadius - pupilRadius);
  const ax = (anchorVx - s.prevAx) / Math.max(1e-4, dt);
  const ay = (anchorVy - s.prevAy) / Math.max(1e-4, dt);
  s.prevAx = anchorVx;
  s.prevAy = anchorVy;

  // Spring toward slight "down" rest + react opposite to anchor accel.
  const restY = -maxR * 0.25;
  const spring = 48;
  const damp = 10;
  const inertia = 0.012;
  s.vx += (-spring * s.px - damp * s.vx - inertia * ax) * dt;
  s.vy += (-spring * (s.py - restY) - damp * s.vy - inertia * ay) * dt;
  s.px += s.vx * dt;
  s.py += s.vy * dt;

  const len = Math.hypot(s.px, s.py);
  if (len > maxR) {
    const k = maxR / len;
    s.px *= k;
    s.py *= k;
    s.vx *= 0.5;
    s.vy *= 0.5;
  }

  return { px: s.px, py: s.py, pupilRadius, domeRadius };
}

export function drawGooglyEye(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  zoom: number,
  pupil: { px: number; py: number; pupilRadius: number; domeRadius: number },
): void {
  const domeR = pupil.domeRadius * zoom;
  const pupilR = pupil.pupilRadius * zoom;
  ctx.fillStyle = '#f4f6fa';
  ctx.strokeStyle = '#2a3340';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(sx, sy, domeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1a2030';
  ctx.beginPath();
  ctx.arc(sx + pupil.px * zoom, sy - pupil.py * zoom, pupilR, 0, Math.PI * 2);
  ctx.fill();
}
