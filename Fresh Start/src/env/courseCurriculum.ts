/**
 * Course curriculum — progressive spawn/finish windows on a base environment.
 * Extends D13 stage training for checkpointed courses (e.g. Gauntlet).
 */
import { COURSE_MARKER_DEFAULT_H, COURSE_MARKER_DEFAULT_W } from '../brain/constants';
import { isFeatureEnabled } from '../port/featureFlags';
import { BUILTIN_GAUNTLET_ENV_ID, gauntletEnv } from './gauntletEnv';
import {
  cloneEnvironment,
  type EnvironmentDesign,
  type EnvCourseMarker,
  type EnvSpawn,
} from './types';

export interface CourseCurriculumStage {
  id: string;
  label: string;
  /** Prefer Sprint so checkpoints + finish score. */
  goalId: 'sprint';
  spawn: EnvSpawn;
  /** Stage finish gate center. */
  finishX: number;
  finishY: number;
  /**
   * Include base checkpoints with order ≤ this value.
   * Use -1 for start→finish only (no checkpoints).
   */
  maxCheckpointOrder: number;
  /** Fitness threshold to advance after an evolve finish. */
  threshold: number;
}

export interface CourseCurriculum {
  packageId: string;
  displayName: string;
  baseEnv: () => EnvironmentDesign;
  stages: CourseCurriculumStage[];
}

/** Gauntlet: widen finish from stairs → tower → pit landing → full course. */
export const GAUNTLET_CURRICULUM: CourseCurriculum = {
  packageId: BUILTIN_GAUNTLET_ENV_ID,
  displayName: 'Gauntlet',
  baseEnv: gauntletEnv,
  stages: [
    {
      id: 'stairs',
      label: 'Clear the stairs',
      goalId: 'sprint',
      spawn: { x: -15, y: 0 },
      finishX: 40,
      finishY: 3,
      /** Include ramp-crest checkpoint so first-ramp climbs get score credit. */
      maxCheckpointOrder: 0,
      threshold: 6,
    },
    {
      id: 'tower',
      label: 'Reach the tower',
      goalId: 'sprint',
      spawn: { x: -15, y: 0 },
      finishX: 51,
      finishY: 8,
      maxCheckpointOrder: 1,
      threshold: 10,
    },
    {
      id: 'pit',
      label: 'Cross the pit',
      goalId: 'sprint',
      spawn: { x: -15, y: 0 },
      finishX: 85,
      finishY: 2,
      maxCheckpointOrder: 2,
      threshold: 14,
    },
    {
      id: 'full',
      label: 'Full gauntlet',
      goalId: 'sprint',
      spawn: { x: -15, y: 0 },
      finishX: 130,
      finishY: 1.5,
      maxCheckpointOrder: 3,
      threshold: 18,
    },
  ],
};

const CURRICULA: CourseCurriculum[] = [GAUNTLET_CURRICULUM];

export function curriculumForPackageId(
  packageId: string | null | undefined,
): CourseCurriculum | null {
  if (!isFeatureEnabled('courseCurriculum')) return null;
  if (!packageId) return null;
  return CURRICULA.find((c) => c.packageId === packageId) ?? null;
}

function stageFinishMarker(stage: CourseCurriculumStage): EnvCourseMarker {
  return {
    id: `curriculum_finish_${stage.id}`,
    kind: 'finish',
    x: stage.finishX,
    y: stage.finishY,
    w: COURSE_MARKER_DEFAULT_W,
    h: COURSE_MARKER_DEFAULT_H,
  };
}

/**
 * Apply a curriculum stage: spawn + start + allowed checkpoints + stage finish.
 * Keeps full obstacle/tower/region geometry from the base env.
 */
export function applyCourseCurriculumStage(
  curriculum: CourseCurriculum,
  stageIndex: number,
): EnvironmentDesign {
  const stages = curriculum.stages;
  const idx = Math.max(0, Math.min(stages.length - 1, Math.floor(stageIndex)));
  const stage = stages[idx];
  const base = cloneEnvironment(curriculum.baseEnv());
  const start = (base.markers ?? []).find((m) => m.kind === 'start');
  const checkpoints = (base.markers ?? [])
    .filter(
      (m) =>
        m.kind === 'checkpoint' &&
        (m.order ?? 0) <= stage.maxCheckpointOrder,
    )
    .map((m) => ({ ...m }));

  const markers: EnvCourseMarker[] = [];
  if (start) markers.push({ ...start });
  markers.push(...checkpoints);
  markers.push(stageFinishMarker(stage));

  return {
    ...base,
    name: `${curriculum.displayName} · ${stage.label}`,
    spawn: { ...stage.spawn },
    markers,
  };
}

export function clampCourseStageIndex(
  curriculum: CourseCurriculum,
  index: number,
): number {
  if (curriculum.stages.length === 0) return 0;
  return Math.max(0, Math.min(curriculum.stages.length - 1, Math.floor(index)));
}
