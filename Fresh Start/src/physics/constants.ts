/** Tunable Keiwan-inspired physics constants (Rapier world scale). */

export const FIXED_DT = 1 / 60;

/** Evolution default gravity is -50 Unity units; retuned for Rapier meter-ish scale. */
export const GRAVITY_Y = -38;

export const JOINT_RADIUS = 0.28;
export const BONE_HALF_WIDTH = 0.14;

/**
 * Soft CCD prediction distance (m) on creature joints/bones when moving fast.
 * Prevents tunneling into static obstacles; 0 disables.
 * Applied only when body speed ≥ SOFT_CCD_SPEED_GATE so slow ground gait /
 * idle plant-brake feel stays intact.
 * See docs/adr/20260806-creature-soft-ccd.md.
 */
export const SOFT_CCD_PREDICTION = 0.5;
/** Min |linvel| (m/s) before soft CCD prediction is armed on a body. */
export const SOFT_CCD_SPEED_GATE = 24;

export const DEFAULT_JOINT_MASS = 1.0;
export const DEFAULT_BONE_MASS = 1.0;

/** SpringJoint-like restore toward rest length (Evolution: spring=1000, damper=50). */
export const MUSCLE_SPRING = 360;
export const MUSCLE_DAMPER = 24;

/** Active contract/expand force scale (Evolution MaxForce ≈ 1500). */
export const MUSCLE_MAX_FORCE = 720;

export const GROUND_FRICTION = 0.85;
export const GROUND_RESTITUTION = 0.05;
/** Ramp colliders only — higher grip so incline climb is hard but learnable. */
export const RAMP_FRICTION = 1.85;
export const BODY_FRICTION = 0.55;
export const BODY_RESTITUTION = 0.02;

export const LINEAR_DAMPING = 0.08;
export const ANGULAR_DAMPING = 0.12;

/** Floor plane y of top surface. */
export const GROUND_Y = 0;

/**
 * Plant slide brake: damp horizontal velocity on planted contacts each fixed
 * step (Idle settle + Evolve/brain scoot). Skipped for flight/motor tasks.
 */
export const PLANT_SLIDE_Y = 0.42;
/** Fraction of horizontal linvel removed per fixed step while planted. */
export const PLANT_SLIDE_BRAKE = 0.45;
/** @deprecated Use PLANT_SLIDE_Y */
export const IDLE_PLANT_Y = PLANT_SLIDE_Y;
/** @deprecated Use PLANT_SLIDE_BRAKE */
export const IDLE_PLANT_BRAKE = PLANT_SLIDE_BRAKE;

/** Motor wheel torque scale (E6.5) — applied as addTorque each fixed step. */
export const MOTOR_TORQUE_SCALE = 28;

/** Aero-like coefficients (E6.6) — Fresh Start design, not parent tables. */
export const AERO_DRAG_COEFF = 0.55;
export const AERO_LIFT_COEFF = 0.85;

/**
 * G10 wing — downstroke lift (world +Y) from descending wing speed.
 * Symmetric paddle pressure self-brakes flaps and cancels over a cycle;
 * this model only authorizes lift on the downstroke (feathered recovery).
 */
export const WING_FLAP_LIFT_COEFF = 18;
/** Light residual paddle drag so wings still feel air both ways. */
export const WING_PADDLE_DRAG_COEFF = 0.35;

/** G10 glider — rigid sail AoA lift/drag. */
export const GLIDER_LIFT_COEFF = 1.05;
export const GLIDER_DRAG_COEFF = 0.35;

/**
 * G10 parachute — inflation drag (jointed canopy chain).
 * Inflates when cupped into relative wind; streams edge-on with low drag.
 */
export const PARA_DRAG_COEFF = 2.4;
export const PARA_INFLATE_RATE = 4.5;
export const PARA_DEFLATE_RATE = 2.2;
/** Residual drag scale when fully streamed (inflation ≈ 0). */
export const PARA_STREAM_DRAG_SCALE = 0.08;

/** G1 static obstacle size clamps (full widths before half-extents). */
export const OBSTACLE_MIN_SIZE = 0.12;
export const OBSTACLE_MAX_SIZE = 40;
/** Default ramp tilt (rad) when EnvObstacle.rot omitted. */
export const OBSTACLE_DEFAULT_RAMP_ROT = -0.4;
/** Stair step count for authored stair obstacles. */
export const OBSTACLE_STAIR_STEPS = 4;
/** Loop ring segment count (open at bottom). */
export const OBSTACLE_LOOP_SEGMENTS = 10;

/** G3 terrain heightfield clamps. */
export const TERRAIN_MIN_SAMPLES = 2;
export const TERRAIN_MAX_SAMPLES = 256;
export const TERRAIN_MIN_WIDTH = 1;
export const TERRAIN_MAX_WIDTH = 200;
export const TERRAIN_MAX_AMPLITUDE = 20;
/** Obs[8] divisor — grade ≈ dy/dx / TERRAIN_GRADE_SCALE. */
export const TERRAIN_GRADE_SCALE = 2;

