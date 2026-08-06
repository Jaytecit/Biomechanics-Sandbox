/**
 * C2.10 — score-only course markers (start / checkpoint / finish).
 * No Rapier bodies — AABB overlap against creature joints.
 */
import {
  OBSTACLE_MAX_SIZE,
  OBSTACLE_MIN_SIZE,
} from '../physics/constants';
import type { SpawnedCreature } from '../physics/spawn';
import { isFeatureEnabled } from '../port/featureFlags';
import type {
  CourseMarkerKind,
  EnvironmentDesign,
  EnvCourseMarker,
} from '../env/types';
import {
  COURSE_MARKER_DEFAULT_H,
  COURSE_MARKER_DEFAULT_W,
} from './constants';

export interface CourseMarkerAccum {
  /** True after overlapping a start marker (or true immediately if none exist). */
  armed: boolean;
  /** Episode sim time when the race armed (start line); 0 if no start marker. */
  startTime: number | null;
  /** Checkpoint orders hit in sequence. */
  checkpointsHit: number;
  /** True after a valid finish overlap. */
  finished: boolean;
  /**
   * Race elapsed seconds at finish (simTime − startTime).
   * Null until finish; not absolute episode time.
   */
  finishTime: number | null;
  /** Marker ids already credited this episode (start/checkpoints/finish). */
  touchedIds: Set<string>;
}

export function emptyCourseMarkerAccum(
  markers: EnvCourseMarker[],
): CourseMarkerAccum {
  const hasStart = markers.some((m) => m.kind === 'start');
  return {
    armed: !hasStart,
    /** No start gate → clock runs from episode t=0. */
    startTime: hasStart ? null : 0,
    checkpointsHit: 0,
    finished: false,
    finishTime: null,
    touchedIds: new Set(),
  };
}

/**
 * Live / final race clock: null until the start line arms the course.
 * While running: simTime − startTime. After finish: recorded finishTime.
 */
export function courseRaceTime(
  state: CourseMarkerAccum,
  simTime: number,
): number | null {
  if (!state.armed || state.startTime == null) return null;
  if (state.finished && state.finishTime != null) return state.finishTime;
  return Math.max(0, simTime - state.startTime);
}

export function clampMarkerSize(v: number): number {
  if (!Number.isFinite(v)) return OBSTACLE_MIN_SIZE;
  return Math.min(OBSTACLE_MAX_SIZE, Math.max(OBSTACLE_MIN_SIZE, Math.abs(v)));
}

export function clampCourseMarker(m: EnvCourseMarker): EnvCourseMarker {
  const order =
    m.kind === 'checkpoint'
      ? Math.max(0, Math.floor(Number.isFinite(m.order ?? 0) ? (m.order ?? 0) : 0))
      : undefined;
  return {
    id: m.id,
    kind: m.kind,
    x: Number.isFinite(m.x) ? m.x : 0,
    y: Number.isFinite(m.y) ? m.y : 0,
    w: clampMarkerSize(m.w),
    h: clampMarkerSize(m.h),
    ...(order !== undefined ? { order } : {}),
  };
}

let markerIdSeq = 0;

export function defaultCourseMarker(kind: CourseMarkerKind): EnvCourseMarker {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `marker_${Date.now().toString(36)}_${(markerIdSeq++).toString(36)}`;
  return {
    id,
    kind,
    x: 0,
    y: COURSE_MARKER_DEFAULT_H / 2,
    w: COURSE_MARKER_DEFAULT_W,
    h: COURSE_MARKER_DEFAULT_H,
    ...(kind === 'checkpoint' ? { order: 0 } : {}),
  };
}

/** Markers active when the feature flag is on. */
export function activeCourseMarkers(env: EnvironmentDesign): EnvCourseMarker[] {
  if (!isFeatureEnabled('courseMarkers')) return [];
  return (env.markers ?? []).map(clampCourseMarker);
}

export function orderedCheckpoints(
  markers: EnvCourseMarker[],
): EnvCourseMarker[] {
  return markers
    .filter((m) => m.kind === 'checkpoint')
    .map(clampCourseMarker)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function jointOverlapsMarker(
  creature: SpawnedCreature,
  marker: EnvCourseMarker,
): boolean {
  const m = clampCourseMarker(marker);
  const hx = m.w / 2;
  const hy = m.h / 2;
  for (const j of creature.joints) {
    const p = j.body.translation();
    if (Math.abs(p.x - m.x) <= hx && Math.abs(p.y - m.y) <= hy) {
      return true;
    }
  }
  return false;
}

/**
 * Advance course progress for one fixed-dt step.
 * `simTime` is absolute episode time in seconds.
 * Start arms the race clock; finishTime stores elapsed race seconds.
 */
export function updateCourseMarkerAccum(
  creature: SpawnedCreature,
  markers: EnvCourseMarker[],
  simTime: number,
  state: CourseMarkerAccum,
): CourseMarkerAccum {
  if (markers.length === 0) return state;

  let armed = state.armed;
  let startTime = state.startTime;
  let checkpointsHit = state.checkpointsHit;
  let finished = state.finished;
  let finishTime = state.finishTime;
  let touched = state.touchedIds;
  const checkpoints = orderedCheckpoints(markers);

  const touch = (id: string): boolean => {
    if (touched.has(id)) return false;
    if (touched === state.touchedIds) {
      touched = new Set(state.touchedIds);
    }
    touched.add(id);
    return true;
  };

  for (const marker of markers) {
    if (!jointOverlapsMarker(creature, marker)) continue;
    const m = clampCourseMarker(marker);

    if (m.kind === 'start') {
      if (touch(m.id)) {
        armed = true;
        if (startTime == null) startTime = simTime;
      }
      continue;
    }

    if (m.kind === 'checkpoint') {
      if (!armed) continue;
      const expected = checkpoints[checkpointsHit];
      if (!expected || expected.id !== m.id) continue;
      if (touch(m.id)) checkpointsHit += 1;
      continue;
    }

    // finish
    if (!armed || finished) continue;
    if (checkpointsHit < checkpoints.length) continue;
    if (touch(m.id)) {
      finished = true;
      const t0 = startTime ?? 0;
      finishTime = Math.max(0, simTime - t0);
    }
  }

  if (
    armed === state.armed &&
    startTime === state.startTime &&
    checkpointsHit === state.checkpointsHit &&
    finished === state.finished &&
    finishTime === state.finishTime &&
    touched === state.touchedIds
  ) {
    return state;
  }
  return {
    armed,
    startTime,
    checkpointsHit,
    finished,
    finishTime,
    touchedIds: touched,
  };
}

/** Next checkpoint order to assign when placing a new checkpoint. */
export function nextCheckpointOrder(markers: EnvCourseMarker[]): number {
  const orders = markers
    .filter((m) => m.kind === 'checkpoint')
    .map((m) => m.order ?? 0);
  if (orders.length === 0) return 0;
  return Math.max(...orders) + 1;
}
