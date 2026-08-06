/**
 * H2 — Disco floor environment (left/right containment walls + dance floor).
 * Uses existing G1 box obstacles; no new Rapier capability.
 */
import {
  DISCO_WALL_H,
  DISCO_WALL_W,
  DISCO_WALL_X,
} from '../physics/constants';
import type { EnvironmentDesign, EnvObstacle } from './types';
import { defaultSpawn } from './types';

function wall(id: string, x: number): EnvObstacle {
  return {
    id,
    kind: 'box',
    x,
    y: DISCO_WALL_H / 2,
    w: DISCO_WALL_W,
    h: DISCO_WALL_H,
  };
}

/** Bundled disco arena: tall side walls only (open dance floor). */
export function discoFloorEnv(name = 'Disco Floor'): EnvironmentDesign {
  const halfW = DISCO_WALL_W / 2;
  return {
    name,
    theme: 'dusk',
    obstacles: [
      wall('disco-wall-l', -(DISCO_WALL_X + halfW)),
      wall('disco-wall-r', DISCO_WALL_X + halfW),
    ],
    regions: [],
    markers: [],
    spawn: defaultSpawn(),
  };
}

export function isDiscoFloorEnv(env: EnvironmentDesign): boolean {
  return env.obstacles.some((o) => o.id === 'disco-wall-l');
}
