/**
 * Minimal climb course (E6.3) — static steps. Not full Environment Studio.
 * Authored world obstacles live in obstacles.ts (G1 / C2.1).
 * E6.8 rough course reuses G3 heightfield spawn.
 */
import type { EnvTerrain } from '../env/types';
import { makeSineTerrain } from '../env/terrainMath';
import {
  GROUND_FRICTION,
  GROUND_RESTITUTION,
  ROUGH_COURSE_AMPLITUDE,
  ROUGH_COURSE_END_X,
  ROUGH_COURSE_SAMPLES,
  ROUGH_COURSE_START_X,
  ROUGH_COURSE_WAVES,
} from './constants';
import {
  destroyTerrain,
  spawnTerrainHeightfield,
  type TerrainHandle,
} from './terrain';
import { groundCollisionGroups, RAPIER } from './world';

export interface CourseHandle {
  bodies: RAPIER.RigidBody[];
}

export interface RoughCourseHandle {
  terrain: TerrainHandle;
  design: EnvTerrain;
}

export function spawnClimbCourse(world: RAPIER.World): CourseHandle {
  const bodies: RAPIER.RigidBody[] = [];
  const steps = [
    { x: 2.5, y: 0.35, hx: 1.2, hy: 0.35 },
    { x: 4.5, y: 0.85, hx: 1.2, hy: 0.35 },
    { x: 6.5, y: 1.35, hx: 1.2, hy: 0.35 },
    { x: 8.5, y: 1.85, hx: 1.2, hy: 0.35 },
  ];
  const groups = groundCollisionGroups();
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

/** Deterministic sine hills for the Rough goal (E6.8). */
export function makeRoughCourseTerrain(): EnvTerrain {
  return makeSineTerrain({
    startX: ROUGH_COURSE_START_X,
    endX: ROUGH_COURSE_END_X,
    sampleCount: ROUGH_COURSE_SAMPLES,
    amplitude: ROUGH_COURSE_AMPLITUDE,
    waves: ROUGH_COURSE_WAVES,
  });
}

export function spawnRoughCourse(world: RAPIER.World): RoughCourseHandle | null {
  const design = makeRoughCourseTerrain();
  const terrain = spawnTerrainHeightfield(world, design);
  if (!terrain) return null;
  return { terrain, design };
}

export function destroyRoughCourse(
  world: RAPIER.World,
  course: RoughCourseHandle | null,
): void {
  if (!course) return;
  destroyTerrain(world, course.terrain);
}
