/**
 * Task fitness adapters (E6.*) — Fresh Start Rapier state only.
 */
import { avgJointX, minJointY } from './observations';
import type { SpawnedCreature } from '../physics/spawn';
import {
  FALL_PENALTY,
  JUMP_HEIGHT_SCALE,
  FLIGHT_AIR_SCALE,
  FLIGHT_HEIGHT_SCALE,
  FLIGHT_MEAN_HEIGHT_SCALE,
  MIN_DESIGNED_HEAD_Y,
  MOTOR_DIST_SCALE,
  CLIMB_HEIGHT_SCALE,
  ROUGH_DIST_SCALE,
  SPRINT_CHECKPOINT_BONUS,
  SPRINT_DIST_SCALE,
  SPRINT_FALL_PROGRESS_FLOOR,
  SPRINT_FINISH_BONUS,
  SPRINT_FINISH_TIME_SCALE,
  SPEED_DIST_SCALE,
  SPEED_PEAK_SCALE,
  STAY_UPRIGHT_SCALE,
  HANG_TIME_SCALE,
  LONG_JUMP_DIST_SCALE,
} from './constants';
import {
  runLiftQuality,
  runUprightQuality,
  scoreRunPerformance,
  type EpisodeResult,
  updateFallState,
} from './fitness';
import {
  applyRegionScore,
  emptyScoreRegionAccum,
  type ScoreRegionAccum,
} from './scoreRegions';
import {
  courseRaceTime,
  emptyCourseMarkerAccum,
  type CourseMarkerAccum,
} from './courseMarkers';
import type { TaskId } from './types';

export interface TaskEpisodeMetrics extends EpisodeResult {
  peakHeight: number;
  airTime: number;
  /** Mean min-joint Y while fully airborne (flight sustain signal). */
  meanAirHeight: number;
  /** Peak mean horizontal joint speed (m/s). */
  peakSpeed: number;
  /** C2.9 — accumulated time-in-zone penalty. */
  regionPenalty: number;
  /** C2.9 — touch-once reward total. */
  regionReward: number;
  /** C2.10 — true after start line (or immediately if no start). */
  courseArmed: boolean;
  /** C2.10 — checkpoints hit in order this episode. */
  checkpointsHit: number;
  /** C2.10 — true after valid finish overlap. */
  finished: boolean;
  /**
   * C2.10 — race elapsed at finish (seconds since start line); null if unfinished.
   */
  finishTime: number | null;
  /**
   * C2.10 — race clock at episode end (running or finished); null if never armed.
   */
  raceTime: number | null;
}

export function emptyMetrics(): TaskEpisodeMetrics {
  return {
    fitness: 0,
    distance: 0,
    fell: false,
    footLifts: 0,
    uprightQuality: 1,
    peakHeight: 0,
    airTime: 0,
    meanAirHeight: 0,
    peakSpeed: 0,
    regionPenalty: 0,
    regionReward: 0,
    courseArmed: false,
    checkpointsHit: 0,
    finished: false,
    finishTime: null,
    raceTime: null,
  };
}

type ScoredBase = EpisodeResult & {
  peakHeight: number;
  airTime: number;
  meanAirHeight: number;
  peakSpeed: number;
  fitness: number;
};

function withRegionScore(
  base: ScoredBase,
  accum: ScoreRegionAccum,
): Omit<
  TaskEpisodeMetrics,
  'courseArmed' | 'checkpointsHit' | 'finished' | 'finishTime' | 'raceTime'
> {
  return {
    ...base,
    fitness: Math.max(0, applyRegionScore(base.fitness, accum)),
    regionPenalty: accum.penalty,
    regionReward: accum.reward,
  };
}

function withCourseMetrics(
  metrics: Omit<
    TaskEpisodeMetrics,
    'courseArmed' | 'checkpointsHit' | 'finished' | 'finishTime' | 'raceTime'
  >,
  courseAccum?: CourseMarkerAccum,
  episodeSimTime = 0,
): TaskEpisodeMetrics {
  if (!courseAccum) {
    return {
      ...metrics,
      courseArmed: false,
      checkpointsHit: 0,
      finished: false,
      finishTime: null,
      raceTime: null,
    };
  }
  return {
    ...metrics,
    courseArmed: courseAccum.armed,
    checkpointsHit: courseAccum.checkpointsHit,
    finished: courseAccum.finished,
    finishTime: courseAccum.finishTime,
    raceTime: courseRaceTime(courseAccum, episodeSimTime),
  };
}

