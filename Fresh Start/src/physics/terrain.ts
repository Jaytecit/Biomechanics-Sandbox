/**
 * G3 — Rapier heightfield from Environment Studio terrain (C2.3).
 */
import type { EnvTerrain } from '../env/types';
import { terrainHeightsForRapier, terrainPolyline } from '../env/terrainMath';
import { GROUND_FRICTION, GROUND_RESTITUTION } from './constants';
import { groundCollisionGroups, RAPIER } from './world';

export interface TerrainVisual {
  points: { x: number; y: number }[];
}

export interface TerrainHandle {
  body: RAPIER.RigidBody;
  visual: TerrainVisual;
}

export function spawnTerrainHeightfield(
  world: RAPIER.World,
  terrain: EnvTerrain,
): TerrainHandle | null {
  const { heights, midX, width } = terrainHeightsForRapier(terrain);
  if (heights.length < 2 || width < 1e-6) return null;

  const groups = groundCollisionGroups();
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(midX, 0),
  );
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(heights, { x: width, y: 1 })
      .setFriction(GROUND_FRICTION)
      .setRestitution(GROUND_RESTITUTION)
      .setCollisionGroups(groups)
      .setSolverGroups(groups),
    body,
  );
  return {
    body,
    visual: { points: terrainPolyline(terrain) },
  };
}

export function destroyTerrain(
  world: RAPIER.World,
  handle: TerrainHandle | null,
): void {
  if (!handle) return;
  world.removeRigidBody(handle.body);
}
