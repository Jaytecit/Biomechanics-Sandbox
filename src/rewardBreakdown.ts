/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Goal-specific reward term breakdown for the leader overlay.
 * Components mirror calculateFitness formulas so totals stay aligned.
 */

import {
  Creature,
  CustomGoalConfig,
  EvolutionGoal,
  Obstacle,
  ParaPilotStage,
  WorldObject,
  DEFAULT_CUSTOM_GOAL,
} from './types';
import { calculateFitness, GROUND_Y } from './physics';
import { paraRampFitness } from './paraPilot';
import { FINISH_LINE_X, PARK_ZONE_X, PARK_ZONE_WIDTH } from './arenas';
import {
  BuiltInRewardRecipe,
  getJumpSpeedRewardCoeffs,
  getSpeedRewardCoeffs,
} from './builtInRewardCoeffs';
import {
  AGENT_SPAWN_X,
  SHUFFLE_OSC_WEIGHT,
  WALK_ALTERNATE_BONUS,
  LOCOMOTION_SLIDE_SHAPING,
  LOCOMOTION_SAME_FOOT_SCALE,
  flightRewardMinClearance,
  FLIGHT_EXCESS_PEAK_MIN,
  SPEED_MIN_TRAVEL_FLOOR,
  JUMP_MIN_FRAMES,
  jumpRewardMinClearance,
  TYPICAL_BODY_HEIGHT,
  GAP_PRE_JUMP_BONUS,
  GAP_CLEAR_SPEED_MUL,
  GAP_ATTEMPT_SPEED_MUL,
  BOX_PUSH_NEAR_PX,
  BOX_PUSH_FALLOFF_PX,
  CLEAR_BAR_APPROACH_LEAD_PX,
  CLEAR_BAR_APPROACH_WIDTH_PX,
} from './physicsConstants';
import { getGoalInfo } from './goalCatalog';

export interface RewardComponent {
  id: string;
  label: string;
  value: number;
}

export interface RewardBreakdown {
  goal: EvolutionGoal;
  goalLabel: string;
  total: number;
  components: RewardComponent[];
}

export type RewardDelta = 'up' | 'down' | 'flat' | 'new';

function c(id: string, label: string, value: number): RewardComponent {
  return { id, label, value: Number.isFinite(value) ? value : 0 };
}

function creatureFlightMinClearance(creature: Creature): number {
  return flightRewardMinClearance(
    creature.restBodyHeight ?? 0,
    creature.restBodyWidth ?? 0
  );
}

function flightExcessClearance(clearance: number, minClear: number): number {
  return Math.max(0, clearance - minClear);
}

function boutFlapFrames(creature: Creature, base?: number): number {
  return Math.max(0, (creature.wingFlapFrames ?? 0) - (base ?? 0));
}

function boutFlapWork(creature: Creature, base?: number): number {
  return Math.max(0, (creature.wingFlapWork ?? 0) - (base ?? 0));
}

function boutSymFrames(creature: Creature, base?: number): number {
  return Math.max(0, (creature.wingSymFlapFrames ?? 0) - (base ?? 0));
}

function boutSymQuality(creature: Creature, base?: number): number {
  return Math.max(0, (creature.wingSymFlapQuality ?? 0) - (base ?? 0));
}

function stayAloftBreakdown(creature: Creature): RewardComponent[] {
  const minClear = creatureFlightMinClearance(creature);
  const frames = creature.flightTimeBoutFrames ?? 0;
  const peak = creature.flightTimeBoutPeak ?? 0;
  const integral = creature.flightTimeBoutIntegral ?? 0;
  const flapFrames = boutFlapFrames(creature, creature.flightTimeBoutFlapBase);
  const flapWork = boutFlapWork(creature, creature.flightTimeBoutWorkBase);
  const symFrames = boutSymFrames(creature, creature.flightTimeBoutSymBase);
  const symQuality = boutSymQuality(creature, creature.flightTimeBoutSymQualityBase);
  const levelFrames = creature.flightTimeBoutLevelFrames ?? 0;
  const stableHoriz = creature.flightTimeBoutStableHorizFrames ?? 0;
  const best = creature.flightTimeBestBoutScore ?? 0;

  const excessPeak = flightExcessClearance(peak, minClear);
  const meanClear = frames > 0 ? integral / frames : 0;
  const excessMean = flightExcessClearance(meanClear, minClear);
  const boutActive = frames >= 8 && excessPeak >= FLIGHT_EXCESS_PEAK_MIN;

  const sustain = boutActive
    ? frames * 2.6 + Math.pow(Math.max(0, frames - 36), 1.18) * 0.32
    : 0;
  const stableHeight = boutActive ? Math.min(excessMean, minClear * 2) * 1.15 : 0;
  const symBonus =
    Math.min(120, symFrames) * 0.65 + Math.min(180, symQuality) * 0.5;
  const levelBonus = Math.min(100, levelFrames) * 0.55;
  const horizStability = Math.min(120, stableHoriz) * 0.45;
  const flapBonus =
    Math.min(140, flapFrames) * 0.5 + Math.min(200, flapWork) * 0.08;
  const leapPenalty =
    boutActive && excessPeak > minClear * 0.7
      ? -Math.max(0, peak / Math.max(minClear, meanClear) - 1.75) * excessPeak * 0.42
      : 0;
  const liveBout = Math.max(
    0,
    sustain + stableHeight + symBonus + levelBonus + horizStability + flapBonus + leapPenalty
  );
  const bestCredit = best > liveBout + 0.01 ? best - liveBout : 0;
  const groundPenalty = -((creature.flightGroundTouches ?? 0) * 18);

  return [
    c('airtime', 'Airtime', sustain),
    c('height', 'Stable Height', stableHeight),
    c('horiz', 'Horizontal Stability', horizStability),
    c('sym', 'Symmetrical Flapping', symBonus),
    c('level', 'Level Flight', levelBonus),
    c('flap', 'Flap Effort', flapBonus),
    c('leap', 'Leap Penalty', leapPenalty),
    c('best', 'Best Bout Credit', bestCredit),
    c('ground', 'Ground Touch Penalty', groundPenalty),
  ];
}