function applyUprightGate(
  creature: SpawnedCreature,
  task: TaskId,
  baseFitness: number,
  uprightMean: number,
): { fitness: number; uprightQuality: number } {
  if (
    task === 'flight' ||
    task === 'hang' ||
    creature.designedHeadY < MIN_DESIGNED_HEAD_Y
  ) {
    return { fitness: baseFitness, uprightQuality: 1 };
  }
  const uprightQuality = runUprightQuality(uprightMean);
  return { fitness: baseFitness * uprightQuality, uprightQuality };
}

function scoreSprint(
  creature: SpawnedCreature,
  startX: number,
  fell: boolean,
  course: CourseMarkerAccum,
  uprightMean: number,
  /** Best forward progress this episode (meters); defaults to end pose. */
  peakDistance?: number,
): { fitness: number; uprightQuality: number; distance: number } {
  const endDistance = avgJointX(creature) - startX;
  // Credit peak progress so a mid-episode climb survives a later tumble.
  const distance = Math.max(0, peakDistance ?? endDistance, endDistance);
  const progressCredit =
    course.checkpointsHit * SPRINT_CHECKPOINT_BONUS +
    distance * SPRINT_DIST_SCALE;
  let fitness = progressCredit;
  if (course.finished && course.finishTime != null) {
    const timeBonus =
      SPRINT_FINISH_BONUS +
      SPRINT_FINISH_TIME_SCALE / Math.max(0.5, course.finishTime);
    fitness += timeBonus;
  }
  if (fell) {
    // Keep a floor of peak progress so fall penalty cannot fully erase a climb.
    fitness = Math.max(
      progressCredit * SPRINT_FALL_PROGRESS_FLOOR,
      fitness - FALL_PENALTY,
    );
  }
  const gated = applyUprightGate(
    creature,
    'sprint',
    Math.max(0, fitness),
    uprightMean,
  );
  return { ...gated, distance };
}

