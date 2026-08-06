/**
 * Environment Studio edit ops — design footprints, hit-test, move/resize.
 */
import {
  OBSTACLE_MAX_SIZE,
  OBSTACLE_MIN_SIZE,
  TERRAIN_MAX_WIDTH,
  TERRAIN_MIN_WIDTH,
} from '../physics/constants';
import {
  clampCourseMarker,
  defaultCourseMarker,
  nextCheckpointOrder,
} from '../brain/courseMarkers';
import {
  clampScoreRegion,
  defaultScoreRegion,
} from '../brain/scoreRegions';
import { clampTower, defaultTower } from '../physics/tower';
import { defaultObstacle } from '../physics/obstacles';
import { clampTerrain, sampleTerrainHeight } from './terrainMath';
import {
  clampSpawn,
  defaultSpawn,
  resolveSpawn,
  type EnvironmentDesign,
  type CourseMarkerKind,
  type EnvCourseMarker,
  type EnvObstacle,
  type EnvScoreRegion,
  type EnvSpawn,
  type EnvTerrain,
  type EnvTower,
  type ObstacleKind,
  type ScoreRegionKind,
} from './types';
import type { EnvSelection } from './envSelection';

/** Hit radius for the spawn marker (world units). */
export const SPAWN_HIT_RADIUS = 0.45;
/** Hit radius for terrain start/end handles (world units). */
export const TERRAIN_HANDLE_HIT_R = 0.4;

export interface Footprint {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  rot: number;
}

function clampSize(v: number): number {
  if (!Number.isFinite(v)) return OBSTACLE_MIN_SIZE;
  return Math.min(OBSTACLE_MAX_SIZE, Math.max(OBSTACLE_MIN_SIZE, Math.abs(v)));
}

export function obstacleFootprint(o: EnvObstacle): Footprint {
  switch (o.kind) {
    case 'box':
    case 'ramp':
      return {
        cx: o.x,
        cy: o.y,
        hw: clampSize(o.w) / 2,
        hh: clampSize(o.h) / 2,
        rot: o.rot ?? 0,
      };
    case 'stair':
      return {
        cx: o.x + clampSize(o.w) / 2,
        cy: o.y + clampSize(o.h) / 2,
        hw: clampSize(o.w) / 2,
        hh: clampSize(o.h) / 2,
        rot: 0,
      };
    case 'pit': {
      const gap = clampSize(o.w);
      const wallH = clampSize(o.h);
      const platformW = Math.max(2, gap);
      const totalW = gap + 2 * platformW;
      return {
        cx: o.x,
        cy: o.y + wallH / 2,
        hw: totalW / 2,
        hh: wallH / 2,
        rot: 0,
      };
    }
    case 'loop': {
      const r = clampSize(Math.max(o.w, o.h)) / 2;
      return { cx: o.x, cy: o.y, hw: r, hh: r, rot: 0 };
    }
    default:
      return { cx: o.x, cy: o.y, hw: 0.5, hh: 0.5, rot: 0 };
  }
}

export function towerFootprint(tower: EnvTower): Footprint {
  const t = clampTower(tower);
  return {
    cx: t.x,
    cy: t.height / 2,
    hw: t.baseW / 2,
    hh: t.height / 2,
    rot: 0,
  };
}

export function regionFootprint(r: EnvScoreRegion): Footprint {
  const c = clampScoreRegion(r);
  return {
    cx: c.x,
    cy: c.y,
    hw: c.w / 2,
    hh: c.h / 2,
    rot: 0,
  };
}

export function markerFootprint(m: EnvCourseMarker): Footprint {
  const c = clampCourseMarker(m);
  return {
    cx: c.x,
    cy: c.y,
    hw: c.w / 2,
    hh: c.h / 2,
    rot: 0,
  };
}

/** World point → local footprint coords (origin at center, +x right, +y up). */
export function worldToLocal(
  wx: number,
  wy: number,
  fp: Footprint,
): { lx: number; ly: number } {
  const dx = wx - fp.cx;
  const dy = wy - fp.cy;
  const c = Math.cos(fp.rot);
  const s = Math.sin(fp.rot);
  return { lx: dx * c + dy * s, ly: -dx * s + dy * c };
}

