/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hidden secret goals — titles/descriptions must never appear outside this file
 * until a discovery is recorded.
 */

import { Creature, EvolutionGoal } from './types';
import type { GoalCategory } from './goalCatalog';
import type { ArenaModifiers } from './types';

export type SecretGoalFlavor = 'triumph' | 'mishap' | 'disaster';

export type SecretGoalId =
  // locomotion
  | 'loco_moonwalk'
  | 'loco_faceplant_sprint'
  | 'loco_one_leg_wonder'
  | 'loco_false_start'
  | 'loco_sleepwalker'
  | 'loco_turtle_crawl'
  | 'loco_stumble_marathon'
  | 'loco_backpedal_hero'
  | 'loco_spinning_top'
  | 'loco_zero_hero'
  // shuffle
  | 'shuf_vibration_nation'
  | 'shuf_statue'
  | 'shuf_backward'
  | 'shuf_earthquake'
  | 'shuf_supersonic'
  | 'shuf_runaway'
  | 'shuf_monoped'
  | 'shuf_ice_scoot'
  | 'shuf_flatline'
  | 'shuf_chaos'
  // jump
  | 'jump_superball'
  | 'jump_belly_flop'
  | 'jump_pogo'
  | 'jump_cartwheel'
  | 'jump_hang_wrong'
  | 'jump_short_pit'
  | 'jump_limbo'
  | 'jump_stuck_landing'
  | 'jump_double_bounce'
  | 'jump_sky_crash'
  // flight
  | 'flight_grounded_eagle'
  | 'flight_kamikaze'
  | 'flight_feather_fall'
  | 'flight_rocket_crash'
  | 'flight_wrong_way'
  | 'flight_loop'
  | 'flight_sail_fail'
  | 'flight_wind_victim'
  | 'flight_touch_go'
  | 'flight_para_bail'
  // climb
  | 'climb_goat_fail'
  | 'climb_beam_wobble'
  | 'climb_obstacle_faceplant'
  | 'climb_bridge_troll'
  | 'climb_cliff_diver'
  | 'climb_summit_retreat'
  | 'climb_roller'
  | 'climb_overhang'
  | 'climb_balance_fail'
  | 'climb_alpine'
  // object
  | 'obj_butterfingers'
  | 'obj_own_goal'
  | 'obj_ball_hog'
  | 'obj_pin_self'
  | 'obj_box_rebound'
  | 'obj_near_miss_storm'
  | 'obj_hoop_escape'
  | 'obj_drop_zone'
  | 'obj_magnet_hands'
  | 'obj_juggernaut'
  // motor
  | 'motor_wheelie_fail'
  | 'motor_ice_spinout'
  | 'motor_gap_short'
  | 'motor_overshoot'
  | 'motor_hurdle_faceplant'
  | 'motor_bridge_collapse'
  | 'motor_slalom_disaster'
  | 'motor_speed_crash'
  | 'motor_hoop_chaos'
  | 'motor_parking_miss'
  // sports
  | 'sport_own_goal'
  | 'sport_strikeout'
  | 'sport_dodge_fail'
  | 'sport_wrong_way_sprint'
  | 'sport_false_finish'
  | 'sport_penalty_box'
  | 'sport_bullseye_backfire'
  | 'sport_gutter_ball'
  | 'sport_hail_mary'
  | 'sport_photo_finish_fail'
  // precision
  | 'prec_near_bar'
  | 'prec_near_target'
  | 'prec_parking_edge'
  | 'prec_beam_almost'
  | 'prec_overshoot_finish'
  | 'prec_gap_tease'
  | 'prec_stop_sign_runner'
  | 'prec_thread_fail'
  | 'prec_zone_violator'
  | 'prec_centimeter_short'
  // custom
  | 'custom_chaos_theory'
  | 'custom_zero_hero'
  | 'custom_max_min'
  | 'custom_rule_breaker'
  | 'custom_accidental_genius'
  | 'custom_morph_lottery'
  | 'custom_frankenstein'
  | 'custom_sandbox_explorer'
  | 'custom_arena_wanderer'
  | 'custom_collector';

export interface SecretGoalEvalContext {
  creature: Creature;
  activeGoal: EvolutionGoal;
  arena: ArenaModifiers;
  modelName: string;
  context: 'sandbox' | 'arena';
  generation?: number;
  /** Already-discovered secret ids */
  discoveredIds: Set<string>;
  /** Count of discoveries before this evaluation pass */
  priorDiscoveryCount: number;
  /** Arena heat: champion had lowest fitness */
  isLowestFitnessInHeat?: boolean;
  /** Non-meta secret would trigger if accident gate ignored */
  accidentalNonCustomMatch?: boolean;
}

export interface SecretGoalDefinition {
  id: SecretGoalId;
  category: GoalCategory;
  title: string;
  description: string;
  flavor: SecretGoalFlavor;
  /** Goals that intentionally reward this — discovery blocked while training them */
  blockedGoals: EvolutionGoal[];
  /** Meta goals evaluated with external ledger state */
  isMeta?: boolean;
  check: (ctx: SecretGoalEvalContext) => boolean;
}

// --- helpers ---

export function netTravelX(c: Creature): number {
  return c.currentX - c.startX;
}

export function distinctWalkNodes(c: Creature): number {
  const ids = c.walkGaitNodeIds ?? [];
  return new Set(ids).size;
}

