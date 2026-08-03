/**
 * Aero-like lift/drag (E6.6) — Fresh Start coefficients only.
 */
import { AERO_DRAG_COEFF, AERO_LIFT_COEFF } from './constants';
import type { SpawnedCreature } from './spawn';

/** Apply drag opposite velocity and a simple perpendicular lift on tagged bones. */
export function applyAeroForces(creature: SpawnedCreature): void {
  for (const bone of creature.bones) {
    const area = bone.aeroArea;
    if (!area || area <= 0) continue;
    const v = bone.body.linvel();
    const speed = Math.hypot(v.x, v.y);
    if (speed < 1e-4) continue;
    const nx = v.x / speed;
    const ny = v.y / speed;
    // Drag opposite velocity
    const drag = AERO_DRAG_COEFF * area * speed * speed;
    // Lift: rotate velocity 90° toward +Y when possible
    const lx = -ny;
    const ly = nx;
    const liftSign = ly >= 0 ? 1 : -1;
    const lift = AERO_LIFT_COEFF * area * speed * speed * liftSign;
    bone.body.wakeUp();
    bone.body.addForce(
      {
        x: -drag * nx + lift * lx,
        y: -drag * ny + lift * ly,
      },
      true,
    );
  }
}