export function localToWorld(
  lx: number,
  ly: number,
  fp: Footprint,
): { x: number; y: number } {
  const c = Math.cos(fp.rot);
  const s = Math.sin(fp.rot);
  return {
    x: fp.cx + lx * c - ly * s,
    y: fp.cy + lx * s + ly * c,
  };
}

export function pointInFootprint(
  wx: number,
  wy: number,
  fp: Footprint,
  pad = 0,
): boolean {
  const { lx, ly } = worldToLocal(wx, wy, fp);
  return (
    Math.abs(lx) <= fp.hw + pad && Math.abs(ly) <= fp.hh + pad
  );
}

export type HandleId =
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'rotate'
  | 'towerLeft'
  | 'towerRight'
  | 'towerTop'
  | 'terrainStart'
  | 'terrainEnd';

export type TerrainEndpoint = 'start' | 'end';

export function handleWorldPos(
  fp: Footprint,
  id: HandleId,
): { x: number; y: number } {
  switch (id) {
    case 'nw':
      return localToWorld(-fp.hw, fp.hh, fp);
    case 'ne':
      return localToWorld(fp.hw, fp.hh, fp);
    case 'sw':
      return localToWorld(-fp.hw, -fp.hh, fp);
    case 'se':
      return localToWorld(fp.hw, -fp.hh, fp);
    case 'rotate':
      return localToWorld(0, fp.hh + Math.max(0.35, fp.hh * 0.25), fp);
    case 'towerLeft':
      return { x: fp.cx - fp.hw, y: fp.cy };
    case 'towerRight':
      return { x: fp.cx + fp.hw, y: fp.cy };
    case 'towerTop':
      return { x: fp.cx, y: fp.cy + fp.hh };
    case 'terrainStart':
    case 'terrainEnd':
      return { x: fp.cx, y: fp.cy };
    default:
      return { x: fp.cx, y: fp.cy };
  }
}

export function terrainEndpointWorld(
  terrain: EnvTerrain,
  which: TerrainEndpoint,
): { x: number; y: number } {
  const t = clampTerrain(terrain);
  const x = which === 'start' ? t.startX : t.endX;
  const y = sampleTerrainHeight(t, x + (which === 'start' ? 1e-3 : -1e-3));
  return { x, y: Math.max(0.15, y) };
}

export function hitTerrainEndpoint(
  terrain: EnvTerrain | undefined,
  wx: number,
  wy: number,
  radius = TERRAIN_HANDLE_HIT_R,
): TerrainEndpoint | null {
  if (!terrain || terrain.samples.length < 2) return null;
  let best: TerrainEndpoint | null = null;
  let bestD = radius;
  for (const which of ['start', 'end'] as const) {
    const p = terrainEndpointWorld(terrain, which);
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < bestD) {
      bestD = d;
      best = which;
    }
  }
  return best;
}

/** Drag start/end X; keeps the sample profile (unitless) and clamps width. */
export function setTerrainEndpoint(
  terrain: EnvTerrain,
  which: TerrainEndpoint,
  x: number,
): EnvTerrain {
  const t = clampTerrain(terrain);
  const nx = Number.isFinite(x) ? x : which === 'start' ? t.startX : t.endX;
  if (which === 'start') {
    let startX = nx;
    let endX = t.endX;
    if (endX - startX < TERRAIN_MIN_WIDTH) endX = startX + TERRAIN_MIN_WIDTH;
    if (endX - startX > TERRAIN_MAX_WIDTH) endX = startX + TERRAIN_MAX_WIDTH;
    return clampTerrain({ ...t, startX, endX });
  }
  let endX = nx;
  let startX = t.startX;
  if (endX - startX < TERRAIN_MIN_WIDTH) startX = endX - TERRAIN_MIN_WIDTH;
  if (endX - startX > TERRAIN_MAX_WIDTH) startX = endX - TERRAIN_MAX_WIDTH;
  return clampTerrain({ ...t, startX, endX });
}