function isLocomotionGoal(g: EvolutionGoal): boolean {
  return g === EvolutionGoal.LOCOMOTION_RIGHT || g === EvolutionGoal.LOCOMOTION_LEFT;
}

function isIsolatedJumpGoal(g: EvolutionGoal): boolean {
  return (
    g === EvolutionGoal.HIGH_JUMP ||
    g === EvolutionGoal.LONG_JUMP ||
    g === EvolutionGoal.JUMP_HANG_TIME ||
    g === EvolutionGoal.JUMP_LEFT ||
    g === EvolutionGoal.JUMP_SPEED ||
    g === EvolutionGoal.JUMP_LAND_UPRIGHT
  );
}

function isAcrobaticsGoal(g: EvolutionGoal): boolean {
  return g === EvolutionGoal.JUMP_ACROBATICS || g === EvolutionGoal.FLIGHT_ACROBATICS;
}

function countIncompatibleTraits(c: Creature): number {
  let traits = 0;
  const hasMotor = c.nodes.some(n => n.isMotorWheel);
  const hasWing = c.muscles.some(m => m.aeroType === 'wing');
  const hasPara =
    !!c.paraPilot ||
    c.muscles.some(m => m.aeroType === 'paraglider' || m.aeroType === 'parachute');
  const hasSoft = c.muscles.some(m => !m.linkKind || m.linkKind === 'muscle');
  const hasBone = c.muscles.some(m => m.linkKind === 'bone');
  if (hasMotor) traits++;
  if (hasWing) traits++;
  if (hasPara) traits++;
  if (hasSoft) traits++;
  if (hasBone) traits++;
  return traits;
}

