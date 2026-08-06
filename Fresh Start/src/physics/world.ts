import RAPIER from '@dimforge/rapier2d-compat';
import {
  BODY_FRICTION,
  BODY_RESTITUTION,
  GRAVITY_Y,
  GROUND_FRICTION,
  GROUND_RESTITUTION,
  GROUND_Y,
} from './constants';

let initPromise: Promise<void> | null = null;

export function initRapier(): Promise<void> {
  if (!initPromise) {
    initPromise = RAPIER.init();
  }
  return initPromise;
}

export function createWorld(): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: GRAVITY_Y });
  addGround(world);
  return world;
}

/**
 * Membership bit 2 = ground / static world geometry.
 * Creature joints/bones filter for this bit (see spawn.ts).
 */
export function groundCollisionGroups(): number {
  return (0b0100 & 0xffff) | ((0xffff & 0xffff) << 16);
}

function addGround(world: RAPIER.World): void {
  // Infinite floor: halfspace solid is below the plane; outward normal points up.
  const groundBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y),
  );
  const groups = groundCollisionGroups();
  world.createCollider(
    RAPIER.ColliderDesc.halfspace({ x: 0, y: 1 })
      .setFriction(GROUND_FRICTION)
      .setRestitution(GROUND_RESTITUTION)
      .setCollisionGroups(groups)
      .setSolverGroups(groups),
    groundBody,
  );
}

export function defaultColliderDesc(
  desc: RAPIER.ColliderDesc,
): RAPIER.ColliderDesc {
  return desc.setFriction(BODY_FRICTION).setRestitution(BODY_RESTITUTION);
}

export { RAPIER };