export function hitHandle(
  wx: number,
  wy: number,
  fp: Footprint,
  handles: HandleId[],
  radius: number,
): HandleId | null {
  let best: HandleId | null = null;
  let bestD = radius;
  for (const id of handles) {
    const p = handleWorldPos(fp, id);
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function selectionFootprint(
  env: EnvironmentDesign,
  sel: EnvSelection,
): Footprint | null {
  if (!sel) return null;
  if (sel.kind === 'spawn') {
    const s = resolveSpawn(env);
    return {
      cx: s.x,
      cy: s.y,
      hw: SPAWN_HIT_RADIUS,
      hh: SPAWN_HIT_RADIUS,
      rot: 0,
    };
  }
  if (sel.kind === 'terrain' && env.terrain) {
    const t = clampTerrain(env.terrain);
    const mid = (t.startX + t.endX) / 2;
    const hw = (t.endX - t.startX) / 2;
    const peak = Math.max(
      sampleTerrainHeight(t, t.startX + 1e-3),
      sampleTerrainHeight(t, mid),
      sampleTerrainHeight(t, t.endX - 1e-3),
      0.5,
    );
    return { cx: mid, cy: peak / 2, hw, hh: peak / 2, rot: 0 };
  }
  if (sel.kind === 'tower') {
    return env.tower ? towerFootprint(env.tower) : null;
  }
  if (sel.kind === 'region') {
    const r = (env.regions ?? []).find((x) => x.id === sel.id);
    return r ? regionFootprint(r) : null;
  }
  if (sel.kind === 'marker') {
    const m = (env.markers ?? []).find((x) => x.id === sel.id);
    return m ? markerFootprint(m) : null;
  }
  if (sel.kind !== 'obstacle') return null;
  const o = env.obstacles.find((x) => x.id === sel.id);
  return o ? obstacleFootprint(o) : null;
}

export function hitTestEnv(
  env: EnvironmentDesign,
  wx: number,
  wy: number,
): EnvSelection {
  const spawn = resolveSpawn(env);
  if (Math.hypot(wx - spawn.x, wy - spawn.y) <= SPAWN_HIT_RADIUS) {
    return { kind: 'spawn' };
  }
  if (hitTerrainEndpoint(env.terrain, wx, wy)) {
    return { kind: 'terrain' };
  }
  // Prefer topmost / last markers, then regions, then obstacles, then tower.
  const markers = env.markers ?? [];
  for (let i = markers.length - 1; i >= 0; i--) {
    const m = markers[i];
    if (pointInFootprint(wx, wy, markerFootprint(m), 0.08)) {
      return { kind: 'marker', id: m.id };
    }
  }
  const regions = env.regions ?? [];
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (pointInFootprint(wx, wy, regionFootprint(r), 0.08)) {
      return { kind: 'region', id: r.id };
    }
  }
  for (let i = env.obstacles.length - 1; i >= 0; i--) {
    const o = env.obstacles[i];
    if (pointInFootprint(wx, wy, obstacleFootprint(o), 0.08)) {
      return { kind: 'obstacle', id: o.id };
    }
  }
  if (env.tower && pointInFootprint(wx, wy, towerFootprint(env.tower), 0.08)) {
    return { kind: 'tower' };
  }
  return null;
}

export function moveObstacle(
  o: EnvObstacle,
  dx: number,
  dy: number,
): EnvObstacle {
  return { ...o, x: o.x + dx, y: o.y + dy };
}

export function moveRegion(
  r: EnvScoreRegion,
  dx: number,
  dy: number,
): EnvScoreRegion {
  return clampScoreRegion({ ...r, x: r.x + dx, y: r.y + dy });
}

export function moveMarker(
  m: EnvCourseMarker,
  dx: number,
  dy: number,
): EnvCourseMarker {
  return clampCourseMarker({ ...m, x: m.x + dx, y: m.y + dy });
}

export function moveTower(tower: EnvTower, dx: number): EnvTower {
  return clampTower({ ...tower, x: tower.x + dx });
}

export function moveSpawn(spawn: EnvSpawn, dx: number, dy: number): EnvSpawn {
  return clampSpawn({ x: spawn.x + dx, y: spawn.y + dy });
}

export function placeSpawnAt(wx: number, wy: number): EnvSpawn {
  return clampSpawn({ x: wx, y: Math.max(0, wy) });
}

/** Resize footprint keeping the opposite corner fixed (world). */
export function resizeObstacleByCorner(
  o: EnvObstacle,
  handle: 'nw' | 'ne' | 'sw' | 'se',
  wx: number,
  wy: number,
): EnvObstacle {
  const fp = obstacleFootprint(o);
  const opposite: Record<'nw' | 'ne' | 'sw' | 'se', 'nw' | 'ne' | 'sw' | 'se'> =
    {
      nw: 'se',
      ne: 'sw',
      sw: 'ne',
      se: 'nw',
    };
  const fixed = handleWorldPos(fp, opposite[handle]);
  const localPtr = worldToLocal(wx, wy, fp);
  const localFix = worldToLocal(fixed.x, fixed.y, fp);

  const minHalf = OBSTACLE_MIN_SIZE / 2;
  let x0 = Math.min(localPtr.lx, localFix.lx);
  let x1 = Math.max(localPtr.lx, localFix.lx);
  let y0 = Math.min(localPtr.ly, localFix.ly);
  let y1 = Math.max(localPtr.ly, localFix.ly);
  if (x1 - x0 < OBSTACLE_MIN_SIZE) {
    const mid = (x0 + x1) / 2;
    x0 = mid - minHalf;
    x1 = mid + minHalf;
  }
  if (y1 - y0 < OBSTACLE_MIN_SIZE) {
    const mid = (y0 + y1) / 2;
    y0 = mid - minHalf;
    y1 = mid + minHalf;
  }
  const newHw = Math.min(OBSTACLE_MAX_SIZE / 2, (x1 - x0) / 2);
  const newHh = Math.min(OBSTACLE_MAX_SIZE / 2, (y1 - y0) / 2);
  const localCx = (x0 + x1) / 2;
  const localCy = (y0 + y1) / 2;
  const center = localToWorld(localCx, localCy, fp);
  const w = newHw * 2;
  const h = newHh * 2;

  switch (o.kind) {
    case 'box':
    case 'ramp':
      return { ...o, x: center.x, y: center.y, w, h };
    case 'stair':
      return {
        ...o,
        x: center.x - w / 2,
        y: center.y - h / 2,
        w,
        h,
      };
    case 'pit': {
      // Keep gap ≈ w of footprint interior; map footprint width back to gap.
      // Footprint totalW = gap + 2*max(2,gap). Invert approximately: use w as gap.
      return {
        ...o,
        x: center.x,
        y: Math.max(0, center.y - h / 2),
        w: clampSize(w * 0.35),
        h,
      };
    }
    case 'loop': {
      const side = Math.max(w, h);
      return { ...o, x: center.x, y: center.y, w: side, h: side };
    }
    default:
      return o;
  }
}

export function rotateObstacle(o: EnvObstacle, wx: number, wy: number): EnvObstacle {
  if (o.kind !== 'box' && o.kind !== 'ramp') return o;
  const ang = Math.atan2(wy - o.y, wx - o.x) - Math.PI / 2;
  return { ...o, rot: ang };
}

export function resizeTowerByHandle(
  tower: EnvTower,
  handle: 'towerLeft' | 'towerRight' | 'towerTop',
  wx: number,
  wy: number,
): EnvTower {
  const t = clampTower(tower);
  if (handle === 'towerTop') {
    return clampTower({ ...t, height: Math.max(OBSTACLE_MIN_SIZE, wy) });
  }
  if (handle === 'towerLeft') {
    const half = Math.abs(t.x - wx);
    return clampTower({ ...t, baseW: half * 2 });
  }
  const half = Math.abs(wx - t.x);
  return clampTower({ ...t, baseW: half * 2 });
}

export function placeObstacleAt(
  kind: ObstacleKind,
  wx: number,
  wy: number,
): EnvObstacle {
  const base = defaultObstacle(kind);
  switch (kind) {
    case 'box':
    case 'ramp': {
      const h = base.h;
      return { ...base, x: wx, y: Math.max(h / 2, wy) };
    }
    case 'stair':
      return { ...base, x: wx - base.w / 2, y: Math.max(0, wy - base.h / 2) };
    case 'pit':
      return { ...base, x: wx, y: Math.max(0, wy) };
    case 'loop': {
      const r = Math.max(base.w, base.h) / 2;
      return { ...base, x: wx, y: Math.max(r, wy) };
    }
    default:
      return { ...base, x: wx, y: wy };
  }
}

export function placeTowerAt(wx: number): EnvTower {
  return clampTower({ ...defaultTower(), x: wx });
}

export function placeScoreRegionAt(
  kind: ScoreRegionKind,
  wx: number,
  wy: number,
): EnvScoreRegion {
  const base = defaultScoreRegion(kind);
  return clampScoreRegion({
    ...base,
    x: wx,
    y: Math.max(base.h / 2, wy),
  });
}

export function placeCourseMarkerAt(
  kind: CourseMarkerKind,
  wx: number,
  wy: number,
  existingMarkers: EnvCourseMarker[],
): EnvCourseMarker {
  const base = defaultCourseMarker(kind);
  const order =
    kind === 'checkpoint' ? nextCheckpointOrder(existingMarkers) : undefined;
  return clampCourseMarker({
    ...base,
    x: wx,
    y: Math.max(base.h / 2, wy),
    ...(order !== undefined ? { order } : {}),
  });
}

/** Resize region AABB keeping the opposite corner fixed (world). */
export function resizeRegionByCorner(
  r: EnvScoreRegion,
  handle: 'nw' | 'ne' | 'sw' | 'se',
  wx: number,
  wy: number,
): EnvScoreRegion {
  const fp = regionFootprint(r);
  const opposite: Record<'nw' | 'ne' | 'sw' | 'se', 'nw' | 'ne' | 'sw' | 'se'> =
    {
      nw: 'se',
      ne: 'sw',
      sw: 'ne',
      se: 'nw',
    };
  const fixed = handleWorldPos(fp, opposite[handle]);
  const localPtr = worldToLocal(wx, wy, fp);
  const localFix = worldToLocal(fixed.x, fixed.y, fp);

  const minHalf = OBSTACLE_MIN_SIZE / 2;
  let x0 = Math.min(localPtr.lx, localFix.lx);
  let x1 = Math.max(localPtr.lx, localFix.lx);
  let y0 = Math.min(localPtr.ly, localFix.ly);
  let y1 = Math.max(localPtr.ly, localFix.ly);
  if (x1 - x0 < OBSTACLE_MIN_SIZE) {
    const mid = (x0 + x1) / 2;
    x0 = mid - minHalf;
    x1 = mid + minHalf;
  }
  if (y1 - y0 < OBSTACLE_MIN_SIZE) {
    const mid = (y0 + y1) / 2;
    y0 = mid - minHalf;
    y1 = mid + minHalf;
  }
  const newHw = Math.min(OBSTACLE_MAX_SIZE / 2, (x1 - x0) / 2);
  const newHh = Math.min(OBSTACLE_MAX_SIZE / 2, (y1 - y0) / 2);
  const localCx = (x0 + x1) / 2;
  const localCy = (y0 + y1) / 2;
  const center = localToWorld(localCx, localCy, fp);
  return clampScoreRegion({
    ...r,
    x: center.x,
    y: center.y,
    w: newHw * 2,
    h: newHh * 2,
  });
}

/** Resize marker AABB keeping the opposite corner fixed (world). */
export function resizeMarkerByCorner(
  m: EnvCourseMarker,
  handle: 'nw' | 'ne' | 'sw' | 'se',
  wx: number,
  wy: number,
): EnvCourseMarker {
  const fp = markerFootprint(m);
  const opposite: Record<'nw' | 'ne' | 'sw' | 'se', 'nw' | 'ne' | 'sw' | 'se'> =
    {
      nw: 'se',
      ne: 'sw',
      sw: 'ne',
      se: 'nw',
    };
  const fixed = handleWorldPos(fp, opposite[handle]);
  const localPtr = worldToLocal(wx, wy, fp);
  const localFix = worldToLocal(fixed.x, fixed.y, fp);

  const minHalf = OBSTACLE_MIN_SIZE / 2;
  let x0 = Math.min(localPtr.lx, localFix.lx);
  let x1 = Math.max(localPtr.lx, localFix.lx);
  let y0 = Math.min(localPtr.ly, localFix.ly);
  let y1 = Math.max(localPtr.ly, localFix.ly);
  if (x1 - x0 < OBSTACLE_MIN_SIZE) {
    const mid = (x0 + x1) / 2;
    x0 = mid - minHalf;
    x1 = mid + minHalf;
  }
  if (y1 - y0 < OBSTACLE_MIN_SIZE) {
    const mid = (y0 + y1) / 2;
    y0 = mid - minHalf;
    y1 = mid + minHalf;
  }
  const newHw = Math.min(OBSTACLE_MAX_SIZE / 2, (x1 - x0) / 2);
  const newHh = Math.min(OBSTACLE_MAX_SIZE / 2, (y1 - y0) / 2);
  const localCx = (x0 + x1) / 2;
  const localCy = (y0 + y1) / 2;
  const center = localToWorld(localCx, localCy, fp);
  return clampCourseMarker({
    ...m,
    x: center.x,
    y: center.y,
    w: newHw * 2,
    h: newHh * 2,
  });
}

export function deleteSelection(
  env: EnvironmentDesign,
  sel: EnvSelection,
): { env: EnvironmentDesign; selection: EnvSelection } {
  if (!sel) return { env, selection: null };
  if (sel.kind === 'spawn') {
    // Spawn is required — reset to origin instead of removing.
    return {
      env: { ...env, spawn: defaultSpawn() },
      selection: { kind: 'spawn' },
    };
  }
  if (sel.kind === 'terrain') {
    return { env: { ...env, terrain: undefined }, selection: null };
  }
  if (sel.kind === 'tower') {
    return { env: { ...env, tower: undefined }, selection: null };
  }
  if (sel.kind === 'region') {
    return {
      env: {
        ...env,
        regions: (env.regions ?? []).filter((r) => r.id !== sel.id),
      },
      selection: null,
    };
  }
  if (sel.kind === 'marker') {
    return {
      env: {
        ...env,
        markers: (env.markers ?? []).filter((m) => m.id !== sel.id),
      },
      selection: null,
    };
  }
  return {
    env: {
      ...env,
      obstacles: env.obstacles.filter((o) => o.id !== sel.id),
    },
    selection: null,
  };
}

export function obstacleHandles(o: EnvObstacle): HandleId[] {
  const corners: HandleId[] = ['nw', 'ne', 'sw', 'se'];
  if (o.kind === 'box' || o.kind === 'ramp') {
    return [...corners, 'rotate'];
  }
  return corners;
}

export function regionHandles(): HandleId[] {
  return ['nw', 'ne', 'sw', 'se'];
}

export function markerHandles(): HandleId[] {
  return ['nw', 'ne', 'sw', 'se'];
}

export function towerHandles(): HandleId[] {
  return ['towerLeft', 'towerRight', 'towerTop'];
}

export function selectionLabel(
  env: EnvironmentDesign,
  sel: EnvSelection,
): string {
  if (!sel) return 'Nothing selected';
  if (sel.kind === 'spawn') {
    const s = resolveSpawn(env);
    return `Spawn · (${s.x.toFixed(1)}, ${s.y.toFixed(1)})`;
  }
  if (sel.kind === 'terrain') {
    if (!env.terrain) return 'Terrain';
    const t = clampTerrain(env.terrain);
    return `Hills · ${t.startX.toFixed(1)} → ${t.endX.toFixed(1)} (${(t.endX - t.startX).toFixed(1)} wide)`;
  }
  if (sel.kind === 'tower') {
    if (!env.tower) return 'Tower';
    return `Tower · x=${env.tower.x.toFixed(1)} h=${env.tower.height.toFixed(1)}`;
  }
  if (sel.kind === 'region') {
    const r = (env.regions ?? []).find((x) => x.id === sel.id);
    if (!r) return 'Region';
    const unit = r.kind === 'penalty' ? '/s' : ' once';
    return `${r.kind} · ${r.w.toFixed(1)}×${r.h.toFixed(1)} · rate ${r.rate.toFixed(2)}${unit}`;
  }
  if (sel.kind === 'marker') {
    const m = (env.markers ?? []).find((x) => x.id === sel.id);
    if (!m) return 'Marker';
    const tag =
      m.kind === 'checkpoint'
        ? `CP${(m.order ?? 0) + 1}`
        : m.kind === 'start'
          ? 'START'
          : 'FINISH';
    return `${tag} · ${m.w.toFixed(1)}×${m.h.toFixed(1)}`;
  }
  const o = env.obstacles.find((x) => x.id === sel.id);
  if (!o) return 'Obstacle';
  return `${o.kind} · ${o.w.toFixed(1)}×${o.h.toFixed(1)}`;
}
