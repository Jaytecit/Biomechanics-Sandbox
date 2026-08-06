/**
 * E5 — Secret goal definitions + flavor text (100 discoverable trophies).
 * Titles/descriptions stay hidden until a discovery is recorded.
 */
import type { TaskEpisodeMetrics } from '../brain/taskScore';
import type { TaskId } from '../brain/types';
import type { CreatureDesign } from '../creature/types';

export type SecretGoalFlavor = 'triumph' | 'mishap' | 'disaster';

export type SecretGoalCategory =
  | 'locomotion'
  | 'jump'
  | 'flight'
  | 'climb'
  | 'motor'
  | 'precision'
  | 'meta';

export type SecretGoalId = string;

/** Scoring thresholds — product logic, not physics feel tunables. */
const ZERO_DIST = 0.35;
const BACKPEDAL_DIST = -1.5;
const FACEPLANT_DIST_MIN = 0.5;
const BELLY_AIR = 0.8;
const BELLY_UPRIGHT_MAX = 0.45;
const SKY_HEIGHT = 2.5;
const CLIMB_PEAK_MIN = 1.2;
const CLIMB_END_DIST_MAX = 1.0;
const MOTOR_UPRIGHT_MAX = 0.4;
const FLIGHT_GROUNDED_AIR = 0.25;
const FLIGHT_FEATHER_AIR = 2.5;
const COLLECTOR_MIN = 3;

export interface SecretGoalEvalContext {
  task: TaskId;
  metrics: TaskEpisodeMetrics;
  design: CreatureDesign;
  episodeSeconds: number;
  generation?: number;
  /** Already-discovered secret ids */
  discoveredIds: Set<string>;
  priorDiscoveryCount: number;
}

export interface SecretGoalDefinition {
  id: SecretGoalId;
  category: SecretGoalCategory;
  title: string;
  description: string;
  flavor: SecretGoalFlavor;
  /** Tasks that intentionally reward this — discovery blocked while training them. */
  blockedTasks: TaskId[];
  requiresWheels?: boolean;
  requiresAero?: boolean;
  isMeta?: boolean;
  check: (ctx: SecretGoalEvalContext) => boolean;
}

export const SECRET_CATEGORIES: SecretGoalCategory[] = [
  'locomotion',
  'jump',
  'flight',
  'climb',
  'motor',
  'precision',
  'meta',
];

function discoveredInCategory(
  ctx: SecretGoalEvalContext,
  category: SecretGoalCategory,
  min: number,
): boolean {
  let count = 0;
  for (const g of SECRET_GOALS) {
    if (g.category === category && ctx.discoveredIds.has(g.id)) count++;
  }
  return count >= min;
}

function discoveredFlavorCount(
  ctx: SecretGoalEvalContext,
  flavor: SecretGoalFlavor,
  min: number,
): boolean {
  let count = 0;
  for (const g of SECRET_GOALS) {
    if (g.flavor === flavor && ctx.discoveredIds.has(g.id)) count++;
  }
  return count >= min;
}