function flightHeightBreakdown(creature: Creature): RewardComponent[] {
  const minClear = creatureFlightMinClearance(creature);
  const frames = creature.flightHeightBoutFrames ?? 0;
  const peak = creature.flightHeightBoutPeak ?? 0;
  const integral = creature.flightHeightBoutIntegral ?? 0;
  const takeoffClear = creature.flightHeightBoutTakeoffClear ?? 0;
  const poweredClimb = creature.flightHeightBoutPoweredClimb ?? 0;
  const flapFrames = boutFlapFrames(creature, creature.flightHeightBoutFlapBase);
  const flapWork = boutFlapWork(creature, creature.flightHeightBoutWorkBase);
  const symFrames = boutSymFrames(creature, creature.flightHeightBoutSymBase);
  const symQuality = boutSymQuality(creature, creature.flightHeightBoutSymQualityBase);
  const verticalTravel = creature.flightHeightBoutVerticalTravel ?? 0;
  const levelFrames = creature.flightHeightBoutLevelFrames ?? 0;
  const best = creature.flightHeightBestBoutScore ?? 0;

  const excessPeak = flightExcessClearance(peak, minClear);
  const mean = integral / Math.max(1, frames);
  const excessMean = flightExcessClearance(mean, minClear);
  const sustainGate = Math.min(1, Math.max(0, frames - 24) / 72);
  const flapGate = Math.min(1, Math.max(0, flapFrames) / 28);
  const glideEvidence = Math.min(1, Math.max(0, frames - 90) / 90);
  const aeroEvidence = Math.max(flapGate, glideEvidence);
  const boutValid = frames >= 12 && excessPeak >= FLIGHT_EXCESS_PEAK_MIN && aeroEvidence >= 0.08;

  const leapiness =
    boutValid && excessPeak > minClear * 0.8
      ? Math.max(0, peak / Math.max(minClear, mean) - 1.65)
      : 0;
  const sustainedPeak = Math.min(excessPeak, excessMean * 1.45 + minClear * 0.15);

  const cruise = boutValid
    ? Math.min(excessMean, minClear * 2.5) * 2.6 * sustainGate * aeroEvidence
    : 0;
  const peakScore = boutValid
    ? sustainedPeak * 1.35 * sustainGate * (0.25 + 0.75 * aeroEvidence)
    : 0;
  const climbScore = boutValid
    ? Math.min(minClear * 1.5, Math.max(0, poweredClimb)) * 2.1 * (0.3 + 0.7 * flapGate)
    : 0;
  const rawClimb = Math.max(0, peak - Math.max(0, takeoffClear));
  const climbShaping = boutValid
    ? Math.min(minClear * 1.2, rawClimb) * 0.35 * sustainGate * flapGate
    : 0;
  const flapBonus = boutValid
    ? Math.min(80, flapFrames) * 0.25 + Math.min(120, flapWork) * 0.05
    : 0;
  const symBonus = boutValid
    ? Math.min(110, symFrames) * 0.55 + Math.min(160, symQuality) * 0.45
    : 0;
  const levelBonus = boutValid ? Math.min(90, levelFrames) * 0.5 : 0;
  const vertScore = boutValid
    ? Math.min(minClear * 2, Math.max(0, verticalTravel)) * 1.8 * sustainGate * aeroEvidence
    : 0;
  const leapPenalty = boutValid ? -leapiness * excessPeak * 0.55 : 0;
  const liveTotal = Math.max(
    0,
    cruise + peakScore + climbScore + climbShaping + flapBonus + symBonus + levelBonus + vertScore + leapPenalty
  );
  const bestCredit = best > liveTotal + 0.01 ? best - liveTotal : 0;

  return [
    c('cruise', 'Cruise Altitude', cruise),
    c('peak', 'Sustained Peak', peakScore),
    c('climb', 'Powered Climb', climbScore),
    c('vertical', 'Vertical Travel', vertScore),
    c('sym', 'Symmetrical Flapping', symBonus),
    c('level', 'Level Flight', levelBonus),
    c('flap', 'Flap Effort', flapBonus),
    c('shaping', 'Climb Shaping', climbShaping),
    c('leap', 'Leap Penalty', leapPenalty),
    c('best', 'Best Bout Credit', bestCredit),
  ];
}

function flightDirectionBreakdown(
  creature: Creature,
  direction: 'right' | 'left'
): RewardComponent[] {
  const minClear = creatureFlightMinClearance(creature);
  const best =
    direction === 'right'
      ? creature.flightRightBestBoutScore ?? 0
      : creature.flightLeftBestBoutScore ?? 0;
  const dist =
    direction === 'right'
      ? creature.attemptBoutRight ?? 0
      : creature.attemptBoutLeft ?? 0;
  const frames = creature.attemptBoutFrames ?? 0;
  const peak = creature.attemptBoutPeakClearance ?? 0;
  const boutValid = frames >= 8 && peak >= minClear;
  const travel = boutValid ? dist * 1.85 : 0;
  const duration = boutValid ? Math.min(frames, 200) * 0.35 : 0;
  const live = travel + duration;
  const bestCredit = best > live + 0.01 ? best - live : 0;

  return [
    c('travel', 'In-Flight Travel', travel),
    c('duration', 'Unbroken Duration', duration),
    c('best', 'Best Bout Credit', bestCredit),
  ];
}

function airspeedBreakdown(creature: Creature): RewardComponent[] {
  const minClear = creatureFlightMinClearance(creature);
  const best = creature.flightAirspeedBestBoutScore ?? 0;
  const peak = creature.flightAirspeedBoutPeak ?? 0;
  const frames = creature.flightAirspeedBoutFrames ?? 0;
  const dist = creature.flightAirspeedBoutDist ?? 0;
  const clearance = creature.flightAirspeedBoutPeakClearance ?? 0;
  const rotation = creature.flightAirspeedBoutRotation ?? 0;
  const spinInvalid = rotation >= Math.PI * 2;
  const boutValid = frames >= 8 && clearance >= minClear && !spinInvalid;
  const peakScore = boutValid ? peak * 55 : 0;
  const sustain = boutValid ? Math.min(frames, 160) * 0.4 : 0;
  const travel = boutValid ? dist * 0.12 : 0;
  const live = peakScore + sustain + travel;
  const bestCredit = best > live + 0.01 ? best - live : 0;
  const spinPenalty = spinInvalid && frames >= 8 && clearance >= minClear ? -live : 0;

  return [
    c('peak', 'Peak Airspeed', peakScore),
    c('sustain', 'Unbroken Flight', sustain),
    c('travel', 'Air Distance', travel),
    c('best', 'Best Bout Credit', bestCredit),
    c('spin', 'Full Spin Penalty', spinPenalty),
  ];
}

function flightAcrobaticsBreakdown(creature: Creature): RewardComponent[] {
  const minClear = creatureFlightMinClearance(creature);
  const best = creature.flightAcrobaticsBestBoutScore ?? 0;
  const rot = creature.attemptBoutRotation ?? 0;
  const air = creature.attemptBoutFrames ?? 0;
  const peak = creature.attemptBoutPeakClearance ?? 0;
  const vertDescent = creature.attemptBoutVertDescent ?? 0;
  const boutValid = peak >= minClear;
  const flips = Math.floor(rot / (Math.PI * 2));
  const airGate = Math.min(1, air / 48);
  const heightGate = Math.min(
    1,
    flightExcessClearance(peak, minClear) / Math.max(1, minClear * 0.75)
  );
  const gate = airGate * heightGate;
  const rotationScore = boutValid ? rot * 28 * gate : 0;
  const flipScore = boutValid ? flips * 90 * gate : 0;
  const heightCredit = boutValid
    ? Math.min(flightExcessClearance(peak, minClear), minClear * 1.5) * 0.4 * gate
    : 0;
  const diveScore =
    boutValid && vertDescent > minClear * 0.35
      ? Math.min(90, vertDescent * 0.65) * Math.min(1, rot / Math.PI)
      : 0;
  const live = rotationScore + flipScore + heightCredit + diveScore;
  const bestCredit = best > live + 0.01 ? best - live : 0;

  return [
    c('rotation', 'Spin / Tumble', rotationScore),
    c('flips', 'Full Rotations', flipScore),
    c('dive', 'Dive / Plunge', diveScore),
    c('height', 'Airborne Height', heightCredit),
    c('best', 'Best Bout Credit', bestCredit),
  ];
}

