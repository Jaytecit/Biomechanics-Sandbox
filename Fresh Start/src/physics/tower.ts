/**
 * C2.4 — Launch tower from Environment Studio designs.
 * Fresh Start–native stem + deck; not parent geometry.
 */
import type { EnvTower } from '../env/types';
import {
  GROUND_FRICTION,
  GROUND_RESTITUTION,
  TOWER_DECK_THICKNESS,
  TOWER_MAX_BASE_W,
  TOWER_MAX_HEIGHT,
  TOWER_MIN_BASE_W,
  TOWER_MIN_HEIGHT,
  TOWER_STEM_WIDTH_RATIO,
} from './constants';
import { groundCollisionGroups, RAPIER } from './world';

export interface TowerCuboidVisual {
  x: number;
  y: number;
  hx: number;
  hy: number;
  rot: number;
  part: 'stem' | 'deck';
}

export interface TowerHandle {
  bodies: RAPIER.RigidBody[];
  visuals: TowerCuboidVisual[];
}

export function clampTower(tower: EnvTower): EnvTower {
  const x = Number.isFinite(tower.x) ? tower.x : 0;
  const baseW = Math.min(
    TOWER_MAX_BASE_W,
    Math.max(
      TOWER_MIN_BASE_W,
      Math.abs(Number.isFinite(tower.baseW) ? tower.baseW : TOWER_MIN_BASE_W),
    ),
  );
  const height = Math.min(
    TOWER_MAX_HEIGHT,
    Math.max(
      TOWER_MIN_HEIGHT,
      Math.abs(Number.isFinite(tower.height) ? tower.height : TOWER_MIN_HEIGHT),
    ),
  );
  return { x, baseW, height };
}

export function defaultTower(): EnvTower {
  return clampTower({ x: 0, baseW: 3.5, height: 4 });
}

function addCuboid(
  world: RAPIER.World,
  handle: TowerHandle,
  part: 'stem' | 'deck',
  x: number,
  y: number,
  hx: number,
  hy: number,
): void {
  const groups = groundCollisionGroups();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, y),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy)
      .setFriction(GROUND_FRICTION)
      .setRestitution(GROUND_RESTITUTION)
      .setCollisionGroups(groups)
      .setSolverGroups(groups),
    body,
  );
  handle.bodies.push(body);
  handle.visuals.push({ x, y, hx, hy, rot: 0, part });
}

export function spawnLaunchTower(
  world: RAPIER.World,
  tower: EnvTower,
): TowerHandle {
  const t = clampTower(tower);
  const handle: TowerHandle = { bodies: [], visuals: [] };
  const deckHy = Math.min(TOWER_DECK_THICKNESS / 2, t.height / 4);
  const deckTop = t.height;
  const deckCy = deckTop - deckHy;
  const stemTop = Math.max(deckCy - deckHy, TOWER_MIN_HEIGHT * 0.25);
  const stemHy = stemTop / 2;
  const stemHx = (t.baseW * TOWER_STEM_WIDTH_RATIO) / 2;
  const deckHx = t.baseW / 2;

  if (stemHy > 1e-4 && stemHx > 1e-4) {
    addCuboid(world, handle, 'stem', t.x, stemHy, stemHx, stemHy);
  }
  addCuboid(world, handle, 'deck', t.x, deckCy, deckHx, deckHy);
  return handle;
}

export function destroyTower(
  world: RAPIER.World,
  handle: TowerHandle | null,
): void {
  if (!handle) return;
  for (const b of handle.bodies) {
    world.removeRigidBody(b);
  }
  handle.bodies.length = 0;
  handle.visuals.length = 0;
}