export const SECRET_GOALS: SecretGoalDefinition[] = [
  // ── Locomotion (15) ──────────────────────────────────────────────────────
  {
    id: 'run_zero_hero',
    category: 'locomotion',
    title: 'Zero Hero',
    description: 'Held your ground with heroic resolve — and zero progress.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' &&
      !ctx.metrics.fell &&
      Math.abs(ctx.metrics.distance) < ZERO_DIST,
  },
  {
    id: 'run_faceplant',
    category: 'locomotion',
    title: 'Faceplant Sprint',
    description: 'Moved a little, then introduced your face to the floor.',
    flavor: 'disaster',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.fell &&
      ctx.metrics.distance >= FACEPLANT_DIST_MIN,
  },
  {
    id: 'run_backpedal',
    category: 'locomotion',
    title: 'Backpedal Hero',
    description: 'Committed fully to the wrong direction.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) => ctx.task === 'run' && ctx.metrics.distance < BACKPEDAL_DIST,
  },
  {
    id: 'run_marathon',
    category: 'locomotion',
    title: 'Marathon Shuffle',
    description: 'Kept going long after everyone else would have stopped.',
    flavor: 'triumph',
    blockedTasks: ['run'],
    check: (ctx) =>
      ctx.task === 'run' &&
      !ctx.metrics.fell &&
      ctx.metrics.distance >= 8,
  },
  {
    id: 'run_tiptoe',
    category: 'locomotion',
    title: 'Tiptoe Commute',
    description: 'Many tiny steps. Almost no territory gained.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.footLifts >= 20 &&
      ctx.metrics.distance < 2,
  },
  {
    id: 'run_steady',
    category: 'locomotion',
    title: 'Steady Strider',
    description: 'Upright, composed, and actually going somewhere.',
    flavor: 'triumph',
    blockedTasks: ['run'],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.uprightQuality >= 0.9 &&
      ctx.metrics.distance >= 3 &&
      !ctx.metrics.fell,
  },
  {
    id: 'run_rough_rider',
    category: 'locomotion',
    title: 'Rough Rider',
    description: 'Survived the bumps and still made forward progress.',
    flavor: 'triumph',
    blockedTasks: ['rough'],
    check: (ctx) =>
      ctx.task === 'rough' &&
      !ctx.metrics.fell &&
      ctx.metrics.distance >= 4,
  },
  {
    id: 'run_sprint_finish',
    category: 'locomotion',
    title: 'Sprint Finisher',
    description: 'Crossed the line while the clock still mattered.',
    flavor: 'triumph',
    blockedTasks: ['sprint'],
    check: (ctx) => ctx.task === 'sprint' && ctx.metrics.finished,
  },
  {
    id: 'run_speed_demon',
    category: 'locomotion',
    title: 'Speed Demon',
    description: 'Hit a frightening peak velocity on the straightaway.',
    flavor: 'triumph',
    blockedTasks: ['speed'],
    check: (ctx) => ctx.task === 'speed' && ctx.metrics.peakSpeed >= 4,
  },
  {
    id: 'run_stay_course',
    category: 'locomotion',
    title: 'Posture Patrol',
    description: 'Held form under the stay task without face-planting.',
    flavor: 'triumph',
    blockedTasks: ['stay'],
    check: (ctx) =>
      ctx.task === 'stay' &&
      ctx.metrics.uprightQuality >= 0.85 &&
      !ctx.metrics.fell,
  },
  {
    id: 'run_checkpoint',
    category: 'locomotion',
    title: 'Checkpoint Courier',
    description: 'Tagged multiple markers in one heated lap.',
    flavor: 'triumph',
    blockedTasks: ['sprint'],
    check: (ctx) => ctx.task === 'sprint' && ctx.metrics.checkpointsHit >= 2,
  },
  {
    id: 'run_penalty_box',
    category: 'locomotion',
    title: 'Penalty Box',
    description: 'Visited every forbidden zone on the map.',
    flavor: 'disaster',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' && ctx.metrics.regionPenalty >= 2,
  },
  {
    id: 'run_reward_hunter',
    category: 'locomotion',
    title: 'Reward Hunter',
    description: 'Snagged bonus zones while pretending to run.',
    flavor: 'triumph',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.regionReward >= 1 &&
      ctx.metrics.distance >= 1,
  },
  {
    id: 'run_off_task_sprint',
    category: 'locomotion',
    title: 'Accidental Sprinter',
    description: 'Blazing speed discovered while training something else.',
    flavor: 'triumph',
    blockedTasks: ['speed', 'sprint'],
    check: (ctx) =>
      ctx.task !== 'speed' &&
      ctx.task !== 'sprint' &&
      ctx.metrics.peakSpeed >= 5,
  },
  {
    id: 'run_long_haul',
    category: 'locomotion',
    title: 'Long Haul',
    description: 'An absurd distance for a creature with no luggage.',
    flavor: 'triumph',
    blockedTasks: ['run'],
    check: (ctx) =>
      ctx.task === 'run' &&
      !ctx.metrics.fell &&
      ctx.metrics.distance >= 12,
  },

  // ── Jump (15) ──────────────────────────────────────────────────────────
  {
    id: 'jump_belly_flop',
    category: 'jump',
    title: 'Belly Flop',
    description: 'Airtime achieved. Dignity optional.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'jump' &&
      ctx.metrics.airTime >= BELLY_AIR &&
      ctx.metrics.uprightQuality < BELLY_UPRIGHT_MAX,
  },
  {
    id: 'jump_sky_tease',
    category: 'jump',
    title: 'Sky Tease',
    description: 'A surprising leap while chasing something else entirely.',
    flavor: 'triumph',
    blockedTasks: ['jump'],
    check: (ctx) =>
      ctx.task !== 'jump' && ctx.metrics.peakHeight >= SKY_HEIGHT,
  },
  {
    id: 'jump_hang_time',
    category: 'jump',
    title: 'Hang Time Hero',
    description: 'Defied gravity on the dedicated hang task.',
    flavor: 'triumph',
    blockedTasks: ['hang'],
    check: (ctx) => ctx.task === 'hang' && ctx.metrics.airTime >= 1.5,
  },
  {
    id: 'jump_long_arc',
    category: 'jump',
    title: 'Long Arc',
    description: 'A horizontal leap that cleared serious ground.',
    flavor: 'triumph',
    blockedTasks: ['longjump'],
    check: (ctx) => ctx.task === 'longjump' && ctx.metrics.distance >= 5,
  },
  {
    id: 'jump_sticky_landing',
    category: 'jump',
    title: 'Sticky Landing',
    description: 'Left the ground, returned upright, stayed alive.',
    flavor: 'triumph',
    blockedTasks: ['jump'],
    check: (ctx) =>
      ctx.task === 'jump' &&
      !ctx.metrics.fell &&
      ctx.metrics.airTime >= 0.5 &&
      ctx.metrics.uprightQuality >= 0.7,
  },
  {
    id: 'jump_short_hop',
    category: 'jump',
    title: 'Short Hop',
    description: 'Technically left the ground. Barely.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'jump' &&
      ctx.metrics.airTime < 0.3 &&
      ctx.metrics.distance < 1,
  },
  {
    id: 'jump_off_task_hang',
    category: 'jump',
    title: 'Off-Task Hover',
    description: 'Extended float time while not training hang at all.',
    flavor: 'triumph',
    blockedTasks: ['hang'],
    check: (ctx) =>
      ctx.task !== 'hang' && ctx.metrics.airTime >= 2,
  },
  {
    id: 'jump_peak_bounce',
    category: 'jump',
    title: 'Peak Bounce',
    description: 'Reached impressive altitude on the jump task.',
    flavor: 'triumph',
    blockedTasks: ['jump'],
    check: (ctx) =>
      ctx.task === 'jump' && ctx.metrics.peakHeight >= 3,
  },
  {
    id: 'jump_foot_frenzy',
    category: 'jump',
    title: 'Foot Frenzy',
    description: 'Churned the ground before finally leaving it.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'jump' && ctx.metrics.footLifts >= 15,
  },
  {
    id: 'jump_rough_bounce',
    category: 'jump',
    title: 'Rough Bounce',
    description: 'Caught air on terrain that was not cooperating.',
    flavor: 'mishap',
    blockedTasks: ['rough'],
    check: (ctx) =>
      ctx.task === 'rough' && ctx.metrics.airTime >= 0.8,
  },
  {
    id: 'jump_run_leap',
    category: 'jump',
    title: 'Runway Leap',
    description: 'Sprinted into an unplanned jump.',
    flavor: 'triumph',
    blockedTasks: ['jump', 'hang'],
    check: (ctx) =>
      ctx.task === 'run' && ctx.metrics.airTime >= 1.0,
  },
  {
    id: 'jump_climb_launch',
    category: 'jump',
    title: 'Cliff Launch',
    description: 'Used a climb session as a launch pad.',
    flavor: 'triumph',
    blockedTasks: ['jump'],
    check: (ctx) =>
      ctx.task === 'climb' && ctx.metrics.airTime >= 0.6,
  },
  {
    id: 'jump_precision_land',
    category: 'jump',
    title: 'Precision Landing',
    description: 'Long jump with distance nailed in the sweet spot.',
    flavor: 'triumph',
    blockedTasks: ['longjump'],
    check: (ctx) =>
      ctx.task === 'longjump' &&
      ctx.metrics.distance >= 6 &&
      !ctx.metrics.fell,
  },
  {
    id: 'jump_disaster',
    category: 'jump',
    title: 'Jump Disaster',
    description: 'Committed to the jump and paid the price.',
    flavor: 'disaster',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'jump' &&
      ctx.metrics.fell &&
      ctx.metrics.airTime >= 0.5,
  },
  {
    id: 'jump_mean_height',
    category: 'jump',
    title: 'Mean Altitude',
    description: 'Stayed high on average while airborne.',
    flavor: 'triumph',
    blockedTasks: ['jump'],
    check: (ctx) =>
      ctx.task === 'jump' && ctx.metrics.meanAirHeight >= 1.5,
  },

  // ── Flight (15) ────────────────────────────────────────────────────────
  {
    id: 'flight_grounded',
    category: 'flight',
    title: 'Grounded Eagle',
    description: 'Wings installed. Takeoff postponed indefinitely.',
    flavor: 'mishap',
    blockedTasks: [],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' && ctx.metrics.airTime < FLIGHT_GROUNDED_AIR,
  },
  {
    id: 'flight_feather',
    category: 'flight',
    title: 'Feather Fall',
    description: 'A long float discovered off-task.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task !== 'flight' && ctx.metrics.airTime >= FLIGHT_FEATHER_AIR,
  },
  {
    id: 'flight_sustained',
    category: 'flight',
    title: 'Sustained Glide',
    description: 'Kept the wings working for a respectable stretch.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' && ctx.metrics.airTime >= 3,
  },
  {
    id: 'flight_cruise',
    category: 'flight',
    title: 'Cruise Altitude',
    description: 'Maintained a lofty mean height while aloft.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' && ctx.metrics.meanAirHeight >= 2,
  },
  {
    id: 'flight_stall',
    category: 'flight',
    title: 'Aero Stall',
    description: 'Airborne but barely moving — classic stall energy.',
    flavor: 'mishap',
    blockedTasks: [],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' &&
      ctx.metrics.airTime >= 1 &&
      ctx.metrics.peakSpeed < 1,
  },
  {
    id: 'flight_off_task_glide',
    category: 'flight',
    title: 'Surprise Glide',
    description: 'Gliding discovered while training another discipline.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task !== 'flight' &&
      ctx.metrics.airTime >= 1.5 &&
      ctx.metrics.meanAirHeight >= 1,
  },
  {
    id: 'flight_high_wind',
    category: 'flight',
    title: 'High Wind',
    description: 'Punched through to serious altitude under flight training.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' && ctx.metrics.peakHeight >= 4,
  },
  {
    id: 'flight_ground_touch',
    category: 'flight',
    title: 'Hard Landing',
    description: 'Flew, then met the ground with enthusiasm.',
    flavor: 'disaster',
    blockedTasks: [],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' &&
      ctx.metrics.airTime >= 0.5 &&
      ctx.metrics.fell,
  },
  {
    id: 'flight_motor_lift',
    category: 'flight',
    title: 'Motor Lift',
    description: 'Wheels and wings in one chaotic episode.',
    flavor: 'mishap',
    blockedTasks: ['flight', 'motor'],
    requiresAero: true,
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' && ctx.metrics.airTime >= 0.8,
  },
  {
    id: 'flight_speed_bird',
    category: 'flight',
    title: 'Speed Bird',
    description: 'Fast and briefly airborne on the speed task.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'speed' && ctx.metrics.airTime >= 1,
  },
  {
    id: 'flight_climb_soar',
    category: 'flight',
    title: 'Cliff Soarer',
    description: 'Used a climb to catch unexpected lift.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'climb' && ctx.metrics.airTime >= 1.2,
  },
  {
    id: 'flight_long_float',
    category: 'flight',
    title: 'Long Float',
    description: 'An extended aerial session under dedicated flight training.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' && ctx.metrics.airTime >= 4,
  },
  {
    id: 'flight_penalty_drift',
    category: 'flight',
    title: 'Penalty Drift',
    description: 'Drifted through restricted airspace.',
    flavor: 'disaster',
    blockedTasks: [],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' && ctx.metrics.regionPenalty >= 1,
  },
  {
    id: 'flight_reward_thermal',
    category: 'flight',
    title: 'Thermal Hunter',
    description: 'Found a reward zone while riding the air.',
    flavor: 'triumph',
    blockedTasks: [],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' &&
      ctx.metrics.regionReward >= 1 &&
      ctx.metrics.airTime >= 0.5,
  },
  {
    id: 'flight_rough_gust',
    category: 'flight',
    title: 'Rough Gust',
    description: 'Caught lift on rough terrain without trying.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'rough' && ctx.metrics.airTime >= 1,
  },

  // ── Climb (15) ─────────────────────────────────────────────────────────
  {
    id: 'climb_retreat',
    category: 'climb',
    title: 'Summit Retreat',
    description: 'Reached up… then ended near where you started.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.peakHeight >= CLIMB_PEAK_MIN &&
      Math.abs(ctx.metrics.distance) < CLIMB_END_DIST_MAX,
  },
  {
    id: 'climb_summit',
    category: 'climb',
    title: 'True Summit',
    description: 'Climbed high and moved forward with purpose.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.peakHeight >= 3 &&
      ctx.metrics.distance >= 2 &&
      !ctx.metrics.fell,
  },
  {
    id: 'climb_hang_on',
    category: 'climb',
    title: 'Hang On',
    description: 'Stayed upright through a demanding ascent.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.uprightQuality >= 0.8 &&
      !ctx.metrics.fell &&
      ctx.metrics.peakHeight >= 1.5,
  },
  {
    id: 'climb_slide',
    category: 'climb',
    title: 'Summit Slide',
    description: 'Peaked, then slid back down in disgrace.',
    flavor: 'disaster',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.peakHeight >= 2 &&
      Math.abs(ctx.metrics.distance) < 0.5 &&
      ctx.metrics.fell,
  },
  {
    id: 'climb_steady',
    category: 'climb',
    title: 'Steady Ascent',
    description: 'Controlled climb with solid posture.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.peakHeight >= 2 &&
      ctx.metrics.uprightQuality >= 0.75,
  },
  {
    id: 'climb_off_task_peak',
    category: 'climb',
    title: 'Off-Task Peak',
    description: 'Reached serious height while not training climb.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task !== 'climb' && ctx.metrics.peakHeight >= 2.5,
  },
  {
    id: 'climb_rough_scramble',
    category: 'climb',
    title: 'Rough Scramble',
    description: 'Scrambled upward on hostile terrain.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'rough' && ctx.metrics.peakHeight >= 1.5,
  },
  {
    id: 'climb_jump_boost',
    category: 'climb',
    title: 'Jump Boost',
    description: 'Used vertical jump momentum to gain height.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'jump' && ctx.metrics.peakHeight >= 2,
  },
  {
    id: 'climb_motor_ramp',
    category: 'climb',
    title: 'Ramp Climber',
    description: 'Drove wheels up an incline like it was a stunt.',
    flavor: 'mishap',
    blockedTasks: ['climb'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' && ctx.metrics.peakHeight >= 1.5,
  },
  {
    id: 'climb_foot_grip',
    category: 'climb',
    title: 'Foot Grip',
    description: 'Many foot contacts powering a vertical push.',
    flavor: 'triumph',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.footLifts >= 10 &&
      ctx.metrics.peakHeight >= 1.5,
  },
  {
    id: 'climb_region_climber',
    category: 'climb',
    title: 'Zone Climber',
    description: 'Claimed a reward zone mid-ascent.',
    flavor: 'triumph',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'climb' && ctx.metrics.regionReward >= 1,
  },
  {
    id: 'climb_penalty_fall',
    category: 'climb',
    title: 'Penalty Fall',
    description: 'Racked up region penalties on the way down.',
    flavor: 'disaster',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'climb' && ctx.metrics.regionPenalty >= 1.5,
  },
  {
    id: 'climb_speed_hill',
    category: 'climb',
    title: 'Speed Hill',
    description: 'Hit a hill at speed without switching tasks.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'speed' && ctx.metrics.peakHeight >= 1.8,
  },
  {
    id: 'climb_stay_up',
    category: 'climb',
    title: 'Stay Elevated',
    description: 'Held height during a stay session.',
    flavor: 'triumph',
    blockedTasks: ['climb', 'stay'],
    check: (ctx) =>
      ctx.task === 'stay' && ctx.metrics.peakHeight >= 1.2,
  },
  {
    id: 'climb_long_ascent',
    category: 'climb',
    title: 'Long Ascent',
    description: 'An exceptionally tall climb under dedicated training.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'climb' && ctx.metrics.peakHeight >= 4,
  },

  // ── Motor (15) ─────────────────────────────────────────────────────────
  {
    id: 'motor_wheelie',
    category: 'motor',
    title: 'Wheelie Fail',
    description: 'Wheels yes. Balance no.',
    flavor: 'mishap',
    blockedTasks: [],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' &&
      ctx.metrics.uprightQuality < MOTOR_UPRIGHT_MAX,
  },
  {
    id: 'motor_cruise',
    category: 'motor',
    title: 'Motor Cruise',
    description: 'A long, balanced drive on the motor task.',
    flavor: 'triumph',
    blockedTasks: ['motor'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' &&
      ctx.metrics.distance >= 5 &&
      ctx.metrics.uprightQuality >= 0.7 &&
      !ctx.metrics.fell,
  },
  {
    id: 'motor_flip',
    category: 'motor',
    title: 'Motor Flip',
    description: 'Traveled far, then capsized spectacularly.',
    flavor: 'disaster',
    blockedTasks: [],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' &&
      ctx.metrics.fell &&
      ctx.metrics.distance >= 2,
  },
  {
    id: 'motor_backslide',
    category: 'motor',
    title: 'Reverse Gear',
    description: 'Wheels spinning in the wrong direction.',
    flavor: 'mishap',
    blockedTasks: [],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' && ctx.metrics.distance < -2,
  },
  {
    id: 'motor_speedster',
    category: 'motor',
    title: 'Motor Speedster',
    description: 'Peak velocity achieved on the motor task.',
    flavor: 'triumph',
    blockedTasks: ['motor'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' && ctx.metrics.peakSpeed >= 5,
  },
  {
    id: 'motor_off_task_roll',
    category: 'motor',
    title: 'Off-Task Roll',
    description: 'Serious wheel travel discovered away from motor training.',
    flavor: 'triumph',
    blockedTasks: ['motor'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task !== 'motor' &&
      ctx.metrics.distance >= 4 &&
      ctx.metrics.peakSpeed >= 3,
  },
  {
    id: 'motor_rough_drive',
    category: 'motor',
    title: 'Rough Drive',
    description: 'Powered through rough terrain on wheels.',
    flavor: 'triumph',
    blockedTasks: ['motor'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'rough' &&
      ctx.metrics.distance >= 3 &&
      !ctx.metrics.fell,
  },
  {
    id: 'motor_sprint_wheel',
    category: 'motor',
    title: 'Wheel Sprint',
    description: 'Finished a sprint course on wheels.',
    flavor: 'triumph',
    blockedTasks: ['motor', 'sprint'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'sprint' && ctx.metrics.finished,
  },
  {
    id: 'motor_jump_ramp',
    category: 'motor',
    title: 'Jump Ramp',
    description: 'Launched off a jump with serious wheel speed.',
    flavor: 'mishap',
    blockedTasks: ['motor'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'jump' && ctx.metrics.peakSpeed >= 3,
  },
  {
    id: 'motor_flight_combo',
    category: 'motor',
    title: 'Flight Combo',
    description: 'Wheels, wings, and questionable physics in one go.',
    flavor: 'mishap',
    blockedTasks: ['motor', 'flight'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'flight' &&
      ctx.metrics.peakSpeed >= 2 &&
      ctx.metrics.airTime >= 0.5,
  },
  {
    id: 'motor_checkpoint',
    category: 'motor',
    title: 'Wheel Checkpoint',
    description: 'Tagged a sprint checkpoint while rolling.',
    flavor: 'triumph',
    blockedTasks: ['motor', 'sprint'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'sprint' && ctx.metrics.checkpointsHit >= 1,
  },
  {
    id: 'motor_steady_ride',
    category: 'motor',
    title: 'Steady Ride',
    description: 'Composed wheel balance over distance.',
    flavor: 'triumph',
    blockedTasks: ['motor'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' &&
      ctx.metrics.uprightQuality >= 0.85 &&
      ctx.metrics.distance >= 3,
  },
  {
    id: 'motor_penalty_pit',
    category: 'motor',
    title: 'Penalty Pit',
    description: 'Drove through every penalty zone available.',
    flavor: 'disaster',
    blockedTasks: [],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' && ctx.metrics.regionPenalty >= 1,
  },
  {
    id: 'motor_reward_lane',
    category: 'motor',
    title: 'Reward Lane',
    description: 'Snagged a bonus lane while cruising on wheels.',
    flavor: 'triumph',
    blockedTasks: [],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' && ctx.metrics.regionReward >= 0.5,
  },
  {
    id: 'motor_longjump_wheels',
    category: 'motor',
    title: 'Wheeled Long Jump',
    description: 'Long jump distance with wheels attached.',
    flavor: 'mishap',
    blockedTasks: ['motor', 'longjump'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'longjump' && ctx.metrics.distance >= 4,
  },

  // ── Precision (15) ─────────────────────────────────────────────────────
  {
    id: 'precision_sprint_perfect',
    category: 'precision',
    title: 'Perfect Sprint',
    description: 'Finished the sprint with an elite time.',
    flavor: 'triumph',
    blockedTasks: ['sprint'],
    check: (ctx) =>
      ctx.task === 'sprint' &&
      ctx.metrics.finished &&
      ctx.metrics.finishTime !== null &&
      ctx.metrics.finishTime <= 15,
  },
  {
    id: 'precision_all_checkpoints',
    category: 'precision',
    title: 'All Checkpoints',
    description: 'Hit every checkpoint on the course in order.',
    flavor: 'triumph',
    blockedTasks: ['sprint'],
    check: (ctx) =>
      ctx.task === 'sprint' && ctx.metrics.checkpointsHit >= 3,
  },
  {
    id: 'precision_stay_still',
    category: 'precision',
    title: 'Statue Mode',
    description: 'Barely moved while holding perfect posture.',
    flavor: 'triumph',
    blockedTasks: ['stay'],
    check: (ctx) =>
      ctx.task === 'stay' &&
      Math.abs(ctx.metrics.distance) < 0.5 &&
      ctx.metrics.uprightQuality >= 0.95,
  },
  {
    id: 'precision_hang_exact',
    category: 'precision',
    title: 'Exact Hang',
    description: 'Hang time landed in the narrow sweet zone.',
    flavor: 'triumph',
    blockedTasks: ['hang'],
    check: (ctx) =>
      ctx.task === 'hang' &&
      ctx.metrics.airTime >= 1 &&
      ctx.metrics.airTime <= 1.5,
  },
  {
    id: 'precision_longjump_target',
    category: 'precision',
    title: 'Target Long Jump',
    description: 'Long jump distance dialed into the target band.',
    flavor: 'triumph',
    blockedTasks: ['longjump'],
    check: (ctx) =>
      ctx.task === 'longjump' &&
      ctx.metrics.distance >= 6 &&
      ctx.metrics.distance <= 8,
  },
  {
    id: 'precision_speed_cap',
    category: 'precision',
    title: 'Speed Cap',
    description: 'Peak speed controlled within a tight window.',
    flavor: 'triumph',
    blockedTasks: ['speed'],
    check: (ctx) =>
      ctx.task === 'speed' &&
      ctx.metrics.peakSpeed >= 3 &&
      ctx.metrics.peakSpeed <= 4.5,
  },
  {
    id: 'precision_upright_run',
    category: 'precision',
    title: 'Upright Run',
    description: 'Near-perfect posture over a real distance.',
    flavor: 'triumph',
    blockedTasks: ['run'],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.uprightQuality >= 0.95 &&
      ctx.metrics.distance >= 2,
  },
  {
    id: 'precision_no_fall',
    category: 'precision',
    title: 'No Fall Run',
    description: 'Long run with active footwork and zero falls.',
    flavor: 'triumph',
    blockedTasks: ['run'],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.distance >= 5 &&
      !ctx.metrics.fell &&
      ctx.metrics.footLifts >= 5,
  },
  {
    id: 'precision_region_clean',
    category: 'precision',
    title: 'Clean Run',
    description: 'Bonus zones collected with zero penalties.',
    flavor: 'triumph',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.regionPenalty === 0 &&
      ctx.metrics.regionReward >= 1 &&
      ctx.metrics.distance >= 2,
  },
  {
    id: 'precision_finish_line',
    category: 'precision',
    title: 'Finish Line',
    description: 'Completed the course with multiple checkpoints.',
    flavor: 'triumph',
    blockedTasks: ['sprint'],
    check: (ctx) =>
      ctx.task === 'sprint' &&
      ctx.metrics.finished &&
      ctx.metrics.checkpointsHit >= 2,
  },
  {
    id: 'precision_min_air',
    category: 'precision',
    title: 'Minimal Air',
    description: 'Jump airtime held in a razor-thin band.',
    flavor: 'triumph',
    blockedTasks: ['jump'],
    check: (ctx) =>
      ctx.task === 'jump' &&
      ctx.metrics.airTime >= 0.4 &&
      ctx.metrics.airTime <= 0.6,
  },
  {
    id: 'precision_climb_control',
    category: 'precision',
    title: 'Climb Control',
    description: 'High climb with exceptional posture control.',
    flavor: 'triumph',
    blockedTasks: ['climb'],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.peakHeight >= 2 &&
      ctx.metrics.uprightQuality >= 0.9,
  },
  {
    id: 'precision_motor_balance',
    category: 'precision',
    title: 'Motor Balance',
    description: 'Elite wheel balance on the motor task.',
    flavor: 'triumph',
    blockedTasks: ['motor'],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' && ctx.metrics.uprightQuality >= 0.9,
  },
  {
    id: 'precision_flight_altitude',
    category: 'precision',
    title: 'Altitude Window',
    description: 'Mean flight height held in the target band.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' &&
      ctx.metrics.meanAirHeight >= 1.5 &&
      ctx.metrics.meanAirHeight <= 2.5,
  },
  {
    id: 'precision_off_task_finish',
    category: 'precision',
    title: 'Surprise Finish',
    description: 'Crossed a finish line while training something else.',
    flavor: 'triumph',
    blockedTasks: ['sprint'],
    check: (ctx) => ctx.task !== 'sprint' && ctx.metrics.finished,
  },

  // ── Meta (10) ──────────────────────────────────────────────────────────
  {
    id: 'meta_collector',
    category: 'meta',
    title: 'Trophy Collector',
    description: 'Three secrets in the ledger. The cabinet is growing.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => ctx.priorDiscoveryCount >= COLLECTOR_MIN,
  },
  {
    id: 'meta_curator_10',
    category: 'meta',
    title: 'Curator',
    description: 'Ten discoveries logged. The cabinet has personality.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => ctx.priorDiscoveryCount >= 10,
  },
  {
    id: 'meta_curator_25',
    category: 'meta',
    title: 'Archivist',
    description: 'Twenty-five trophies. A serious collection.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => ctx.priorDiscoveryCount >= 25,
  },
  {
    id: 'meta_curator_50',
    category: 'meta',
    title: 'Half Century',
    description: 'Fifty secrets found. The hunt continues.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => ctx.priorDiscoveryCount >= 50,
  },
  {
    id: 'meta_locomotion_fan',
    category: 'meta',
    title: 'Locomotion Fan',
    description: 'Five locomotion trophies collected.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => discoveredInCategory(ctx, 'locomotion', 5),
  },
  {
    id: 'meta_jump_fan',
    category: 'meta',
    title: 'Jump Fan',
    description: 'Five jump trophies collected.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => discoveredInCategory(ctx, 'jump', 5),
  },
  {
    id: 'meta_flight_fan',
    category: 'meta',
    title: 'Flight Fan',
    description: 'Five flight trophies collected.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => discoveredInCategory(ctx, 'flight', 5),
  },
  {
    id: 'meta_triumph_streak',
    category: 'meta',
    title: 'Triumph Streak',
    description: 'Five triumph-flavor discoveries on the shelf.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => discoveredFlavorCount(ctx, 'triumph', 5),
  },
  {
    id: 'meta_disaster_magnet',
    category: 'meta',
    title: 'Disaster Magnet',
    description: 'Five disaster-flavor trophies. Chaos collector.',
    flavor: 'mishap',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => discoveredFlavorCount(ctx, 'disaster', 5),
  },
  {
    id: 'meta_completionist',
    category: 'meta',
    title: 'Completionist',
    description: 'Ninety-nine secrets found. One slot remains.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => ctx.priorDiscoveryCount >= 99,
  },
];

export function secretGoalById(id: SecretGoalId): SecretGoalDefinition | undefined {
  return SECRET_GOALS.find((g) => g.id === id);
}

export function revealedTitle(id: SecretGoalId): string {
  return secretGoalById(id)?.title ?? id;
}
