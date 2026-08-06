import type { CreatureDesign } from '../creature/types';
import { FIXED_DT } from '../physics/constants';
import { Simulation } from '../sim/simulation';
import { EPISODE_SECONDS } from './constants';
import {
  createFootLiftState,
  instantUprightQuality,
  updateFallState,
  updateFootLiftState,
  type EpisodeResult,
} from './fitness';
import {
  scoreTaskPerformance,
  updateJumpFlightTrackers,
  type TaskEpisodeMetrics,
} from './taskScore';
import {
  activeCourseMarkers,
  emptyCourseMarkerAccum,
  updateCourseMarkerAccum,
} from './courseMarkers';
import {
  activeScoreRegions,
  emptyScoreRegionAccum,
  updateScoreRegionAccum,
} from './scoreRegions';
import { avgJointVelX, avgJointX } from './observations';
import type { NetworkShape, TaskId } from './types';

export type { EpisodeResult } from './fitness';
export type { TaskEpisodeMetrics } from './taskScore';
export {
  createFootLiftState,
  instantUprightQuality,
  scoreRunPerformance,
  updateFallState,
  updateFootLiftState,
} from './fitness';

/**
 * Run one fixed-duration episode with a genome driving muscles.
 * Resets the sim to `design` each call.
 */
export function evaluateRunEpisode(
  sim: Simulation,
  design: CreatureDesign,
  shape: NetworkShape,
  weights: Float32Array,
  episodeSeconds = EPISODE_SECONDS,
): EpisodeResult {
  return evaluateTaskEpisode(sim, design, shape, weights, 'run', episodeSeconds);
}

/** Evaluate any TaskId with the same fixed-dt episode loop. */
export function evaluateTaskEpisode(
  sim: Simulation,
  design: CreatureDesign,
  shape: NetworkShape,
  weights: Float32Array,
  task: TaskId,
  episodeSeconds = EPISODE_SECONDS,
): TaskEpisodeMetrics {
  sim.setTask(task);
  sim.loadDesign(design);
  sim.setBrain(shape, weights);
  sim.driveMode = 'brain';

  const creature = sim.creature;
  if (!creature) throw new Error('No creature after load');

  const startX = avgJointX(creature);
  let fallTime = 0;
  let fell = false;
  let footLifts = 0;
  let peakHeight = 0;
  let airTime = 0;
  let airHeightIntegral = 0;
  let meanAirHeight = 0;
  let uprightSum = 0;
  let uprightSteps = 0;
  let peakSpeed = 0;
  let peakDistance = 0;
  let regionAccum = emptyScoreRegionAccum();
  const regions = activeScoreRegions(sim.getEnvironment());
  let courseAccum = emptyCourseMarkerAccum(
    activeCourseMarkers(sim.getEnvironment()),
  );
  const markers = activeCourseMarkers(sim.getEnvironment());
  const planted = createFootLiftState(creature.joints.length);
  const steps = Math.round(episodeSeconds / FIXED_DT);
  let episodeSimTime = 0;

  for (let i = 0; i < steps; i++) {
    sim.step(FIXED_DT);
    episodeSimTime = (i + 1) * FIXED_DT;
    const terrain = sim.activeTerrain();
    peakDistance = Math.max(peakDistance, avgJointX(creature) - startX);
    footLifts += updateFootLiftState(creature, planted, terrain);
    uprightSum += instantUprightQuality(creature);
    uprightSteps++;
    peakSpeed = Math.max(peakSpeed, avgJointVelX(creature));
    const track = updateJumpFlightTrackers(
      creature,
      FIXED_DT,
      peakHeight,
      airTime,
      airHeightIntegral,
    );
    peakHeight = track.peakHeight;
    airTime = track.airTime;
    airHeightIntegral = track.airHeightIntegral;
    meanAirHeight = track.meanAirHeight;
    regionAccum = updateScoreRegionAccum(
      creature,
      regions,
      FIXED_DT,
      regionAccum,
    );
    courseAccum = updateCourseMarkerAccum(
      creature,
      markers,
      episodeSimTime,
      courseAccum,
    );
    const fall = updateFallState(creature, fallTime, FIXED_DT, terrain);
    fallTime = fall.fallTime;
    if (fall.fell) {
      fell = true;
      break;
    }
  }

  const uprightMean = uprightSteps > 0 ? uprightSum / uprightSteps : 1;
  return scoreTaskPerformance(
    task,
    creature,
    startX,
    fell,
    footLifts,
    peakHeight,
    airTime,
    uprightMean,
    meanAirHeight,
    regionAccum,
    courseAccum,
    peakSpeed,
    episodeSimTime,
    peakDistance,
  );
}