export const SECRET_GOALS: SecretGoalDefinition[] = [
  // --- locomotion (10) ---
  {
    id: 'loco_moonwalk',
    category: 'locomotion',
    title: 'Moonwalker',
    description: 'Travelled far left while training to run right.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.LOCOMOTION_LEFT],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.LOCOMOTION_RIGHT && netTravelX(creature) < -120,
  },
  {
    id: 'loco_faceplant_sprint',
    category: 'locomotion',
    title: 'Faceplant Sprinter',
    description: 'Hit high speed then collapsed repeatedly — not on a speed goal.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.SPEED, EvolutionGoal.SPRINT_FINISH, EvolutionGoal.MOTOR_LANDSPEED],
    check: ({ creature }) =>
      (creature.peakSpeed ?? 0) > 8 && (creature.stayTallFallFrames ?? 0) > 40,
  },
  {
    id: 'loco_one_leg_wonder',
    category: 'locomotion',
    title: 'One-Leg Wonder',
    description: 'Logged many run steps from a single foot plant.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.LOCOMOTION_RIGHT, EvolutionGoal.LOCOMOTION_LEFT],
    check: ({ creature }) =>
      (creature.walkStepCountRight ?? 0) >= 8 && distinctWalkNodes(creature) <= 1,
  },
  {
    id: 'loco_false_start',
    category: 'locomotion',
    title: 'False Start',
    description: 'Crossed the finish line without leaving the starting blocks.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.SPRINT_FINISH],
    check: ({ creature }) =>
      !!creature.crossedFinish && creature.currentX < creature.startX + 50,
  },
  {
    id: 'loco_sleepwalker',
    category: 'locomotion',
    title: 'Sleepwalker',
    description: 'Slid right on Run Right without a single alternating step.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.SHUFFLE_RIGHT],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.LOCOMOTION_RIGHT &&
      (creature.walkStrideDistanceRight ?? 0) > 80 &&
      (creature.walkAlternateStepCountRight ?? 0) === 0,
  },
  {
    id: 'loco_turtle_crawl',
    category: 'locomotion',
    title: 'Turtle Crawl',
    description: 'Crawled slowly but stayed upright for an entire episode.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.peakSpeed ?? 0) < 0.4 &&
      (creature.uprightFrames ?? 0) > 400 &&
      netTravelX(creature) > 60,
  },
  {
    id: 'loco_stumble_marathon',
    category: 'locomotion',
    title: 'Stumble Marathon',
    description: 'Many steps, many falls — a chaotic marathon.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.walkStepCountRight ?? 0) > 15 && (creature.stayTallFallFrames ?? 0) > 30,
  },
  {
    id: 'loco_backpedal_hero',
    category: 'locomotion',
    title: 'Backpedal Hero',
    description: 'Ran left while training to run right.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.LOCOMOTION_LEFT],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.LOCOMOTION_RIGHT &&
      (creature.walkStrideDistanceLeft ?? 0) > 100,
  },
  {
    id: 'loco_spinning_top',
    category: 'locomotion',
    title: 'Spinning Top',
    description: 'Spun wildly while mostly grounded on a locomotion goal.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.JUMP_ACROBATICS, EvolutionGoal.FLIGHT_ACROBATICS],
    check: ({ creature, activeGoal }) =>
      isLocomotionGoal(activeGoal) &&
      (creature.airborneRotation ?? 0) > 6 &&
      (creature.flightFrames ?? 0) < 30,
  },
  {
    id: 'loco_zero_hero',
    category: 'locomotion',
    title: 'Standing Still',
    description: 'Earned zero fitness for an entire locomotion episode.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      isLocomotionGoal(activeGoal) &&
      creature.fitness === 0 &&
      (creature.episodeFrames ?? 0) > 300,
  },

  // --- shuffle (10) ---
  {
    id: 'shuf_vibration_nation',
    category: 'shuffle',
    title: 'Vibration Nation',
    description: 'Oscillation-shuffled far while training strict running.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.SHUFFLE_RIGHT, EvolutionGoal.SHUFFLE_LEFT],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.LOCOMOTION_RIGHT &&
      (creature.shuffleOscDistanceRight ?? 0) > 100,
  },
  {
    id: 'shuf_statue',
    category: 'shuffle',
    title: 'Statue Shuffle',
    description: 'Vibrated furiously but barely moved.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      (activeGoal === EvolutionGoal.SHUFFLE_RIGHT || activeGoal === EvolutionGoal.SHUFFLE_LEFT) &&
      Math.max(creature.shuffleOscDistanceRight ?? 0, creature.shuffleOscDistanceLeft ?? 0) > 50 &&
      Math.abs(netTravelX(creature)) < 20,
  },
  {
    id: 'shuf_backward',
    category: 'shuffle',
    title: 'Reverse Scoot',
    description: 'Shuffled left while training shuffle right.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.SHUFFLE_LEFT],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.SHUFFLE_RIGHT && (creature.shuffleOscDistanceLeft ?? 0) > 80,
  },
  {
    id: 'shuf_earthquake',
    category: 'shuffle',
    title: 'Earthquake',
    description: 'Bounced vertically while scooting — a seismic shuffle.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      (activeGoal === EvolutionGoal.SHUFFLE_RIGHT || activeGoal === EvolutionGoal.SHUFFLE_LEFT) &&
      (creature.episodeRapidBounceFrames ?? 0) > 40,
  },
  {
    id: 'shuf_supersonic',
    category: 'shuffle',
    title: 'Supersonic Shimmer',
    description: 'Hit extreme speed while shuffling.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.SPEED],
    check: ({ creature, activeGoal }) =>
      (activeGoal === EvolutionGoal.SHUFFLE_RIGHT || activeGoal === EvolutionGoal.SHUFFLE_LEFT) &&
      (creature.peakSpeed ?? 0) > 10,
  },
  {
    id: 'shuf_runaway',
    category: 'shuffle',
    title: 'Runaway Vibration',
    description: 'Shuffled into the abyss.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      Math.max(creature.shuffleOscDistanceRight ?? 0, creature.shuffleOscDistanceLeft ?? 0) > 200 &&
      !!creature.fellInPit,
  },
  {
    id: 'shuf_monoped',
    category: 'shuffle',
    title: 'Monoped Shuffle',
    description: 'Oscillation credit from a single contact point.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.SHUFFLE_RIGHT, EvolutionGoal.SHUFFLE_LEFT],
    check: ({ creature, activeGoal }) =>
      activeGoal !== EvolutionGoal.SHUFFLE_RIGHT &&
      activeGoal !== EvolutionGoal.SHUFFLE_LEFT &&
      Math.max(creature.shuffleOscDistanceRight ?? 0, creature.shuffleOscDistanceLeft ?? 0) > 60 &&
      distinctWalkNodes(creature) <= 1,
  },
  {
    id: 'shuf_ice_scoot',
    category: 'shuffle',
    title: 'Ice Scooter',
    description: 'Oscillation-shuffled on ice while training something else.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.MOTOR_ICE, EvolutionGoal.SHUFFLE_RIGHT],
    check: ({ creature, arena }) =>
      !!arena.iceEnabled &&
      (creature.shuffleOscDistanceRight ?? 0) > 80 &&
      (creature.iceSupportedDistance ?? 0) > 20,
  },
  {
    id: 'shuf_flatline',
    category: 'shuffle',
    title: 'Flatline',
    description: 'Zero shuffle fitness for a long episode.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      (activeGoal === EvolutionGoal.SHUFFLE_RIGHT || activeGoal === EvolutionGoal.SHUFFLE_LEFT) &&
      creature.fitness === 0 &&
      (creature.episodeFrames ?? 0) > 250,
  },
  {
    id: 'shuf_chaos',
    category: 'shuffle',
    title: 'Chaos Scoot',
    description: 'Oscillated hard in both directions at once.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.shuffleOscDistanceRight ?? 0) > 60 && (creature.shuffleOscDistanceLeft ?? 0) > 60,
  },

  // --- jump (10) ---
  {
    id: 'jump_superball',
    category: 'jump',
    title: 'Superball',
    description: 'Launched to extreme height on the wrong jump goal.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.HIGH_JUMP, EvolutionGoal.CLEAR_BAR],
    check: ({ creature }) => (creature.jumpHeightBestClearance ?? 0) > 140,
  },
  {
    id: 'jump_belly_flop',
    category: 'jump',
    title: 'Belly Flop',
    description: 'Jumped high then collapsed on landing.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.jumpHeightBestClearance ?? 0) > 80 && (creature.stayTallFallFrames ?? 0) > 20,
  },
  {
    id: 'jump_pogo',
    category: 'jump',
    title: 'Pogo Stick',
    description: 'Hop-chained on an isolated-jump goal.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.HOP_RIGHT, EvolutionGoal.HOP_LEFT, EvolutionGoal.HOP_SPEED],
    check: ({ creature, activeGoal }) =>
      isIsolatedJumpGoal(activeGoal) && (creature.hopBoutCount ?? 0) >= 6,
  },
  {
    id: 'jump_cartwheel',
    category: 'jump',
    title: 'Cartwheel',
    description: 'Acrobatic rotation on a non-acrobatics jump goal.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.JUMP_ACROBATICS],
    check: ({ creature, activeGoal }) =>
      !isAcrobaticsGoal(activeGoal) && (creature.jumpAcrobaticsBestBoutScore ?? 0) > 80,
  },
  {
    id: 'jump_hang_wrong',
    category: 'jump',
    title: 'Wrong Hang',
    description: 'Floated in hang time while training jump height.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.JUMP_HANG_TIME],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.HIGH_JUMP && (creature.jumpHangBestBoutScore ?? 0) > 90,
  },
  {
    id: 'jump_short_pit',
    category: 'jump',
    title: 'Short Pit',
    description: 'Jumped well then fell into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.jumpHeightBestClearance ?? 0) > 60 && !!creature.fellInPit,
  },
  {
    id: 'jump_limbo',
    category: 'jump',
    title: 'Limbo Legend',
    description: 'Nearly cleared bar height without registering a clear.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.CLEAR_BAR],
    check: ({ creature, activeGoal }) =>
      activeGoal !== EvolutionGoal.CLEAR_BAR &&
      !creature.clearedBar &&
      (creature.jumpHeightBestClearance ?? 0) > 85,
  },
  {
    id: 'jump_stuck_landing',
    category: 'jump',
    title: 'Stuck Landing',
    description: 'High jump, terrible landing score.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.JUMP_LAND_UPRIGHT],
    check: ({ creature }) =>
      (creature.jumpHeightBestClearance ?? 0) > 70 && (creature.uprightLandingScore ?? 0) < 10,
  },
  {
    id: 'jump_double_bounce',
    category: 'jump',
    title: 'Double Bounce',
    description: 'Multiple isolated jumps with weak landings.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) => {
      const snap = creature.lastIsolatedJumpSnapshot;
      return (
        (creature.hadAerialBout ?? false) &&
        (creature.jumpHeightBestClearance ?? 0) > 40 &&
        (snap?.landScore ?? creature.uprightLandingScore ?? 0) < 15 &&
        (creature.hopBoutCount ?? 0) >= 2
      );
    },
  },
  {
    id: 'jump_sky_crash',
    category: 'jump',
    title: 'Icarus Jr.',
    description: 'Sky-high jump, touch-and-go chaos, then the pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.jumpHeightBestClearance ?? 0) > 160 &&
      (creature.flightGroundTouches ?? 0) > 5 &&
      !!creature.fellInPit,
  },

  // --- flight (10) ---
  {
    id: 'flight_grounded_eagle',
    category: 'flight',
    title: 'Grounded Eagle',
    description: 'Flew a bit but touched down constantly.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.flightFrames ?? 0) > 60 && (creature.flightGroundTouches ?? 0) > 25,
  },
  {
    id: 'flight_kamikaze',
    category: 'flight',
    title: 'Kamikaze Glide',
    description: 'Glided far then plunged into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) => (creature.flightDistance ?? 0) > 200 && !!creature.fellInPit,
  },
  {
    id: 'flight_feather_fall',
    category: 'flight',
    title: 'Feather Fall',
    description: 'Long hang with almost no forward glide.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.GLIDE_RANGE],
    check: ({ creature }) =>
      (creature.flightTimeBestBoutScore ?? 0) > 80 && (creature.flightDistance ?? 0) < 30,
  },
  {
    id: 'flight_rocket_crash',
    category: 'flight',
    title: 'Rocket Crash',
    description: 'Rocketed to extreme height then crashed down.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.flightHeightBoutPeak ?? 0) > 200 && (creature.stayTallFallFrames ?? 0) > 25,
  },
  {
    id: 'flight_wrong_way',
    category: 'flight',
    title: 'Wrong-Way Bird',
    description: 'Flew left while training flight right.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.FLIGHT_LEFT],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.FLIGHT_RIGHT && (creature.flightDistanceLeft ?? 0) > 150,
  },
  {
    id: 'flight_loop',
    category: 'flight',
    title: 'Loop-de-Loop',
    description: 'Full rotation in the air on a non-acrobatics flight goal.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.FLIGHT_ACROBATICS],
    check: ({ creature, activeGoal }) =>
      !isAcrobaticsGoal(activeGoal) && (creature.airborneRotation ?? 0) > 12,
  },
  {
    id: 'flight_sail_fail',
    category: 'flight',
    title: 'Premature Sail',
    description: 'Opened the sail too early on the ground.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) => (creature.sailEarlyOpenFrames ?? 0) > 60,
  },
  {
    id: 'flight_wind_victim',
    category: 'flight',
    title: 'Wind Victim',
    description: 'Windy flight ended in a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature, arena }) =>
      !!arena.windEnabled && (creature.flightFrames ?? 0) > 40 && !!creature.fellInPit,
  },
  {
    id: 'flight_touch_go',
    category: 'flight',
    title: 'Touch-and-Go',
    description: 'Constant ground touches yet still scored flight points.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.flightGroundTouches ?? 0) > 15 && creature.fitness > 0,
  },
  {
    id: 'flight_para_bail',
    category: 'flight',
    title: 'Para Bailout',
    description: 'Para launch without glide credit — straight into disaster.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.paraLaunchSpeed ?? 0) > 6 &&
      (creature.paraAirBestBoutScore ?? 0) < 20 &&
      !!creature.fellInPit,
  },

  // --- climb (10) ---
  {
    id: 'climb_goat_fail',
    category: 'climb',
    title: 'Mountain Goat Fail',
    description: 'Climbed high stairs then fell into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) => (creature.stairPeakHeight ?? 0) > 80 && !!creature.fellInPit,
  },
  {
    id: 'climb_beam_wobble',
    category: 'climb',
    title: 'Beam Wobble',
    description: 'Spent ages on the beam without finishing.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.BALANCE_BEAM],
    check: ({ creature }) =>
      (creature.beamSupportedFrames ?? 0) > 120 && !creature.beamCompleted,
  },
  {
    id: 'climb_obstacle_faceplant',
    category: 'climb',
    title: 'Obstacle Faceplant',
    description: 'Mounted obstacles then fell into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) => (creature.obstacleClimbMountCount ?? 0) > 0 && !!creature.fellInPit,
  },
  {
    id: 'climb_bridge_troll',
    category: 'climb',
    title: 'Bridge Troll',
    description: 'Lingered on the bridge without crossing.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.MOTOR_BRIDGE],
    check: ({ creature }) =>
      (creature.bridgeSupportedFrames ?? 0) > 80 && !creature.bridgeCompleted,
  },
  {
    id: 'climb_cliff_diver',
    category: 'climb',
    title: 'Cliff Diver',
    description: 'Fell from a great height into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      !!creature.fellInPit && (creature.episodePeakSupportHeight ?? 0) > 60,
  },
  {
    id: 'climb_summit_retreat',
    category: 'climb',
    title: 'Summit Retreat',
    description: 'Reached a stair summit then retreated left.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.episodeStairPeak ?? 0) > 60 && netTravelX(creature) < -40,
  },
  {
    id: 'climb_roller',
    category: 'climb',
    title: 'Stair Roller',
    description: 'Peaked on stairs then tumbled down.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.episodeStairPeak ?? 0) > 60 &&
      (creature.stayTallFallFrames ?? 0) > 25 &&
      (creature.stairPeakHeight ?? 0) < (creature.episodeStairPeak ?? 0) * 0.5,
  },
  {
    id: 'climb_overhang',
    category: 'climb',
    title: 'Overhang Oops',
    description: 'High obstacle support followed by a collapse.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.obstacleClimbSupportedHeight ?? 0) > 50 &&
      (creature.stayTallFallFrames ?? 0) > 30,
  },
  {
    id: 'climb_balance_fail',
    category: 'climb',
    title: 'Balance Fail',
    description: 'Beam contact then a long fall.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.beamSupportedFrames ?? 0) > 40 &&
      (creature.stayTallFallFrames ?? 0) > 40 &&
      !!creature.fellInPit,
  },
  {
    id: 'climb_alpine',
    category: 'climb',
    title: 'Alpine Avalanche',
    description: 'Multi-climb chaos ending in a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      ((creature.stairPeakHeight ?? 0) > 40 ||
        (creature.obstacleClimbMountCount ?? 0) > 0 ||
        (creature.beamSupportedFrames ?? 0) > 60) &&
      (creature.stayTallFallFrames ?? 0) > 50 &&
      !!creature.fellInPit,
  },

  // --- object (10) ---
  {
    id: 'obj_butterfingers',
    category: 'object',
    title: 'Butterfingers',
    description: 'Held the ball forever but never transported it.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.CARRY_BALL],
    check: ({ creature }) =>
      (creature.carryBallBestContactChainFrames ?? 0) > 40 &&
      (creature.carryBallTransportDistance ?? 0) < 20,
  },
  {
    id: 'obj_own_goal',
    category: 'object',
    title: 'Own Goal',
    description: 'Scored a goal while training something else entirely.',
    flavor: 'disaster',
    blockedGoals: [EvolutionGoal.KICK_GOAL],
    check: ({ creature, activeGoal }) =>
      activeGoal !== EvolutionGoal.KICK_GOAL && !!creature.goalScored,
  },
  {
    id: 'obj_ball_hog',
    category: 'object',
    title: 'Ball Hog',
    description: 'Long ball contact with zero meaningful transport.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.carryBallBestContactChainFrames ?? 0) > 60 &&
      (creature.carryBallTransportDistance ?? 0) < 5,
  },
  {
    id: 'obj_pin_self',
    category: 'object',
    title: 'Pin Self',
    description: 'Knocked pins then fell into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) => (creature.pinsDown ?? 0) > 0 && !!creature.fellInPit,
  },
  {
    id: 'obj_box_rebound',
    category: 'object',
    title: 'Box Rebound',
    description: 'Slammed into the box at high speed with no push credit.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.PUSH_BOX],
    check: ({ creature, activeGoal }) =>
      activeGoal !== EvolutionGoal.PUSH_BOX &&
      (creature.peakSpeed ?? 0) > 8 &&
      creature.fitness < 10,
  },
  {
    id: 'obj_near_miss_storm',
    category: 'object',
    title: 'Near Miss Storm',
    description: 'Approached targets repeatedly but never hit one.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.HIT_TARGET],
    check: ({ creature }) =>
      (creature.targetApproachBest ?? 0) > 40 && (creature.targetHits ?? 0) === 0,
  },
  {
    id: 'obj_hoop_escape',
    category: 'object',
    title: 'Hoop Escape Artist',
    description: 'Spent more time outside the hoop than rolling inside it.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.MOTOR_LOOP],
    check: ({ creature }) =>
      (creature.hoopOutsideFrames ?? 0) > (creature.hoopTravel ?? 0) &&
      (creature.hoopOutsideFrames ?? 0) > 50,
  },
  {
    id: 'obj_drop_zone',
    category: 'object',
    title: 'Drop Zone',
    description: 'Grabbed the ball then immediately lost it.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      !!creature.ballCreatureContacted &&
      (creature.carryBallBestContactChainFrames ?? 0) > 15 &&
      (creature.carryBallTransportDistance ?? 0) < 8,
  },
  {
    id: 'obj_magnet_hands',
    category: 'object',
    title: 'Magnet Hands',
    description: 'Maximum contact, minimum movement.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.carryBallBestContactChainFrames ?? 0) > 80 &&
      (creature.carryBallTransportDistance ?? 0) < 15,
  },
  {
    id: 'obj_juggernaut',
    category: 'object',
    title: 'Juggernaut',
    description: 'Pushed progress then drove into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.PUSH_BOX && creature.fitness > 20 && !!creature.fellInPit,
  },

  // --- motor (10) ---
  {
    id: 'motor_wheelie_fail',
    category: 'motor',
    title: 'Wheelie Fail',
    description: 'Climbed the ramp but never cleared the gap.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.MOTOR_GAP, EvolutionGoal.MOTOR_RAMP],
    check: ({ creature }) =>
      (creature.rampPeakHeight ?? 0) > 40 && !creature.gapCleared,
  },
  {
    id: 'motor_ice_spinout',
    category: 'motor',
    title: 'Ice Spinout',
    description: 'Ice run ended in a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.iceSupportedDistance ?? 0) > 100 && !!creature.fellInPit,
  },
  {
    id: 'motor_gap_short',
    category: 'motor',
    title: 'Gap Short',
    description: 'Fell short on the motor gap goal.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.MOTOR_GAP && !!creature.fellInPit,
  },
  {
    id: 'motor_overshoot',
    category: 'motor',
    title: 'Launch Overshoot',
    description: 'Cleared the gap but botched the wheel landing.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.MOTOR_LAUNCH_LAND],
    check: ({ creature }) => !!creature.gapCleared && (creature.wheelLandScore ?? 0) === 0,
  },
  {
    id: 'motor_hurdle_faceplant',
    category: 'motor',
    title: 'Hurdle Faceplant',
    description: 'Hit hurdles then collapsed.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.hurdlesHitMask ?? 0) > 0 && (creature.stayTallFallFrames ?? 0) > 20,
  },
  {
    id: 'motor_bridge_collapse',
    category: 'motor',
    title: 'Bridge Collapse',
    description: 'Bridge support then pit fall.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.bridgeSupportedFrames ?? 0) > 30 && !!creature.fellInPit,
  },
  {
    id: 'motor_slalom_disaster',
    category: 'motor',
    title: 'Slalom Disaster',
    description: 'High speed, stalled slalom progress.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.MOTOR_SLALOM],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.MOTOR_SLALOM &&
      (creature.peakSpeed ?? 0) > 9 &&
      (creature.technicalSupportedDistance ?? 0) < 80,
  },
  {
    id: 'motor_speed_crash',
    category: 'motor',
    title: 'Landspeed Crash',
    description: 'Peak landspeed then pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) => (creature.peakLandSpeed ?? 0) > 12 && !!creature.fellInPit,
  },
  {
    id: 'motor_hoop_chaos',
    category: 'motor',
    title: 'Hoop Chaos',
    description: 'Lost the hoop constantly on the loop goal.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.MOTOR_LOOP && (creature.hoopOutsideFrames ?? 0) > 200,
  },
  {
    id: 'motor_parking_miss',
    category: 'motor',
    title: 'Parking Miss',
    description: 'Blasted through the finish without parking.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.PARKING_ZONE],
    check: ({ creature }) =>
      !!creature.crossedFinish &&
      (creature.parkingFrames ?? 0) === 0 &&
      (creature.peakSpeed ?? 0) > 6,
  },

  // --- sports (10) ---
  {
    id: 'sport_own_goal',
    category: 'sports',
    title: 'Own Goal Scorer',
    description: 'Scored while training dodgeball or another sport.',
    flavor: 'disaster',
    blockedGoals: [EvolutionGoal.KICK_GOAL],
    check: ({ creature, activeGoal }) =>
      activeGoal !== EvolutionGoal.KICK_GOAL && !!creature.goalScored,
  },
  {
    id: 'sport_strikeout',
    category: 'sports',
    title: 'Strikeout',
    description: 'Bowling speed demon — zero pins down.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.BOWLING_PINS &&
      (creature.pinsDown ?? 0) === 0 &&
      (creature.peakSpeed ?? 0) > 10,
  },
  {
    id: 'sport_dodge_fail',
    category: 'sports',
    title: 'Dodge Fail',
    description: 'Barely progressed on dodgeball then fell.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.DODGEBALL &&
      (creature.hazardProgressCount ?? 0) < 2 &&
      !!creature.fellInPit,
  },
  {
    id: 'sport_wrong_way_sprint',
    category: 'sports',
    title: 'Wrong-Way Sprint',
    description: 'Finished with minimal checkpoint progress.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.SPRINT_FINISH &&
      !!creature.crossedFinish &&
      (creature.checkpointReached ?? -1) < 1,
  },
  {
    id: 'sport_false_finish',
    category: 'sports',
    title: 'False Finish',
    description: 'Crossed the line then immediately collapsed.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      !!creature.crossedFinish && (creature.postFinishFallFrames ?? 0) > 15,
  },
  {
    id: 'sport_penalty_box',
    category: 'sports',
    title: 'Penalty Box',
    description: 'Entered the parking zone at maximum speed.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.SPRINT_FINISH &&
      (creature.parkingFrames ?? 0) > 5 &&
      (creature.peakSpeed ?? 0) > 10,
  },
  {
    id: 'sport_bullseye_backfire',
    category: 'sports',
    title: 'Bullseye Backfire',
    description: 'Hit the target then fell into a pit.',
    flavor: 'disaster',
    blockedGoals: [],
    check: ({ creature }) => (creature.targetHits ?? 0) > 0 && !!creature.fellInPit,
  },
  {
    id: 'sport_gutter_ball',
    category: 'sports',
    title: 'Gutter Ball',
    description: 'Partial pin knockdown with a wayward finish.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.BOWLING_PINS &&
      (creature.pinsDown ?? 0) > 0 &&
      (creature.pinsDown ?? 0) < 5 &&
      !!creature.fellInPit,
  },
  {
    id: 'sport_hail_mary',
    category: 'sports',
    title: 'Hail Mary',
    description: 'Scored a goal from the wrong side of the field on the wrong goal.',
    flavor: 'triumph',
    blockedGoals: [EvolutionGoal.KICK_GOAL],
    check: ({ creature, activeGoal }) =>
      activeGoal !== EvolutionGoal.KICK_GOAL &&
      !!creature.goalScored &&
      creature.currentX < creature.startX + 80,
  },
  {
    id: 'sport_photo_finish_fail',
    category: 'sports',
    title: 'Photo Finish Fail',
    description: 'Crossed the finish dead last in an arena heat.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, context, isLowestFitnessInHeat }) =>
      context === 'arena' &&
      !!isLowestFitnessInHeat &&
      !!creature.crossedFinish,
  },

  // --- precision (10) ---
  {
    id: 'prec_near_bar',
    category: 'precision',
    title: 'Bar Tease',
    description: 'Almost cleared the bar — but not quite.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.CLEAR_BAR],
    check: ({ creature }) =>
      !creature.clearedBar &&
      (creature.jumpHeightBestClearance ?? 0) > 75 &&
      (creature.jumpHeightBestClearance ?? 0) < 92,
  },
  {
    id: 'prec_near_target',
    category: 'precision',
    title: 'Bullseye Tease',
    description: 'Lined up perfectly but never scored a hit.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.HIT_TARGET],
    check: ({ creature, activeGoal }) =>
      activeGoal !== EvolutionGoal.HIT_TARGET &&
      (creature.targetApproachBest ?? 0) > 35 &&
      (creature.targetHits ?? 0) === 0,
  },
  {
    id: 'prec_parking_edge',
    category: 'precision',
    title: 'Edge Parker',
    description: 'Parked for a while but never fully settled.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.PARKING_ZONE &&
      (creature.parkingFrames ?? 0) > 30 &&
      (creature.parkingFrames ?? 0) < 120 &&
      creature.fitness < 50,
  },
  {
    id: 'prec_beam_almost',
    category: 'precision',
    title: 'Beam Almost',
    description: 'Long beam run without completion.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.BALANCE_BEAM],
    check: ({ creature }) =>
      (creature.beamSupportedFrames ?? 0) > 80 && !creature.beamCompleted,
  },
  {
    id: 'prec_overshoot_finish',
    category: 'precision',
    title: 'Overshoot',
    description: 'Crossed the finish with massive overshoot.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      !!creature.crossedFinish && netTravelX(creature) > 200 && (creature.peakSpeed ?? 0) > 8,
  },
  {
    id: 'prec_gap_tease',
    category: 'precision',
    title: 'Gap Tease',
    description: 'Reached the pit edge without clearing the gap.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.MOTOR_GAP, EvolutionGoal.AERIAL_CROSSING],
    check: ({ creature, arena }) =>
      !!arena.pitEnabled &&
      !creature.gapCleared &&
      !creature.fellInPit &&
      (creature.episodeMaxX ?? creature.currentX) > creature.startX + (arena.gapWidthPx ?? 500) * 0.85,
  },
  {
    id: 'prec_stop_sign_runner',
    category: 'precision',
    title: 'Stop Sign Runner',
    description: 'Sprint finish at full speed — never slowed down.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.SPRINT_FINISH &&
      !!creature.crossedFinish &&
      (creature.parkingFrames ?? 0) === 0 &&
      (creature.peakSpeed ?? 0) > 8,
  },
  {
    id: 'prec_thread_fail',
    category: 'precision',
    title: 'Thread the Needle Fail',
    description: 'Most of the slalom done, then stuck.',
    flavor: 'mishap',
    blockedGoals: [EvolutionGoal.MOTOR_SLALOM],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.MOTOR_SLALOM &&
      (creature.technicalSupportedDistance ?? 0) > 120 &&
      (creature.peakSpeed ?? 0) < 2 &&
      (creature.episodeFrames ?? 0) > 200,
  },
  {
    id: 'prec_zone_violator',
    category: 'precision',
    title: 'Zone Violator',
    description: 'Brief parking then blasted off at speed.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.PARKING_ZONE &&
      (creature.parkingFrames ?? 0) > 10 &&
      (creature.parkingFrames ?? 0) < 60 &&
      (creature.peakSpeed ?? 0) > 9,
  },
  {
    id: 'prec_centimeter_short',
    category: 'precision',
    title: 'Centimeter Short',
    description: 'High effort, strong telemetry, fitness just shy of glory.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, context }) =>
      context === 'sandbox' &&
      creature.fitness > 0 &&
      creature.fitness < 8 &&
      (creature.episodeFrames ?? 0) > 200 &&
      ((creature.peakSpeed ?? 0) > 5 || (creature.jumpHeightBestClearance ?? 0) > 40),
  },

  // --- custom (10) ---
  {
    id: 'custom_chaos_theory',
    category: 'custom',
    title: 'Chaos Theory',
    description: 'Custom goal with multiple unrelated metrics all spiking at once.',
    flavor: 'triumph',
    blockedGoals: [],
    check: ({ creature, activeGoal }) => {
      if (activeGoal !== EvolutionGoal.CUSTOM) return false;
      let metrics = 0;
      if ((creature.peakSpeed ?? 0) > 5) metrics++;
      if ((creature.jumpHeightBestClearance ?? 0) > 40) metrics++;
      if ((creature.flightFrames ?? 0) > 30) metrics++;
      if ((creature.stairPeakHeight ?? 0) > 30) metrics++;
      return metrics >= 3;
    },
  },
  {
    id: 'custom_zero_hero',
    category: 'custom',
    title: 'Zero Hero',
    description: 'Custom goal, zero fitness, full episode.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.CUSTOM &&
      creature.fitness === 0 &&
      (creature.episodeFrames ?? 0) > 300,
  },
  {
    id: 'custom_max_min',
    category: 'custom',
    title: 'Max Effort Min Reward',
    description: 'Peak athletic telemetry with almost no fitness.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      (creature.peakSpeed ?? 0) > 6 &&
      (creature.jumpHeightBestClearance ?? 0) > 35 &&
      (creature.flightFrames ?? 0) > 20 &&
      creature.fitness < 5,
  },
  {
    id: 'custom_rule_breaker',
    category: 'custom',
    title: 'Rule Breaker',
    description: 'Positive fitness on custom despite chaotic behavior.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature, activeGoal }) =>
      activeGoal === EvolutionGoal.CUSTOM &&
      creature.fitness > 10 &&
      (creature.stayTallFallFrames ?? 0) > 30,
  },
  {
    id: 'custom_accidental_genius',
    category: 'custom',
    title: 'Accidental Genius',
    description: 'Custom training accidentally matched another secret condition.',
    flavor: 'triumph',
    blockedGoals: [],
    check: ({ activeGoal, accidentalNonCustomMatch }) =>
      activeGoal === EvolutionGoal.CUSTOM && !!accidentalNonCustomMatch,
  },
  {
    id: 'custom_morph_lottery',
    category: 'custom',
    title: 'Morph Lottery',
    description: 'Generation-one random morph unlocked a secret.',
    flavor: 'triumph',
    blockedGoals: [],
    isMeta: true,
    check: () => false,
  },
  {
    id: 'custom_frankenstein',
    category: 'custom',
    title: 'Frankenstein',
    description: 'A chimera body with many incompatible systems triggered a mishap.',
    flavor: 'mishap',
    blockedGoals: [],
    check: ({ creature }) =>
      countIncompatibleTraits(creature) >= 4 &&
      ((creature.stayTallFallFrames ?? 0) > 20 || !!creature.fellInPit),
  },
  {
    id: 'custom_sandbox_explorer',
    category: 'custom',
    title: 'Sandbox Explorer',
    description: 'First secret ever discovered in the Sandbox.',
    flavor: 'triumph',
    blockedGoals: [],
    isMeta: true,
    check: () => false,
  },
  {
    id: 'custom_arena_wanderer',
    category: 'custom',
    title: 'Arena Wanderer',
    description: 'First secret discovered in an Arena Championship heat.',
    flavor: 'triumph',
    blockedGoals: [],
    isMeta: true,
    check: () => false,
  },
  {
    id: 'custom_collector',
    category: 'custom',
    title: 'Trophy Hunter',
    description: 'Discovered ten secret goals.',
    flavor: 'triumph',
    blockedGoals: [],
    isMeta: true,
    check: () => false,
  },
];

export function secretGoalById(id: SecretGoalId): SecretGoalDefinition | undefined {
  return SECRET_GOALS.find(g => g.id === id);
}

export const SECRET_GOAL_COUNT = SECRET_GOALS.length;

export function secretsByCategory(category: GoalCategory): SecretGoalDefinition[] {
  return SECRET_GOALS.filter(g => g.category === category);
}

/** For smoke tests / validation — never call from public UI before discovery */
export function allSecretTitles(): string[] {
  return SECRET_GOALS.map(g => g.title);
}