function glideRangeBreakdown(creature: Creature): RewardComponent[] {
  const minClear = creatureFlightMinClearance(creature);
  const best = creature.glideBestBoutScore ?? 0;
  const flyDist = creature.glideBoutDistance ?? 0;
  const air = creature.glideBoutFrames ?? 0;
  const peak = creature.glideBoutPeakClearance ?? 0;
  const meanClear = air > 0 ? (creature.glideBoutHeightIntegral ?? 0) / air : 0;
  const corridor = creature.glideBoutCorridorFrames ?? 0;
  const corridorDist = creature.glideBoutCorridorDist ?? 0;
  const openGlide = creature.glideBoutOpenDist ?? 0;
  const technique = (creature.glideBoutTechniqueBonus ?? 0) * 0.75;
  const landed = !!creature.glideHasLanded;

  const excessPeak = flightExcessClearance(peak, minClear);
  const excessMean = flightExcessClearance(meanClear, minClear);
  const boutValid = !landed && air >= 12 && excessPeak >= FLIGHT_EXCESS_PEAK_MIN;
  const leapiness =
    boutValid && excessPeak > minClear * 0.6
      ? Math.max(0, peak / Math.max(minClear, meanClear) - 1.55)
      : 0;
  const sustainGate = Math.min(1, air / 140);
  const cruiseHeight = boutValid
    ? Math.min(excessMean, minClear * 2) * 2.4 + Math.min(excessPeak, minClear * 2.2) * 0.12
    : 0;
  const streakBonus = boutValid
    ? air * 1.35 + Math.pow(Math.max(0, air - 100), 1.25) * 0.22
    : 0;
  const corridorBonus = boutValid ? corridor * 5.2 + corridorDist * 3.8 : 0;
  const distScore = boutValid
    ? flyDist * 0.85 * (0.12 + 0.88 * sustainGate) + openGlide * 0.9 * sustainGate
    : 0;
  const leapPenalty = boutValid ? -leapiness * excessPeak * 0.45 : 0;
  const live = Math.max(
    0,
    corridorBonus + streakBonus + distScore + cruiseHeight + technique + leapPenalty
  );
  const bestCredit = best > live + 0.01 ? best - live : 0;
  const lockout = landed && live <= 0 ? 0 : 0;

  return [
    c('corridor', 'Glide Corridor', corridorBonus),
    c('streak', 'Unbroken Airtime', streakBonus),
    c('distance', 'Glide Distance', distScore),
    c('cruise', 'Cruise Height', cruiseHeight),
    c('technique', 'Launch Technique', technique),
    c('leap', 'Leap Penalty', leapPenalty),
    c('best', 'Initial Glide Credit', bestCredit),
    c('landed', 'Post-Landing Lockout', lockout),
  ];
}

function aerialCrossingBreakdown(creature: Creature): RewardComponent[] {
  const landing = creature.aerialCrossingLanded ? 400 : 0;
  const bestShaping = creature.aerialCrossingBestShaping ?? 0;
  const frames = creature.attemptBoutFrames ?? 0;
  const dist = creature.attemptBoutRight ?? 0;
  const liveShaping =
    frames >= 3 ? Math.min(180, dist * 0.5 + Math.min(120, frames) * 0.25) : 0;
  const shaping = Math.max(bestShaping, liveShaping);
  const travel = Math.min(180, dist * 0.5);
  const airtime = Math.min(180, Math.min(120, frames) * 0.25);
  const bestCredit =
    bestShaping > liveShaping + 0.01 ? bestShaping - liveShaping : 0;

  return [
    c('landing', 'Supported Landing', landing),
    c('travel', 'In-Flight Travel', travel),
    c('airtime', 'In-Flight Duration', airtime),
    c('best', 'Best Bout Credit', bestCredit),
  ];
}

function locomotionBreakdown(creature: Creature, direction: 'right' | 'left'): RewardComponent[] {
  const stepCount =
    direction === 'right'
      ? creature.walkStepCountRight ?? 0
      : creature.walkStepCountLeft ?? 0;
  const altCount =
    direction === 'right'
      ? creature.walkAlternateStepCountRight ?? 0
      : creature.walkAlternateStepCountLeft ?? 0;
  const strides = Math.max(
    0,
    direction === 'right'
      ? creature.walkStrideDistanceRight ?? 0
      : creature.walkStrideDistanceLeft ?? 0
  );
  const body =
    direction === 'right'
      ? Math.max(0, creature.currentX - creature.startX)
      : Math.max(0, creature.startX - creature.currentX);

  if (stepCount <= 0) {
    return [
      c('travel', 'Forward Travel', body * LOCOMOTION_SLIDE_SHAPING),
      c('altBonus', 'Step Bonus', 0),
    ];
  }

  const travel = strides > 0 ? Math.min(body, strides) : body;
  if (altCount <= 0) {
    return [
      c('travel', 'Forward Travel', travel * LOCOMOTION_SAME_FOOT_SCALE),
      c('altBonus', 'Step Bonus', 0),
    ];
  }

  const altBonus = Math.min(altCount * WALK_ALTERNATE_BONUS, travel);
  return [
    c('travel', 'Forward Travel', travel),
    c('altBonus', 'Step Bonus', altBonus),
  ];
}

function shuffleBreakdown(creature: Creature, direction: 'right' | 'left'): RewardComponent[] {
  const body =
    direction === 'right'
      ? Math.max(0, creature.currentX - creature.startX)
      : Math.max(0, creature.startX - creature.currentX);
  const osc = Math.max(
    0,
    direction === 'right'
      ? creature.shuffleOscDistanceRight ?? 0
      : creature.shuffleOscDistanceLeft ?? 0
  );
  const oscBonus = SHUFFLE_OSC_WEIGHT * Math.min(osc, body);
  return [
    c('travel', 'Body Travel', body),
    c('osc', 'Oscillation Bonus', oscBonus),
  ];
}