/**
 * E6.8 rough-terrain course (task-owned sine heightfield).
 * Starts ahead of typical spawn so the creature enters hills on flat ground.
 */
export const ROUGH_COURSE_START_X = 3;
export const ROUGH_COURSE_END_X = 43;
export const ROUGH_COURSE_AMPLITUDE = 1.2;
export const ROUGH_COURSE_SAMPLES = 41;
export const ROUGH_COURSE_WAVES = 2.5;

/** Environment Studio creature spawn marker clamps (world units). */
export const SPAWN_MIN_X = -200;
export const SPAWN_MAX_X = 200;
export const SPAWN_MIN_Y = 0;
export const SPAWN_MAX_Y = 80;

/**
 * H2 disco arena walls — inner faces near ±DISCO_WALL_X (ruler units).
 * Pair with DISCO_CAM_ZOOM_* so the full floor fits at default zoom-out.
 */
export const DISCO_WALL_X = 50;
export const DISCO_WALL_W = 0.7;
export const DISCO_WALL_H = 24;
/** SimCanvas zoom floor / default overview for the disco arena. */
export const DISCO_CAM_ZOOM_MIN = 8;
export const DISCO_CAM_ZOOM_DEFAULT = 8;
export const DISCO_CAM_Y = 6;

/** Default disco-ball world position (render FX; drag to reposition). */
export const DEFAULT_DISCO_BALL_X = 0;
export const DEFAULT_DISCO_BALL_Y = 17;
/** Soft clamp for dragging the ball inside the arena. */
export const DISCO_BALL_X_MAX = DISCO_WALL_X * 0.92;
export const DISCO_BALL_Y_MIN = 2;
export const DISCO_BALL_Y_MAX = DISCO_WALL_H * 0.95;

/**
 * H2 disco puppet modes — disco-arena only. Evolve/Edit use base muscle
 * constants and default gravityScale / damping from spawn.
 */
export type DiscoPuppetMode =
  | 'natural'
  | 'stiffStrings'
  | 'marionette'
  | 'fullPuppet';

export interface DiscoPuppetTune {
  springMult: number;
  damperMult: number;
  maxForceMult: number;
  /** Rapier rigid-body gravity scale (1 = world gravity). */
  gravityScale: number;
  linearDamping: number;
  angularDamping: number;
  /**
   * When > 0, drive also shifts effective rest length:
   * rest * (1 - drive * restLengthDrive). Contract shortens the “string”.
   */
  restLengthDrive: number;
}

export const DISCO_PUPPET_MODES: Record<DiscoPuppetMode, DiscoPuppetTune> = {
  natural: {
    springMult: 1,
    damperMult: 1,
    maxForceMult: 1,
    gravityScale: 1,
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
    restLengthDrive: 0,
  },
  stiffStrings: {
    springMult: 3.5,
    damperMult: 2.5,
    maxForceMult: 1.8,
    gravityScale: 1,
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
    restLengthDrive: 0,
  },
  marionette: {
    springMult: 4.5,
    damperMult: 3,
    maxForceMult: 1.5,
    gravityScale: 0.35,
    linearDamping: 0.14,
    angularDamping: 0.22,
    restLengthDrive: 0.22,
  },
  fullPuppet: {
    springMult: 7,
    damperMult: 4.5,
    maxForceMult: 1.2,
    gravityScale: 0.08,
    linearDamping: 0.28,
    angularDamping: 0.4,
    restLengthDrive: 0.35,
  },
};

export const DISCO_PUPPET_MODE_LABELS: {
  id: DiscoPuppetMode;
  label: string;
}[] = [
  { id: 'natural', label: 'Natural' },
  { id: 'stiffStrings', label: 'Stiff strings' },
  { id: 'marionette', label: 'Marionette' },
  { id: 'fullPuppet', label: 'Full puppet' },
];

export const DEFAULT_DISCO_PUPPET_MODE: DiscoPuppetMode = 'fullPuppet';

/**
 * Disco-only mass for joints marked `isFoot` (heavier feet resist float-away).
 * Evolve/Edit keep authored / DEFAULT_JOINT_MASS.
 */
export const DISCO_FOOT_MASS_MIN = 1;
export const DISCO_FOOT_MASS_MAX = 96;
export const DISCO_FOOT_MASS_DEFAULT = 96;

/** C2.4 launch tower clamps / proportions. */
export const TOWER_MIN_BASE_W = 0.6;
export const TOWER_MAX_BASE_W = 30;
export const TOWER_MIN_HEIGHT = 0.8;
export const TOWER_MAX_HEIGHT = 40;
/** Deck slab thickness (world units). */
export const TOWER_DECK_THICKNESS = 0.22;
/** Stem width as a fraction of baseW. */
export const TOWER_STEM_WIDTH_RATIO = 0.42;
