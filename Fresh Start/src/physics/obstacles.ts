/**
 * G1 — Static obstacles from Environment Studio designs (C2.1).
 * Fresh Start–native cuboid compositions; not parent geometry.
 */
import type { EnvObstacle, ObstacleKind } from '../env/types';
import {
  GROUND_FRICTION,
  GROUND_RESTITUTION,
  OBSTACLE_DEFAULT_RAMP_ROT,
  OBSTACLE_LOOP_SEGMENTS,
  OBSTACLE_MAX_SIZE,
  OBSTACLE_MIN_SIZE,
  OBSTACLE_STAIR_STEPS,
  RAMP_FRICTION,
} from './constants';
import { groundCollisionGroups, RAPIER } from './world';

export interface ObstacleVisual {
  kind: ObstacleKind;
  x: number;
  y: number;
  hx: number;
  hy: number;
  rot: number;
}

export interface ObstacleHandle {
  bodies: RAPIER.RigidBody[];
  visuals: ObstacleVisual[];
}

function clampSize(v: number): number {
  if (!Number.isFinite(v)) return OBSTACLE_MIN_SIZE;
  return Math.min(OBSTACLE_MAX_SIZE, Math.max(OBSTACLE_MIN_SIZE, Math.abs(v)));
}

function addCuboid(
  world: RAPIER.World,
  handle: ObstacleHandle,
  kind: ObstacleKind,
  x: number,
  y: number,
  hx: number,
  hy: number,
  rot: number,
  friction: number = GROUND_FRICTION,
): void {
  const safeHx = Math.max(OBSTACLE_MIN_SIZE / 2, hx);
  const safeHy = Math.max(OBSTACLE_MIN_SIZE / 2, hy);
  const groups = groundCollisionGroups();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(rot),
  );
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(safeHx, safeHy)
      .setFriction(friction)
      .setRestitution(GROUND_RESTITUTION)
      .setCollisionGroups(groups)
      .setSolverGroups(groups),
    body,
  );
  handle.bodies.push(body);
  handle.visuals.push({ kind, x, y, hx: safeHx, hy: safeHy, rot });
}

function spawnBox(
  world: RAPIER.World,
  handle: ObstacleHandle,
  o: EnvObstacle,
): void {
  const w = clampSize(o.w);
  const h = clampSize(o.h);
  addCuboid(world, handle, 'box', o.x, o.y, w / 2, h / 2, o.rot ?? 0);
}

function spawnRamp(
  world: RAPIER.World,
  handle: ObstacleHandle,
  o: EnvObstacle,
): void {
  const w = clampSize(o.w);
  const h = clampSize(Math.min(o.h, o.w * 0.35));
  const rot = o.rot ?? OBSTACLE_DEFAULT_RAMP_ROT;
  addCuboid(world, handle, 'ramp', o.x, o.y, w / 2, h / 2, rot, RAMP_FRICTION);
}

function spawnStair(
  world: RAPIER.World,
  handle: ObstacleHandle,
  o: EnvObstacle,
): void {
  const w = clampSize(o.w);
  const h = clampSize(o.h);
  const n = OBSTACLE_STAIR_STEPS;
  const stepW = w / n;
  for (let i = 0; i < n; i++) {
    const top = ((i + 1) / n) * h;
    const hy = top / 2;
    const hx = stepW / 2;
    const cx = o.x + (i + 0.5) * stepW;
    const cy = o.y + hy;
    addCuboid(world, handle, 'stair', cx, cy, hx, hy, 0);
  }
}

function spawnPit(
  world: RAPIER.World,
  handle: ObstacleHandle,
  o: EnvObstacle,
): void {
  const gap = clampSize(o.w);
  const wallH = clampSize(o.h);
  const platformW = Math.max(2, gap);
  const hy = wallH / 2;
  const hx = platformW / 2;
  const cy = o.y + hy;
  addCuboid(
    world,
    handle,
    'pit',
    o.x - gap / 2 - hx,
    cy,
    hx,
    hy,
    0,
  );
  addCuboid(
    world,
    handle,
    'pit',
    o.x + gap / 2 + hx,
    cy,
    hx,
    hy,
    0,
  );
}

function spawnLoop(
  world: RAPIER.World,
  handle: ObstacleHandle,
  o: EnvObstacle,
): void {
  const radius = clampSize(Math.max(o.w, o.h)) / 2;
  const segments = OBSTACLE_LOOP_SEGMENTS;
  const thickness = Math.max(OBSTACLE_MIN_SIZE, radius * 0.12);
  const arc = (2 * Math.PI) / segments;
  const slabLen = radius * arc * 1.05;
  for (let i = 0; i < segments; i++) {
    const angle = -Math.PI / 2 + arc * (i + 0.5);
    // Open gap near the bottom so creatures can enter.
    if (Math.sin(angle) < -0.55) continue;
    const cx = o.x + radius * Math.cos(angle);
    const cy = o.y + radius * Math.sin(angle);
    const rot = angle + Math.PI / 2;
    addCuboid(
      world,
      handle,
      'loop',
      cx,
      cy,
      slabLen / 2,
      thickness / 2,
      rot,
    );
  }
}

export function spawnStaticObstacles(
  world: RAPIER.World,
  obstacles: readonly EnvObstacle[],
): ObstacleHandle {
  const handle: ObstacleHandle = { bodies: [], visuals: [] };
  for (const o of obstacles) {
    switch (o.kind) {
      case 'box':
        spawnBox(world, handle, o);
        break;
      case 'ramp':
        spawnRamp(world, handle, o);
        break;
      case 'stair':
        spawnStair(world, handle, o);
        break;
      case 'pit':
        spawnPit(world, handle, o);
        break;
      case 'loop':
        spawnLoop(world, handle, o);
        break;
      default:
        break;
    }
  }
  return handle;
}

export function destroyObstacles(
  world: RAPIER.World,
  handle: ObstacleHandle | null,
): void {
  if (!handle) return;
  for (const b of handle.bodies) {
    world.removeRigidBody(b);
  }
  handle.bodies.length = 0;
  handle.visuals.length = 0;
}

let obstacleIdSeq = 0;

export function defaultObstacle(kind: ObstacleKind): EnvObstacle {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `obs_${Date.now().toString(36)}_${(obstacleIdSeq++).toString(36)}`;
  switch (kind) {
    case 'box':
      return { id, kind, x: 3, y: 0.5, w: 2, h: 1 };
    case 'ramp':
      return {
        id,
        kind,
        x: 5,
        y: 0.45,
        w: 3.5,
        h: 0.28,
        rot: OBSTACLE_DEFAULT_RAMP_ROT,
      };
    case 'stair':
      return { id, kind, x: 2, y: 0, w: 6, h: 2 };
    case 'pit':
      return { id, kind, x: 6, y: 0, w: 2.2, h: 1.4 };
    case 'loop':
      return { id, kind, x: 10, y: 2.2, w: 3.6, h: 3.6 };
    default:
      return { id, kind: 'box', x: 3, y: 0.5, w: 2, h: 1 };
  }
}
