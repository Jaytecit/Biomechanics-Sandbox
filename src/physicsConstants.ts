/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared world scale. Keep Visualizer default canvas width in sync with
 * ARENA_SCREEN_WIDTH so one “screen” of runway matches the camera framing.
 *
 * Typical creature nodes are radius ~8–15; body span ~70–120px. Obstacle
 * thickness and gap widths are sized against that reference, not pixel decoration.
 *
 * Object/gap authoring uses WIDTH_SCALE (horizontal) and DEPTH_SCALE (vertical
 * thickness / pit depth) so course geometry stays readable next to creatures.
 */
export const GROUND_Y = 480;
/**
 * D123–D129 prior semantics. D130–D134 joint-lock / rigid-group work was removed
 * (D135). D136 adds compound solid segments (shape-matched rigid plates) that
 * do not use angle locks. D137 splits step-strict Run from Shuffle vibration
 * travel. Controllers trained under 4.8.x–4.13.x remain visible but stale when
 * fingerprints or physics version diverge.
 */
export const SOFT_BODY_PHYSICS_VERSION = '4.21.0';

/**
 * Length-error below this (px) is treated as numerical residual in diagnostics.
 * Actuation detection itself uses targetLength change (D142).
 */
export const LENGTH_ACTUATION_EPS_PX = 0.5;

/**
 * Walk gait: at most this many distinct contact nodes participate in the
 * progressive plant sequence (monoped = 1 … quadruped = 4).
 */
export const WALK_MAX_CONTACT_POINTS = 4;
/** Minimum goal-direction progress (px) between successive credited plants. */
export const WALK_STRIDE_MIN_PROGRESS = 2;
/**
 * Run Right/Left: a plant only counts as a step after the contact node spent
 * at least this many frames airborne (swing / transfer). Kills grounded flicker.
 */
export const WALK_SWING_MIN_FRAMES = 8;
/**
 * Run Right/Left: minimum frames between credited steps. Caps plant rate so
 * high-frequency vibration cannot mint stride credit.
 */
export const WALK_STEP_MIN_INTERVAL = 12;
/** Points awarded per credited discrete step (telemetry / UI only since D140). */
export const WALK_STEP_POINTS = 48;
/** Extra points when a step switches to a different gait contact node. */
export const WALK_ALTERNATE_BONUS = 16;
/**
 * Shuffle Right/Left: weight on oscillation-plant travel that co-occurs with
 * body advance. Vibration scooting is intentional on Shuffle goals.
 */
export const SHUFFLE_OSC_WEIGHT = 0.55;

/**
 * After landing, a new takeoff within this many grounded frames is a hop-chain
 * continuation — not an isolated jump.
 */
export const HOP_CHAIN_GROUND_MAX = 10;
/** Isolated jump bouts below this lowest-anatomy clearance score nothing. */
export const JUMP_MIN_CLEARANCE = 6;
/** Isolated jump bouts shorter than this many airborne frames score nothing. */
export const JUMP_MIN_FRAMES = 3;
export const WORLD_GRAVITY = 0.4;
export const RELAXATION_ITERATIONS = 8;
export const GAIT_HISTORY_LENGTH = 48;
/**
 * Floor on |ΔtargetLength| per tick for telescopes / hard slaves (px).
 * Actual cap is max(this, stroke × TELESCOPE_STROKE_FRACTION_PER_FRAME) so
 * long-stroke jump struts can still deliver a crouch/extend impulse.
 * Pistons ignore this and use authored extendRate / retractRate instead.
 */
export const TELESCOPE_MAX_DELTA_PER_FRAME = 4;
/** Fraction of (maxLength − minLength) a telescope may travel per physics tick. */
export const TELESCOPE_STROKE_FRACTION_PER_FRAME = 0.25;

/** Per-tick length-command budget for a telescope / hard slave. */
export function telescopeCommandDeltaBudget(minLength: number, maxLength: number): number {
  const span = Math.max(0, maxLength - minLength);
  return Math.max(TELESCOPE_MAX_DELTA_PER_FRAME, span * TELESCOPE_STROKE_FRACTION_PER_FRAME);
}

/**
 * Soft-body Verlet / aero timestep.
 *
 * Every physics tick advances one frame with **dt ≡ 1**. Position impulses
 * (gravity, muscle projection, aero) are authored in px/frame² and must never
 * be scaled by render Δt or `simulationSpeed`. UI speed only changes how many
 * whole ticks run per animation frame (0.5× skips ticks; 2× runs two ticks).
 */
export const PHYSICS_DT = 1;

/** Reference creature scale (Motor Cart / biped ballpark). */
export const TYPICAL_NODE_RADIUS = 12;
export const TYPICAL_BODY_HEIGHT = 70;
export const TYPICAL_BODY_LENGTH = 90;

