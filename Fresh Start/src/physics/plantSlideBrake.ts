/**
 * Planted slide brake — damps horizontal slip on ground contacts.
 * Fresh Start product damping (not parent plant-grip / X-lock).
 * Used in Idle and during Evolve/brain so scoot cannot ice-skate for distance.
 */
import { PLANT_SLIDE_BRAKE, PLANT_SLIDE_Y } from './constants';
import type { SpawnedCreature } from './spawn';

function brakeBody(
  body: {
    translation: () => { y: number };
    linvel: () => { x: number; y: number };
    setLinvel: (v: { x: number; y: number }, wake: boolean) => void;
  },
  keep: number,
  maxY: number,
): void {
  if (body.translation().y >= maxY) return;
  const v = body.linvel();
  if (Math.abs(v.x) < 1e-5) return;
  body.setLinvel({ x: v.x * keep, y: v.y }, true);
}

/**
 * Scale down horizontal linvel on planted feet (and near-ground bones once
 * any foot is planted). Skips motor wheels. Call after world.step.
 */
export function applyPlantSlideBrake(creature: SpawnedCreature): void {
  if (PLANT_SLIDE_BRAKE <= 0) return;
  const keep = 1 - Math.min(1, Math.max(0, PLANT_SLIDE_BRAKE));

  const marked = creature.joints.filter((j) => j.isFoot && !j.isWheel);
  const footTargets =
    marked.length > 0
      ? marked
      : creature.joints.filter((j) => !j.isWheel);

  let anyPlanted = false;
  for (const j of footTargets) {
    if (j.body.translation().y >= PLANT_SLIDE_Y) continue;
    anyPlanted = true;
    brakeBody(j.body, keep, PLANT_SLIDE_Y);
  }
  if (!anyPlanted) return;

  // Bones scrape and carry COM during scoot — brake only while feet support.
  for (const b of creature.bones) {
    brakeBody(b.body, keep, PLANT_SLIDE_Y + 0.35);
  }
}

/** @deprecated Use applyPlantSlideBrake */
export const applyIdlePlantBrake = applyPlantSlideBrake;
