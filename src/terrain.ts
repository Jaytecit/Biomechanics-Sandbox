/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Obstacle } from './types';
import {
  AGENT_SPAWN_X,
  GROUND_Y,
  HOOP_FINISH_OFFSET_BASE,
  HOOP_FINISH_OFFSET_MAX,
  clampDifficulty,
} from './physicsConstants';

/** Flat pad at spawn so agents / hoop start stable. */
export const HOOP_SPAWN_PAD = 220;
/** Initial generated length ahead of spawn (then extended endlessly with the pack). */
export const TERRAIN_INITIAL_LENGTH = 1400;
/** Initial generated length behind spawn. */
export const TERRAIN_INITIAL_BACK_LENGTH = 800;
/** How far ahead of the furthest agent to keep generating. */
export const TERRAIN_LOOKAHEAD = 1000;
/** How far behind the leftmost agent to keep generating. */
export const TERRAIN_LOOKBEHIND = 1000;
export const TERRAIN_STEP = 28;
/** Canvas sampling step for procedural terrain (viewport only). */
export const TERRAIN_RENDER_STEP = 24;

export const PROCEDURAL_TERRAIN_LABEL = 'procedural';

export interface ProceduralTerrainInfo {
  seed: number;
  difficulty: number;
  leftX: number;
  rightX: number;
  marker: Obstacle;
}

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

function isProceduralMarker(obs: Obstacle): boolean {
  return obs.type === 'terrain' && obs.label === PROCEDURAL_TERRAIN_LABEL;
}

function isAuthoredTerrainSegment(obs: Obstacle): boolean {
  return obs.type === 'terrain' && !isProceduralMarker(obs);
}

/** Procedural heightfield marker, if present. */
export function parseProceduralTerrain(obstacles: Obstacle[]): ProceduralTerrainInfo | null {
  const marker = obstacles.find(isProceduralMarker);
  if (!marker || marker.terrainSeed === undefined) return null;
  const leftX = marker.terrainLeftX ?? marker.x;
  const rightX = marker.terrainRightX ?? marker.x + marker.width;
  return {
    seed: marker.terrainSeed,
    difficulty: marker.terrainDifficulty ?? 1,
    leftX,
    rightX,
    marker,
  };
}

/** Elevation (positive = hill above nominal ground) at world X. */
export function proceduralTerrainElevation(x: number, seed: number, difficulty: number): number {
  const dist = x - AGENT_SPAWN_X;
  const absDist = Math.abs(dist);
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

  if (absDist <= HOOP_SPAWN_PAD) {
    const t = absDist / HOOP_SPAWN_PAD;
    return Math.sin(dist * freq1 + phase1) * amp1 * 0.08 * t;
  }

  const u = absDist - HOOP_SPAWN_PAD;
  let elev =
    Math.sin(u * freq1 + phase1) * amp1 +
    Math.sin(u * freq2 + phase2) * amp2 +
    Math.sin(u * freq3 + phase3) * amp3 +
    Math.sin(u * 0.0032 + phase1) * 14 * ampScale;

  const shelf = noise1(seed, Math.floor(u / 180));
  if (shelf > 0.72) elev += (shelf - 0.72) * 90 * d;

  const maxElev = 55 + d * 35;
  return Math.max(-60 - d * 20, Math.min(maxElev, elev));
}

/** Surface Y at world X for procedural terrain (O(1)). */
export function proceduralTerrainSurfaceY(x: number, seed: number, difficulty: number): number {
  return GROUND_Y - proceduralTerrainElevation(x, seed, difficulty);
}

function sampleAuthoredTerrainHeight(obstacles: Obstacle[], x: number): number | null {
  let best: number | null = null;
  for (const obs of obstacles) {
    if (!isAuthoredTerrainSegment(obs)) continue;
    const x2 = obs.x2 ?? obs.x + obs.width;
    const y2 = obs.y2 ?? obs.y;
    if (x < obs.x - 0.5 || x > x2 + 0.5) continue;
    const t = x2 === obs.x ? 0 : (x - obs.x) / (x2 - obs.x);
    const y = obs.y + (y2 - obs.y) * Math.max(0, Math.min(1, t));
    if (best === null || y < best) best = y;
  }
  return best;
}

/** Surface Y at world X; procedural fields are O(1), authored segments are scanned. */
export function sampleTerrainHeight(obstacles: Obstacle[], x: number): number {
  const proc = parseProceduralTerrain(obstacles);
  const authored = sampleAuthoredTerrainHeight(obstacles, x);
  const procedural =
    proc === null ? null : proceduralTerrainSurfaceY(x, proc.seed, proc.difficulty);
  if (procedural === null) return authored ?? GROUND_Y;
  if (authored === null) return procedural;
  return Math.min(procedural, authored);
}

export function hasTerrain(obstacles: Obstacle[]): boolean {
  return obstacles.some(o => o.type === 'terrain');
}

export function terrainMaxX(obstacles: Obstacle[]): number {
  const proc = parseProceduralTerrain(obstacles);
  if (proc) return proc.rightX;
  let maxX = AGENT_SPAWN_X - 40;
  for (const obs of obstacles) {
    if (!isAuthoredTerrainSegment(obs)) continue;
    maxX = Math.max(maxX, obs.x2 ?? obs.x + obs.width);
  }
  return maxX;
}

