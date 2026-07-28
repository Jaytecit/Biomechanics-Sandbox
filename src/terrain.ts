/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Obstacle } from './types';
import { AGENT_SPAWN_X, GROUND_Y, clampDifficulty } from './physicsConstants';

/** Flat pad at spawn so agents / hoop start stable. */
export const HOOP_SPAWN_PAD = 220;
/** Initial generated length (then extended endlessly ahead of the pack). */
export const TERRAIN_INITIAL_LENGTH = 1400;
/** How far ahead of the furthest agent to keep generating. */
export const TERRAIN_LOOKAHEAD = 1000;
export const TERRAIN_STEP = 28;

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic unit noise in [0,1) for a world-X bucket. */
function noise1(seed: number, bucket: number): number {
  return mulberry32((seed ^ Math.imul(bucket | 0, 2654435761)) >>> 0)();
}

/** Surface Y at world X from terrain segments; falls back to flat ground. */
export function sampleTerrainHeight(obstacles: Obstacle[], x: number): number {
  let best: number | null = null;
  for (const obs of obstacles) {
    if (obs.type !== 'terrain') continue;
    const x2 = obs.x2 ?? obs.x + obs.width;
    const y2 = obs.y2 ?? obs.y;
    if (x < obs.x - 0.5 || x > x2 + 0.5) continue;
    const t = x2 === obs.x ? 0 : (x - obs.x) / (x2 - obs.x);
    const y = obs.y + (y2 - obs.y) * Math.max(0, Math.min(1, t));
    if (best === null || y < best) best = y;
  }
  return best ?? GROUND_Y;
}

export function hasTerrain(obstacles: Obstacle[]): boolean {
  return obstacles.some(o => o.type === 'terrain');
}

export function terrainMaxX(obstacles: Obstacle[]): number {
  let maxX = AGENT_SPAWN_X - 40;
  for (const obs of obstacles) {
    if (obs.type !== 'terrain') continue;
    maxX = Math.max(maxX, obs.x2 ?? obs.x + obs.width);
  }
  return maxX;
}

/** Elevation (positive = hill above nominal ground) at world X. */
function elevationAt(x: number, seed: number, difficulty: number): number {
  const dist = x - AGENT_SPAWN_X;
  const d = clampDifficulty(difficulty);
  const ampScale = 0.85 + d * 0.35;
  const amp1 = 32 * ampScale;
  const amp2 = 18 * ampScale;
  const amp3 = 11 * ampScale;
  const freq1 = 0.0055;
  const freq2 = 0.013;
  const freq3 = 0.027;
  const phase1 = noise1(seed, 1) * Math.PI * 2;
  const phase2 = noise1(seed, 2) * Math.PI * 2;
  const phase3 = noise1(seed, 3) * Math.PI * 2;

  if (dist <= HOOP_SPAWN_PAD) {
    const t = Math.max(0, dist) / HOOP_SPAWN_PAD;
    return Math.sin(dist * freq1 + phase1) * amp1 * 0.08 * t;
  }

  const u = dist - HOOP_SPAWN_PAD;
  let elev =
    Math.sin(u * freq1 + phase1) * amp1 +
    Math.sin(u * freq2 + phase2) * amp2 +
    Math.sin(u * freq3 + phase3) * amp3 +
    Math.sin(u * 0.0032 + phase1) * 14 * ampScale;

  // Occasional steeper shelves past the pad (difficulty stretches amplitude)
  const shelf = noise1(seed, Math.floor(u / 180));
  if (shelf > 0.72) elev += (shelf - 0.72) * 90 * d;

  const maxElev = 55 + d * 35;
  return Math.max(-60 - d * 20, Math.min(maxElev, elev));
}

function appendTerrainSpan(
  obstacles: Obstacle[],
  seed: number,
  fromX: number,
  toX: number,
  difficulty: number,
  includeRocks: boolean
) {
  const d = clampDifficulty(difficulty);
  const samples: { x: number; y: number }[] = [];
  const start = Math.ceil(fromX / TERRAIN_STEP) * TERRAIN_STEP;
  // Ensure we include fromX if it isn't on the grid (join continuity)
  if (samples.length === 0 || samples[0].x > fromX + 0.1) {
    samples.push({ x: fromX, y: GROUND_Y - elevationAt(fromX, seed, d) });
  }
  for (let x = start; x <= toX; x += TERRAIN_STEP) {
    if (x <= fromX + 0.5) continue;
    samples.push({ x, y: GROUND_Y - elevationAt(x, seed, d) });
  }
  if (samples.length === 0 || samples[samples.length - 1].x < toX - 0.5) {
    samples.push({ x: toX, y: GROUND_Y - elevationAt(toX, seed, d) });
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    if (b.x - a.x < 1) continue;
    obstacles.push({
      type: 'terrain',
      x: a.x,
      y: a.y,
      x2: b.x,
      y2: b.y,
      width: b.x - a.x,
      height: Math.abs(b.y - a.y),
      label: 'ground',
    });
  }

  if (!includeRocks) return;

  // Higher difficulty → tighter spacing, larger rocks, more fill rate
  const rockSpacing = Math.max(28, Math.round(140 / (0.55 + d * 0.85)));
  const spawnChance = Math.min(0.92, 0.38 + d * 0.28);
  const firstBucket = Math.floor((Math.max(fromX, AGENT_SPAWN_X + HOOP_SPAWN_PAD) ) / rockSpacing);
  const lastBucket = Math.floor(toX / rockSpacing);
  for (let b = firstBucket; b <= lastBucket; b++) {
    const roll = noise1(seed, 1000 + b);
    if (roll > spawnChance) continue;
    const x = b * rockSpacing + noise1(seed, 2000 + b) * rockSpacing * 0.55;
    if (x < AGENT_SPAWN_X + HOOP_SPAWN_PAD + 30) continue;
    if (x < fromX || x > toX) continue;
    const surface = GROUND_Y - elevationAt(x, seed, d);
    const isBoulder = noise1(seed, 3000 + b) < 0.28 + d * 0.12;
    const sizeMul = 0.75 + d * 0.55;
    const w =
      (isBoulder ? 48 : 24) * 3 * sizeMul +
      noise1(seed, 4000 + b) * (isBoulder ? 36 : 20) * 3 * sizeMul;
    const h =
      (isBoulder ? 40 : 18) * 0.5 * sizeMul +
      noise1(seed, 5000 + b) * (isBoulder ? 32 : 18) * 0.5 * sizeMul;
    obstacles.push({
      type: 'box',
      x: x - w / 2,
      y: surface - h,
      width: w,
      height: h,
      label: isBoulder ? 'boulder' : 'rock',
    });
  }
}

