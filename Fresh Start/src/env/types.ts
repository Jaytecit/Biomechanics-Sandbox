/**
 * F4 / C2 — Environment design schema.
 * Obstacles: `staticObstacles` (G1 / C2.1). Terrain: `terrainHeightfield` (G3 / C2.3).
 * Tower: `launchTower` (C2.4). Score regions: C2.9 (penalty/reward AABBs, score-only).
 * Course markers: C2.10 (start/finish/checkpoint, score-only).
 * Spawn: creature offset for train/play.
 */

import {
  SPAWN_MAX_X,
  SPAWN_MAX_Y,
  SPAWN_MIN_X,
  SPAWN_MIN_Y,
} from '../physics/constants';

export type EnvTheme = 'plain' | 'dusk' | 'mint' | 'slate';

export type ObstacleKind = 'box' | 'ramp' | 'stair' | 'pit' | 'loop';

export const OBSTACLE_KINDS: ObstacleKind[] = [
  'box',
  'ramp',
  'stair',
  'pit',
  'loop',
];

export interface EnvObstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

export function isObstacleKind(value: string): value is ObstacleKind {
  return (OBSTACLE_KINDS as string[]).includes(value);
}

/**
 * C2.9 — score-only AABB (no Rapier).
 * Penalty: time-in-zone. Reward: touch-once (flat bonus on first overlap).
 */
export type ScoreRegionKind = 'penalty' | 'reward';

export const SCORE_REGION_KINDS: ScoreRegionKind[] = ['penalty', 'reward'];

export interface EnvScoreRegion {
  id: string;
  kind: ScoreRegionKind;
  /** Center X. */
  x: number;
  /** Center Y. */
  y: number;
  w: number;
  h: number;
  /**
   * Magnitude (≥ 0). Penalty: fitness / second while overlapping.
   * Reward: flat fitness bonus on first touch.
   */
  rate: number;
}

export function isScoreRegionKind(value: string): value is ScoreRegionKind {
  return (SCORE_REGION_KINDS as string[]).includes(value);
}

/**
 * C2.10 — score-only course markers (no Rapier).
 * Start arms the course; checkpoints are ordered; finish completes when armed.
 */
export type CourseMarkerKind = 'start' | 'checkpoint' | 'finish';

export const COURSE_MARKER_KINDS: CourseMarkerKind[] = [
  'start',
  'checkpoint',
  'finish',
];

export interface EnvCourseMarker {
  id: string;
  kind: CourseMarkerKind;
  /** Center X. */
  x: number;
  /** Center Y. */
  y: number;
  w: number;
  h: number;
  /** Checkpoint sequence index (0-based). Ignored for start/finish. */
  order?: number;
}

export function isCourseMarkerKind(value: string): value is CourseMarkerKind {
  return (COURSE_MARKER_KINDS as string[]).includes(value);
}

export interface EnvTerrain {
  startX: number;
  endX: number;
  samples: number[];
  amplitude: number;
}

export interface EnvTower {
  x: number;
  baseW: number;
  height: number;
}

/** World offset applied when spawning the creature (design coords + spawn). */
export interface EnvSpawn {
  x: number;
  y: number;
}

export interface EnvironmentDesign {
  name: string;
  theme: EnvTheme;
  obstacles: EnvObstacle[];
  /** C2.9 penalty / reward AABBs (score-only; optional). */
  regions?: EnvScoreRegion[];
  /** C2.10 start / finish / checkpoint markers (score-only; optional). */
  markers?: EnvCourseMarker[];
  terrain?: EnvTerrain;
  tower?: EnvTower;
  /** Creature spawn; omitted / invalid → origin. */
  spawn?: EnvSpawn;
}

export const ENV_THEMES: EnvTheme[] = ['plain', 'dusk', 'mint', 'slate'];

export const THEME_CSS: Record<
  EnvTheme,
  { bg: string; panel: string; canvasClear: string }
> = {
  plain: { bg: '#0d121a', panel: '#151c27', canvasClear: '#0d121a' },
  dusk: { bg: '#1a1218', panel: '#241820', canvasClear: '#1a1218' },
  mint: { bg: '#0d1816', panel: '#142420', canvasClear: '#0d1816' },
  slate: { bg: '#12151a', panel: '#1a1f27', canvasClear: '#12151a' },
};

export function defaultSpawn(): EnvSpawn {
  return { x: 0, y: 0 };
}

export function clampSpawn(spawn: EnvSpawn): EnvSpawn {
  const x = Number.isFinite(spawn.x) ? spawn.x : 0;
  const y = Number.isFinite(spawn.y) ? spawn.y : 0;
  return {
    x: Math.min(SPAWN_MAX_X, Math.max(SPAWN_MIN_X, x)),
    y: Math.min(SPAWN_MAX_Y, Math.max(SPAWN_MIN_Y, y)),
  };
}

export function resolveSpawn(env: EnvironmentDesign): EnvSpawn {
  return env.spawn ? clampSpawn(env.spawn) : defaultSpawn();
}

export function flatGroundEnv(name = 'Flat Ground'): EnvironmentDesign {
  return {
    name,
    theme: 'plain',
    obstacles: [],
    regions: [],
    markers: [],
    spawn: defaultSpawn(),
  };
}

export function cloneEnvironment(env: EnvironmentDesign): EnvironmentDesign {
  return {
    name: env.name,
    theme: env.theme,
    obstacles: env.obstacles.map((o) => ({ ...o })),
    regions: (env.regions ?? []).map((r) => ({ ...r })),
    markers: (env.markers ?? []).map((m) => ({ ...m })),
    terrain: env.terrain
      ? { ...env.terrain, samples: env.terrain.samples.slice() }
      : undefined,
    tower: env.tower ? { ...env.tower } : undefined,
    spawn: clampSpawn(env.spawn ?? defaultSpawn()),
  };
}

export function isEnvTheme(value: string): value is EnvTheme {
  return (ENV_THEMES as string[]).includes(value);
}
