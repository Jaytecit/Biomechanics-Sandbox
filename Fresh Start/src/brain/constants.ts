/** Brain tick rate (Keiwan ≈ 30 Hz). Physics stays at FIXED_DT (60 Hz). */
export const BRAIN_HZ = 30;
/** Optional faster control rate — one brain eval per physics step. */
export const BRAIN_HZ_FAST = 60;
export type BrainHz = typeof BRAIN_HZ | typeof BRAIN_HZ_FAST;
export const BRAIN_DT = 1 / BRAIN_HZ;

/**
 * Observation vector length (D7 contact/terrain pack + phase clock).
 * 0–5: body stats · 6 foot contact · 7 foot clearance · 8 terrain grade (G3)
 * · 9 head height · 10–11 sin/cos phase clock (rhythmic prior for flapping/gait)
 */
export const OBS_COUNT = 12;
/** Open-loop phase frequency for obs[10]/11] (Hz). */
export const PHASE_CLOCK_HZ = 2.5;

/**
 * Divisors to keep inputs roughly O(1).
 * height / HEIGHT_SCALE, vel / VEL_SCALE, angVel / ANG_VEL_SCALE, rotation already /π.
 */
export const HEIGHT_SCALE = 3;
export const VEL_SCALE = 8;
export const ANG_VEL_SCALE = 10;
/** Joints with Y below this count as near-ground contacts. */
export const GROUND_CONTACT_Y = 0.45;
/** Foot clearance scale for obs[7]. */
export const FOOT_CLEARANCE_SCALE = 2;

/** Hidden width = clamp(2 * max(in, out), HIDDEN_MIN, HIDDEN_MAX). */
export const HIDDEN_MIN = 8;
export const HIDDEN_MAX = 32;

export const WEIGHT_INIT_SIGMA = 0.5;

/** GA defaults (headless smoke). */
export const POPULATION_SIZE = 40;
export const EPISODE_SECONDS = 20;
/** UI presets for per-generation episode length (simulated seconds). */
export const EPISODE_LENGTH_PRESETS = [5, 20, 40, 80, 120] as const;
export const ELITE_COUNT = 2;
export const TOURNAMENT_SIZE = 3;
export const MUTATION_SIGMA = 0.15;
export const MUTATION_RESET_RATE = 0.05;
export const MAX_GENERATIONS = 100;

/**
 * Live UI evolve (Keiwan-style): watch a batch in real time.
 * Defaults mirror Evolution’s small simultaneous cohort.
 */
export const LIVE_POPULATION_SIZE = 12;
export const LIVE_BATCH_SIZE = 12;
export const LIVE_MAX_GENERATIONS = 100;
/** Non-focused creatures in the batch (Keiwan “hidden” opacity). */
export const GHOST_OPACITY = 0.28;

/** Run-task fall penalty: joint Y below threshold for this many seconds. */
export const FALL_Y_THRESHOLD = 0.12;
export const FALL_TIME_LIMIT = 1.5;
export const FALL_PENALTY = 2;

/**
 * C2.9 score regions.
 * Penalty `rate` = fitness / second while overlapping.
 * Reward `rate` = flat fitness bonus on first touch.
 */
export const SCORE_REGION_DEFAULT_PENALTY_RATE = 1;
export const SCORE_REGION_DEFAULT_REWARD_RATE = 1;
export const SCORE_REGION_MIN_RATE = 0;
export const SCORE_REGION_MAX_RATE = 20;
/** Default full size for newly placed regions (world units). */
export const SCORE_REGION_DEFAULT_W = 3;
export const SCORE_REGION_DEFAULT_H = 2;

/**
 * C2.10 course markers (score-only trigger volumes).
 * Default size is a tall thin gate.
 */
export const COURSE_MARKER_DEFAULT_W = 0.6;
export const COURSE_MARKER_DEFAULT_H = 3;
/** Sprint finish: base bonus for crossing finish (armed + checkpoints). */
export const SPRINT_FINISH_BONUS = 8;
/** Sprint finish: bonus scale / finishTimeSeconds (faster → higher). */
export const SPRINT_FINISH_TIME_SCALE = 40;
/** Sprint: fitness per ordered checkpoint reached. */
export const SPRINT_CHECKPOINT_BONUS = 1.5;
/** Sprint: fitness per meter of peak forward progress (not end pose). */
export const SPRINT_DIST_SCALE = 0.15;
/**
 * After a fall, keep at least this fraction of travel+checkpoint credit so a
 * mid-episode climb is not wiped by post-fall thrash / tumble.
 */
export const SPRINT_FALL_PROGRESS_FLOOR = 0.5;
/** D13 priority tilt: meters of travel that saturate the distance slider. */
export const GOAL_PRIORITY_DISTANCE_SCALE = 40;
/** Speed task: peak COM speed scale (m/s → fitness). */
export const SPEED_PEAK_SCALE = 4;
/** Speed task: travel contribution. */
export const SPEED_DIST_SCALE = 12;
/** Stay-tall: fitness per second of supported upright posture. */
export const STAY_UPRIGHT_SCALE = 0.35;
/** Hang-time task: air-time weight. */
export const HANG_TIME_SCALE = 0.55;
/** Long-jump: horizontal distance scale. */
export const LONG_JUMP_DIST_SCALE = 6;

/**
 * Foot-lift legitimacy (anti-scoot):
 * - Count plant→clear only when the foot advanced ≥ MIN_STEP_PROGRESS in X.
 * - quality = clamp(footLifts / max(MIN_FOOT_LIFTS, Δx / DISTANCE_PER_LIFT), 0, 1)
 */
export const PLANT_Y = 0.42;
export const LIFT_Y = 0.65;
/** Floor on required lifts so short episodes still need a few steps. */
export const MIN_FOOT_LIFTS = 3;
/** Credited meters of run distance per required foot lift (continuous anti-scoot). */
export const DISTANCE_PER_LIFT = 2;
/** Min forward plant-X advance for a plant→clear to count as a step. */
export const MIN_STEP_PROGRESS = 0.2;

/**
 * Upright posture (marked head): quality = clamp(headY / designedHeadY, 0, 1).
 * Inactive when no head is marked or designedHeadY is below this floor.
 */
export const MIN_DESIGNED_HEAD_Y = 0.5;
/** Floor so a brief crouch/dip does not zero the whole episode. */
export const UPRIGHT_QUALITY_FLOOR = 0.2;

/** Task scoring scales (E6.*) — not physics tunables. */
export const JUMP_HEIGHT_SCALE = 2.5;
export const CLIMB_HEIGHT_SCALE = 3.5;
export const MOTOR_DIST_SCALE = 1;
export const FLIGHT_HEIGHT_SCALE = 4;
/** Mean airborne height divisor — sustains altitude, not one peak flap. */
export const FLIGHT_MEAN_HEIGHT_SCALE = 2.5;
export const FLIGHT_AIR_SCALE = 4;
/** Rough terrain: forward distance divisor (run-like × lift quality). */
export const ROUGH_DIST_SCALE = 1;