function speedBreakdown(
  creature: Creature,
  recipe?: BuiltInRewardRecipe
): RewardComponent[] {
  const coeffs = getSpeedRewardCoeffs(recipe);
  const peak = creature.peakSupportedSpeed ?? creature.peakSpeed ?? 0;
  const distance = Math.max(0, creature.currentX - creature.startX);
  const minTravel = Math.max(SPEED_MIN_TRAVEL_FLOOR, (creature.restBodyWidth ?? 0) * 0.5);
  if (distance < minTravel) {
    return [c('travel', 'Travel (gated)', distance * coeffs.belowGateDistance)];
  }
  return [
    c('peak', 'Peak Supported Speed', peak * coeffs.peak),
    c('travel', 'Distance', distance * coeffs.distance),
  ];
}

function jumpSpeedBreakdown(
  creature: Creature,
  recipe?: BuiltInRewardRecipe
): RewardComponent[] {
  const coeffs = getJumpSpeedRewardCoeffs(recipe);
  const jumpMin = jumpRewardMinClearance(creature.restBodyHeight ?? 0);
  const metrics = creature.jumpSpeedBestBoutMetrics;
  const liveFrames = creature.aerialBoutIsHop ? 0 : (creature.jumpHangBoutFrames ?? 0);
  const livePeak = creature.aerialBoutIsHop
    ? 0
    : (creature.aerialBoutPeakLowestClearance ?? 0);
  const liveSpeed = creature.aerialBoutIsHop
    ? 0
    : (creature.aerialBoutPeakSpeed ?? 0);

  const bestOk =
    metrics &&
    metrics.frames >= JUMP_MIN_FRAMES &&
    metrics.peakClearance >= jumpMin;
  const liveOk = liveFrames >= JUMP_MIN_FRAMES && livePeak >= jumpMin;

  const bestTotal = bestOk
    ? metrics!.peakSpeed * coeffs.peakSpeed +
      Math.min(metrics!.peakClearance, jumpMin * 3) * coeffs.clearance +
      Math.min(metrics!.frames, 80) * coeffs.airtime
    : 0;
  const liveTotal = liveOk
    ? liveSpeed * coeffs.peakSpeed +
      Math.min(livePeak, jumpMin * 3) * coeffs.clearance +
      Math.min(liveFrames, 80) * coeffs.airtime
    : 0;

  const useLive = liveTotal >= bestTotal;
  const peakSpeed = useLive ? liveSpeed : (metrics?.peakSpeed ?? 0);
  const peakClearance = useLive ? livePeak : (metrics?.peakClearance ?? 0);
  const frames = useLive ? liveFrames : (metrics?.frames ?? 0);
  const ok = useLive ? liveOk : bestOk;

  if (!ok) {
    const legacy = creature.jumpSpeedBestBoutScore ?? 0;
    if (legacy > 0 && !metrics) {
      return [c('speed', 'Jump Speed', legacy)];
    }
    return [
      c('peak', 'Peak Airspeed', 0),
      c('clearance', 'Clearance', 0),
      c('airtime', 'Airtime', 0),
    ];
  }

  return [
    c('peak', 'Peak Airspeed', peakSpeed * coeffs.peakSpeed),
    c(
      'clearance',
      'Clearance',
      Math.min(peakClearance, jumpMin * 3) * coeffs.clearance
    ),
    c('airtime', 'Airtime', Math.min(frames, 80) * coeffs.airtime),
  ];
}

function clearBarBreakdown(creature: Creature, obstacles: Obstacle[]): RewardComponent[] {
  const bar = obstacles.find(o => o.type === 'bar');
  const jumpH = Math.max(
    creature.jumpHeightBestClearance ?? 0,
    creature.aerialBoutIsHop ? 0 : creature.aerialBoutPeakLowestClearance ?? 0
  );
  if (!bar) return [c('height', 'Jump Height', jumpH)];
  const barTop = bar.y;
  const approach = Math.max(
    0,
    Math.min(
      1,
      (creature.currentX - (bar.x - CLEAR_BAR_APPROACH_LEAD_PX)) /
        CLEAR_BAR_APPROACH_WIDTH_PX
    )
  );
  const clearance = Math.max(0, jumpH - (GROUND_Y - barTop));
  const clearBonus = creature.clearedBar
    ? 80 + clearance * 2
    : clearance * 0.5 * approach;
  return [
    c('height', 'Height Credit', jumpH * 0.35),
    c('clear', 'Clear Bonus', clearBonus),
  ];
}

function stayTallBreakdown(creature: Creature): RewardComponent[] {
  const sustained = creature.stayTallIntegral ?? 0;
  const falls = creature.stayTallFallFrames ?? 0;
  return [
    c('posture', 'Supported Posture', sustained),
    c('falls', 'Fall Penalty', -falls * 0.35),
  ];
}

function hopSpeedBreakdown(creature: Creature): RewardComponent[] {
  const jumpMin = Math.max(1, (creature.restBodyHeight ?? TYPICAL_BODY_HEIGHT) * 0.15);
  const livePeak = creature.aerialBoutPeakLowestClearance ?? 0;
  const liveSpeed =
    creature.aerialBoutIsHop &&
    (creature.jumpHangBoutFrames ?? 0) > 0 &&
    livePeak >= jumpMin
      ? creature.aerialBoutPeakSpeed ?? 0
      : 0;
  const peak = Math.max(creature.hopPeakSpeed ?? 0, liveSpeed);
  const travel =
    (creature.hopDistanceRight ?? 0) + (creature.hopDistanceLeft ?? 0);
  return [
    c('peak', 'Peak Hop Speed', peak * 55),
    c('travel', 'Hop Travel', Math.min(travel, 200) * 0.15),
  ];
}

function stairBreakdown(creature: Creature): RewardComponent[] {
  const supported = creature.stairPeakHeight ?? 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  return [
    c('height', 'Supported Height', supported * 2.8),
    c('forward', 'Forward Progress', forward * 0.12),
  ];
}

function obstacleClimbBreakdown(creature: Creature): RewardComponent[] {
  const mounts = Math.max(0, creature.obstacleClimbMountCount ?? 0);
  if (mounts === 0) {
    return [
      c('mounts', 'Ordered Mounts', 0),
      c('height', 'Supported Height', 0),
      c('progress', 'Supported Progress', 0),
    ];
  }
  const supportedHeight = Math.max(0, creature.obstacleClimbSupportedHeight ?? 0);
  const supportedProgress = Math.max(
    0,
    (creature.obstacleClimbSupportedX ?? creature.startX) - creature.startX
  );
  return [
    c('mounts', 'Ordered Mounts', mounts * 250),
    c('height', 'Supported Height', supportedHeight * 1.5),
    c('progress', 'Supported Progress', supportedProgress * 0.1),
  ];
}

function motorRampBreakdown(creature: Creature): RewardComponent[] {
  const rampH = creature.rampPeakHeight ?? 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  return [
    c('height', 'Ramp Height', rampH * 2.5),
    c('forward', 'Forward Progress', forward * 0.4),
  ];
}