export function scoreTaskPerformance(
  task: TaskId,
  creature: SpawnedCreature,
  startX: number,
  fell: boolean,
  footLifts: number,
  peakHeight: number,
  airTime: number,
  uprightMean = 1,
  meanAirHeight = 0,
  regionAccum: ScoreRegionAccum = emptyScoreRegionAccum(),
  courseAccum?: CourseMarkerAccum,
  peakSpeed = 0,
  /** Episode sim time (s) — used for live/final race clock. */
  episodeSimTime = 0,
  /** Best forward progress (m) this episode — sprint uses peak, not end pose. */
  peakDistance?: number,
): TaskEpisodeMetrics {
  const course = courseAccum ?? emptyCourseMarkerAccum([]);
  const finish = (
    base: Omit<
      TaskEpisodeMetrics,
      'courseArmed' | 'checkpointsHit' | 'finished' | 'finishTime' | 'raceTime'
    >,
  ): TaskEpisodeMetrics =>
    withCourseMetrics(base, courseAccum, episodeSimTime);

  // H6 — dance is imitation-trained; no GA episode scoring.
  if (task === 'dance') {
    return finish(
      withRegionScore(
        {
          fitness: 0,
          distance: avgJointX(creature) - startX,
          fell,
          footLifts,
          uprightQuality: uprightMean,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'run') {
    const r = scoreRunPerformance(creature, startX, fell, footLifts, uprightMean);
    return finish(
      withRegionScore(
        { ...r, peakHeight, airTime, meanAirHeight, peakSpeed },
        regionAccum,
      ),
    );
  }

  if (task === 'speed') {
    const distance = avgJointX(creature) - startX;
    const base =
      Math.max(0, peakSpeed) / SPEED_PEAK_SCALE +
      Math.max(0, distance) / SPEED_DIST_SCALE -
      (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return finish(
      withRegionScore(
        {
          fitness: gated.fitness,
          distance,
          fell,
          footLifts,
          uprightQuality: gated.uprightQuality,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'sprint') {
    const s = scoreSprint(
      creature,
      startX,
      fell,
      course,
      uprightMean,
      peakDistance,
    );
    return finish(
      withRegionScore(
        {
          fitness: s.fitness,
          distance: s.distance,
          fell,
          footLifts,
          uprightQuality: s.uprightQuality,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'stay') {
    const distance = avgJointX(creature) - startX;
    const base =
      uprightMean / STAY_UPRIGHT_SCALE - (fell ? FALL_PENALTY : 0);
    return finish(
      withRegionScore(
        {
          fitness: Math.max(0, base),
          distance,
          fell,
          footLifts,
          uprightQuality: uprightMean,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'jump') {
    const heightScore = Math.max(0, peakHeight) / JUMP_HEIGHT_SCALE;
    const airScore = airTime * 0.15;
    const base = heightScore + airScore - (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return finish(
      withRegionScore(
        {
          fitness: gated.fitness,
          distance: avgJointX(creature) - startX,
          fell,
          footLifts,
          uprightQuality: gated.uprightQuality,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'hang') {
    const base =
      airTime * HANG_TIME_SCALE +
      Math.max(0, peakHeight) / JUMP_HEIGHT_SCALE * 0.15 -
      (fell ? FALL_PENALTY : 0);
    return finish(
      withRegionScore(
        {
          fitness: Math.max(0, base),
          distance: avgJointX(creature) - startX,
          fell,
          footLifts,
          uprightQuality: 1,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'longjump') {
    const distance = avgJointX(creature) - startX;
    const base =
      Math.max(0, distance) / LONG_JUMP_DIST_SCALE +
      airTime * 0.05 -
      (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return finish(
      withRegionScore(
        {
          fitness: gated.fitness,
          distance,
          fell,
          footLifts,
          uprightQuality: gated.uprightQuality,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'climb') {
    const height = Math.max(0, peakHeight) / CLIMB_HEIGHT_SCALE;
    const forward = Math.max(0, avgJointX(creature) - startX) * 0.05;
    const base = height + forward - (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return finish(
      withRegionScore(
        {
          fitness: gated.fitness,
          distance: avgJointX(creature) - startX,
          fell,
          footLifts,
          uprightQuality: gated.uprightQuality,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'motor') {
    const distance = avgJointX(creature) - startX;
    const base =
      Math.max(0, distance) / MOTOR_DIST_SCALE - (fell ? FALL_PENALTY : 0);
    const gated = applyUprightGate(creature, task, Math.max(0, base), uprightMean);
    return finish(
      withRegionScore(
        {
          fitness: gated.fitness,
          distance,
          fell,
          footLifts,
          uprightQuality: gated.uprightQuality,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  if (task === 'rough') {
    const distance = avgJointX(creature) - startX;
    const liftQuality = runLiftQuality(distance, footLifts);
    const gated = applyUprightGate(
      creature,
      task,
      Math.max(0, distance) / ROUGH_DIST_SCALE,
      uprightMean,
    );
    const fitness = gated.fitness * liftQuality - (fell ? FALL_PENALTY : 0);
    return finish(
      withRegionScore(
        {
          fitness,
          distance,
          fell,
          footLifts,
          uprightQuality: gated.uprightQuality,
          peakHeight,
          airTime,
          meanAirHeight,
          peakSpeed,
        },
        regionAccum,
      ),
    );
  }

  // flight — sustain mean airborne height; peak alone (one-flap) is weak.
  const peakScore = Math.max(0, peakHeight) / FLIGHT_HEIGHT_SCALE;
  const meanScore = Math.max(0, meanAirHeight) / FLIGHT_MEAN_HEIGHT_SCALE;
  const airScore = airTime / FLIGHT_AIR_SCALE;
  const fitness =
    peakScore * 0.2 +
    meanScore * 0.5 +
    airScore * 0.3 -
    (fell ? FALL_PENALTY * 0.5 : 0);
  return finish(
    withRegionScore(
      {
        fitness,
        distance: avgJointX(creature) - startX,
        fell,
        footLifts,
        uprightQuality: 1,
        peakHeight,
        airTime,
        meanAirHeight,
        peakSpeed,
      },
      regionAccum,
    ),
  );
}

/** Track peak / airtime / mean airborne height (all joints above ground contact). */
export function updateJumpFlightTrackers(
  creature: SpawnedCreature,
  dt: number,
  peakHeight: number,
  airTime: number,
  airHeightIntegral = 0,
  airborneY = 0.55,
): {
  peakHeight: number;
  airTime: number;
  airHeightIntegral: number;
  meanAirHeight: number;
} {
  const y = minJointY(creature);
  const nextPeak = Math.max(peakHeight, y);
  const airborne = creature.joints.every(
    (j) => j.body.translation().y > airborneY,
  );
  let nextAir = airTime;
  let nextIntegral = airHeightIntegral;
  if (airborne) {
    nextAir += dt;
    nextIntegral += y * dt;
  }
  return {
    peakHeight: nextPeak,
    airTime: nextAir,
    airHeightIntegral: nextIntegral,
    meanAirHeight: nextAir > 1e-6 ? nextIntegral / nextAir : 0,
  };
}

/** Human-readable score terms for B10 rewards breakdown (pure; no physics). */
export interface ScoreTerm {
  label: string;
  value: string;
  note?: string;
}

export function explainTaskScore(
  task: TaskId,
  metrics: TaskEpisodeMetrics,
): ScoreTerm[] {
  const terms: ScoreTerm[] = [
    { label: 'Fitness', value: metrics.fitness.toFixed(3) },
  ];
  const dist = metrics.distance;
  const lifts = metrics.footLifts;
  const liftQ = runLiftQuality(dist, lifts);

  if (task === 'run' || task === 'rough') {
    terms.push(
      { label: 'Distance', value: `${dist.toFixed(2)} m` },
      {
        label: 'Foot lifts',
        value: String(lifts),
        note: `lift quality ${liftQ.toFixed(2)}`,
      },
      { label: 'Upright', value: metrics.uprightQuality.toFixed(2) },
    );
  } else if (task === 'speed') {
    terms.push(
      {
        label: 'Peak speed',
        value: `${metrics.peakSpeed.toFixed(2)} m/s`,
        note: `÷ ${SPEED_PEAK_SCALE}`,
      },
      {
        label: 'Distance',
        value: `${dist.toFixed(2)} m`,
        note: `÷ ${SPEED_DIST_SCALE}`,
      },
      { label: 'Upright', value: metrics.uprightQuality.toFixed(2) },
    );
  } else if (task === 'sprint') {
    terms.push(
      { label: 'Checkpoints', value: String(metrics.checkpointsHit) },
      {
        label: 'Finished',
        value: metrics.finished ? 'yes' : 'no',
        note:
          metrics.finishTime != null
            ? `t=${metrics.finishTime.toFixed(2)}s`
            : undefined,
      },
      { label: 'Distance', value: `${dist.toFixed(2)} m` },
      { label: 'Upright', value: metrics.uprightQuality.toFixed(2) },
    );
  } else if (task === 'stay') {
    terms.push(
      {
        label: 'Upright mean',
        value: metrics.uprightQuality.toFixed(2),
        note: `÷ ${STAY_UPRIGHT_SCALE}`,
      },
    );
  } else if (task === 'jump') {
    terms.push(
      {
        label: 'Peak height',
        value: `${metrics.peakHeight.toFixed(2)} m`,
        note: `÷ ${JUMP_HEIGHT_SCALE}`,
      },
      {
        label: 'Air time',
        value: `${metrics.airTime.toFixed(2)} s`,
        note: '× 0.15',
      },
      { label: 'Upright', value: metrics.uprightQuality.toFixed(2) },
    );
  } else if (task === 'hang') {
    terms.push(
      {
        label: 'Air time',
        value: `${metrics.airTime.toFixed(2)} s`,
        note: `× ${HANG_TIME_SCALE}`,
      },
      {
        label: 'Peak height',
        value: `${metrics.peakHeight.toFixed(2)} m`,
      },
    );
  } else if (task === 'longjump') {
    terms.push(
      {
        label: 'Distance',
        value: `${dist.toFixed(2)} m`,
        note: `÷ ${LONG_JUMP_DIST_SCALE}`,
      },
      {
        label: 'Air time',
        value: `${metrics.airTime.toFixed(2)} s`,
      },
      { label: 'Upright', value: metrics.uprightQuality.toFixed(2) },
    );
  } else if (task === 'climb') {
    terms.push(
      {
        label: 'Peak height',
        value: `${metrics.peakHeight.toFixed(2)} m`,
        note: `÷ ${CLIMB_HEIGHT_SCALE}`,
      },
      {
        label: 'Forward',
        value: `${dist.toFixed(2)} m`,
        note: '× 0.05',
      },
      { label: 'Upright', value: metrics.uprightQuality.toFixed(2) },
    );
  } else if (task === 'motor') {
    terms.push(
      {
        label: 'Distance',
        value: `${dist.toFixed(2)} m`,
        note: `÷ ${MOTOR_DIST_SCALE}`,
      },
      { label: 'Upright', value: metrics.uprightQuality.toFixed(2) },
    );
  } else if (task === 'flight') {
    terms.push(
      {
        label: 'Mean air height',
        value: `${metrics.meanAirHeight.toFixed(2)} m`,
        note: `÷ ${FLIGHT_MEAN_HEIGHT_SCALE} · 50%`,
      },
      {
        label: 'Air time',
        value: `${metrics.airTime.toFixed(2)} s`,
        note: `÷ ${FLIGHT_AIR_SCALE} · 30%`,
      },
      {
        label: 'Peak height',
        value: `${metrics.peakHeight.toFixed(2)} m`,
        note: `÷ ${FLIGHT_HEIGHT_SCALE} · 20%`,
      },
    );
  }

  if (metrics.fell) {
    terms.push({
      label: 'Fall penalty',
      value:
        task === 'flight'
          ? `−${(FALL_PENALTY * 0.5).toFixed(2)}`
          : `−${FALL_PENALTY.toFixed(2)}`,
    });
  }
  if (metrics.regionPenalty > 0) {
    terms.push({
      label: 'Zone penalty',
      value: `−${metrics.regionPenalty.toFixed(2)}`,
      note: 'time in penalty zones',
    });
  }
  if (metrics.regionReward > 0) {
    terms.push({
      label: 'Zone reward',
      value: `+${metrics.regionReward.toFixed(2)}`,
      note: 'touch-once',
    });
  }
  if (metrics.courseArmed || metrics.checkpointsHit > 0 || metrics.finished) {
    const race =
      metrics.raceTime != null ? `${metrics.raceTime.toFixed(2)}s` : '—';
    terms.push({
      label: 'Course timer',
      value: metrics.finished ? `finish ${race}` : race,
      note: metrics.finished
        ? `${metrics.checkpointsHit} CP · race clock`
        : metrics.courseArmed
          ? `${metrics.checkpointsHit} CP · since start`
          : 'waiting for start',
    });
  }
  return terms;
}

/** Short scoring legend for a goal (B4), without live metrics. */
export function scoringLegendForTask(task: TaskId): string {
  const zoneNote =
    ' Env zones: penalty time-in-zone · reward touch-once. Course markers for Sprint.';
  switch (task) {
    case 'run':
      return (
        'Forward distance × foot-lift quality × upright − fall.' + zoneNote
      );
    case 'speed':
      return 'Peak horizontal speed + travel × upright − fall.' + zoneNote;
    case 'sprint':
      return (
        'Peak forward progress + ordered checkpoints + finish-time bonus × upright; fall keeps a progress floor. Place start/finish in World.' +
        zoneNote
      );
    case 'stay':
      return 'Mean supported upright posture − fall.' + zoneNote;
    case 'rough':
      return (
        'Hill distance × foot-lift quality × upright − fall.' + zoneNote
      );
    case 'jump':
      return 'Peak height + air time × upright − fall.' + zoneNote;
    case 'hang':
      return 'Air time (primary) + light peak height − fall.' + zoneNote;
    case 'longjump':
      return 'Horizontal jump distance + light air time × upright − fall.' + zoneNote;
    case 'climb':
      return 'Peak height + slight forward × upright − fall.' + zoneNote;
    case 'motor':
      return 'Wheeled forward distance × upright − fall.' + zoneNote;
    case 'flight':
      return (
        'Mean airborne height (50%) + air time (30%) + peak (20%) − light fall. One-flap coasts score poorly.' +
        zoneNote
      );
    case 'dance':
      return 'Disco imitation fitness (1 / (1 + MSE)); not GA-evolved.';
    default:
      return 'Task fitness from episode metrics.' + zoneNote;
  }
}

export { updateFallState };
