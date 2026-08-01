/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared world scale. Keep Visualizer default canvas width in sync with
 * ARENA_SCREEN_WIDTH so one “screen” of runway matches the camera framing.
 *
 * Typical creature nodes are radius ~1–2; body span ~7–12px. Obstacle
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
 * travel. D145 adds a always-on object-relative sensor pack (observation only).
 * D147 adds contact-class touch sensing (per-node class + summary pack).
 * D149 retunes brain observation divisors + leftover legacy-px reward gates
 * after CREATURE_WORLD_SCALE (learning was stalled by ~10×-too-small proprioception).
 * D150 adds opt-in soft-muscle command rate caps and collapses telescope into
 * piston (authorable rates). Controllers trained under ≤4.23.x remain visible
 * but stale when fingerprints or physics version diverge.
 * D153 wires the D142 actuation flag into the preserve policy (actuating links
 * always use position-only correction), seeds spawn targetLength inside the
 * stroke bounds, normalizes inverted min/max stroke bounds, and aligns the
 * ice-friction band with authored patch geometry.
 * D161 adds session `oscillationIgnore` (default 0 = off): reverse-dwell filter
 * on brain→length commands so high-frequency flip-flops do not move the body.
 */
export const SOFT_BODY_PHYSICS_VERSION = '4.26.0';

/**
 * D161 — at `oscillationIgnore = 1`, brain-driven length commands must keep the
 * same stroke direction for this many ticks before a reverse is accepted.
 * `0` disables the filter (identity). Tunable via ControlPanel slider.
 */
export const OSCILLATION_IGNORE_MAX_DWELL_TICKS = 24;

