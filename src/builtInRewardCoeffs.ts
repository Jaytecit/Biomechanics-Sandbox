/**
 * Shared built-in reward coefficient recipes (Phase 22A / D148).
 *
 * Defaults match pre-22A shipped literals in calculateFitness. Gates
 * (travel floors, min frames, clearance floors) stay in physicsConstants.
 */

import { EvolutionGoal } from './types';

/** SPEED term coefficients (see speedFitness). */
export interface SpeedRewardCoeffs {
  /** Multiplier on distance while below the travel gate. */
  belowGateDistance: number;
  /** Multiplier on peak supported speed once the gate is cleared. */
  peak: number;
  /** Multiplier on distance once the gate is cleared. */
  distance: number;
}

/** JUMP_SPEED bout term coefficients (see jumpSpeedBoutScore). */
export interface JumpSpeedRewardCoeffs {
  /** Multiplier on peak airspeed. */
  peakSpeed: number;
  /** Multiplier on capped clearance. */
  clearance: number;
  /** Multiplier on capped airtime frames. */
  airtime: number;
}

/** Editable built-in reward recipe (pilot goals only in 22A). */
export interface BuiltInRewardRecipe {
  speed: SpeedRewardCoeffs;
  jumpSpeed: JumpSpeedRewardCoeffs;
}

export const DEFAULT_SPEED_REWARD_COEFFS: SpeedRewardCoeffs = {
  belowGateDistance: 0.15,
  peak: 45,
  distance: 0.35,
};

export const DEFAULT_JUMP_SPEED_REWARD_COEFFS: JumpSpeedRewardCoeffs = {
  peakSpeed: 50,
  clearance: 0.3,
  airtime: 0.35,
};

export const DEFAULT_BUILTIN_REWARD_RECIPE: BuiltInRewardRecipe = {
  speed: { ...DEFAULT_SPEED_REWARD_COEFFS },
  jumpSpeed: { ...DEFAULT_JUMP_SPEED_REWARD_COEFFS },
};

/** Stable fingerprint for the default recipe (legacy Best Ever keys use bare goal). */
export const DEFAULT_REWARD_RECIPE_FINGERPRINT = 'default';

const PILOT_GOALS: ReadonlySet<EvolutionGoal> = new Set([
  EvolutionGoal.SPEED,
  EvolutionGoal.JUMP_SPEED,
]);

