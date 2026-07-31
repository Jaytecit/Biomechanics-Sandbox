/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Curated challenge cards — score targets calibrated to current fitness ledgers,
 * with enforced morphology and arena presets.
 */

import { ChallengeDefinition, EvolutionGoal } from './types';
import { CHALLENGE_PRESETS } from './challengeConstraints';

const WALK = CHALLENGE_PRESETS.walkingMuscle;
const JUMP = CHALLENGE_PRESETS.jumpingMuscle;
const MOTOR = CHALLENGE_PRESETS.motorCart;
const MOTOR_TWIN = CHALLENGE_PRESETS.motorTwin;
const WING = CHALLENGE_PRESETS.wingFlapper;
const GLIDE = CHALLENGE_PRESETS.glider;
const PARA = CHALLENGE_PRESETS.paraRig;

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'sprint_800',
    title: 'Marathon stride',
    description:
      'Alternate-foot Run Right: score 520+ body-travel points on rough ground within 45 generations. Oscillation without alternating steps scores zero.',
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    targetValue: 520,
    maxGenerations: 45,
    badgeLabel: 'Sprinter',
    constraints: WALK,
    recommendedBody: 'Sprongo',
    episodeSeconds: 32,
    arena: { difficulty: 1.2, terrainEnabled: true, terrainObstaclesEnabled: true },
  },
  {
    id: 'jump_140',
    title: 'Vertical snap',
    description:
      'Isolated Jump Height bout: lowest-point clearance 10+ world px (~body height). Hop chains and ballistic spikes do not count.',
    goal: EvolutionGoal.HIGH_JUMP,
    targetValue: 10,
    maxGenerations: 35,
    badgeLabel: 'Hopper',
    constraints: JUMP,
    recommendedBody: 'Tool Eggs',
    episodeSeconds: 14,
    arena: { difficulty: 1.15, pitEnabled: false },
  },
  {
    id: 'jump_right_180',
    title: 'Broad jump',
    description:
      'One isolated Jump Right bout covering 25+ score-units. Repeated hop chains score on Hop goals instead.',
    goal: EvolutionGoal.LONG_JUMP,
    targetValue: 25,
    maxGenerations: 40,
    badgeLabel: 'Leaper',
    constraints: JUMP,
    recommendedBody: 'Tool Eggs',
    episodeSeconds: 16,
    arena: { difficulty: 1.2, pitEnabled: true, gapWidthPx: 540 },
  },
  {
    id: 'hang_time_120',
    title: 'Hang time bout',
    description:
      'Best supported-takeoff airtime bout scoring 100+ points. Short hop chains are gated out entirely.',
    goal: EvolutionGoal.JUMP_HANG_TIME,
    targetValue: 100,
    maxGenerations: 35,
    badgeLabel: 'Floater',
    constraints: JUMP,
    recommendedBody: 'Tool Eggs',
    episodeSeconds: 14,
  },
  {
    id: 'upright_15s',
    title: 'Tower stance',
    description:
      'Stay Tall integrated posture ledger 130+ with fall penalties. Final-pose camping cannot win.',
    goal: EvolutionGoal.STAY_UPRIGHT,
    targetValue: 130,
    maxGenerations: 30,
    badgeLabel: 'Tower',
    constraints: WALK,
    recommendedBody: 'Sprongo',
    episodeSeconds: 28,
  },
  {
    id: 'ball_courier',
    title: 'Ball courier',
    description:
      'Collision-proven Carry Ball transport 90+ points (lifted carry distance + peak lift). Proximity without contact scores zero.',
    goal: EvolutionGoal.CARRY_BALL,
    targetValue: 90,
    maxGenerations: 40,
    badgeLabel: 'Courier',
    constraints: { ...WALK, maxNodes: 16, maxMass: 32 },
    recommendedBody: 'Sprongo',
    episodeSeconds: 30,
    arena: { difficulty: 1.15 },
  },
  {
    id: 'box_mover',
    title: 'Box hauler',
    description:
      'Push Box while staying in contact: 200+ points of box displacement. Remote shoves without proximity do not count.',
    goal: EvolutionGoal.PUSH_BOX,
    targetValue: 200,
    maxGenerations: 40,
    badgeLabel: 'Hauler',
    constraints: { ...WALK, maxNodes: 16, maxMass: 32 },
    recommendedBody: 'Sprongo',
    episodeSeconds: 30,
    arena: { difficulty: 1.15 },
  },
  {
    id: 'stair_280',
    title: 'Summit treads',
    description:
      'Supported stair tread height 220+ on endless stairs. Free jumps above the course score zero.',
    goal: EvolutionGoal.STAIR_CLIMB,
    targetValue: 220,
    maxGenerations: 45,
    badgeLabel: 'Climber',
    constraints: WALK,
    recommendedBody: 'Sprongo',
    episodeSeconds: 36,
    arena: { difficulty: 1.25, terrainEnabled: false },
  },
  {
    id: 'clear_bar_160',
    title: 'Bar clearance',
    description:
      'Clear the Bar with whole-body clearance during an isolated jump bout — 120+ points including bar bonus.',
    goal: EvolutionGoal.CLEAR_BAR,
    targetValue: 120,
    maxGenerations: 40,
    badgeLabel: 'Vaulter',
    constraints: JUMP,
    recommendedBody: 'Tool Eggs',
    episodeSeconds: 16,
    arena: { difficulty: 1.25, progressiveTier: 0 },
  },
  {
    id: 'speed_demon',
    title: 'Supported sprint',
    description:
      'Max Speed: supported peak speed plus meaningful travel — 180+ points. Raw impulse spikes without travel are gated.',
    goal: EvolutionGoal.SPEED,
    targetValue: 180,
    maxGenerations: 35,
    badgeLabel: 'Blazer',
    constraints: WALK,
    recommendedBody: 'Sprongo',
    episodeSeconds: 22,
    arena: { difficulty: 1.2, iceEnabled: true },
  },
  {
    id: 'stick_landing',
    title: 'Stick the landing',
    description:
      'Jump & Land: best single return-to-takeoff hop scoring 8+ points. Summing many tiny hops does not accumulate.',
    goal: EvolutionGoal.JUMP_LAND_UPRIGHT,
    targetValue: 8,
    maxGenerations: 35,
    badgeLabel: 'Stickler',
    constraints: JUMP,
    recommendedBody: 'Tool Eggs',
    episodeSeconds: 16,
  },
  {
    id: 'motor_drive_600',
    title: 'Motor haul',
    description:
      'Motor Drive forward travel 750+ px with ≤2 wheels and motor power ≤9. Score equals distance — no shortcuts.',
    goal: EvolutionGoal.MOTOR_DRIVE,
    targetValue: 750,
    maxGenerations: 35,
    badgeLabel: 'Driver',
    constraints: MOTOR,
    recommendedBody: 'Motor Cart',
    episodeSeconds: 28,
    arena: { difficulty: 1.2, terrainEnabled: true },
  },
  {
    id: 'motor_ramp_220',
    title: 'Ramp assault',
    description:
      'Motor Ramp: climb height + forward progress 280+ points on a steep user ramp. Wheelies without height gain stall out.',
    goal: EvolutionGoal.MOTOR_RAMP,
    targetValue: 280,
    maxGenerations: 40,
    badgeLabel: 'Hillclimb',
    constraints: MOTOR,
    recommendedBody: 'Motor Cart',
    episodeSeconds: 26,
    arena: { difficulty: 1.25, rampEnabled: true, rampAngleDeg: 32 },
  },
  {
    id: 'motor_ice_500',
    title: 'Ice runner',
    description:
      'Motor Ice: ice-supported distance dominates — score 620+ with the same motor cart envelope (≤9 power).',
    goal: EvolutionGoal.MOTOR_ICE,
    targetValue: 620,
    maxGenerations: 40,
    badgeLabel: 'Ice pilot',
    constraints: MOTOR,
    recommendedBody: 'Motor Cart',
    episodeSeconds: 28,
    arena: { difficulty: 1.25, iceEnabled: true },
  },
  {
    id: 'motor_gap_350',
    title: 'Gap clear',
    description:
      'Motor Gap: clear the pit for the 180-point bonus plus approach — 320+ total. Falling in caps progress harshly.',
    goal: EvolutionGoal.MOTOR_GAP,
    targetValue: 320,
    maxGenerations: 45,
    badgeLabel: 'Gapper',
    constraints: MOTOR_TWIN,
    recommendedBody: 'Motor Cart',
    episodeSeconds: 26,
    // No rampEnabled: Motor Gap authors its own course and the optional
    // ramp/pit appender explicitly skips MOTOR_GAP — the flag never took effect.
    arena: { difficulty: 1.3, pitEnabled: true, gapWidthPx: 680 },
  },
  {
    id: 'motor_hoop_900',
    title: 'Hoop finish',
    description:
      'Motor Hoop: roll the hoop to the finish line for 900+ points. Lofting the hoop is heavily penalized.',
    goal: EvolutionGoal.MOTOR_LOOP,
    targetValue: 900,
    maxGenerations: 50,
    badgeLabel: 'Hooper',
    constraints: MOTOR,
    recommendedBody: 'Motor Cart',
    episodeSeconds: 55,
    arena: {
      difficulty: 1.2,
      terrainEnabled: true,
      terrainObstaclesEnabled: false,
      progressiveTier: 0,
    },
  },
  {
    id: 'motor_landspeed_6',
    title: 'Landspeed record',
    description:
      'Landspeed: peak grounded wheel speed with travel gate — 380+ points. Airborne spin does not count.',
    goal: EvolutionGoal.MOTOR_LANDSPEED,
    targetValue: 380,
    maxGenerations: 40,
    badgeLabel: 'LandSpeed',
    constraints: MOTOR,
    recommendedBody: 'Motor Cart',
    episodeSeconds: 24,
    arena: { difficulty: 1.25, iceEnabled: false, terrainEnabled: false },
  },
  {
    id: 'bowling_280',
    title: 'Strike lane',
    description:
      'Bowling: knock down 240+ points worth of pins (6+ pins). Forward shove alone is nearly worthless.',
    goal: EvolutionGoal.BOWLING_PINS,
    targetValue: 240,
    maxGenerations: 45,
    badgeLabel: 'Bowler',
    constraints: { ...WALK, maxFootSpan: 180 },
    recommendedBody: 'Sprongo',
    episodeSeconds: 28,
    arena: { difficulty: 1.15 },
  },
  {
    id: 'goal_scorer_320',
    title: 'Net striker',
    description:
      'Kick Goal: contact-caused goal for 300+ points — you must score, not just move the ball remotely.',
    goal: EvolutionGoal.KICK_GOAL,
    targetValue: 300,
    maxGenerations: 50,
    badgeLabel: 'Striker',
    constraints: { ...WALK, maxFootSpan: 160 },
    recommendedBody: 'Sprongo',
    episodeSeconds: 32,
    arena: { difficulty: 1.2 },
  },
  {
    id: 'park_master_120',
    title: 'Parking precision',
    description:
      'Parking Zone: hold upright inside the bay for 150+ points (park frames + approach). Edge camping without posture fails.',
    goal: EvolutionGoal.PARKING_ZONE,
    targetValue: 150,
    maxGenerations: 40,
    badgeLabel: 'Parker',
    constraints: MOTOR,
    recommendedBody: 'Motor Cart',
    episodeSeconds: 30,
    arena: { difficulty: 1.15 },
  },
  {
    id: 'flight_aloft_180',
    title: 'Sustained flight',
    description:
      'Stay Aloft: best single fully-airborne bout 200+ with flap evidence. Ground touches end the bout.',
    goal: EvolutionGoal.FLIGHT_TIME,
    targetValue: 200,
    maxGenerations: 45,
    badgeLabel: 'Aviator',
    constraints: WING,
    recommendedBody: 'RoboBird',
    episodeSeconds: 40,
    arena: { difficulty: 1.15, windEnabled: true, windStrength: 0.08 },
  },
  {
    id: 'flight_height_160',
    title: 'Climb bout',
    description:
      'Flight Height: sustained aero climb bout 140+ with flap symmetry bonus. Ballistic hop peaks are penalized.',
    goal: EvolutionGoal.FLIGHT_HEIGHT,
    targetValue: 140,
    maxGenerations: 40,
    badgeLabel: 'Climber',
    constraints: WING,
    recommendedBody: 'RoboBird',
    episodeSeconds: 36,
    arena: { windEnabled: true, windStrength: 0.06 },
  },
  {
    id: 'fly_right_200',
    title: 'Crosswind cruise',
    description:
      'Fly Right: one uninterrupted forward flight bout scoring 170+. Ground scooting and hop totals are excluded.',
    goal: EvolutionGoal.FLIGHT_RIGHT,
    targetValue: 170,
    maxGenerations: 45,
    badgeLabel: 'Cruise',
    constraints: WING,
    recommendedBody: 'RoboBird',
    episodeSeconds: 38,
    arena: { windEnabled: true, windStrength: 0.1, difficulty: 1.15 },
  },
  {
    id: 'acro_flip_150',
    title: 'Aerial acro',
    description:
      'Aero Acrobatics: best single aerial sequence 130+ combining rotation, height, and airtime in one bout.',
    goal: EvolutionGoal.FLIGHT_ACROBATICS,
    targetValue: 130,
    maxGenerations: 50,
    badgeLabel: 'Acrobat',
    constraints: WING,
    recommendedBody: 'RoboBird',
    episodeSeconds: 40,
    arena: { windEnabled: true, windStrength: 0.08 },
  },
  {
    id: 'glide_range_220',
    title: 'Open glide',
    description:
      'Glide Range: best uninterrupted paraglider bout 200+ in the sky corridor. Requires a paraglider — no passive chute farming.',
    goal: EvolutionGoal.GLIDE_RANGE,
    targetValue: 200,
    maxGenerations: 45,
    badgeLabel: 'Glider',
    constraints: GLIDE,
    recommendedBody: 'Glide Cart',
    episodeSeconds: 42,
    arena: { windEnabled: true, windStrength: 0.1, difficulty: 1.2 },
  },
  {
    id: 'para_ramp_260',
    title: 'Para curriculum',
    description:
      'Para Ramp full run-up → deploy → glide scoring 220+ with reef/deploy technique. Requires paraglider + twin motor wheels ≤9 power.',
    goal: EvolutionGoal.PARA_RAMP_GLIDE,
    targetValue: 220,
    maxGenerations: 55,
    badgeLabel: 'Para Pilot',
    constraints: PARA,
    recommendedBody: 'Glide Cart',
    episodeSeconds: 60,
    arena: { difficulty: 1.2, pitEnabled: true, rampEnabled: true, gapWidthPx: 620 },
  },
  {
    id: 'aerial_cross_300',
    title: 'Far-side landing',
    description:
      'Aerial Crossing: stick a supported landing on the far side for 380+ (400 landing bonus + flight shaping).',
    goal: EvolutionGoal.AERIAL_CROSSING,
    targetValue: 380,
    maxGenerations: 50,
    badgeLabel: 'Flyer',
    constraints: WING,
    recommendedBody: 'RoboBird',
    episodeSeconds: 42,
    arena: { difficulty: 1.25, pitEnabled: true, gapWidthPx: 760, windEnabled: true, windStrength: 0.08 },
  },
];

const STORAGE_KEY = 'biomech_challenge_progress_v4';

export function loadChallengeProgress(): Record<
  string,
  {
    cleared: boolean;
    clearedAtGeneration?: number;
    bestScore: number;
    liveTarget?: number;
    clearCount?: number;
  }
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveChallengeProgress(
  progress: Record<
    string,
    {
      cleared: boolean;
      clearedAtGeneration?: number;
      bestScore: number;
      liveTarget?: number;
      clearCount?: number;
    }
  >
) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore quota errors
  }
}

/** Wipe challenge badges / best scores (does not change challenge definitions). */
export function clearChallengeProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