function gapBreakdown(creature: Creature): RewardComponent[] {
  const forward = Math.max(0, creature.currentX - creature.startX);
  const span = Math.max(0, Math.min(1, creature.gapSpanFraction ?? 0));
  const clear = creature.gapCleared ? 180 : 0;
  const spanScore = creature.gapCleared ? 0 : span * 100;
  const preJump = creature.gapPreJump ? GAP_PRE_JUMP_BONUS : 0;
  const approach = creature.fellInPit
    ? Math.min(forward, 250) * 0.08
    : forward * 0.35;
  const peak = creature.peakSupportedSpeed ?? creature.peakSpeed ?? 0;
  const speedMul = creature.gapCleared
    ? GAP_CLEAR_SPEED_MUL
    : span > 0 || creature.gapPreJump
      ? GAP_ATTEMPT_SPEED_MUL
      : 0;
  return [
    c('clear', 'Gap Clear', clear),
    c('span', 'Gap Span', spanScore),
    c('preJump', 'Pre-Gap Jump', preJump),
    c('speed', 'Approach Speed', peak * speedMul),
    c('forward', creature.fellInPit ? 'Progress (fell)' : 'Forward Progress', approach),
  ];
}

function launchLandBreakdown(creature: Creature): RewardComponent[] {
  const land = creature.wheelLandScore ?? 0;
  const gap = creature.gapCleared ? 220 : 0;
  const pitPenalty = creature.fellInPit ? -120 : 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  const progress = creature.gapCleared
    ? forward * 0.05
    : Math.min(forward, 120) * 0.012;
  return [
    c('land', 'Pad Landing', land * 1.75),
    c('gap', 'Gap Clear', gap),
    c('progress', 'Approach', progress),
    c('pit', 'Pit Penalty', pitPenalty),
  ];
}

function hoopBreakdown(
  creature: Creature,
  objects: WorldObject[],
  obstacles: Obstacle[] = []
): RewardComponent[] {
  const hoop = objects.find(o => o.type === 'hoop');
  const rawTravel = hoop
    ? Math.max(0, hoop.x - hoop.startX)
    : Math.max(0, creature.currentX - creature.startX);
  const grounded = creature.hoopGroundedTravel ?? 0;
  const lofted = Math.max(0, rawTravel - grounded);
  const finishObs = obstacles.find(o => o.type === 'finish');
  const finishSpan = finishObs ? Math.max(1, finishObs.x - AGENT_SPAWN_X) : 8000;
  const approach = Math.min(1, rawTravel / finishSpan);
  const outsidePenalty = Math.min(80, (creature.hoopOutsideFrames ?? 0) * 0.15);
  const loftFrames = creature.hoopLoftFrames ?? 0;
  const peakLoft = creature.hoopPeakLoft ?? 0;
  const loftPenalty = loftFrames * 0.55 + Math.min(400, peakLoft) * 1.1;
  if (creature.crossedFinish) {
    const frames = creature.finishFrame ?? creature.episodeFrames ?? 9999;
    return [
      c('finish', 'Finish Completion', 1800),
      c('time', 'Finish Time Bonus', Math.max(0, 350 - frames / 5)),
      c('grounded', 'Grounded Travel', grounded * 0.08),
      c('outside', 'Outside Penalty', -outsidePenalty),
      c('loftPen', 'Loft Penalty', -loftPenalty),
    ];
  }
  return [
    c('approach', 'Finish Approach', approach * 180),
    c('grounded', 'Grounded Travel', grounded * 0.35),
    c('lofted', 'Lofted Travel', lofted * 0.04),
    c('outside', 'Outside Penalty', -outsidePenalty),
    c('loftPen', 'Loft Penalty', -loftPenalty),
  ];
}

function hurdlesBreakdown(creature: Creature): RewardComponent[] {
  const cleared = creature.hurdlesCleared ?? 0;
  const finish = creature.crossedFinish ? 120 : 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  return [
    c('cleared', 'Hurdles Cleared', cleared * 45),
    c('finish', 'Finish Bonus', finish),
    c('forward', 'Forward Progress', forward * 0.2),
  ];
}

function timeTrialBreakdown(creature: Creature, finishX: number): RewardComponent[] {
  const cps = (creature.checkpointReached ?? -1) + 1;
  if (creature.crossedFinish) {
    const frames = creature.finishFrame ?? creature.episodeFrames ?? 9999;
    return [
      c('finish', 'Finish Bonus', 800),
      c('cps', 'Checkpoints', cps * 40),
      c('time', 'Time Bonus', Math.max(0, 700 - frames)),
    ];
  }
  const progress = Math.max(
    0,
    Math.min(1, (creature.currentX - creature.startX) / (finishX - creature.startX))
  );
  return [
    c('progress', 'Course Progress', progress * 400),
    c('cps', 'Checkpoints', cps * 50),
  ];
}

function landSpeedBreakdown(creature: Creature): RewardComponent[] {
  const peak = creature.peakLandSpeed ?? 0;
  const distance = Math.max(0, creature.currentX - creature.startX);
  const minTravel = Math.max(SPEED_MIN_TRAVEL_FLOOR, (creature.restBodyWidth ?? 0) * 0.5);
  if (distance < minTravel) {
    return [c('travel', 'Warm-up Travel', distance * 0.15)];
  }
  return [
    c('peak', 'Peak Land Speed', peak * 55),
    c('travel', 'Distance', Math.min(distance, 800) * 0.2),
  ];
}

function bridgeBreakdown(creature: Creature): RewardComponent[] {
  const distance = creature.bridgeSupportedDistance ?? 0;
  const frames = Math.min(100, creature.bridgeSupportedFrames ?? 0);
  return [
    c('distance', 'Supported Distance', distance * 1.1),
    c('frames', 'Supported Time', frames * 0.2),
    c('complete', 'Completion', creature.bridgeCompleted ? 300 : 0),
  ];
}

function parkingBreakdown(creature: Creature, obstacles: Obstacle[]): RewardComponent[] {
  const park = creature.parkingFrames ?? 0;
  const zone = obstacles.find(o => o.type === 'finish' && o.label === 'PARK');
  const zoneCenter = zone
    ? zone.x + (zone.zoneWidth ?? zone.width) / 2
    : PARK_ZONE_X + PARK_ZONE_WIDTH / 2;
  const approach = Math.max(
    0,
    PARK_ZONE_WIDTH - Math.abs(creature.currentX - zoneCenter)
  );
  return [
    c('park', 'Parked Time', park * 2.5),
    c('approach', 'Approach', approach * 0.15),
  ];
}