/** Clamp session oscillation-ignore strength to [0, 1]; non-finite → 0. */
export function clampOscillationIgnore(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

/**
 * Minimum same-direction stroke ticks before a reverse command is accepted.
 * `0` when ignore is off.
 */
export function oscillationIgnoreDwellTicks(ignore: number | undefined | null): number {
  const t = clampOscillationIgnore(ignore);
  if (t <= 0) return 0;
  return Math.max(1, Math.round(t * OSCILLATION_IGNORE_MAX_DWELL_TICKS));
}

/**
 * Length-error below this (px) is treated as numerical residual in diagnostics.
 * Actuation detection itself uses targetLength change (D142).
 */
export const LENGTH_ACTUATION_EPS_PX = 0.05;

/**
 * Walk gait: at most this many distinct contact nodes participate in the
 * progressive plant sequence (monoped = 1 … quadruped = 4).
 */
export const WALK_MAX_CONTACT_POINTS = 4;
/**
 * Minimum goal-direction progress (px) between successive credited plants.
 * Legacy 2px ≈ 2% of a typical body; kept proportional after CREATURE_WORLD_SCALE.
 */
export const WALK_STRIDE_MIN_PROGRESS = 0.2;
/**
 * Run Right/Left: a plant only counts as a step after the contact node spent
 * at least this many frames airborne (swing / transfer). Kills grounded flicker.
 * Tuned for CREATURE_WORLD_SCALE bodies — legacy 8 was unreachable for triangle
 * walkers whose foot clearance lasts only ~5–6 frames under current gravity.
 */
export const WALK_SWING_MIN_FRAMES = 4;
/**
 * Run Right/Left: minimum frames between credited steps. Caps plant rate so
 * high-frequency vibration cannot mint stride credit.
 */
export const WALK_STEP_MIN_INTERVAL = 8;
/** Points awarded per credited discrete step (telemetry / UI only since D140). */
export const WALK_STEP_POINTS = 48;
/** Extra points when a step switches to a different gait contact node. */
export const WALK_ALTERNATE_BONUS = 16;
/**
 * Run Right/Left: tiny body-travel shaping when no swing-gated steps yet.
 * Gives selection a directional gradient (left scores 0) without letting
 * vibration scooters beat real walkers (full travel still dominates).
 */
export const LOCOMOTION_SLIDE_SHAPING = 0.02;
/**
 * Run Right/Left: fraction of travel paid for swing-gated same-foot plants
 * before the first foot→foot alternate unlocks full score.
 */
export const LOCOMOTION_SAME_FOOT_SCALE = 0.35;
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
/** Absolute floor for jump clearance when a creature has no measured size yet.
 * Prefer `jumpRewardMinClearance(creature)` which scales with body height.
 */
export const JUMP_MIN_CLEARANCE = 2;
/** Isolated jump bouts shorter than this many airborne frames score nothing. */
export const JUMP_MIN_FRAMES = 4;
export const WORLD_GRAVITY = 0.4;
export const RELAXATION_ITERATIONS = 8;
export const GAIT_HISTORY_LENGTH = 48;
/**
 * Minimum excess clearance (px above flight floor) before flight/glide bouts score.
 * Legacy 1px; scaled with creature world units.
 */
export const FLIGHT_EXCESS_PEAK_MIN = 0.1;
/**
 * Floor on supported travel (px) before peak-speed goals pay full rate.
 * Legacy 40px; below this, distance is starved at 0.15×.
 */
export const SPEED_MIN_TRAVEL_FLOOR = 4;
/** Upright score (height×aspect) treated as “good posture” for land/park gates. */
export const UPRIGHT_SCORE_GOOD = 4;
/** Parking posture upright floor when body height is unknown / tiny. */
export const PARKING_UPRIGHT_FLOOR = 1.8;
/** Reference floor for normalized upright posture (0…1). */
export const UPRIGHT_NORM_REFERENCE_FLOOR = 4;
/**
 * Floor on |ΔtargetLength| per tick used to seed default piston rates (D150).
 * Actual seed is max(this, stroke × TELESCOPE_STROKE_FRACTION_PER_FRAME).
 * Runtime pistons use authored extendRate / retractRate; this budget is the
 * fallback when rates are missing on a hard slave / legacy path.
 * Legacy authoring floor was 4px; scaled with CREATURE_WORLD_SCALE.
 */
export const TELESCOPE_MAX_DELTA_PER_FRAME = 0.4;
/** Fraction of (maxLength − minLength) used when seeding piston stroke rates. */
export const TELESCOPE_STROKE_FRACTION_PER_FRAME = 0.25;

/** Per-tick length-command budget seed (default piston / hard-slave fallback). */
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

/**
 * Reference creature scale for reward gates when live AABB is unavailable.
 *
 * Studio canvases are often ~600×600 design spaces, but settled physics bodies
 * in this arena are typically ~7–15px tall (GROUND_Y = 480). Always prefer
 * measured `restBodyHeight` / `restBodyWidth` on the creature; these constants
 * are fallbacks and course-geometry references only.
 */
export const TYPICAL_NODE_RADIUS = 12;
export const TYPICAL_BODY_HEIGHT = 12;
export const TYPICAL_BODY_LENGTH = 12;
/** Design-canvas ballpark the authoring UI often presents; not a physics AABB. */
export const DESIGN_CANVAS_BODY = 600;
/** Fraction of resting body height that must clear the floor before flight rewards unlock. */
export const FLIGHT_MIN_CLEARANCE_BODY_FRAC = 0.5;
/** Fraction of resting body width that can also set the flight clearance floor (wingspan). */
export const FLIGHT_MIN_CLEARANCE_SPAN_FRAC = 0.2;
/** Absolute minimum flight clearance (px) even for tiny bodies. */
export const FLIGHT_MIN_CLEARANCE_FLOOR = 4;
/**
 * Push-box proximity gate (world px). Legacy authoring used 60px against
 * ~120px bodies; scaled so a ~12px body still gets a contact-near band.
 */
export const BOX_PUSH_NEAR_PX = 6;
/** Soft falloff width beyond {@link BOX_PUSH_NEAR_PX}. */
export const BOX_PUSH_FALLOFF_PX = 10;
/** Clear-bar approach window leading edge offset / width (world px). */
export const CLEAR_BAR_APPROACH_LEAD_PX = 4;
export const CLEAR_BAR_APPROACH_WIDTH_PX = 8;
/**
 * Motor Launch & Land: minimum airborne COM rise (world px) after a gap clear.
 * Legacy 32px; body-scaled carts clear ~3px on a real launch.
 */
export const MOTOR_LAUNCH_MIN_AIR_PX = 3.2;
/** Jump / hop leave-ground clearance as a fraction of resting body height. */
export const JUMP_MIN_CLEARANCE_BODY_FRAC = 0.18;
/** Jump & Land COM rise floor as a fraction of resting body height. */
export const JUMP_LAND_MIN_HEIGHT_BODY_FRAC = 0.28;
/** Flight Land approach ceiling as a multiple of resting body height (COM/clearance). */
export const LAND_CEILING_BODY_MULT = 1.35;

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

/**
 * Authored horizontal run from course start to a finish line (pre-WIDTH_SCALE).
 * Tier 0 uses BASE (~5× legacy); progressive tiers scale toward MAX (~10× legacy).
 */
export const FINISH_RUN_AUTHORED_BASE = 7000;
export const FINISH_RUN_AUTHORED_MAX = 14000;
/** @deprecated alias — use finishRunAuthored(tier) in arenas.ts */
export const FINISH_RUN_AUTHORED = FINISH_RUN_AUTHORED_MAX;
/** Finish offset from agent spawn for hoop-roll scoring at tier 0 (px). */
export const HOOP_FINISH_OFFSET_BASE = 8000;
export const HOOP_FINISH_OFFSET_MAX = 26000;

/** Default gap width before difficulty / progressive / user override (post WIDTH_SCALE). */
export const BASE_GAP_WIDTH = scaleW(Math.round(TYPICAL_BODY_LENGTH * 2.4)); // ~648
/**
 * Clear Gap: takeoff incentive window immediately left of the pit lip (world px).
 * COM must be in [pit.x − zone, pit.x) with all wheels airborne.
 */
export const GAP_PRE_JUMP_ZONE_PX = 40;
/** One-shot fitness bonus for a Clear Gap pre-lip wheel jump. */
export const GAP_PRE_JUMP_BONUS = 40;
/** Clear Gap: peak supported speed × this after a full clear (faster jump wins). */
export const GAP_CLEAR_SPEED_MUL = 10;
/**
 * Clear Gap: peak supported speed × this on a jump attempt (span / pre-jump)
 * so building approach speed still pays when the clear fails.
 */
export const GAP_ATTEMPT_SPEED_MUL = 3;
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

/** Base tower height for CHUTE_DESCENT (ground-relative platform Y = GROUND_Y − height). */
export const BASE_TOWER_HEIGHT = scaleD(280);
export const MIN_TOWER_HEIGHT = scaleD(120);
export const MAX_TOWER_HEIGHT = 50000;
export const CHUTE_TOWER_X = AGENT_SPAWN_X + scaleW(40);
export const CHUTE_TOWER_WIDTH = scaleW(100);

export function clampTowerHeightPx(h: number): number {
  return Math.max(MIN_TOWER_HEIGHT, Math.min(MAX_TOWER_HEIGHT, Math.round(h)));
}

export function effectiveTowerHeight(arena?: Partial<{ towerHeightPx?: number; difficulty?: number }>): number {
  const d = clampDifficulty(arena?.difficulty ?? 1);
  const base = arena?.towerHeightPx ?? BASE_TOWER_HEIGHT;
  return clampTowerHeightPx(Math.round(base * (0.88 + d * 0.12)));
}

/** Platform surface Y where creatures spawn on the tower. */
export function chuteTowerPlatformY(arena?: Partial<{ towerHeightPx?: number; difficulty?: number }>): number {
  return GROUND_Y - effectiveTowerHeight(arena);
}

/**
 * Flight Land approach ceiling fallback (px) when body size is unknown.
 * Prefer `flightLandCeiling(creature)` which scales with resting body height.
 */
export const LAND_CEILING_FLIGHT = Math.round(TYPICAL_BODY_HEIGHT * LAND_CEILING_BODY_MULT);

/**
 * Jump & Land (non-flight) fallback COM rise (px) when body size is unknown.
 * Prefer `jumpLandMinHeight(creature)`.
 */
export const JUMP_LAND_MIN_HEIGHT = Math.round(
  TYPICAL_BODY_HEIGHT * JUMP_LAND_MIN_HEIGHT_BODY_FRAC
);
/** Max |landX − takeoffX| (px) for a non-zero return factor. */
export const JUMP_LAND_RETURN_TOLERANCE = 5;

/** Measure axis-aligned extent of nodes (including radii). */
export function measureNodeExtents(
  nodes: ReadonlyArray<{ x: number; y: number; radius: number }>
): { width: number; height: number; minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.radius);
    maxX = Math.max(maxX, n.x + n.radius);
    minY = Math.min(minY, n.y - n.radius);
    maxY = Math.max(maxY, n.y + n.radius);
  }
  if (!Number.isFinite(minX)) {
    return {
      width: TYPICAL_BODY_LENGTH,
      height: TYPICAL_BODY_HEIGHT,
      minX: 0,
      maxX: TYPICAL_BODY_LENGTH,
      minY: 0,
      maxY: TYPICAL_BODY_HEIGHT,
    };
  }
  return {
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    minX,
    maxX,
    minY,
    maxY,
  };
}

