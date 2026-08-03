/**
 * Minimal climb course (E6.3) — static steps. Not full Environment Studio.
 */
import { GROUND_FRICTION, GROUND_RESTITUTION } from './constants';
import { RAPIER } from './world';

export interface CourseHandle {
  bodies: RAPIER.RigidBody[];
}

/** Ground membership bit 2 — same as main ground so creatures collide. */
function groundGroups(): number {
  return (0b0100 & 0xffff) | ((0xffff & 0xffff) << 16);
}

export function spawnClimbCourse(world: RAPIER.World): CourseHandle {
  const bodies: RAPIER.RigidBody[] = [];
  const steps = [
    { x: 2.5, y: 0.35, hx: 1.2, hy: 0.35 },
    { x: 4.5, y: 0.85, hx: 1.2, hy: 0.35 },
    { x: 6.5, y: 1.35, hx: 1.2, hy: 0.35 },
    { x: 8.5, y: 1.85, hx: 1.2, hy: 0.35 },
  ];
  const groups = groundGroups();
  for (const s of steps) {
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(s.x, s.y),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(s.hx, s.hy)
        .setFriction(GROUND_FRICTION)
        .setRestitution(GROUND_RESTITUTION)
        .setCollisionGroups(groups)
        .setSolverGroups(groups),
      body,
    );
    bodies.push(body);
  }
  return { bodies };
}

export function destroyCourse(world: RAPIER.World, course: CourseHandle | null): void {
  if (!course) return;
  for (const b of course.bodies) {
    world.removeRigidBody(b);
  }
  course.bodies.length = 0;
}
