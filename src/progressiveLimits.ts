/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * When a goal limit is beaten, raise the next limit (gap, bar, finish, challenge target).
 */

import { Creature, EvolutionGoal, SimulationConfig } from './types';
import { BASE_GAP_WIDTH, clampGapWidthPx, clampTowerHeightPx } from './physicsConstants';
import { CREATURE_WORLD_SCALE } from './creatureScale';

const GAP_GOALS = new Set<EvolutionGoal>([
  EvolutionGoal.MOTOR_GAP,
  EvolutionGoal.AERIAL_CROSSING,
  EvolutionGoal.MOTOR_LAUNCH_LAND,
  EvolutionGoal.PARA_RAMP_GLIDE,
  EvolutionGoal.MOTOR_BRIDGE,
  EvolutionGoal.BALANCE_BEAM,
]);

const FINISH_GOALS = new Set<EvolutionGoal>([
  EvolutionGoal.SPRINT_FINISH,
  EvolutionGoal.MOTOR_HURDLES,
  EvolutionGoal.MOTOR_SLALOM,
  EvolutionGoal.DODGEBALL,
  EvolutionGoal.MOTOR_LOOP,
  EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
]);

/** Fraction to grow gap width / challenge targets after each clear. */
export const LIMIT_GROWTH = 1.15;

export type LimitEscalation = {
  arenaPatch?: Partial<SimulationConfig['arena']>;
  reason?: string;
};

/**
 * Inspect the best creature of a finished generation and escalate limits when beaten.
 */