/** Lowest-point clearance required before any flight reward can score. */
export function flightRewardMinClearance(restHeight: number, restWidth: number): number {
  const h = Number.isFinite(restHeight) && restHeight > 0 ? restHeight : TYPICAL_BODY_HEIGHT;
  const w = Number.isFinite(restWidth) && restWidth > 0 ? restWidth : TYPICAL_BODY_LENGTH;
  return Math.max(
    FLIGHT_MIN_CLEARANCE_FLOOR,
    h * FLIGHT_MIN_CLEARANCE_BODY_FRAC,
    w * FLIGHT_MIN_CLEARANCE_SPAN_FRAC
  );
}

/** Isolated-jump clearance floor (smaller than flight — a real hop, not a skim). */
export function jumpRewardMinClearance(restHeight: number): number {
  const h = Number.isFinite(restHeight) && restHeight > 0 ? restHeight : TYPICAL_BODY_HEIGHT;
  return Math.max(JUMP_MIN_CLEARANCE, h * JUMP_MIN_CLEARANCE_BODY_FRAC);
}

/** Jump & Land minimum COM rise. */
export function jumpLandMinHeight(restHeight: number): number {
  const h = Number.isFinite(restHeight) && restHeight > 0 ? restHeight : TYPICAL_BODY_HEIGHT;
  return Math.max(JUMP_LAND_MIN_HEIGHT, h * JUMP_LAND_MIN_HEIGHT_BODY_FRAC);
}

/** Flight Land climb ceiling (must reach ~1.35× body height before descent credit). */
export function flightLandCeiling(restHeight: number): number {
  const h = Number.isFinite(restHeight) && restHeight > 0 ? restHeight : TYPICAL_BODY_HEIGHT;
  return Math.max(LAND_CEILING_FLIGHT, h * LAND_CEILING_BODY_MULT);
}

/** Glide corridor band: mid-height cruise relative to body size. */
export function glideCorridorBand(restHeight: number): { min: number; max: number } {
  const h = Number.isFinite(restHeight) && restHeight > 0 ? restHeight : TYPICAL_BODY_HEIGHT;
  const min = Math.max(flightRewardMinClearance(h, h), h * 0.55);
  const max = Math.max(min + 4, h * 2.2);
  return { min, max };
}

export function paraRunwayLength(difficulty = 1): number {
  const d = clampDifficulty(difficulty);
  return Math.round(PARA_RUNWAY_BASE * (0.85 + d * 0.2));
}

export function paraRampStartX(difficulty = 1): number {
  return AGENT_SPAWN_X + paraRunwayLength(difficulty);
}
