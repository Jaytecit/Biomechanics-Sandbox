/** Tunable Keiwan-inspired physics constants (Rapier world scale). */

export const FIXED_DT = 1 / 60;

/** Evolution default gravity is -50 Unity units; retuned for Rapier meter-ish scale. */
export const GRAVITY_Y = -38;

export const JOINT_RADIUS = 0.28;
export const BONE_HALF_WIDTH = 0.14;

export const DEFAULT_JOINT_MASS = 1.0;
export const DEFAULT_BONE_MASS = 1.0;

/** SpringJoint-like restore toward rest length (Evolution: spring=1000, damper=50). */
export const MUSCLE_SPRING = 360;
export const MUSCLE_DAMPER = 24;

/** Active contract/expand force scale (Evolution MaxForce ≈ 1500). */
export const MUSCLE_MAX_FORCE = 720;

export const GROUND_FRICTION = 0.85;
export const GROUND_RESTITUTION = 0.05;
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