function kickGoalBreakdown(creature: Creature, objects: WorldObject[]): RewardComponent[] {
  const ball = objects.find(o => o.type === 'ball');
  const recent =
    ball &&
    creature.ballContactFrame !== undefined &&
    (creature.episodeFrames ?? 0) - creature.ballContactFrame <= 45;
  const ballTravel = ball && recent ? Math.max(0, ball.x - ball.startX) : 0;
  return [
    c('goal', 'Goal Scored', creature.goalScored ? 300 : 0),
    c('ball', 'Ball Travel', Math.min(100, ballTravel * 0.2)),
  ];
}

function hitTargetBreakdown(creature: Creature, objects: WorldObject[]): RewardComponent[] {
  const hits = creature.targetHits ?? 0;
  const ball = objects.find(o => o.type === 'ball');
  const recent =
    ball &&
    creature.ballContactFrame !== undefined &&
    (creature.episodeFrames ?? 0) - creature.ballContactFrame <= 45;
  const loft =
    ball && hits > 0 && recent ? Math.max(0, ball.startY - ball.y) : 0;
  return [
    c('hits', 'Target Hits', hits * 120),
    c('approach', 'Target Approach', creature.targetApproachBest ?? 0),
    c('loft', 'Loft Bonus', Math.min(40, loft * 0.4)),
  ];
}

function bowlingBreakdown(creature: Creature): RewardComponent[] {
  return [
    c('pins', 'Pins Down', (creature.pinsDown ?? 0) * 40),
    c('travel', 'Approach', Math.max(0, creature.currentX - creature.startX) * 0.1),
  ];
}

function dodgeballBreakdown(creature: Creature): RewardComponent[] {
  return [
    c('sections', 'Hazard Sections', (creature.hazardProgressCount ?? 0) * 150),
    c('finish', 'Finish Bonus', creature.crossedFinish ? 300 : 0),
    c('upright', 'Upright Progress', Math.min(50, creature.hazardUprightProgress ?? 0)),
  ];
}

function technicalBreakdown(creature: Creature): RewardComponent[] {
  const checkpoints = (creature.checkpointReached ?? -1) + 1;
  return [
    c('cps', 'Checkpoints', checkpoints * 250),
    c('finish', 'Finish Bonus', creature.crossedFinish ? 500 : 0),
    c('support', 'Supported Shaping', Math.min(100, (creature.technicalSupportedDistance ?? 0) * 0.1)),
  ];
}

function roughTerrainBreakdown(creature: Creature): RewardComponent[] {
  const checkpoints = (creature.checkpointReached ?? -1) + 1;
  const finishSpeedBonus = creature.crossedFinish
    ? Math.max(0, 100 - (creature.finishFrame ?? 1400) / 14)
    : 0;
  return [
    c('sections', 'Supported Sections', checkpoints * 200),
    c('support', 'Supported Shaping', Math.min(150, (creature.roughSupportedDistance ?? 0) * 0.08)),
    c('finish', 'Completion', creature.crossedFinish ? 500 + finishSpeedBonus : 0),
  ];
}

function balanceBeamBreakdown(creature: Creature): RewardComponent[] {
  return [
    c('distance', 'Supported Distance', (creature.beamSupportedDistance ?? 0) * 1.2),
    c('frames', 'Supported Time', Math.min(100, creature.beamSupportedFrames ?? 0) * 0.2),
    c('posture', 'Supported Posture', Math.min(100, creature.beamSupportedPosture ?? 0) * 0.1),
    c('complete', 'Completion', creature.beamCompleted ? 250 : 0),
  ];
}

function carryBallBreakdown(creature: Creature): RewardComponent[] {
  const transport = creature.carryBallTransportDistance ?? 0;
  const lift = creature.carryBallTransportPeakLift ?? 0;
  return [
    c('transport', 'Carry Distance', transport * 1.5),
    c('lift', 'Carry Lift', lift * 1.2),
  ];
}

function pushBoxBreakdown(creature: Creature, objects: WorldObject[]): RewardComponent[] {
  const box = objects.find(o => o.type === 'box');
  if (!box) return [c('push', 'Box Push', 0)];
  const halfW = Math.max(1, (box.width ?? 20) / 2);
  const halfH = Math.max(1, (box.height ?? 20) / 2);
  let minDist = Infinity;
  for (const n of creature.nodes) {
    const dx = Math.max(0, Math.abs(n.x - box.x) - halfW);
    const dy = Math.max(0, Math.abs(n.y - box.y) - halfH);
    const d = Math.hypot(dx, dy) - n.radius;
    minDist = Math.min(minDist, Math.max(0, d));
  }
  const near =
    minDist < BOX_PUSH_NEAR_PX
      ? 1
      : Math.max(0, 1 - (minDist - BOX_PUSH_NEAR_PX) / BOX_PUSH_FALLOFF_PX);
  return [c('push', 'Box Push', near * Math.max(0, box.x - box.startX))];
}

function flightLandBreakdown(creature: Creature): RewardComponent[] {
  const best = creature.flightLandBestBoutScore ?? 0;
  const land = creature.flightLandScore ?? 0;
  const climb = creature.landClimbScore ?? 0;
  const descent = creature.landDescentScore ?? 0;
  const overshoot = creature.landOvershootPenalty ?? 0;
  const streak = creature.attemptBoutFrames ?? creature.flightStreak ?? 0;
  const active =
    land * 3.0 +
    climb * 1.0 +
    descent * 2.6 -
    overshoot * 1.85 +
    Math.min(streak, 180) * 0.12;
  if (best > active + 0.01) {
    return [c('bout', 'Best Landing Bout', best)];
  }
  return [
    c('land', 'Landing', land * 3.0),
    c('climb', 'Climb', climb * 1.0),
    c('descent', 'Descent', descent * 2.6),
    c('overshoot', 'Overshoot Penalty', -overshoot * 1.85),
    c('streak', 'Air Streak', Math.min(streak, 180) * 0.12),
  ];
}

function chuteDescentBreakdown(creature: Creature): RewardComponent[] {
  const best = creature.chuteDescentBestScore ?? 0;
  const land = creature.flightLandScore ?? 0;
  const descent = creature.landDescentScore ?? 0;
  const overshoot = creature.landOvershootPenalty ?? 0;
  const streak = creature.flightStreak ?? 0;
  const active = descent * 2.4 + land * 3.2 + Math.min(streak, 220) * 0.14 - overshoot * 1.5;
  if (best > active + 0.01) {
    return [c('bout', 'Best Descent Bout', best)];
  }
  return [
    c('descent', 'Controlled Descent', descent * 2.4),
    c('land', 'Soft Landing', land * 3.2),
    c('streak', 'Air Streak', Math.min(streak, 220) * 0.14),
    c('overshoot', 'Terminal Speed Penalty', -overshoot * 1.5),
  ];
}

