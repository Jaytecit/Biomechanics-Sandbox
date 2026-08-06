/**
 * G3 / C2.3 — deterministic terrain sampling & authoring helpers.
 * No unseeded randomness (safe for eval / obs paths).
 */
import {
  TERRAIN_GRADE_SCALE,
  TERRAIN_MAX_AMPLITUDE,
  TERRAIN_MAX_SAMPLES,
  TERRAIN_MAX_WIDTH,
  TERRAIN_MIN_SAMPLES,
  TERRAIN_MIN_WIDTH,
} from '../physics/constants';
import type { EnvTerrain } from './types';

export function clampTerrain(terrain: EnvTerrain): EnvTerrain {
  let startX = Number.isFinite(terrain.startX) ? terrain.startX : 0;
  let endX = Number.isFinite(terrain.endX) ? terrain.endX : startX + TERRAIN_MIN_WIDTH;
  if (endX < startX) {
    const t = startX;
    startX = endX;
    endX = t;
  }
  const width = Math.min(
    TERRAIN_MAX_WIDTH,
    Math.max(TERRAIN_MIN_WIDTH, endX - startX),
  );
  endX = startX + width;
  const amplitude = Math.min(
    TERRAIN_MAX_AMPLITUDE,
    Math.max(0, Number.isFinite(terrain.amplitude) ? terrain.amplitude : 0),
  );
  const raw = terrain.samples.filter((s) => Number.isFinite(s));
  const n = Math.min(
    TERRAIN_MAX_SAMPLES,
    Math.max(TERRAIN_MIN_SAMPLES, raw.length || TERRAIN_MIN_SAMPLES),
  );
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i < raw.length) samples.push(raw[i]);
    else samples.push(0);
  }
  return { startX, endX, samples, amplitude };
}

/** World-space surface Y at x (0 outside span / empty). */
export function sampleTerrainHeight(terrain: EnvTerrain | null | undefined, x: number): number {
  if (!terrain || terrain.samples.length < 2) return 0;
  const t = clampTerrain(terrain);
  if (x <= t.startX || x >= t.endX) return 0;
  const u = (x - t.startX) / (t.endX - t.startX);
  const maxI = t.samples.length - 1;
  const f = u * maxI;
  const i0 = Math.floor(f);
  const i1 = Math.min(maxI, i0 + 1);
  const frac = f - i0;
  const s0 = t.samples[i0];
  const s1 = t.samples[i1];
  return Math.max(0, (s0 + (s1 - s0) * frac) * t.amplitude);
}

/** Approximate dy/dx at x, scaled for observations. */
export function sampleTerrainGrade(terrain: EnvTerrain | null | undefined, x: number): number {
  if (!terrain || terrain.samples.length < 2) return 0;
  const t = clampTerrain(terrain);
  const dx = Math.max(0.05, (t.endX - t.startX) / (t.samples.length - 1));
  const y1 = sampleTerrainHeight(t, x - dx);
  const y2 = sampleTerrainHeight(t, x + dx);
  const grade = (y2 - y1) / (2 * dx);
  return grade / TERRAIN_GRADE_SCALE;
}

/** Heights buffer for Rapier (already amplitude-scaled, ≥ 0). */
export function terrainHeightsForRapier(terrain: EnvTerrain): {
  heights: Float32Array;
  startX: number;
  endX: number;
  midX: number;
  width: number;
} {
  const t = clampTerrain(terrain);
  const heights = new Float32Array(t.samples.length);
  for (let i = 0; i < t.samples.length; i++) {
    heights[i] = Math.max(0, t.samples[i] * t.amplitude);
  }
  const width = t.endX - t.startX;
  const midX = (t.startX + t.endX) / 2;
  return { heights, startX: t.startX, endX: t.endX, midX, width };
}

export function terrainPolyline(terrain: EnvTerrain): { x: number; y: number }[] {
  const t = clampTerrain(terrain);
  const n = t.samples.length;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const x = t.startX + u * (t.endX - t.startX);
    pts.push({ x, y: Math.max(0, t.samples[i] * t.amplitude) });
  }
  return pts;
}

/** Deterministic sine hills for Environment Studio (no Math.random). */
export function makeSineTerrain(opts?: {
  startX?: number;
  endX?: number;
  sampleCount?: number;
  amplitude?: number;
  waves?: number;
}): EnvTerrain {
  const startX = opts?.startX ?? 0;
  const endX = opts?.endX ?? 40;
  const n = Math.min(
    TERRAIN_MAX_SAMPLES,
    Math.max(TERRAIN_MIN_SAMPLES, opts?.sampleCount ?? 41),
  );
  const amplitude = opts?.amplitude ?? 1.2;
  const waves = opts?.waves ?? 2.5;
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    // Unitless [0, 1] profile; amplitude applied at spawn/sample time.
    samples.push(0.5 + 0.45 * Math.sin(u * Math.PI * 2 * waves));
  }
  return clampTerrain({ startX, endX, samples, amplitude });
}

export function resampleTerrain(terrain: EnvTerrain, sampleCount: number): EnvTerrain {
  const t = clampTerrain(terrain);
  const n = Math.min(
    TERRAIN_MAX_SAMPLES,
    Math.max(TERRAIN_MIN_SAMPLES, Math.floor(sampleCount)),
  );
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1);
    const x = t.startX + u * (t.endX - t.startX);
    const h = sampleTerrainHeight(t, x);
    samples.push(t.amplitude > 1e-9 ? h / t.amplitude : 0);
  }
  return clampTerrain({ ...t, samples });
}
