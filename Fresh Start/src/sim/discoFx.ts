/**
 * H2 — Canvas disco lighting / special FX (render-only, no Rapier).
 * Driven by Web Audio bands; uses deterministic time hashes (no Math.random).
 */
import type { AudioBands } from '../audio/audioAnalysis';
import {
  DEFAULT_DISCO_BALL_X,
  DEFAULT_DISCO_BALL_Y,
  DISCO_BALL_X_MAX,
  DISCO_BALL_Y_MAX,
  DISCO_BALL_Y_MIN,
  DISCO_WALL_H,
  DISCO_WALL_X,
  GROUND_Y,
} from '../physics/constants';
import { type Camera, worldToScreen } from './Camera';

export interface DiscoBallPos {
  x: number;
  y: number;
}

export function clampDiscoBallPos(x: number, y: number): DiscoBallPos {
  return {
    x: Math.max(-DISCO_BALL_X_MAX, Math.min(DISCO_BALL_X_MAX, x)),
    y: Math.max(DISCO_BALL_Y_MIN, Math.min(DISCO_BALL_Y_MAX, y)),
  };
}

/** Resting screen radius (ignores music pulse) — used for hit-testing. */
export function discoBallScreenRadius(cam: Camera): number {
  return Math.max(16, cam.zoom * 0.7);
}

export function hitTestDiscoBall(
  cam: Camera,
  canvasW: number,
  canvasH: number,
  screenX: number,
  screenY: number,
  ball: DiscoBallPos,
): boolean {
  const p = worldToScreen(cam, canvasW, canvasH, ball.x, ball.y);
  const r = discoBallScreenRadius(cam) * 1.4;
  const dx = screenX - p.x;
  const dy = screenY - p.y;
  return dx * dx + dy * dy <= r * r;
}

function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Flat chroma-key green (no lighting / atmosphere). */
export const GREENSCREEN_COLOR = '#00b140';

export function clearGreenscreenCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.fillStyle = GREENSCREEN_COLOR;
  ctx.fillRect(0, 0, w, h);
}

/** Disco-tinted clear / atmosphere behind the world. */
export function clearDiscoCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bands: AudioBands,
  timeSec: number,
): void {
  const energy = clamp01(bands.energy);
  const bass = clamp01(bands.bass);
  const treble = clamp01(bands.treble);
  const hueShift = (timeSec * 18 + bass * 40) % 360;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `hsla(${(280 + hueShift) % 360}, 55%, ${8 + energy * 10}%, 1)`);
  g.addColorStop(0.55, `hsla(${(320 + hueShift * 0.5) % 360}, 40%, ${5 + bass * 8}%, 1)`);
  g.addColorStop(1, `hsla(${(200 + treble * 40) % 360}, 35%, ${4 + energy * 6}%, 1)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft vignette
  const vg = ctx.createRadialGradient(w / 2, h * 0.4, h * 0.1, w / 2, h * 0.5, h * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, `rgba(0,0,0,${0.35 + energy * 0.25})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

/** Checker dance floor between the disco walls. */
export function drawDiscoFloor(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  bands: AudioBands,
  timeSec: number,
): void {
  const ground = worldToScreen(cam, w, h, 0, GROUND_Y);
  const left = worldToScreen(cam, w, h, -DISCO_WALL_X, GROUND_Y);
  const right = worldToScreen(cam, w, h, DISCO_WALL_X, GROUND_Y);
  const x0 = Math.max(0, left.x);
  const x1 = Math.min(w, right.x);
  if (x1 <= x0) return;

  const tile = Math.max(10, cam.zoom * 0.85);
  const energy = clamp01(bands.energy);
  const onset = clamp01(bands.onset);
  const pulse = 0.12 + energy * 0.35 + onset * 0.25;
  const hue = (timeSec * 40 + bands.bass * 80) % 360;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, ground.y, x1 - x0, h - ground.y);
  ctx.clip();

  for (let x = x0; x < x1; x += tile) {
    for (let y = ground.y; y < h; y += tile) {
      const ix = Math.floor(x / tile);
      const iy = Math.floor(y / tile);
      const odd = (ix + iy) & 1;
      if (odd) {
        ctx.fillStyle = `hsla(${hue}, 70%, ${22 + pulse * 30}%, ${0.45 + pulse * 0.35})`;
      } else {
        ctx.fillStyle = `hsla(${(hue + 180) % 360}, 55%, ${12 + pulse * 18}%, ${0.4 + pulse * 0.3})`;
      }
      ctx.fillRect(x, y, tile + 0.5, tile + 0.5);
    }
  }

  // Center runway glow
  const mid = (x0 + x1) / 2;
  const runway = ctx.createLinearGradient(mid - 40, 0, mid + 40, 0);
  runway.addColorStop(0, 'rgba(255,255,255,0)');
  runway.addColorStop(0.5, `rgba(255, 220, 255, ${0.08 + onset * 0.25})`);
  runway.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = runway;
  ctx.fillRect(mid - 40, ground.y, 80, Math.min(h - ground.y, 120));
  ctx.restore();
}