function paraRampBreakdown(creature: Creature, stage: ParaPilotStage): RewardComponent[] {
  const total = paraRampFitness(creature, stage);
  const launchSpeed = Math.min(creature.paraLaunchSpeed ?? 0, 40);
  const deploy = creature.sailDeploySpeed ?? 0;
  const clear = creature.gapCleared ? 1 : 0;
  const fell = !!creature.fellInPit;
  const pitMul = fell ? 0.1 : 1;

  if (stage === 'runUp') {
    const speedScore = launchSpeed * 8 * 3.2;
    const clearScore = clear * (280 + Math.min(launchSpeed, 35) * 8);
    const takeoffBonus =
      launchSpeed >= 12
        ? 80 + Math.min(launchSpeed, 45) * 6
        : Math.max(0, launchSpeed - 6) * 4;
    const landBonus =
      clear && !fell && creature.nodes.some(n => n.isGround) ? 35 : 0;
    const approach =
      Math.min(Math.max(0, creature.currentX - creature.startX), 2000) * 0.015;
    const air = Math.max(
      0,
      total -
        (speedScore + clearScore + takeoffBonus + landBonus + approach) * pitMul
    );
    return [
      c('speed', 'Ramp Launch Speed', speedScore * pitMul),
      c('takeoff', 'Takeoff Bonus', takeoffBonus * pitMul),
      c('clear', 'Gap Clear', clearScore * pitMul),
      c('land', 'Far-Side Landing', landBonus * pitMul),
      c('approach', 'Run-Up Progress', approach * pitMul),
      c('air', 'Air Credit', air),
    ];
  }

  const deployBonus =
    (deploy >= 12 ? 50 + (Math.min(deploy, 40) - 12) * 3.5 : deploy * 1.2) *
    (stage === 'deploy' ? 1.6 : 0.35);
  const speedScore = launchSpeed * 8 * (stage === 'deploy' ? 0.4 : 0.2);
  return [
    c('speed', 'Launch Speed', speedScore * pitMul),
    c('deploy', 'Deploy Bonus', deployBonus * pitMul),
    c('air', 'Glide / Air', Math.max(0, total - (speedScore + deployBonus) * pitMul)),
  ];
}

function customBreakdown(
  creature: Creature,
  customGoal: CustomGoalConfig,
  objects: WorldObject[],
  obstacles: Obstacle[]
): RewardComponent[] {
  const components: RewardComponent[] = [];
  for (const rule of customGoal.rules) {
    // Reuse calculateFitness path by scoring a one-rule config for alignment
    const single: CustomGoalConfig = {
      name: customGoal.name,
      rules: [rule],
    };
    const value = calculateFitness(
      creature,
      EvolutionGoal.CUSTOM,
      objects,
      single,
      obstacles
    );
    components.push(c(rule.id || rule.name, rule.name || rule.metric, value));
  }
  if (components.length === 0) {
    components.push(c('total', 'Custom Score', 0));
  }
  return components;
}

function singleScore(
  id: string,
  label: string,
  creature: Creature,
  goal: EvolutionGoal,
  objects: WorldObject[],
  customGoal: CustomGoalConfig,
  obstacles: Obstacle[],
  paraStage?: ParaPilotStage,
  rewardRecipe?: BuiltInRewardRecipe
): RewardComponent[] {
  const value = calculateFitness(
    creature,
    goal,
    objects,
    customGoal,
    obstacles,
    paraStage,
    rewardRecipe
  );
  return [c(id, label, value)];
}

/**
 * Break the leader's episode fitness into goal-specific reward terms.
 */