/** Horizontal size multiplier for course objects and gaps (D062). */
export const WIDTH_SCALE = 3;
/** Vertical thickness / pit-depth multiplier for course objects and gaps (D062). */
export const DEPTH_SCALE = 0.5;

export function scaleW(px: number): number {
  return Math.round(px * WIDTH_SCALE);
}

export function scaleD(px: number): number {
  return Math.max(1, Math.round(px * DEPTH_SCALE));
}

/** Stair tread geometry — rises must clear a foot/wheel, not skim under it. */
export const STAIR_STEP_WIDTH = scaleW(58);
export const STAIR_STEP_HEIGHT = scaleD(26);
export const STAIR_AHEAD_STEPS = 48;

/** Multi-pass + swept contacts fight high-speed tunneling. */
export const OBSTACLE_COLLISION_PASSES = 5;
/** Max travel (px) per substep when sweeping circle↔AABB. */
export const COLLISION_SWEEP_STEP = 4;

/** Creatures are spawned at this world X. */
export const AGENT_SPAWN_X = 100;
/**
 * One arena viewport width (matches Visualizer default canvas width).
 * Course geometry begins one full screen past spawn so agents accelerate first.
 */
export const ARENA_SCREEN_WIDTH = 800;
/** First allowed X for course geometry / interactive objects. */
export const COURSE_START_X = AGENT_SPAWN_X + ARENA_SCREEN_WIDTH;

/** Default gap width before difficulty / progressive / user override (post WIDTH_SCALE). */
export const BASE_GAP_WIDTH = scaleW(Math.round(TYPICAL_BODY_LENGTH * 2.4)); // ~648
/** Default pit visual depth (post DEPTH_SCALE). */
export const BASE_PIT_DEPTH = scaleD(80);
/** Default ramp angle from ground (degrees). */
export const DEFAULT_RAMP_ANGLE_DEG = 27;
/** Default optional-course ramp run length (post WIDTH_SCALE). */
export const BASE_RAMP_WIDTH = scaleW(200);

/** Clamp arena difficulty used to scale gaps, hurdles, bars, stairs. */
export function clampDifficulty(d?: number): number {
  if (d === undefined || Number.isNaN(d)) return 1;
  return Math.max(0.75, Math.min(2.5, d));
}

export function clampRampAngleDeg(deg?: number): number {
  if (deg === undefined || Number.isNaN(deg)) return DEFAULT_RAMP_ANGLE_DEG;
  return Math.max(8, Math.min(55, deg));
}

/** Min = default ramp run length; max = 10× that length. */
export function clampRampWidthPx(w?: number): number {
  if (w === undefined || Number.isNaN(w)) return BASE_RAMP_WIDTH;
  return Math.max(BASE_RAMP_WIDTH, Math.min(BASE_RAMP_WIDTH * 10, Math.round(w)));
}

export function clampGapWidthPx(w?: number): number {
  if (w === undefined || Number.isNaN(w)) return BASE_GAP_WIDTH;
  return Math.max(scaleW(40), Math.min(scaleW(600), Math.round(w)));
}

/** Ramp height from run length and ground angle. */
export function rampHeightForAngle(width: number, angleDeg?: number): number {
  const a = clampRampAngleDeg(angleDeg);
  return Math.max(scaleD(12), Math.round(width * Math.tan((a * Math.PI) / 180)));
}

/**
 * Para Ramp Glide (multi-head): long flat runway then a takeoff ramp.
 * Runway length scales mildly with difficulty so harder settings need more speed.
 */
export const PARA_RUNWAY_BASE = 1500;
export const PARA_RAMP_WIDTH = scaleW(300);
export const PARA_RAMP_HEIGHT = scaleD(150); // overridden by angle when arena supplies rampAngleDeg
/** Frames to blend actuator outputs across a ParaPilot head handoff. */
export const PARA_BLEND_FRAMES = 10;
/** Airborne+open frames required in deploy phase before glide head takes over. */
export const PARA_DEPLOY_AIR_GATE = 8;

/**
 * Flight Land approach ceiling (COM altitude / clearance, px).
 * Climb is rewarded only up to this height; further gain is penalized and
 * descent credit unlocks after the ceiling is reached.
 */
export const LAND_CEILING_FLIGHT = 105;

/**
 * Jump & Land (non-flight): best single hop that returns near takeoff.
 * Hops below MIN height do not register; horizontal drift beyond TOLERANCE
 * zeroes that attempt. Only the max attempt score is kept.
 */
export const JUMP_LAND_MIN_HEIGHT = 24;
/** Max |landX − takeoffX| (px) for a non-zero return factor. */
export const JUMP_LAND_RETURN_TOLERANCE = 45;

export function paraRunwayLength(difficulty = 1): number {
  const d = clampDifficulty(difficulty);
  return Math.round(PARA_RUNWAY_BASE * (0.85 + d * 0.2));
}

export function paraRampStartX(difficulty = 1): number {
  return AGENT_SPAWN_X + paraRunwayLength(difficulty);
}