/**
 * Seeded undulating heightfield. Rocks/boulders only when includeObstacles is true.
 * Spawn region stays nearly flat. Course extends via extendEndlessTerrain.
 */
export function buildHoopTerrain(
  seed = 42,
  difficulty = 1,
  includeObstacles = false
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const startX = AGENT_SPAWN_X - 40;
  const endX = AGENT_SPAWN_X + TERRAIN_INITIAL_LENGTH;
  appendTerrainSpan(obstacles, seed, startX, endX, difficulty, includeObstacles);
  return obstacles;
}

/**
 * Keep procedural terrain generated ahead of the furthest creature.
 * Mutates `obstacles` in place; returns true if segments were appended.
 */
export function extendEndlessTerrain(
  obstacles: Obstacle[],
  furthestX: number,
  seed = 42,
  difficulty = 1,
  includeObstacles = false
): boolean {
  if (!hasTerrain(obstacles)) return false;
  const maxX = terrainMaxX(obstacles);
  const needUntil = furthestX + TERRAIN_LOOKAHEAD;
  if (maxX >= needUntil) return false;

  const spanStart = maxX;
  const spanEnd = needUntil + TERRAIN_STEP;
  const before = obstacles.length;
  appendTerrainSpan(obstacles, seed, spanStart, spanEnd, difficulty, includeObstacles);
  return obstacles.length > before;
}

/** Place a distant finish for hoop-roll scoring (endless terrain continues past it). */
export function hoopFinishX(difficulty = 1): number {
  const d = clampDifficulty(difficulty);
  return AGENT_SPAWN_X + Math.round(2600 * d);
}

/** Inner hoop radius that fits a blueprint with margin. */
export function hoopInnerRadiusForBlueprint(
  relativePositions: { x: number; y: number }[],
  nodeRadii: number[]
): number {
  let comX = 0;
  let comY = 0;
  const n = relativePositions.length || 1;
  for (const p of relativePositions) {
    comX += p.x;
    comY += p.y;
  }
  comX /= n;
  comY /= n;
  let extent = 40;
  for (let i = 0; i < relativePositions.length; i++) {
    const p = relativePositions[i];
    const r = nodeRadii[i] ?? 8;
    extent = Math.max(extent, Math.hypot(p.x - comX, p.y - comY) + r);
  }
  return Math.max(70, Math.min(180, extent * 1.45 + 32));
}

/**
 * Sit boxes / bars / finishes on the heightfield when terrain is present.
 * Pits / ice / terrain segments are left alone.
 */
export function snapObstaclesToTerrain(obstacles: Obstacle[]) {
  if (!hasTerrain(obstacles)) return;
  for (const obs of obstacles) {
    if (
      obs.type !== 'box' &&
      obs.type !== 'bar' &&
      obs.type !== 'finish' &&
      obs.type !== 'checkpoint' &&
      obs.type !== 'ramp' &&
      obs.type !== 'target'
    ) {
      continue;
    }
    // Rocks already placed on terrain
    if (obs.label === 'rock' || obs.label === 'boulder') continue;

    const midX = obs.x + (obs.type === 'target' ? 0 : obs.width / 2);
    const surface = sampleTerrainHeight(obstacles, midX);
    if (obs.type === 'ramp') {
      // Keep ramp geometry; only shift so the low end meets the local surface
      const lift = surface - GROUND_Y;
      obs.y += lift;
      continue;
    }
    if (obs.type === 'bar' || obs.type === 'target') {
      const clear = obs.barClearHeight ?? obs.targetRadius ?? obs.height;
      obs.y = surface - clear;
      continue;
    }
    if (obs.type === 'finish' || obs.type === 'checkpoint') {
      obs.y = surface - obs.height;
      continue;
    }
    // box / platform: bottom on surface
    obs.y = surface - obs.height;
  }
}