export function terrainMinX(obstacles: Obstacle[]): number {
  const proc = parseProceduralTerrain(obstacles);
  if (proc) return proc.leftX;
  let minX = AGENT_SPAWN_X + TERRAIN_INITIAL_LENGTH;
  for (const obs of obstacles) {
    if (!isAuthoredTerrainSegment(obs)) continue;
    minX = Math.min(minX, obs.x);
  }
  return minX;
}

function syncProceduralMarkerBounds(marker: Obstacle, leftX: number, rightX: number) {
  marker.terrainLeftX = leftX;
  marker.terrainRightX = rightX;
  marker.x = leftX;
  marker.width = Math.max(0, rightX - leftX);
}

function appendTerrainRocks(
  obstacles: Obstacle[],
  seed: number,
  fromX: number,
  toX: number,
  difficulty: number
) {
  const d = clampDifficulty(difficulty);
  const rockSpacing = Math.max(28, Math.round(140 / (0.55 + d * 0.85)));
  const spawnChance = Math.min(0.92, 0.38 + d * 0.28);
  const firstBucket = Math.floor(Math.max(fromX, AGENT_SPAWN_X + HOOP_SPAWN_PAD) / rockSpacing);
  const lastBucket = Math.floor(toX / rockSpacing);
  for (let b = firstBucket; b <= lastBucket; b++) {
    const roll = noise1(seed, 1000 + b);
    if (roll > spawnChance) continue;
    const x = b * rockSpacing + noise1(seed, 2000 + b) * rockSpacing * 0.55;
    if (x < AGENT_SPAWN_X + HOOP_SPAWN_PAD + 30) continue;
    if (x < fromX || x > toX) continue;
    const surface = GROUND_Y - proceduralTerrainElevation(x, seed, d);
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

/** Legacy authored segment span (Environment Studio hand-placed terrain). */
function appendAuthoredTerrainSpan(
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
  if (samples.length === 0 || samples[0].x > fromX + 0.1) {
    samples.push({ x: fromX, y: proceduralTerrainSurfaceY(fromX, seed, d) });
  }
  for (let x = start; x <= toX; x += TERRAIN_STEP) {
    if (x <= fromX + 0.5) continue;
    samples.push({ x, y: proceduralTerrainSurfaceY(x, seed, d) });
  }
  if (samples.length === 0 || samples[samples.length - 1].x < toX - 0.5) {
    samples.push({ x: toX, y: proceduralTerrainSurfaceY(toX, seed, d) });
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

  if (includeRocks) appendTerrainRocks(obstacles, seed, fromX, toX, d);
}

function makeProceduralTerrainMarker(
  seed: number,
  difficulty: number,
  leftX: number,
  rightX: number
): Obstacle {
  return {
    type: 'terrain',
    x: leftX,
    y: GROUND_Y,
    width: rightX - leftX,
    height: 0,
    label: PROCEDURAL_TERRAIN_LABEL,
    terrainSeed: seed,
    terrainDifficulty: clampDifficulty(difficulty),
    terrainLeftX: leftX,
    terrainRightX: rightX,
  };
}

/**
 * Seeded undulating heightfield via one marker obstacle (O(1) physics sampling).
 * Rocks/boulders only when includeObstacles is true. Course extends via extendEndlessTerrain.
 */
export function buildHoopTerrain(
  seed = 42,
  difficulty = 1,
  includeObstacles = false
): Obstacle[] {
  const d = clampDifficulty(difficulty);
  const leftX = AGENT_SPAWN_X - TERRAIN_INITIAL_BACK_LENGTH;
  const rightX = AGENT_SPAWN_X + TERRAIN_INITIAL_LENGTH;
  const obstacles: Obstacle[] = [makeProceduralTerrainMarker(seed, d, leftX, rightX)];
  if (includeObstacles) appendTerrainRocks(obstacles, seed, leftX, rightX, d);
  return obstacles;
}

export interface TerrainPackBounds {
  leftX: number;
  rightX: number;
}

/**
 * Keep procedural terrain generated around the pack in both directions.
 * Mutates `obstacles` in place; returns true if bounds or rocks were extended.
 */
export function extendEndlessTerrain(
  obstacles: Obstacle[],
  packBounds: TerrainPackBounds,
  seed = 42,
  difficulty = 1,
  includeObstacles = false
): boolean {
  if (!hasTerrain(obstacles)) return false;
  const proc = parseProceduralTerrain(obstacles);
  if (proc) {
    const before = obstacles.length;
    const d = clampDifficulty(difficulty);
    let leftX = proc.leftX;
    let rightX = proc.rightX;

    const needUntil = packBounds.rightX + TERRAIN_LOOKAHEAD;
    if (rightX < needUntil) {
      const nextRight = needUntil + TERRAIN_STEP;
      if (includeObstacles) appendTerrainRocks(obstacles, proc.seed, rightX, nextRight, d);
      rightX = nextRight;
    }

    const needFrom = packBounds.leftX - TERRAIN_LOOKBEHIND;
    if (leftX > needFrom) {
      const nextLeft = needFrom - TERRAIN_STEP;
      if (includeObstacles) appendTerrainRocks(obstacles, proc.seed, nextLeft, leftX, d);
      leftX = nextLeft;
    }

    if (leftX !== proc.leftX || rightX !== proc.rightX) {
      syncProceduralMarkerBounds(proc.marker, leftX, rightX);
    }
    return obstacles.length > before || leftX !== proc.leftX || rightX !== proc.rightX;
  }

  const before = obstacles.length;
  const maxX = terrainMaxX(obstacles);
  const needUntil = packBounds.rightX + TERRAIN_LOOKAHEAD;
  if (maxX < needUntil) {
    appendAuthoredTerrainSpan(
      obstacles,
      seed,
      maxX,
      needUntil + TERRAIN_STEP,
      difficulty,
      includeObstacles
    );
  }

  const minX = terrainMinX(obstacles);
  const needFrom = packBounds.leftX - TERRAIN_LOOKBEHIND;
  if (minX > needFrom) {
    appendAuthoredTerrainSpan(
      obstacles,
      seed,
      needFrom - TERRAIN_STEP,
      minX,
      difficulty,
      includeObstacles
    );
  }

  return obstacles.length > before;
}

/** Place a distant finish for hoop-roll scoring (endless terrain continues past it). */
export function hoopFinishX(difficulty = 1, tier = 0): number {
  const d = clampDifficulty(difficulty);
  const t = Math.max(0, tier);
  const prog = 1 + t * 0.12;
  const span = HOOP_FINISH_OFFSET_MAX - HOOP_FINISH_OFFSET_BASE;
  const offset =
    t <= 0
      ? HOOP_FINISH_OFFSET_BASE
      : Math.round(HOOP_FINISH_OFFSET_BASE + span * Math.min(1, t / 4));
  return AGENT_SPAWN_X + Math.round(offset * d * (t > 0 ? prog : 1));
}

/** Extend procedural terrain through `targetX` so finish/checkpoints snap correctly. */
export function ensureTerrainToX(
  obstacles: Obstacle[],
  targetX: number,
  seed = 42,
  difficulty = 1,
  includeObstacles = false
): boolean {
  if (!hasTerrain(obstacles)) return false;
  const proc = parseProceduralTerrain(obstacles);
  const needUntil = targetX + TERRAIN_LOOKAHEAD;
  if (proc) {
    if (proc.rightX >= needUntil) return false;
    const before = obstacles.length;
    const d = clampDifficulty(difficulty);
    if (includeObstacles) {
      appendTerrainRocks(obstacles, proc.seed, proc.rightX, needUntil + TERRAIN_STEP, d);
    }
    syncProceduralMarkerBounds(proc.marker, proc.leftX, needUntil + TERRAIN_STEP);
    return obstacles.length > before || proc.rightX !== needUntil + TERRAIN_STEP;
  }

  const maxX = terrainMaxX(obstacles);
  if (maxX >= needUntil) return false;
  const before = obstacles.length;
  appendAuthoredTerrainSpan(
    obstacles,
    seed,
    maxX,
    needUntil + TERRAIN_STEP,
    difficulty,
    includeObstacles
  );
  return obstacles.length > before;
}

function finishCourseMaxX(obstacles: Obstacle[]): number {
  let maxX = AGENT_SPAWN_X + TERRAIN_INITIAL_LENGTH;
  for (const obs of obstacles) {
    if (obs.type === 'finish' || obs.type === 'checkpoint') {
      maxX = Math.max(maxX, obs.x + (obs.width ?? 0));
    }
  }
  return maxX;
}

/** Extend terrain through the furthest finish/checkpoint before snapping course props. */
export function ensureTerrainForFinishCourse(
  obstacles: Obstacle[],
  seed = 42,
  difficulty = 1,
  includeObstacles = false
): boolean {
  return ensureTerrainToX(
    obstacles,
    finishCourseMaxX(obstacles),
    seed,
    difficulty,
    includeObstacles
  );
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
    if (obs.label === 'rock' || obs.label === 'boulder') continue;

    const midX = obs.x + obs.width / 2;
    const surface = sampleTerrainHeight(obstacles, midX);
    if (obs.type === 'ramp') {
      const lift = surface - GROUND_Y;
      obs.y += lift;
      continue;
    }
    if (obs.type === 'bar' || obs.type === 'target') {
      const clear = obs.barClearHeight ?? obs.targetRadius ?? obs.height;
      if (obs.type === 'target') {
        const r = obs.targetRadius ?? obs.height / 2;
        obs.y = surface - clear - r;
      } else {
        obs.y = surface - clear;
      }
      continue;
    }
    // Preserve the authored elevation above the flat floor. Seating every box
    // on the local surface (`surface - height`) flattened elevated pads,
    // beams, and landing platforms onto the terrain whenever terrain was
    // enabled — e.g. Balance Beam decks lost their pit clearance.
    obs.y += surface - GROUND_Y;
  }
}
