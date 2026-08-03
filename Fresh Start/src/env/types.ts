/**
 * F4 / C2 — Environment design schema (data-only; geometry not spawned yet).
 */

export type EnvTheme = 'plain' | 'dusk' | 'mint' | 'slate';

export type ObstacleKind = 'box' | 'ramp' | 'stair' | 'pit' | 'loop';

export interface EnvObstacle {
  id: string;
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
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

export interface EnvironmentDesign {
  name: string;
  theme: EnvTheme;
  obstacles: EnvObstacle[];
  terrain?: EnvTerrain;
  tower?: EnvTower;
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

export function flatGroundEnv(name = 'Flat Ground'): EnvironmentDesign {
  return {
    name,
    theme: 'plain',
    obstacles: [],
  };
}

export function cloneEnvironment(env: EnvironmentDesign): EnvironmentDesign {
  return {
    name: env.name,
    theme: env.theme,
    obstacles: env.obstacles.map((o) => ({ ...o })),
    terrain: env.terrain
      ? { ...env.terrain, samples: env.terrain.samples.slice() }
      : undefined,
    tower: env.tower ? { ...env.tower } : undefined,
  };
}

export function isEnvTheme(value: string): value is EnvTheme {
  return (ENV_THEMES as string[]).includes(value);
}
