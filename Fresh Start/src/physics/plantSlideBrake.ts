/**
 * Planted slide brake — damps horizontal slip on ground / obstacle contacts.
 * Fresh Start product damping (not parent plant-grip / X-lock).
 * Used in Idle and during Evolve/brain so scoot cannot ice-skate for distance.
 * Obstacle contacts (ramps/stairs/boxes) use Rapier pairs so elevated slabs
 * get the same anti-slip help as flat ground.
 */
import type { EnvTerrain } from '../env/types';
import { sampleTerrainHeight } from '../env/terrainMath';
import { PLANT_SLIDE_BRAKE, PLANT_SLIDE_Y } from './constants';
import type { ObstacleHandle } from './obstacles';
import type { SpawnedCreature } from './spawn';
import { RAPIER } from './world';

function brakeBody(
  body: {
    translation: () => { x: number; y: number };
    linvel: () => { x: number; y: number };
    setLinvel: (v: { x: number; y: number }, wake: boolean) => void;
  },
  keep: number,
  maxClearance: number,
  surfaceY: number,
): void {
  if (body.translation().y - surfaceY >= maxClearance) return;
  const v = body.linvel();
  if (Math.abs(v.x) < 1e-5) return;
  body.setLinvel({ x: v.x * keep, y: v.y }, true);
}

function obstacleBodyHandles(obstacles: ObstacleHandle | null): Set<number> {
  const set = new Set<number>();
  if (!obstacles) return set;
  for (const b of obstacles.bodies) set.add(b.handle);
  return set;
}

/** True if any collider on this body is in contact with an obstacle body. */
function touchingObstacle(
  world: RAPIER.World,
  body: RAPIER.RigidBody,
  obsHandles: Set<number>,
): boolean {
  if (obsHandles.size === 0) return false;
  for (let i = 0; i < body.numColliders(); i++) {
    let hit = false;
    world.contactPairsWith(body.collider(i), (other) => {
      const parent = other.parent();
      if (parent && obsHandles.has(parent.handle)) hit = true;
    });
    if (hit) return true;
  }
  return false;
}

/**
 * Scale down horizontal linvel on planted feet (and near-ground bones once
 * any foot is planted). Skips motor wheels. Call after world.step.
 * When `terrain` is set, plant checks use clearance above the local surface.
 * When `world` + `obstacles` are set, feet in Rapier contact with obstacles
 * also count as planted (elevated ramps/stairs/boxes).
 */
export function applyPlantSlideBrake(
  creature: SpawnedCreature,
  terrain?: EnvTerrain | null,
  world?: RAPIER.World | null,
  obstacles?: ObstacleHandle | null,
): void {
  if (PLANT_SLIDE_BRAKE <= 0) return;
  const keep = 1 - Math.min(1, Math.max(0, PLANT_SLIDE_BRAKE));
  const obsHandles =
    world && obstacles ? obstacleBodyHandles(obstacles) : new Set<number>();

  const marked = creature.joints.filter((j) => j.isFoot && !j.isWheel);
  const footTargets =
    marked.length > 0
      ? marked
      : creature.joints.filter((j) => !j.isWheel);

  let anyPlanted = false;
  for (const j of footTargets) {
    const t = j.body.translation();
    const terrainSurface = sampleTerrainHeight(terrain, t.x);
    const onTerrain = t.y - terrainSurface < PLANT_SLIDE_Y;
    const onObstacle =
      !!world && obsHandles.size > 0 && touchingObstacle(world, j.body, obsHandles);
    if (!onTerrain && !onObstacle) continue;
    anyPlanted = true;
    if (onObstacle) {
      // In contact with obstacle — damp slip immediately (surface ≈ foot).
      brakeBody(j.body, keep, PLANT_SLIDE_Y, t.y);
    } else {
      brakeBody(j.body, keep, PLANT_SLIDE_Y, terrainSurface);
    }
  }
  if (!anyPlanted) return;

  // Bones scrape and carry COM during scoot — brake only while feet support.
  for (const b of creature.bones) {
    const t = b.body.translation();
    const terrainSurface = sampleTerrainHeight(terrain, t.x);
    const onTerrain = t.y - terrainSurface < PLANT_SLIDE_Y + 0.35;
    const onObstacle =
      !!world && obsHandles.size > 0 && touchingObstacle(world, b.body, obsHandles);
    if (onObstacle) {
      brakeBody(b.body, keep, PLANT_SLIDE_Y + 0.35, t.y);
    } else if (onTerrain) {
      brakeBody(b.body, keep, PLANT_SLIDE_Y + 0.35, terrainSurface);
    }
  }
}

/** @deprecated Use applyPlantSlideBrake */
export const applyIdlePlantBrake = applyPlantSlideBrake;
