/**
 * C2.9 — score-only AABB regions (no Rapier).
 * Penalty: time-in-zone. Reward: touch-once flat bonus.
 */
import {
  OBSTACLE_MAX_SIZE,
  OBSTACLE_MIN_SIZE,
} from '../physics/constants';
import type { SpawnedCreature } from '../physics/spawn';
import { isFeatureEnabled } from '../port/featureFlags';
import type { EnvironmentDesign, EnvScoreRegion, ScoreRegionKind } from '../env/types';
import {
  SCORE_REGION_DEFAULT_H,
  SCORE_REGION_DEFAULT_PENALTY_RATE,
  SCORE_REGION_DEFAULT_REWARD_RATE,
  SCORE_REGION_DEFAULT_W,
  SCORE_REGION_MAX_RATE,
  SCORE_REGION_MIN_RATE,
} from './constants';

export interface ScoreRegionAccum {
  /** Accumulated penalty magnitude (≥ 0). */
  penalty: number;
  /** Accumulated reward magnitude (≥ 0). */
  reward: number;
  /** Reward region ids already granted this episode. */
  touchedRewardIds: Set<string>;
}

export function emptyScoreRegionAccum(): ScoreRegionAccum {
  return { penalty: 0, reward: 0, touchedRewardIds: new Set() };
}

export function clampRegionSize(v: number): number {
  if (!Number.isFinite(v)) return OBSTACLE_MIN_SIZE;
  return Math.min(OBSTACLE_MAX_SIZE, Math.max(OBSTACLE_MIN_SIZE, Math.abs(v)));
}

export function clampRegionRate(v: number): number {
  if (!Number.isFinite(v)) return SCORE_REGION_MIN_RATE;
  return Math.min(SCORE_REGION_MAX_RATE, Math.max(SCORE_REGION_MIN_RATE, v));
}

export function clampScoreRegion(r: EnvScoreRegion): EnvScoreRegion {
  return {
    id: r.id,
    kind: r.kind,
    x: Number.isFinite(r.x) ? r.x : 0,
    y: Number.isFinite(r.y) ? r.y : 0,
    w: clampRegionSize(r.w),
    h: clampRegionSize(r.h),
    rate: clampRegionRate(r.rate),
  };
}

let regionIdSeq = 0;

export function defaultScoreRegion(kind: ScoreRegionKind): EnvScoreRegion {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `region_${Date.now().toString(36)}_${(regionIdSeq++).toString(36)}`;
  return {
    id,
    kind,
    x: 0,
    y: SCORE_REGION_DEFAULT_H / 2,
    w: SCORE_REGION_DEFAULT_W,
    h: SCORE_REGION_DEFAULT_H,
    rate:
      kind === 'penalty'
        ? SCORE_REGION_DEFAULT_PENALTY_RATE
        : SCORE_REGION_DEFAULT_REWARD_RATE,
  };
}

/** Regions active for scoring when the feature flag is on. */
export function activeScoreRegions(env: EnvironmentDesign): EnvScoreRegion[] {
  if (!isFeatureEnabled('scoreRegions')) return [];
  return (env.regions ?? []).map(clampScoreRegion);
}

export function jointOverlapsRegion(
  creature: SpawnedCreature,
  region: EnvScoreRegion,
): boolean {
  const r = clampScoreRegion(region);
  const hx = r.w / 2;
  const hy = r.h / 2;
  for (const j of creature.joints) {
    const p = j.body.translation();
    if (
      Math.abs(p.x - r.x) <= hx &&
      Math.abs(p.y - r.y) <= hy
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Advance region accumulators for one fixed-dt step.
 * Penalty accrues every overlapping step; reward grants once per region id.
 */
export function updateScoreRegionAccum(
  creature: SpawnedCreature,
  regions: EnvScoreRegion[],
  dt: number,
  state: ScoreRegionAccum,
): ScoreRegionAccum {
  if (regions.length === 0 || dt <= 0) return state;
  let penalty = state.penalty;
  let reward = state.reward;
  let touched = state.touchedRewardIds;
  for (const region of regions) {
    if (!jointOverlapsRegion(creature, region)) continue;
    const r = clampScoreRegion(region);
    if (r.kind === 'penalty') {
      penalty += r.rate * dt;
    } else if (!touched.has(r.id)) {
      if (touched === state.touchedRewardIds) {
        touched = new Set(state.touchedRewardIds);
      }
      touched.add(r.id);
      reward += r.rate;
    }
  }
  if (
    penalty === state.penalty &&
    reward === state.reward &&
    touched === state.touchedRewardIds
  ) {
    return state;
  }
  return { penalty, reward, touchedRewardIds: touched };
}

/** Apply region delta after task base score, before non-negative clamp. */
export function applyRegionScore(
  baseFitness: number,
  accum: ScoreRegionAccum,
): number {
  return baseFitness - accum.penalty + accum.reward;
}