export function calculateRewardBreakdown(
  creature: Creature | null | undefined,
  goal: EvolutionGoal,
  objects: WorldObject[] = [],
  customGoal: CustomGoalConfig = DEFAULT_CUSTOM_GOAL,
  obstacles: Obstacle[] = [],
  paraStage?: ParaPilotStage,
  rewardRecipe?: BuiltInRewardRecipe
): RewardBreakdown {
  const goalLabel = getGoalInfo(goal).shortLabel;
  if (!creature) {
    return { goal, goalLabel, total: 0, components: [c('total', 'Score', 0)] };
  }

  const objs = objects.length > 0 ? objects : creature.privateWorld ?? [];
  let components: RewardComponent[];

  switch (goal) {
    case EvolutionGoal.LOCOMOTION_RIGHT:
      components = locomotionBreakdown(creature, 'right');
      break;
    case EvolutionGoal.LOCOMOTION_LEFT:
      components = locomotionBreakdown(creature, 'left');
      break;
    case EvolutionGoal.SHUFFLE_RIGHT:
      components = shuffleBreakdown(creature, 'right');
      break;
    case EvolutionGoal.SHUFFLE_LEFT:
      components = shuffleBreakdown(creature, 'left');
      break;
    case EvolutionGoal.SPEED:
      components = speedBreakdown(creature, rewardRecipe);
      break;
    case EvolutionGoal.HIGH_JUMP:
      components = singleScore('clearance', 'Peak Clearance', creature, goal, objs, customGoal, obstacles, paraStage, rewardRecipe);
      break;
    case EvolutionGoal.CLEAR_BAR:
      components = clearBarBreakdown(creature, obstacles);
      break;
    case EvolutionGoal.JUMP_LAND_UPRIGHT:
      components = singleScore('land', 'Jump & Land', creature, goal, objs, customGoal, obstacles, paraStage, rewardRecipe);
      break;
    case EvolutionGoal.LONG_JUMP:
      components = singleScore('bout', 'Jump Distance', creature, goal, objs, customGoal, obstacles, paraStage, rewardRecipe);
      break;
    case EvolutionGoal.JUMP_HANG_TIME:
      components = singleScore('hang', 'Hang Time', creature, goal, objs, customGoal, obstacles, paraStage, rewardRecipe);
      break;
    case EvolutionGoal.JUMP_LEFT:
      components = singleScore('bout', 'Jump Distance', creature, goal, objs, customGoal, obstacles, paraStage, rewardRecipe);
      break;
    case EvolutionGoal.JUMP_SPEED:
      components = jumpSpeedBreakdown(creature, rewardRecipe);
      break;
    case EvolutionGoal.JUMP_ACROBATICS:
      components = singleScore('acro', 'Acrobatics', creature, goal, objs, customGoal, obstacles, paraStage);
      break;
    case EvolutionGoal.HOP_RIGHT:
      components = singleScore('hop', 'Hop Distance', creature, goal, objs, customGoal, obstacles, paraStage);
      break;
    case EvolutionGoal.HOP_LEFT:
      components = singleScore('hop', 'Hop Distance', creature, goal, objs, customGoal, obstacles, paraStage);
      break;
    case EvolutionGoal.HOP_SPEED:
      components = hopSpeedBreakdown(creature);
      break;
    case EvolutionGoal.STAIR_CLIMB:
      components = stairBreakdown(creature);
      break;
    case EvolutionGoal.STAY_UPRIGHT:
      components = stayTallBreakdown(creature);
      break;
    case EvolutionGoal.OBSTACLE_CLIMB:
      components = obstacleClimbBreakdown(creature);
      break;
    case EvolutionGoal.BALANCE_BEAM:
      components = balanceBeamBreakdown(creature);
      break;
    case EvolutionGoal.CARRY_BALL:
      components = carryBallBreakdown(creature);
      break;
    case EvolutionGoal.PUSH_BOX:
      components = pushBoxBreakdown(creature, objs);
      break;
    case EvolutionGoal.MOTOR_DRIVE:
      components = [
        c('travel', 'Distance', Math.max(0, creature.currentX - creature.startX)),
      ];
      break;
    case EvolutionGoal.MOTOR_ICE:
      components = [
        c('ice', 'Ice Distance', (creature.iceSupportedDistance ?? 0) * 1.25),
        c('travel', 'Forward Progress', Math.max(0, creature.currentX - creature.startX) * 0.12),
      ];
      break;
    case EvolutionGoal.MOTOR_RAMP:
      components = motorRampBreakdown(creature);
      break;
    case EvolutionGoal.MOTOR_GAP:
      components = gapBreakdown(creature);
      break;
    case EvolutionGoal.MOTOR_LAUNCH_LAND:
      components = launchLandBreakdown(creature);
      break;
    case EvolutionGoal.MOTOR_LOOP:
      components = hoopBreakdown(creature, objs, obstacles);
      break;
    case EvolutionGoal.MOTOR_HURDLES:
      components = hurdlesBreakdown(creature);
      break;
    case EvolutionGoal.MOTOR_LANDSPEED:
      components = landSpeedBreakdown(creature);
      break;
    case EvolutionGoal.SPRINT_FINISH: {
      const finish = obstacles.find(o => o.type === 'finish' && o.label === 'FINISH');
      components = timeTrialBreakdown(creature, finish?.x ?? FINISH_LINE_X);
      break;
    }
    case EvolutionGoal.ROUGH_TERRAIN_TRAVERSE:
      components = roughTerrainBreakdown(creature);
      break;
    case EvolutionGoal.MOTOR_BRIDGE:
      components = bridgeBreakdown(creature);
      break;
    case EvolutionGoal.MOTOR_SLALOM:
      components = technicalBreakdown(creature);
      break;
    case EvolutionGoal.PARKING_ZONE:
      components = parkingBreakdown(creature, obstacles);
      break;
    case EvolutionGoal.KICK_GOAL:
      components = kickGoalBreakdown(creature, objs);
      break;
    case EvolutionGoal.HIT_TARGET:
      components = hitTargetBreakdown(creature, objs);
      break;
    case EvolutionGoal.BOWLING_PINS:
      components = bowlingBreakdown(creature);
      break;
    case EvolutionGoal.DODGEBALL:
      components = dodgeballBreakdown(creature);
      break;
    case EvolutionGoal.FLIGHT_TIME:
      components = stayAloftBreakdown(creature);
      break;
    case EvolutionGoal.FLIGHT_HEIGHT:
      components = flightHeightBreakdown(creature);
      break;
    case EvolutionGoal.FLIGHT_RIGHT:
      components = flightDirectionBreakdown(creature, 'right');
      break;
    case EvolutionGoal.FLIGHT_LEFT:
      components = flightDirectionBreakdown(creature, 'left');
      break;
    case EvolutionGoal.FLIGHT_AIRSPEED:
      components = airspeedBreakdown(creature);
      break;
    case EvolutionGoal.FLIGHT_LAND:
      components = flightLandBreakdown(creature);
      break;
    case EvolutionGoal.FLIGHT_ACROBATICS:
      components = flightAcrobaticsBreakdown(creature);
      break;
    case EvolutionGoal.GLIDE_RANGE:
      components = glideRangeBreakdown(creature);
      break;
    case EvolutionGoal.AERIAL_CROSSING:
      components = aerialCrossingBreakdown(creature);
      break;
    case EvolutionGoal.PARA_RAMP_GLIDE:
      components = paraRampBreakdown(creature, paraStage ?? 'runUp');
      break;
    case EvolutionGoal.CHUTE_DESCENT:
      components = chuteDescentBreakdown(creature);
      break;
    case EvolutionGoal.CUSTOM:
      components = customBreakdown(creature, customGoal, objs, obstacles);
      break;
    default:
      components = singleScore('total', 'Score', creature, goal, objs, customGoal, obstacles, paraStage, rewardRecipe);
      break;
  }

  const total = calculateFitness(
    creature,
    goal,
    objs,
    customGoal,
    obstacles,
    paraStage,
    rewardRecipe
  );
  // Prefer live fitness when it already matches this recipe's total; otherwise
  // trust the recalculated score so live coeff edits stay aligned.
  const live =
    Number.isFinite(creature.fitness) &&
    Math.abs((creature.fitness as number) - total) < 1e-3
      ? (creature.fitness as number)
      : total;

  return {
    goal,
    goalLabel,
    total: live,
    components,
  };
}

const DELTA_EPS = 0.05;

export function rewardComponentDelta(
  current: number,
  previous: number | undefined
): RewardDelta {
  if (previous === undefined) return 'new';
  const d = current - previous;
  if (Math.abs(d) < DELTA_EPS) return 'flat';
  return d > 0 ? 'up' : 'down';
}

/** Numeric change for a term (0 when flat / missing baseline). */
export function rewardComponentDeltaValue(
  current: number,
  previous: number | undefined
): number {
  if (previous === undefined) return current;
  const d = current - previous;
  return Math.abs(d) < DELTA_EPS ? 0 : d;
}

export function previousValueMap(
  baseline: RewardBreakdown | null | undefined
): Map<string, number> {
  const map = new Map<string, number>();
  if (!baseline) return map;
  for (const row of baseline.components) {
    map.set(row.id, row.value);
  }
  return map;
}

export interface RewardMover {
  id: string;
  label: string;
  delta: number;
  current: number;
}

/**
 * Largest absolute term changes vs the last elite snapshot.
 * Includes terms that dropped out of the current breakdown.
 */
export function topRewardMovers(
  breakdown: RewardBreakdown,
  baseline: RewardBreakdown | null | undefined,
  limit = 3
): RewardMover[] {
  if (!baseline || baseline.goal !== breakdown.goal) return [];
  const prev = previousValueMap(baseline);
  const seen = new Set<string>();
  const movers: RewardMover[] = [];

  for (const row of breakdown.components) {
    seen.add(row.id);
    const delta = rewardComponentDeltaValue(row.value, prev.get(row.id));
    if (delta === 0) continue;
    movers.push({
      id: row.id,
      label: row.label,
      delta,
      current: row.value,
    });
  }
  for (const row of baseline.components) {
    if (seen.has(row.id)) continue;
    const delta = rewardComponentDeltaValue(0, row.value);
    if (delta === 0) continue;
    movers.push({
      id: row.id,
      label: row.label,
      delta,
      current: 0,
    });
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return movers.slice(0, Math.max(0, limit));
}