export interface DiscoLightsOptions {
  /** Greenscreen: disco ball only — skip wall neon / other lighting FX. */
  ballOnly?: boolean;
  /** World-space ball center (default above stage center). */
  ballPos?: DiscoBallPos;
}

/**
 * Disco ball + wall neon. Spotlights removed — the ball pulses with loudness / hits.
 * Pass `ballOnly` for greenscreen (no wall neon).
 */
export function drawDiscoLights(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  bands: AudioBands,
  timeSec: number,
  options?: DiscoLightsOptions,
): void {
  const energy = clamp01(bands.energy);
  const bass = clamp01(bands.bass);
  const treble = clamp01(bands.treble);
  const onset = clamp01(bands.onset);
  const ballOnly = options?.ballOnly === true;
  const ballWorld = clampDiscoBallPos(
    options?.ballPos?.x ?? DEFAULT_DISCO_BALL_X,
    options?.ballPos?.y ?? DEFAULT_DISCO_BALL_Y,
  );

  ctx.save();

  // Music-reactive disco ball (scale + brightness pulse).
  const ball = worldToScreen(cam, w, h, ballWorld.x, ballWorld.y);
  const pulse =
    1 + energy * 0.35 + bass * 0.45 + onset * 0.55;
  const ballR = Math.max(16, cam.zoom * 0.7) * pulse;
  const glowR = ballR * (1.35 + onset * 0.5);

  const halo = ctx.createRadialGradient(
    ball.x,
    ball.y,
    ballR * 0.2,
    ball.x,
    ball.y,
    glowR,
  );
  halo.addColorStop(
    0,
    `rgba(255, 255, 255, ${0.2 + energy * 0.25 + onset * 0.35})`,
  );
  halo.addColorStop(
    0.45,
    `hsla(${(timeSec * 80 + bass * 120) % 360}, 90%, 70%, ${0.12 + energy * 0.2})`,
  );
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ballR, 0, Math.PI * 2);
  const ballG = ctx.createRadialGradient(
    ball.x - ballR * 0.3,
    ball.y - ballR * 0.3,
    1,
    ball.x,
    ball.y,
    ballR,
  );
  ballG.addColorStop(0, `rgba(255,255,255,${0.65 + treble * 0.35 + onset * 0.2})`);
  ballG.addColorStop(0.45, `rgba(200, 220, 255, ${0.4 + energy * 0.4})`);
  ballG.addColorStop(1, `rgba(80, 90, 120, ${0.55 + bass * 0.25})`);
  ctx.fillStyle = ballG;
  ctx.fill();

  const speckCount = 18;
  for (let i = 0; i < speckCount; i++) {
    const ang = timeSec * (1.2 + i * 0.07) + i * 1.7;
    const dist = ballR * (1.05 + hash01(i + 3) * 1.6);
    const sx = ball.x + Math.cos(ang) * dist;
    const sy = ball.y + Math.sin(ang) * dist * 0.65;
    const a = 0.2 + treble * 0.45 * hash01(i + timeSec * 0.01) + onset * 0.25;
    ctx.fillStyle = `hsla(${(i * 40 + timeSec * 60) % 360}, 90%, 70%, ${a})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5 + treble * 2 + onset * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (!ballOnly) {
    // Side wall neon edge glow spanning the tall arena walls.
    for (const side of [-DISCO_WALL_X, DISCO_WALL_X] as const) {
      const a = worldToScreen(cam, w, h, side, 0);
      const b = worldToScreen(cam, w, h, side, DISCO_WALL_H * 0.75);
      ctx.strokeStyle = `hsla(${(timeSec * 50 + (side > 0 ? 180 : 0)) % 360}, 90%, 65%, ${0.35 + energy * 0.45})`;
      ctx.lineWidth = 3 + bass * 4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}