export function isPilotRewardGoal(goal: EvolutionGoal): boolean {
  return PILOT_GOALS.has(goal);
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Normalize a partial/unknown recipe against defaults. */
export function normalizeBuiltInRewardRecipe(
  recipe?: BuiltInRewardRecipe | null
): BuiltInRewardRecipe {
  const speed = recipe?.speed;
  const jumpSpeed = recipe?.jumpSpeed;
  return {
    speed: {
      belowGateDistance: finiteOr(
        speed?.belowGateDistance,
        DEFAULT_SPEED_REWARD_COEFFS.belowGateDistance
      ),
      peak: finiteOr(speed?.peak, DEFAULT_SPEED_REWARD_COEFFS.peak),
      distance: finiteOr(speed?.distance, DEFAULT_SPEED_REWARD_COEFFS.distance),
    },
    jumpSpeed: {
      peakSpeed: finiteOr(
        jumpSpeed?.peakSpeed,
        DEFAULT_JUMP_SPEED_REWARD_COEFFS.peakSpeed
      ),
      clearance: finiteOr(
        jumpSpeed?.clearance,
        DEFAULT_JUMP_SPEED_REWARD_COEFFS.clearance
      ),
      airtime: finiteOr(
        jumpSpeed?.airtime,
        DEFAULT_JUMP_SPEED_REWARD_COEFFS.airtime
      ),
    },
  };
}

export function cloneBuiltInRewardRecipe(
  recipe?: BuiltInRewardRecipe | null
): BuiltInRewardRecipe {
  const n = normalizeBuiltInRewardRecipe(recipe);
  return {
    speed: { ...n.speed },
    jumpSpeed: { ...n.jumpSpeed },
  };
}

export function isDefaultRewardRecipe(
  recipe?: BuiltInRewardRecipe | null
): boolean {
  const n = normalizeBuiltInRewardRecipe(recipe);
  const d = DEFAULT_BUILTIN_REWARD_RECIPE;
  return (
    n.speed.belowGateDistance === d.speed.belowGateDistance &&
    n.speed.peak === d.speed.peak &&
    n.speed.distance === d.speed.distance &&
    n.jumpSpeed.peakSpeed === d.jumpSpeed.peakSpeed &&
    n.jumpSpeed.clearance === d.jumpSpeed.clearance &&
    n.jumpSpeed.airtime === d.jumpSpeed.airtime
  );
}

/**
 * Stable short fingerprint for fairness tagging.
 * Default recipe always returns DEFAULT_REWARD_RECIPE_FINGERPRINT.
 */
export function rewardRecipeFingerprint(
  recipe?: BuiltInRewardRecipe | null
): string {
  if (!recipe || isDefaultRewardRecipe(recipe)) {
    return DEFAULT_REWARD_RECIPE_FINGERPRINT;
  }
  const n = normalizeBuiltInRewardRecipe(recipe);
  const payload = [
    n.speed.belowGateDistance,
    n.speed.peak,
    n.speed.distance,
    n.jumpSpeed.peakSpeed,
    n.jumpSpeed.clearance,
    n.jumpSpeed.airtime,
  ]
    .map(v => Number(v).toFixed(6))
    .join('|');
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `r${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Goal-specific coeff slice (defaults when goal is not a pilot). */
export function getSpeedRewardCoeffs(
  recipe?: BuiltInRewardRecipe | null
): SpeedRewardCoeffs {
  return normalizeBuiltInRewardRecipe(recipe).speed;
}

export function getJumpSpeedRewardCoeffs(
  recipe?: BuiltInRewardRecipe | null
): JumpSpeedRewardCoeffs {
  return normalizeBuiltInRewardRecipe(recipe).jumpSpeed;
}

/** Slider metadata for the Elite Rewards overlay. */
export type RewardCoeffSliderSpec = {
  path: 'speed.belowGateDistance' | 'speed.peak' | 'speed.distance'
    | 'jumpSpeed.peakSpeed' | 'jumpSpeed.clearance' | 'jumpSpeed.airtime';
  label: string;
  min: number;
  max: number;
  step: number;
};

export function rewardCoeffSlidersForGoal(
  goal: EvolutionGoal
): RewardCoeffSliderSpec[] {
  if (goal === EvolutionGoal.SPEED) {
    return [
      {
        path: 'speed.belowGateDistance',
        label: 'Gated travel',
        min: 0,
        max: 1,
        step: 0.01,
      },
      { path: 'speed.peak', label: 'Peak speed', min: 0, max: 120, step: 1 },
      { path: 'speed.distance', label: 'Distance', min: 0, max: 2, step: 0.01 },
    ];
  }
  if (goal === EvolutionGoal.JUMP_SPEED) {
    return [
      {
        path: 'jumpSpeed.peakSpeed',
        label: 'Peak airspeed',
        min: 0,
        max: 120,
        step: 1,
      },
      {
        path: 'jumpSpeed.clearance',
        label: 'Clearance',
        min: 0,
        max: 2,
        step: 0.01,
      },
      {
        path: 'jumpSpeed.airtime',
        label: 'Airtime',
        min: 0,
        max: 2,
        step: 0.01,
      },
    ];
  }
  return [];
}

export function readRewardCoeff(
  recipe: BuiltInRewardRecipe,
  path: RewardCoeffSliderSpec['path']
): number {
  const n = normalizeBuiltInRewardRecipe(recipe);
  switch (path) {
    case 'speed.belowGateDistance':
      return n.speed.belowGateDistance;
    case 'speed.peak':
      return n.speed.peak;
    case 'speed.distance':
      return n.speed.distance;
    case 'jumpSpeed.peakSpeed':
      return n.jumpSpeed.peakSpeed;
    case 'jumpSpeed.clearance':
      return n.jumpSpeed.clearance;
    case 'jumpSpeed.airtime':
      return n.jumpSpeed.airtime;
  }
}

export function patchRewardCoeff(
  recipe: BuiltInRewardRecipe | undefined,
  path: RewardCoeffSliderSpec['path'],
  value: number
): BuiltInRewardRecipe {
  const next = cloneBuiltInRewardRecipe(recipe);
  const v = Number.isFinite(value) ? value : readRewardCoeff(next, path);
  switch (path) {
    case 'speed.belowGateDistance':
      next.speed.belowGateDistance = v;
      break;
    case 'speed.peak':
      next.speed.peak = v;
      break;
    case 'speed.distance':
      next.speed.distance = v;
      break;
    case 'jumpSpeed.peakSpeed':
      next.jumpSpeed.peakSpeed = v;
      break;
    case 'jumpSpeed.clearance':
      next.jumpSpeed.clearance = v;
      break;
    case 'jumpSpeed.airtime':
      next.jumpSpeed.airtime = v;
      break;
  }
  return next;
}