export function escalateLimitsAfterGeneration(
  goal: EvolutionGoal,
  arena: SimulationConfig['arena'],
  best: Creature | undefined
): LimitEscalation {
  if (!best) return {};

  const tier = arena.progressiveTier ?? 0;

  if (GAP_GOALS.has(goal) && best.gapCleared) {
    const nextGap = clampGapWidthPx(Math.round((arena.gapWidthPx || BASE_GAP_WIDTH) * LIMIT_GROWTH));
    return {
      arenaPatch: {
        gapWidthPx: nextGap,
        progressiveTier: tier + 1,
        ...(arena.pitEnabled || GAP_GOALS.has(goal) ? {} : { pitEnabled: true }),
      },
      reason: `Gap cleared — width → ${nextGap}px (tier ${tier + 1})`,
    };
  }

  if (goal === EvolutionGoal.CLEAR_BAR && best.clearedBar) {
    return {
      arenaPatch: { progressiveTier: tier + 1 },
      reason: `Bar cleared — height tier ${tier + 1}`,
    };
  }

  if (FINISH_GOALS.has(goal) && best.crossedFinish) {
    return {
      arenaPatch: { progressiveTier: tier + 1 },
      reason: `Finish reached — course tier ${tier + 1}`,
    };
  }

  if (goal === EvolutionGoal.MOTOR_HURDLES && (best.hurdlesCleared ?? 0) >= 6) {
    return {
      arenaPatch: { progressiveTier: tier + 1 },
      reason: `All hurdles cleared — tier ${tier + 1}`,
    };
  }

  if (goal === EvolutionGoal.PARKING_ZONE && (best.parkingFrames ?? 0) > 90) {
    return {
      arenaPatch: { progressiveTier: tier + 1 },
      reason: `Park held — zone pushed (tier ${tier + 1})`,
    };
  }

  if (
    goal === EvolutionGoal.HIGH_JUMP ||
    goal === EvolutionGoal.JUMP_LAND_UPRIGHT ||
    goal === EvolutionGoal.JUMP_HANG_TIME ||
    goal === EvolutionGoal.FLIGHT_HEIGHT ||
    goal === EvolutionGoal.FLIGHT_LAND ||
    goal === EvolutionGoal.CHUTE_DESCENT
  ) {
    // Soft escalate on strong jump / flight height relative to prior tier baseline
    const jump = Math.max(
      best.jumpHeightBestClearance ?? 0,
      best.airbornePeakHeight ?? 0,
      best.flightPeakClearance ?? 0
    );
    // Height bars were authored against legacy ~120px bodies; scale to world px.
    const bar = (80 + tier * 18) * CREATURE_WORLD_SCALE;
    if (jump >= bar) {
      const patch: Partial<SimulationConfig['arena']> = { progressiveTier: tier + 1 };
      if (goal === EvolutionGoal.CHUTE_DESCENT) {
        patch.towerHeightPx = clampTowerHeightPx(
          Math.round((arena.towerHeightPx ?? 280) * LIMIT_GROWTH)
        );
      }
      return {
        arenaPatch: patch,
        reason: goal === EvolutionGoal.CHUTE_DESCENT
          ? `Soft landing — tower height → ${patch.towerHeightPx}px (tier ${tier + 1})`
          : `Height ${jump.toFixed(1)}px beat ${bar.toFixed(1)}px — tier ${tier + 1}`,
      };
    }
  }

  if (
    goal === EvolutionGoal.LONG_JUMP ||
    goal === EvolutionGoal.JUMP_LEFT ||
    goal === EvolutionGoal.HOP_RIGHT ||
    goal === EvolutionGoal.HOP_LEFT ||
    goal === EvolutionGoal.FLIGHT_RIGHT ||
    goal === EvolutionGoal.FLIGHT_LEFT
  ) {
    const dist =
      goal === EvolutionGoal.JUMP_LEFT ||
      goal === EvolutionGoal.HOP_LEFT ||
      goal === EvolutionGoal.FLIGHT_LEFT
        ? Math.max(best.flightDistanceLeft ?? 0, best.hopDistanceLeft ?? 0)
        : Math.max(best.flightDistance ?? 0, best.hopDistanceRight ?? 0);
    const bar = (120 + tier * 40) * CREATURE_WORLD_SCALE;
    if (dist >= bar) {
      return {
        arenaPatch: { progressiveTier: tier + 1 },
        reason: `Air distance ${dist.toFixed(0)} beat ${bar.toFixed(0)} — tier ${tier + 1}`,
      };
    }
  }

  if (
    goal === EvolutionGoal.JUMP_SPEED ||
    goal === EvolutionGoal.HOP_SPEED ||
    goal === EvolutionGoal.FLIGHT_AIRSPEED ||
    goal === EvolutionGoal.SPEED ||
    goal === EvolutionGoal.MOTOR_LANDSPEED
  ) {
    const peak =
      goal === EvolutionGoal.MOTOR_LANDSPEED
        ? best.peakLandSpeed ?? 0
        : goal === EvolutionGoal.SPEED
          ? best.peakSpeed ?? 0
          : goal === EvolutionGoal.HOP_SPEED
            ? best.hopPeakSpeed ?? 0
            : best.peakAirSpeed ?? 0;
    const bar =
      goal === EvolutionGoal.SPEED || goal === EvolutionGoal.MOTOR_LANDSPEED
        ? 4 + tier * 0.6
        : 3.5 + tier * 0.55;
    if (peak >= bar) {
      return {
        arenaPatch: { progressiveTier: tier + 1 },
        reason: `Speed ${peak.toFixed(1)} beat ${bar.toFixed(1)} — tier ${tier + 1}`,
      };
    }
  }

  if (goal === EvolutionGoal.JUMP_ACROBATICS || goal === EvolutionGoal.FLIGHT_ACROBATICS) {
    const rot = best.airborneRotation ?? 0;
    const bar = Math.PI + tier * (Math.PI * 0.5);
    if (rot >= bar) {
      return {
        arenaPatch: { progressiveTier: tier + 1 },
        reason: `Rotation ${(rot / Math.PI).toFixed(1)}π beat ${(bar / Math.PI).toFixed(1)}π — tier ${tier + 1}`,
      };
    }
  }

  if (
    goal === EvolutionGoal.LOCOMOTION_RIGHT ||
    goal === EvolutionGoal.SHUFFLE_RIGHT ||
    goal === EvolutionGoal.MOTOR_DRIVE ||
    goal === EvolutionGoal.MOTOR_ICE
  ) {
    const dist = Math.max(0, best.currentX - best.startX);
    // Locomotion / motor travel bars stay arena-scale (bodies still cover hundreds
    // of world px per episode); only jump/flight height+air bars were legacy-sized.
    const bar = 600 + tier * 120;
    if (dist >= bar) {
      return {
        arenaPatch: { progressiveTier: tier + 1 },
        reason: `Distance ${dist.toFixed(0)} beat ${bar} — tier ${tier + 1}`,
      };
    }
  }

  return {};
}

/** Raise challenge live target after it is beaten. */
export function nextChallengeTarget(current: number, base: number): number {
  return Math.round(Math.max(current, base) * LIMIT_GROWTH);
}
