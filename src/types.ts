/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- PHYSICS TYPES ---

/**
 * C2 authoritative contact class (observation / provenance only).
 * Priority when multiple contacts land on one node: object > structure > floor.
 */
export const CONTACT_NONE = 0;
export const CONTACT_FLOOR = 1;
export const CONTACT_STRUCTURE = 2;
export const CONTACT_OBJECT = 3;
export type ContactClass =
  | typeof CONTACT_NONE
  | typeof CONTACT_FLOOR
  | typeof CONTACT_STRUCTURE
  | typeof CONTACT_OBJECT;

export interface PhysicsNode {
  id: number;
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  friction: number;
  isGround: boolean;
  /**
   * C2: highest-priority contact class resolved this frame (runtime only).
   * Cleared with `isGround` each integrate; never applies force by itself.
   */
  contactClass?: ContactClass;
  color?: string;
  /** Roller: rolls on contact instead of gripping the ground */
  isWheel?: boolean;
  /** Powered wheel: brain-driven when grounded (implies isWheel) */
  isMotorWheel?: boolean;
  /** Max horizontal drive for motor wheels (0.1–20); default 0.45 */
  motorPower?: number;
  /**
   * Authored foot plant point (D138). When any node is marked, Run / Shuffle
   * plant ledgers only credit these nodes — alternation is foot-to-foot.
   */
  isFoot?: boolean;
  /**
   * Right-angle hinge stop (D138). Hard bones meeting here cannot open past
   * 90° (parallel → perpendicular is allowed; hyperextension past that is not).
   */
  isHingeStop?: boolean;
  /** Visual spin angle in radians (runtime; not part of blueprint) */
  spinAngle?: number;
  /**
   * Pre-constraint Verlet velocity (px/frame, dt ≡ 1) for aerodynamics only.
   * Set by `snapshotAeroVelocities` after integrate/wind and before muscle
   * relaxation so constraint projection cannot invent airspeed (F01 / D074).
   */
  aeroVx?: number;
  aeroVy?: number;
}

/**
 * Soft-body link role:
 * - muscle: soft spring actuator (brain-driven unless parachute)
 * - bone: fixed-length hard constraint (not brain-driven)
 * - piston: variable-length hard strut (brain-driven unless a parallel soft
 *   muscle on the same node pair slaves its targetLength). Compression /
 *   expansion rates are authored per link (px per tick).
 *
 * Legacy blueprints may still carry `linkKind: 'telescope'`; normalize on load
 * to piston with stroke-seeded rates (D150). Omitting linkKind is inferred.
 */
export type MuscleLinkKind = 'muscle' | 'bone' | 'piston';
/** Pre-D150 hard variable strut; accepted only for JSON migration. */
export type LegacyMuscleLinkKind = MuscleLinkKind | 'telescope';

/** Discrete mid-bone attach slots for soft-muscle moment arms (D151). */
export type MuscleLeverSlot = 'nearA' | 'mid' | 'nearB';

/** Parametric t along host bone nodeA→nodeB for each lever slot. */
export const LEVER_SLOT_T: Record<MuscleLeverSlot, number> = {
  nearA: 0.25,
  mid: 0.5,
  nearB: 0.75,
};

export function isValidLeverSlot(value: unknown): value is MuscleLeverSlot {
  return value === 'nearA' || value === 'mid' || value === 'nearB';
}

/** True when a soft muscle uses at least one bone-slot lever. */
export function muscleHasLever(
  muscle: Pick<{ leverBoneA?: number; leverBoneB?: number }, 'leverBoneA' | 'leverBoneB'>
): boolean {
  return muscle.leverBoneA !== undefined || muscle.leverBoneB !== undefined;
}

export interface PhysicsMuscle {
  id: number;
  nodeA: number;
  nodeB: number;
  originalLength: number;
  minLength: number;
  maxLength: number;
  targetLength: number;
  strength: number;
  phaseOffset: number;
  /** Explicit link role; omit on legacy bodies (inferred). */
  linkKind?: MuscleLinkKind | 'telescope';
  /**
   * Piston only: max length increase per physics tick (px). Ignored on other
   * link kinds. Clamped to MIN/MAX_PISTON_RATE when applied.
   */
  extendRate?: number;
  /**
   * Piston only: max length decrease per physics tick (px). Ignored on other
   * link kinds. Clamped to MIN/MAX_PISTON_RATE when applied.
   */
  retractRate?: number;
  /**
   * Soft muscle only: max |ΔtargetLength| per physics tick (px).
   * `undefined` = inherit creature default; `0` = force unlimited.
   */
  softMaxDeltaPerTick?: number;
  /** Soft-paint visual/structural thickness (studio); default 1 */
  thickness?: number;
  color?: string;
  /**
   * Aerodynamic surface on this link:
   * - wing: flat-plate pressure on downstroke only, per wing (must flap; no hover).
   *   Matched L/R strokes produce the strongest lift (bird-like symmetry).
   * - paraglider: cambered canopy lift from airspeed + AoA (stalls when slow)
   * - parachute: one-sided cup drag from projected area; inflates into relative
   *   wind, collapses edge-on (no buoyancy when vertical)
   */
  aeroType?: 'none' | 'wing' | 'paraglider' | 'parachute';
  /** Effective lifting area (px²-ish); defaults from length × thickness when unset */
  aeroArea?: number;
  /** Runtime chute inflation 0…1 (not part of blueprint; visual + aero). */
  _chuteInflation?: number;
  /** Runtime cup normal used for billow drawing (unit; not part of blueprint). */
  _chuteNx?: number;
  _chuteNy?: number;
  /**
   * Soft muscle only (D151): host bone index in `muscles[]` for end A.
   * When set, the constraint anchor is a virtual point on that rigid bone
   * at `leverSlotA` instead of `nodeA`.
   */
  leverBoneA?: number;
  /** Soft muscle only: slot along host bone A (`nearA`=0.25, `mid`=0.5, `nearB`=0.75). */
  leverSlotA?: MuscleLeverSlot;
  /** Soft muscle only: host bone index for end B. */
  leverBoneB?: number;
  /** Soft muscle only: slot along host bone B. */
  leverSlotB?: MuscleLeverSlot;
  /**
   * Runtime: last targetLength seen by the length solver (D142). Used to detect
   * actuation vs held commands. Not part of the blueprint.
   */
  _constraintTargetSeen?: number;
  /** Runtime: true this physics tick when targetLength changed (D142). */
  _actuatingThisTick?: boolean;
  /**
   * Runtime (D161): last accepted command stroke direction (−1 retract, +1
   * extend, 0 idle). Used by session `oscillationIgnore` reverse-dwell.
   */
  _commandStrokeDir?: -1 | 0 | 1;
  /** Runtime (D161): ticks spent in `_commandStrokeDir` (holds count). */
  _commandStrokeTicks?: number;
}

export interface Obstacle {
  type:
    | 'box'
    | 'ramp'
    | 'ice'
    | 'stair'
    | 'bar'
    | 'pit'
    | 'loop'
    | 'finish'
    | 'checkpoint'
    | 'target'
    /** Heightfield segment: surface from (x,y) → (x2,y2) */
    | 'terrain'
    /** Launch tower for parachute descent goals */
    | 'tower';
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  /** Terrain segment right endpoint X (defaults to x + width) */
  x2?: number;
  /** Terrain segment right endpoint Y (surface) */
  y2?: number;
  /** High-jump clear bar: upright post height (visual only for posts) */
  barClearHeight?: number;
  /** Stair index for endless staircase bookkeeping */
  stairIndex?: number;
  /** Optional UI / scoring label */
  label?: string;
  /** Hurdle index for motor hurdles */
  hurdleIndex?: number;
  /** Checkpoint order index */
  checkpointIndex?: number;
  /** Ordered authored box index for the Climb Obstacles course. */
  climbOrder?: number;
  /** Ordered authored obstacle index for the Hazard Dash course. */
  hazardOrder?: number;
  /** Target bullseye radius (center at x,y) */
  targetRadius?: number;
  /** Parking / goal zone width when finish is a region */
  zoneWidth?: number;
  /** Procedural heightfield seed (marker segment with label `procedural` only). */
  terrainSeed?: number;
  /** Procedural heightfield difficulty (marker segment only). */
  terrainDifficulty?: number;
  /** Generated left extent for procedural terrain bookkeeping. */
  terrainLeftX?: number;
  /** Generated right extent for procedural terrain bookkeeping. */
  terrainRightX?: number;
}

export enum EvolutionGoal {
  LOCOMOTION_RIGHT = 'LOCOMOTION_RIGHT',
  LOCOMOTION_LEFT = 'LOCOMOTION_LEFT',
  /**
   * Flat travel that rewards oscillatory / vibrating scooting (muscle pumping
   * and contact flicker). Step-strict Run Right/Left do not reward this.
   */
  SHUFFLE_RIGHT = 'SHUFFLE_RIGHT',
  /** Leftward twin of Shuffle Right. */
  SHUFFLE_LEFT = 'SHUFFLE_LEFT',
  /** Peak jump height (lowest anatomical point clearance). */
  HIGH_JUMP = 'HIGH_JUMP',
  /** Clear a high-jump crossbar on the runway. */
  CLEAR_BAR = 'CLEAR_BAR',
  SPEED = 'SPEED',
  /** Best single isolated jump: max height, land near takeoff X (non-flight). */
  JUMP_LAND_UPRIGHT = 'JUMP_LAND_UPRIGHT',
  /** Maximize rightward distance in one isolated jump (all points leave the floor). */
  LONG_JUMP = 'LONG_JUMP',
  /** Stay airborne as long as possible in one isolated jump (hang time). */
  JUMP_HANG_TIME = 'JUMP_HANG_TIME',
  /** Maximize leftward distance in one isolated jump. */
  JUMP_LEFT = 'JUMP_LEFT',
  /** Peak takeoff / airspeed during an isolated jump. */
  JUMP_SPEED = 'JUMP_SPEED',
  /** Accumulate rotation / flips while airborne from an isolated jump. */
  JUMP_ACROBATICS = 'JUMP_ACROBATICS',
  /** Repeated hopping travel as far right as possible. */
  HOP_RIGHT = 'HOP_RIGHT',
  /** Repeated hopping travel as far left as possible. */
  HOP_LEFT = 'HOP_LEFT',
  /** Repeated hopping for peak hop-bout travel speed. */
  HOP_SPEED = 'HOP_SPEED',
  STAIR_CLIMB = 'STAIR_CLIMB',
  STAY_UPRIGHT = 'STAY_UPRIGHT',
  OBSTACLE_CLIMB = 'OBSTACLE_CLIMB',
  BALANCE_BEAM = 'BALANCE_BEAM',
  CARRY_BALL = 'CARRY_BALL',
  PUSH_BOX = 'PUSH_BOX',
  /** Flat track scored on distance — designed for motor wheels */
  MOTOR_DRIVE = 'MOTOR_DRIVE',
  /** Inclined ramp that powered wheels must climb */
  MOTOR_RAMP = 'MOTOR_RAMP',
  /** Ice patches where motor torque beats muscle grip */
  MOTOR_ICE = 'MOTOR_ICE',
  /** Jump a pit without falling in */
  MOTOR_GAP = 'MOTOR_GAP',
  /** Launch off a ramp and land on wheels on a pad */
  MOTOR_LAUNCH_LAND = 'MOTOR_LAUNCH_LAND',
  /** Roll a containment hoop across uneven terrain (weight-shift / wheel torque) */
  MOTOR_LOOP = 'MOTOR_LOOP',
  /** Clear a series of hurdles */
  MOTOR_HURDLES = 'MOTOR_HURDLES',
  /** Peak ground speed — motor twin of Flight Airspeed */
  MOTOR_LANDSPEED = 'MOTOR_LANDSPEED',
  /** Cross a narrow elevated bridge */
  MOTOR_BRIDGE = 'MOTOR_BRIDGE',
  /** Weave through posts without getting stuck */
  MOTOR_SLALOM = 'MOTOR_SLALOM',
  /** Flat sprint race through checkpoints to a finish (any body) */
  SPRINT_FINISH = 'SPRINT_FINISH',
  /** Traverse a seeded rough-terrain course through ordered supported markers. */
  ROUGH_TERRAIN_TRAVERSE = 'ROUGH_TERRAIN_TRAVERSE',
  /** Stop inside a marked parking bay */
  PARKING_ZONE = 'PARKING_ZONE',
  /** Kick / carry the ball into a goal mouth */
  KICK_GOAL = 'KICK_GOAL',
  /** Hit elevated bullseye targets with the ball */
  HIT_TARGET = 'HIT_TARGET',
  /** Knock down bowling pins */
  BOWLING_PINS = 'BOWLING_PINS',
  /** Reach the finish after traversing ordered static hazards */
  DODGEBALL = 'DODGEBALL',
  /**
   * Stay airborne as long as possible (whole body clear of the floor).
   * Designed for Flapper / wings — hopping once scores poorly vs sustained flight.
   */
  FLIGHT_TIME = 'FLIGHT_TIME',
  /** Peak altitude / clearance while fully airborne. */
  FLIGHT_HEIGHT = 'FLIGHT_HEIGHT',
  /** Maximize rightward distance while fully airborne. */
  FLIGHT_RIGHT = 'FLIGHT_RIGHT',
  /** Maximize leftward distance while fully airborne. */
  FLIGHT_LEFT = 'FLIGHT_LEFT',
  /** Peak airspeed while fully airborne. */
  FLIGHT_AIRSPEED = 'FLIGHT_AIRSPEED',
  /** Sustained flight then stick a soft upright landing. */
  FLIGHT_LAND = 'FLIGHT_LAND',
  /** Accumulate airborne rotation / aero flips. */
  FLIGHT_ACROBATICS = 'FLIGHT_ACROBATICS',
  /**
   * Sustained mid-height glide — not a single long leap.
   * Designed for Proven Glider / paraglider — rolling on wheels barely counts.
   */
  GLIDE_RANGE = 'GLIDE_RANGE',
  /**
   * Launch, stay aloft across a gap, and land past it.
   * Rewards real flight over the pit, not edge teetering.
   */
  AERIAL_CROSSING = 'AERIAL_CROSSING',
  /**
   * Multi-head paraglider curriculum: long run-up → ramp → deploy → glide.
   * Three NEAT heads with hard phase takeover (Proven Glider).
   */
  PARA_RAMP_GLIDE = 'PARA_RAMP_GLIDE',
  /** Step off a tower, deploy parachute, and land softly on the pad below. */
  CHUTE_DESCENT = 'CHUTE_DESCENT',
  CUSTOM = 'CUSTOM',
}

const FLIGHT_GOALS: ReadonlySet<EvolutionGoal> = new Set([
  EvolutionGoal.FLIGHT_TIME,
  EvolutionGoal.FLIGHT_HEIGHT,
  EvolutionGoal.FLIGHT_RIGHT,
  EvolutionGoal.FLIGHT_LEFT,
  EvolutionGoal.FLIGHT_AIRSPEED,
  EvolutionGoal.FLIGHT_LAND,
  EvolutionGoal.FLIGHT_ACROBATICS,
  EvolutionGoal.GLIDE_RANGE,
  EvolutionGoal.AERIAL_CROSSING,
  EvolutionGoal.PARA_RAMP_GLIDE,
  EvolutionGoal.CHUTE_DESCENT,
]);

/** Flight curriculum goals — no camping pads. */
export function isFlightGoal(goal: EvolutionGoal): boolean {
  return FLIGHT_GOALS.has(goal);
}

const JUMP_GOALS: ReadonlySet<EvolutionGoal> = new Set([
  EvolutionGoal.HIGH_JUMP,
  EvolutionGoal.CLEAR_BAR,
  EvolutionGoal.JUMP_LAND_UPRIGHT,
  EvolutionGoal.LONG_JUMP,
  EvolutionGoal.JUMP_HANG_TIME,
  EvolutionGoal.JUMP_LEFT,
  EvolutionGoal.JUMP_SPEED,
  EvolutionGoal.JUMP_ACROBATICS,
  EvolutionGoal.HOP_RIGHT,
  EvolutionGoal.HOP_LEFT,
  EvolutionGoal.HOP_SPEED,
]);

/** Isolated all-points-off jump tasks — hop chains must not score. */
const ISOLATED_JUMP_GOALS: ReadonlySet<EvolutionGoal> = new Set([
  EvolutionGoal.HIGH_JUMP,
  EvolutionGoal.CLEAR_BAR,
  EvolutionGoal.JUMP_LAND_UPRIGHT,
  EvolutionGoal.LONG_JUMP,
  EvolutionGoal.JUMP_HANG_TIME,
  EvolutionGoal.JUMP_LEFT,
  EvolutionGoal.JUMP_SPEED,
  EvolutionGoal.JUMP_ACROBATICS,
]);

const HOP_GOALS: ReadonlySet<EvolutionGoal> = new Set([
  EvolutionGoal.HOP_RIGHT,
  EvolutionGoal.HOP_LEFT,
  EvolutionGoal.HOP_SPEED,
]);

const SHUFFLE_GOALS: ReadonlySet<EvolutionGoal> = new Set([
  EvolutionGoal.SHUFFLE_RIGHT,
  EvolutionGoal.SHUFFLE_LEFT,
]);

export function isJumpGoal(goal: EvolutionGoal): boolean {
  return JUMP_GOALS.has(goal);
}

export function isIsolatedJumpGoal(goal: EvolutionGoal): boolean {
  return ISOLATED_JUMP_GOALS.has(goal);
}

export function isHopGoal(goal: EvolutionGoal): boolean {
  return HOP_GOALS.has(goal);
}

/** Oscillatory scoot travel — vibration is intentional, not a Run shortcut. */
export function isShuffleGoal(goal: EvolutionGoal): boolean {
  return SHUFFLE_GOALS.has(goal);
}

/** Which ParaPilot head is being evolved (others frozen). */
export type ParaPilotStage = 'runUp' | 'deploy' | 'glide' | 'eval';

/** In-episode flight phase for multi-head control. */
export type ParaPilotPhase = 'runUp' | 'deploy' | 'glide';

/** Auto-scored metrics for custom goals; use `manual` when the user supplies a freeform bonus rule. */
export type CustomGoalMetric =
  | 'distance_right'
  | 'distance_left'
  | 'jump_height'
  | 'upright'
  | 'ball_carry'
  | 'box_push'
  | 'survival'
  | 'speed'
  | 'stair_height'
  | 'jump_land'
  | 'clear_bar'
  | 'manual';

export interface CustomGoalRule {
  id: string;
  name: string;
  metric: CustomGoalMetric;
  /** Multiplier applied to the auto-computed metric value */
  weight: number;
  /** Optional threshold: when metric >= target, add `bonus` */
  target?: number;
  bonus?: number;
  /** Free-text description for manual rules (shown in UI; bonus applied as flat weight each step if set) */
  manualNote?: string;
}

export interface CustomGoalConfig {
  name: string;
  description?: string;
  rules: CustomGoalRule[];
}

export interface ArenaModifiers {
  windEnabled: boolean;
  windStrength: number;
  iceEnabled: boolean;
  /**
   * Procedural uneven hills/valleys (hamster-hoop terrain).
   * Selectable for any goal/model; always on for MOTOR_LOOP.
   * Extends endlessly ahead of the pack. Obstacle-free unless terrainObstaclesEnabled.
   */
  terrainEnabled: boolean;
  /**
   * Scatter rocks/boulders across procedural terrain.
   * Off by default; denser and larger as difficulty rises.
   */
  terrainObstaclesEnabled: boolean;
  /** Seed for procedural terrain (stable within a session / generation) */
  terrainSeed?: number;
  /** Seed for every authored/procedural course element; recorded with runs. */
  courseSeed?: number;
  /**
   * Scales gaps, hurdles, bars, stairs, finish distances (0.75–2.5).
   * Also densifies/enlarges terrain rocks when terrainObstaclesEnabled.
   */
  difficulty: number;
  /** Optional user ramp available on any goal (never triggers ParaPilot phases). */
  rampEnabled: boolean;
  /** Optional user pit/gap available on any goal. */
  pitEnabled: boolean;
  /** User gap width in px (also used by goal-built pits when set). */
  gapWidthPx: number;
  /** Ground-relative ramp angle in degrees (user + goal ramps). */
  rampAngleDeg: number;
  /**
   * Horizontal ramp run length in px (user + goal ramps).
   * Min = BASE_RAMP_WIDTH; max = 10× that (see clampRampWidthPx).
   */
  rampWidthPx: number;
  /**
   * Auto-increments when a goal limit is beaten (gap clear, bar clear, finish, etc.).
   * Widens gaps / raises bars / pushes finishes.
   */
  progressiveTier: number;
  /** Tower platform height above ground (CHUTE_DESCENT + Environment Studio towers). */
  towerHeightPx: number;
}

export type WorldObjectType = 'ball' | 'box' | 'hoop';

export interface WorldObject {
  id: string;
  type: WorldObjectType;
  x: number;
  y: number;
  oldX: number;
  oldY: number;
  /** Inner radius for hoop / ball radius */
  radius: number;
  width: number;
  height: number;
  mass: number;
  startX: number;
  startY: number;
  /** Hoop tube thickness (outer = radius + tubeThickness) */
  tubeThickness?: number;
  /** Visual / roll angle in radians */
  angle?: number;
}

/** Morphology limits enforced when starting — and while scoring — a challenge. */
export interface ChallengeBodyConstraints {
  maxNodes?: number;
  minNodes?: number;
  maxMuscles?: number;
  minFlexibleMuscles?: number;
  maxMotorWheels?: number;
  minMotorWheels?: number;
  /** Per-wheel motorPower ceiling (blocks cranked drive exploits). */
  maxMotorPower?: number;
  maxAeroSurfaces?: number;
  minAeroSurfaces?: number;
  requireWing?: boolean;
  requireParaglider?: boolean;
  requireParachute?: boolean;
  forbidAero?: boolean;
  forbidMotorWheels?: boolean;
  forbidPassiveWheels?: boolean;
  maxMass?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxFootSpan?: number;
  allowedEquipment?: {
    motorWheels?: boolean;
    passiveWheels?: boolean;
    aero?: boolean;
  };
}

export interface ChallengeDefinition {
  id: string;
  title: string;
  description: string;
  goal: EvolutionGoal;
  /** Fitness / score threshold to clear (base; live target escalates after each clear) */
  targetValue: number;
  maxGenerations: number;
  badgeLabel: string;
  /** Body limits that gate launch and score credit. */
  constraints?: ChallengeBodyConstraints;
  /** Arena preset for this challenge (merged over zone defaults on start). */
  arena?: Partial<ArenaModifiers>;
  /** Episode length while the challenge is active. */
  episodeSeconds?: number;
  /** Keep NEAT topology fixed so morphology limits stay meaningful (default true when constrained). */
  lockTopology?: boolean;
  /** Shipped template that matches the constraint envelope. */
  recommendedBody?: string;
}

export interface ChallengeProgress {
  challengeId: string;
  /** True after the base target was met at least once (badge). */
  cleared: boolean;
  clearedAtGeneration?: number;
  bestScore: number;
  /** Current score to beat; starts at targetValue and grows after each achievement. */
  liveTarget?: number;
  /** How many times the live target has been beaten. */
  clearCount?: number;
}

// --- NEURAL NETWORK / NEAT TYPES ---

export type NodeType = 'input' | 'hidden' | 'output';

export interface NodeGene {
  id: number;
  type: NodeType;
  label?: string;
}

export interface ConnectionGene {
  fromNode: number;
  toNode: number;
  weight: number;
  enabled: boolean;
  innovation: number;
}

export interface Genome {
  nodes: NodeGene[];
  connections: ConnectionGene[];
}

/** Three specialist genomes for the paraglider curriculum. */
export interface ParaPilot {
  runUp: Genome;
  deploy: Genome;
  glide: Genome;
}

export function createParaPilot(base: Genome, clone: (g: Genome) => Genome): ParaPilot {
  return { runUp: clone(base), deploy: clone(base), glide: clone(base) };
}

export function activeParaGenome(pilot: ParaPilot, stage: ParaPilotStage): Genome {
  if (stage === 'deploy') return pilot.deploy;
  if (stage === 'glide' || stage === 'eval') return pilot.glide;
  return pilot.runUp;
}

// --- CREATURE / AGENT TYPES ---

/**
 * Authoring solid plate (D136). Disjoint node sets become compound rigid bodies
 * via shape matching — not per-joint angle locks.
 */
export interface SolidSegmentSpec {
  id: string;
  nodeIds: number[];
}

/** Runtime rigid body built at spawn from SolidSegmentSpec. */
export interface RuntimeSolidBody {
  id: string;
  /** Indices into creature.nodes */
  nodeIndices: number[];
  /** Rest offsets from rest COM in the spawn pose (local frame). */
  restOffsets: { x: number; y: number }[];
}

export interface CreatureBlueprint {
  name: string;
  nodes: Omit<PhysicsNode, 'x' | 'y' | 'oldX' | 'oldY' | 'vx' | 'vy' | 'isGround' | 'spinAngle'>[];
  muscles: Omit<PhysicsMuscle, 'targetLength'>[];
  relativePositions: { x: number; y: number }[];
  /** Optional rigid plates; omitted on legacy bodies. */
  solidSegments?: SolidSegmentSpec[];
  /**
   * Soft-muscle command rate cap (px/tick) for all soft actuators that do not
   * override with `softMaxDeltaPerTick`. Omit / undefined = unlimited (legacy).
   */
  softMuscleMaxDeltaPerTick?: number;
}

export interface Creature {
  id: string;
  generation: number;
  blueprint: CreatureBlueprint;
  /** Finished-product display name (competition / hall of champions). */
  displayName?: string;
  /** Link back to a saved finished model id when competing. */
  productId?: string;
  /** Primary / display genome — synced to active ParaPilot head when multi-head. */
  genome: Genome;
  /** Multi-head paraglider controller (PARA_RAMP_GLIDE). */
  paraPilot?: ParaPilot;
  /** In-episode phase for ParaPilot hard handoff. */
  paraPhase?: ParaPilotPhase;
  /** Frames spent blending between ParaPilot heads. */
  paraBlendFrames?: number;
  /** Previous phase outputs during blend (length = actuator count). */
  paraBlendFrom?: number[];
  /** Frames airborne with open sail during deploy phase (gate to glide). */
  paraDeployAirFrames?: number;
  /** Horizontal speed recorded at ramp lip / first leave-ramp airborne. */
  paraLaunchSpeed?: number;
  /** Peak clearance after leaving the takeoff ramp. */
  paraLaunchHeight?: number;
  /** Farthest world X reached after entering deploy/glide (for backslide penalty). */
  paraPeakX?: number;
  nodes: PhysicsNode[];
  muscles: PhysicsMuscle[];
  /**
   * Runtime solid plates built at spawn from blueprint.solidSegments (D136).
   * Shape-matched each physics tick; not part of the genome I/O.
   */
  solidBodies?: RuntimeSolidBody[];
  /**
   * C2: hard-link capsule contacted a structure this frame (runtime observation).
   */
  linkContactStructure?: boolean;
  /**
   * C2: hard-link capsule contacted a private/world object this frame.
   * Reserved — node–object collisions own object class today; stays false until
   * link–object capsules exist. Included so the observation pack stays stable.
   */
  linkContactObject?: boolean;
  startX: number;
  startY: number;
  /**
   * Settled spawn AABB (including node radii). Used to scale flight / jump
   * reward gates to the creature actually competing.
   */
  restBodyHeight?: number;
  restBodyWidth?: number;
  highestY: number;
  currentX: number;
  currentY: number;
  fitness: number;
  isAlive: boolean;
  /** Frames the creature stayed reasonably upright (for survival challenges) */
  uprightFrames?: number;
  /** Stay Tall: integrated normalized posture on authoritative support */
  stayTallIntegral?: number;
  /** Stay Tall: frames that contributed supported posture evidence */
  stayTallSupportedFrames?: number;
  /** Stay Tall: supported frames spent in a fallen/collapsed posture */
  stayTallFallFrames?: number;
  /** Peak horizontal speed observed this episode (px/frame) */
  peakSpeed?: number;
  /** Peak horizontal speed while any node is grounded (landspeed record) */
  peakLandSpeed?: number;
  /** Instantaneous horizontal speed this frame (px/frame) */
  currentSpeed?: number;
  /** Highest COM altitude reached while airborne (current bout) */
  airbornePeakHeight?: number;
  /**
   * Jump & Land: best single-attempt score this episode (max, not sum).
   * Also used by custom `jump_land` metric.
   */
  uprightLandingScore?: number;
  /** Jump & Land: COM X at the moment of takeoff for the current airborne bout */
  jumpTakeoffX?: number;
  /** Hang Time: frames in the current bout that began from authoritative support */
  jumpHangBoutFrames?: number;
  /** Hang Time: whole-body clearance peak in the current supported-takeoff bout */
  jumpHangBoutPeakClearance?: number;
  /** Hang Time: best completed supported-takeoff bout score this episode */
  jumpHangBestBoutScore?: number;
  /**
   * Walk gait: ordered distinct contact-node indices in the active plant sequence
   * (1 monoped … 4 quadruped).
   */
  walkGaitNodeIds?: number[];
  /** Walk gait: prior-frame grounded flags per node (rising-edge plant detection). */
  walkPrevGrounded?: boolean[];
  /**
   * Walk gait: monotonic plant frontier in world X (high-water toward the goal).
   * Oscillating plants behind this mark never re-credit.
   */
  walkPlantFrontierX?: number;
  /**
   * Walk gait: monotonic body-COM frontier in world X. Credited stride progress
   * cannot exceed contemporaneous body advance past this mark.
   */
  walkBodyFrontierX?: number;
  /** Walk gait: credited rightward plant+body progress (px). */
  walkStrideDistanceRight?: number;
  /** Walk gait: credited leftward plant+body progress (px). */
  walkStrideDistanceLeft?: number;
  /** Run Right: discrete step count (swing-gated plants). */
  walkStepCountRight?: number;
  /** Run Left: discrete step count (swing-gated plants). */
  walkStepCountLeft?: number;
  /** Run Right: steps that switched to a different contact node. */
  walkAlternateStepCountRight?: number;
  /** Run Left: steps that switched to a different contact node. */
  walkAlternateStepCountLeft?: number;
  /** Run Right: step points (base + alternate bonuses). */
  walkStepScoreRight?: number;
  /** Run Left: step points (base + alternate bonuses). */
  walkStepScoreLeft?: number;
  /** Node index of the last credited Run step plant. */
  walkLastStepNodeId?: number;
  /** Episode frame of the last credited Run step. */
  walkLastStepFrame?: number;
  /** Consecutive airborne frames per node (swing detection). */
  walkNodeAirFrames?: number[];
  /**
   * Shuffle: rightward plant+body travel credited without swing/interval gates
   * (vibration scooting is intentional here).
   */
  shuffleOscDistanceRight?: number;
  /** Shuffle: leftward oscillation-plant travel. */
  shuffleOscDistanceLeft?: number;
  /** Shuffle: monotonic plant frontier for oscillation credit. */
  shufflePlantFrontierX?: number;
  /** Shuffle: monotonic body frontier for oscillation credit. */
  shuffleBodyFrontierX?: number;
  /** Consecutive grounded frames since last all-points-off landing. */
  groundedStreak?: number;
  /** True once any all-points-off bout has completed this episode. */
  hadAerialBout?: boolean;
  /** Current all-points-off bout is a hop-chain continuation. */
  aerialBoutIsHop?: boolean;
  /** Peak lowest-anatomy clearance in the current all-points-off bout. */
  aerialBoutPeakLowestClearance?: number;
  /** Peak COM speed in the current all-points-off bout. */
  aerialBoutPeakSpeed?: number;
  /** Best isolated-jump peak lowest-anatomy clearance this episode. */
  jumpHeightBestClearance?: number;
  /** Best isolated-jump speed bout score this episode. */
  jumpSpeedBestBoutScore?: number;
  /**
   * Raw metrics for the best JUMP_SPEED bout so live recipe edits can re-score
   * without relying on a stale coefficient-scaled total.
   */
  jumpSpeedBestBoutMetrics?: {
    peakSpeed: number;
    frames: number;
    peakClearance: number;
  };
  /** Accumulated rightward travel across hop-chain bouts. */
  hopDistanceRight?: number;
  /** Accumulated leftward travel across hop-chain bouts. */
  hopDistanceLeft?: number;
  /** Peak bout travel speed observed during hop-chain bouts. */
  hopPeakSpeed?: number;
  /** Hop bouts completed this episode. */
  hopBoutCount?: number;
  /** Last finalized isolated-jump snapshot (revoked when a hop chain continues). */
  lastIsolatedJumpSnapshot?: {
    hangScore: number;
    rightScore: number;
    leftScore: number;
    heightClearance: number;
    speedScore: number;
    acroScore: number;
    landScore: number;
    rightDist: number;
    leftDist: number;
    peakSpeed: number;
    frames: number;
    peakClearance: number;
  };
  /** True once the clear-bar height was crossed past the bar X */
  clearedBar?: boolean;
  /** Peak stair tread height (px above ground) actually stood on */
  stairPeakHeight?: number;
  /** Peak support height on motor-ramp surfaces (px above ground) */
  rampPeakHeight?: number;
  /** Number of authored Climb Obstacles box tops mounted in strict course order */
  obstacleClimbMountCount?: number;
  /** Highest authored box top reached through ordered, stable support */
  obstacleClimbSupportedHeight?: number;
  /** Farthest authored box-top X reached through ordered, stable support */
  obstacleClimbSupportedX?: number;
  /** Current authored box index accumulating stable-support frames */
  obstacleClimbCandidateOrder?: number;
  /** Consecutive frames supported on the current authored box candidate */
  obstacleClimbCandidateFrames?: number;
  /** Balance Beam: frames with authoritative support on the authored beam */
  beamSupportedFrames?: number;
  /** Balance Beam: rightward distance accumulated during continuous beam support */
  beamSupportedDistance?: number;
  /** Balance Beam: supported posture integral, never final-pose posture */
  beamSupportedPosture?: number;
  /** Balance Beam: whether the previous frame had authored beam support */
  beamContactActive?: boolean;
  /** Balance Beam: prior supported center X for contact-chain travel */
  beamLastSupportedX?: number;
  /** Balance Beam: reached the far end after traversing most of the beam */
  beamCompleted?: boolean;
  /** Motor Bridge: continuous authored-bridge support ledger */
  bridgeSupportedFrames?: number;
  bridgeSupportedDistance?: number;
  bridgeContactActive?: boolean;
  bridgeLastSupportedX?: number;
  bridgeCompleted?: boolean;
  /** Sim frames elapsed this episode */
  episodeFrames?: number;
  /** Fell into a pit */
  fellInPit?: boolean;
  /** Cleared a gap / pit by reaching the far side without falling */
  gapCleared?: boolean;
  /**
   * Clear Gap: best fraction of pit width reached by the leading hull edge
   * (0…1), including failed jumps that never fully clear.
   */
  gapSpanFraction?: number;
  /**
   * Clear Gap: earned the pre-lip jump incentive (all wheels airborne in the
   * 40px window immediately left of the pit start).
   */
  gapPreJump?: boolean;
  /** Aerial Crossing: regained authoritative support beyond the far pit lip */
  aerialCrossingLanded?: boolean;
  /** Crossed the finish line */
  crossedFinish?: boolean;
  /** Frame index when finish was first crossed */
  finishFrame?: number;
  /** Highest checkpoint index reached */
  checkpointReached?: number;
  /** Rough Terrain Traverse: monotonic rightward distance observed under support. */
  roughSupportedDistance?: number;
  /** Rough Terrain Traverse: farthest supported center X used by its ledger. */
  roughSupportedX?: number;
  /** Motor Technical Course: new rightward distance observed while supported */
  technicalSupportedDistance?: number;
  /** Motor Technical Course: farthest supported center X used by its ledger */
  technicalSupportedX?: number;
  /** Peak hoop travel distance (px) this episode */
  hoopTravel?: number;
  /** Frames where most nodes were outside the hoop */
  hoopOutsideFrames?: number;
  /** @deprecated legacy loop-track fields kept for share-code compatibility */
  loopProgress?: number;
  loopCompleted?: boolean;
  loopLastAngle?: number;
  loopAngleAccum?: number;
  /**
   * Launch & Land: best motor-wheel pad landing after gap clear (max, not sum).
   * Ramp hops do not contribute.
   */
  wheelLandScore?: number;
  /** Hurdles cleared (COM past hurdle while above it) */
  hurdlesCleared?: number;
  /** Bitmask / count of hurdles already counted */
  hurdlesHitMask?: number;
  /** Frames spent inside a parking zone while slow & upright */
  parkingFrames?: number;
  /** Target bullseyes scored */
  targetHits?: number;
  /** Bitmask of targets already hit */
  targetHitMask?: number;
  /** Goal scored with ball */
  goalScored?: boolean;
  /** Direct creature-to-private-ball collision occurred this episode */
  ballCreatureContacted?: boolean;
  /** Last simulation frame with direct creature-to-ball contact */
  ballContactFrame?: number;
  /** Peak horizontal speed while at least one node was grounded (Max Speed) */
  peakSupportedSpeed?: number;
  /** Motor Ice: supported travel distance while on ice patches */
  iceSupportedDistance?: number;
  /** Motor Ice: farthest X while on ice with support */
  iceSupportedX?: number;
  /** Hit Target: best approach shaping toward nearest unhit target */
  targetApproachBest?: number;
  /** Pins knocked from start pose */
  pinsDown?: number;
  /** Hazard Dash: number of authored hazards crossed in strict course order */
  hazardProgressCount?: number;
  /** Hazard Dash: farthest new rightward progress observed */
  hazardProgressX?: number;
  /** Hazard Dash: upright posture integral weighted by new rightward distance */
  hazardUprightProgress?: number;
  /** Carry Ball: consecutive frames with a resolved creature-to-ball collision */
  carryBallContactChainFrames?: number;
  /** Carry Ball: longest direct-contact chain observed this episode */
  carryBallBestContactChainFrames?: number;
  /** Carry Ball: rightward ball displacement during continuous direct contact */
  carryBallTransportDistance?: number;
  /** Carry Ball: peak lift reached on a directly contacted transport frame */
  carryBallTransportPeakLift?: number;
  /** Carry Ball: whether the immediately preceding frame resolved direct contact */
  carryBallContactActive?: boolean;
  /** Carry Ball: prior post-collision ball position used for causal transport */
  carryBallLastX?: number;
  /** Carry Ball: prior post-collision ball position used for causal transport */
  carryBallLastY?: number;
  /** Frames the whole body was clear of the ground (flight goals) */
  flightFrames?: number;
  /** Rightward horizontal distance accumulated while fully airborne (px) */
  flightDistance?: number;
  /** Leftward horizontal distance accumulated while fully airborne (px) */
  flightDistanceLeft?: number;
  /** Peak ground clearance while fully airborne (px) */
  flightPeakClearance?: number;
  /** Sum of ground clearance each airborne frame (mean height = integral / frames) */
  flightHeightIntegral?: number;
  /** Stay Aloft: frames in the current fully-airborne bout */
  flightTimeBoutFrames?: number;
  /** Stay Aloft: peak clearance in the current bout */
  flightTimeBoutPeak?: number;
  /** Stay Aloft: clearance integral in the current bout */
  flightTimeBoutIntegral?: number;
  /** Stay Aloft: wingFlapFrames snapshot at bout start */
  flightTimeBoutFlapBase?: number;
  /** Stay Aloft: wingFlapWork snapshot at bout start */
  flightTimeBoutWorkBase?: number;
  /** Stay Aloft: wingSymFlapFrames snapshot at bout start */
  flightTimeBoutSymBase?: number;
  /** Stay Aloft: wingSymFlapQuality snapshot at bout start */
  flightTimeBoutSymQualityBase?: number;
  /** Stay Aloft: best completed single-bout score this episode */
  flightTimeBestBoutScore?: number;
  /** Airspeed: peak speed in the current fully-airborne bout */
  flightAirspeedBoutPeak?: number;
  /** Airspeed: frames in the current fully-airborne bout */
  flightAirspeedBoutFrames?: number;
  /** Airspeed: horizontal distance (L+R) in the current bout */
  flightAirspeedBoutDist?: number;
  /** Airspeed: peak clearance in the current bout */
  flightAirspeedBoutPeakClearance?: number;
  /** Airspeed: best completed single-bout score this episode */
  flightAirspeedBestBoutScore?: number;
  /** Aerial Crossing: best capped flight-shaping from one airborne bout */
  aerialCrossingBestShaping?: number;
  /** Para Ramp: best glide/air component from one uninterrupted airborne bout */
  paraAirBestBoutScore?: number;
  /** Flight Height: frames in the current fully-airborne bout */
  flightHeightBoutFrames?: number;
  /** Flight Height: peak clearance in the current bout */
  flightHeightBoutPeak?: number;
  /** Flight Height: clearance integral in the current bout */
  flightHeightBoutIntegral?: number;
  /** Flight Height: clearance on the first fully-airborne frame of the bout */
  flightHeightBoutTakeoffClear?: number;
  /** Flight Height: COM rise (px) while wing muscles were flapping this bout */
  flightHeightBoutPoweredClimb?: number;
  /** Flight Height: wingFlapFrames snapshot at bout start */
  flightHeightBoutFlapBase?: number;
  /** Flight Height: wingFlapWork snapshot at bout start */
  flightHeightBoutWorkBase?: number;
  /** Flight Height: wingSymFlapFrames snapshot at bout start */
  flightHeightBoutSymBase?: number;
  /** Flight Height: wingSymFlapQuality snapshot at bout start */
  flightHeightBoutSymQualityBase?: number;
  /** Flight Height: prior-frame wingFlapFrames for powered-climb edge detect */
  flightHeightBoutPrevFlap?: number;
  /** Flight Height: best completed sustained-climb bout score this episode */
  flightHeightBestBoutScore?: number;
  /** Peak speed magnitude while fully airborne (px/frame); telemetry only */
  peakAirSpeed?: number;
  /** Last-frame spine / body pitch angle (radians) */
  bodyAngle?: number;
  /** Body angular rate (rad/frame) from spine-angle delta */
  bodyOmega?: number;
  /** Frames a wing muscle was in the flap-gated aero branch */
  wingFlapFrames?: number;
  /** Sum of |ΔtargetLength| on wings while flapping (command stroke effort) */
  wingFlapWork?: number;
  /** Frames a matched L/R wing pair scored bird-like (sym ≥ 0.4) */
  wingSymFlapFrames?: number;
  /** Integral of pair bird-score on those frames (higher = more symmetrical) */
  wingSymFlapQuality?: number;
  /** Stay Aloft: body-level frames while flapping in the current bout */
  flightTimeBoutLevelFrames?: number;
  /** Stay Aloft: low horizontal-jitter frames in the current bout */
  flightTimeBoutStableHorizFrames?: number;
  /** Stay Aloft: prior-frame horizontal speed for stability tracking */
  flightTimePrevHorizSpeed?: number;
  /** Stay Aloft: episode ground-touch count (penalised) */
  flightGroundTouches?: number;
  /** Flight Height: upward-only COM travel in the current bout (px) */
  flightHeightBoutVerticalTravel?: number;
  /** Flight Height: level-flight frames while flapping in the current bout */
  flightHeightBoutLevelFrames?: number;
  /** Airspeed: rotation accumulated in the current bout (radians) */
  flightAirspeedBoutRotation?: number;
  /** Acrobatics: downward COM travel during the current bout (px) */
  attemptBoutVertDescent?: number;
  /** Glide Range: first landing ended scoring — no further glide credit */
  glideHasLanded?: boolean;
  /** Absolute rotation accumulated while airborne (radians) */
  airborneRotation?: number;
  /** Soft upright landings after sustained flight */
  flightLandScore?: number;
  /** Land-goal: climb credit toward the approach ceiling (current bout + episode) */
  landClimbScore?: number;
  /** Land-goal: descent credit after ceiling reached */
  landDescentScore?: number;
  /** Land-goal: penalty for climbing past the ceiling / re-climbing */
  landOvershootPenalty?: number;
  /** Land-goal: current airborne bout reached the approach ceiling */
  landReachedCeiling?: boolean;
  /** Land-goal: current bout began descending after the ceiling */
  landBeganDescent?: boolean;
  /** Peak forward speed while sail reefed and wheels grounded (paraglider technique) */
  sailReefedSpeedPeak?: number;
  /** Forward speed at the moment the sail first fully opened */
  sailDeploySpeed?: number;
  /** Airborne distance while sail was fully open */
  sailOpenGlideDist?: number;
  /** Frames sail was open while slow and still on the ground (penalty) */
  sailEarlyOpenFrames?: number;
  /** Last-frame sail openness for deploy-edge detection */
  sailPrevOpenness?: number;
  /** Current consecutive fully-airborne frame streak */
  flightStreak?: number;
  /** Longest consecutive airborne streak this episode */
  flightLongestStreak?: number;
  /** Frames in the sustained-glide corridor (open sail, mid height, gentle sink) */
  glideCorridorFrames?: number;
  /** Horizontal distance while in the sustained-glide corridor */
  glideCorridorDist?: number;
  /** Glide Range: frames in the current uninterrupted fully-airborne bout */
  glideBoutFrames?: number;
  /** Glide Range: rightward distance in the current uninterrupted bout */
  glideBoutDistance?: number;
  /** Glide Range: clearance integral for the current uninterrupted bout */
  glideBoutHeightIntegral?: number;
  /** Glide Range: peak clearance for the current uninterrupted bout */
  glideBoutPeakClearance?: number;
  /** Glide Range: corridor frames in the current uninterrupted bout */
  glideBoutCorridorFrames?: number;
  /** Glide Range: corridor distance in the current uninterrupted bout */
  glideBoutCorridorDist?: number;
  /** Glide Range: open-sail distance in the current uninterrupted bout */
  glideBoutOpenDist?: number;
  /** Glide Range: best sail-technique shaping captured during the current bout */
  glideBoutTechniqueBonus?: number;
  /** Glide Range: best completed uninterrupted bout score this episode */
  glideBestBoutScore?: number;
  /** R2: frames in the current fully-airborne attempt */
  attemptBoutFrames?: number;
  /** R2: rightward distance in the current fully-airborne attempt */
  attemptBoutRight?: number;
  /** R2: leftward distance in the current fully-airborne attempt */
  attemptBoutLeft?: number;
  /** R2: peak whole-body clearance in the current fully-airborne attempt */
  attemptBoutPeakClearance?: number;
  /** R2: absolute rotation in the current fully-airborne attempt */
  attemptBoutRotation?: number;
  /** R2 best completed scores for isolated directional and acrobatic attempts */
  jumpRightBestBoutScore?: number;
  jumpLeftBestBoutScore?: number;
  flightRightBestBoutScore?: number;
  flightLeftBestBoutScore?: number;
  jumpAcrobaticsBestBoutScore?: number;
  flightAcrobaticsBestBoutScore?: number;
  /** R2: best complete climb-descent-stick Flight Land attempt */
  flightLandBestBoutScore?: number;
  /** Best CHUTE_DESCENT composite score (descent + landing). */
  chuteDescentBestScore?: number;
  /** Hoop travel counted only while the hoop is near terrain (not lofted) */
  hoopGroundedTravel?: number;
  /** Frames the hoop spent lofted above rolling height */
  hoopLoftFrames?: number;
  /** Peak loft of hoop center above expected rolling height (px) */
  hoopPeakLoft?: number;
  /**
   * Private ball/crate copies for this agent only.
   * Shared world objects would let the ghost pack contaminate everyone else's score.
   */
  privateWorld?: WorldObject[];
  /** Recent muscle contraction ratios for gait fingerprints [muscleIdx][t] */
  gaitHistory?: number[][];
  /** Secret-goal telemetry: farthest left/right COM this episode */
  episodeMinX?: number;
  episodeMaxX?: number;
  /** Secret-goal telemetry: peak support height before any pit fall */
  episodePeakSupportHeight?: number;
  /** Secret-goal telemetry: frames with inverted posture heuristic */
  upsideDownFrames?: number;
  /** Secret-goal telemetry: fall frames within 30 frames of crossing finish */
  postFinishFallFrames?: number;
  /** Secret-goal telemetry: rapid vertical COM bounce frames (shuffle mishaps) */
  episodeRapidBounceFrames?: number;
  /** Prior-frame COM Y for bounce detection */
  episodePrevComY?: number;
  /** Peak stair height before any descent (secret climb goals) */
  episodeStairPeak?: number;
}

export interface GenerationRecord {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  minFitness: number;
  bestCreatureData?: string;
}

/** Built-in reward recipe (Phase 22A). Defined in builtInRewardCoeffs.ts. */
export type BuiltInRewardRecipeRef = import('./builtInRewardCoeffs').BuiltInRewardRecipe;

export interface SimulationConfig {
  populationSize: number;
  generationDuration: number;
  simulationSpeed: number;
  mutationRate: number;
  addNodeRate: number;
  addConnectionRate: number;
  goal: EvolutionGoal;
  gravity: number;
  groundFriction: number;
  /**
   * D161 — ignore high-frequency actuator flip-flops (0…1).
   * `0` (default) = off (legacy). Higher values require longer same-direction
   * command strokes before a reverse is applied, so buzz cannot move the body
   * or mint travel rewards. See `oscillationIgnoreDwellTicks`.
   */
  oscillationIgnore?: number;
  arena: ArenaModifiers;
  customGoal: CustomGoalConfig;
  /**
   * Optional live built-in reward coefficients (SPEED / JUMP_SPEED pilot).
   * Omit or leave at defaults for shipped scoring.
   */
  rewardRecipe?: BuiltInRewardRecipeRef;
  /** Which ParaPilot head is evolving (PARA_RAMP_GLIDE). */
  paraPilotStage?: ParaPilotStage;
  /** Recent best-of-gen scores for the active stage (auto-advance). */
  paraStageBestHistory?: number[];
}

export const DEFAULT_ARENA_MODIFIERS: ArenaModifiers = {
  windEnabled: false,
  windStrength: 0.12,
  iceEnabled: false,
  terrainEnabled: false,
  terrainObstaclesEnabled: false,
  terrainSeed: 42,
  courseSeed: 21001,
  difficulty: 1,
  rampEnabled: false,
  pitEnabled: false,
  gapWidthPx: 648,
  rampAngleDeg: 27,
  /** Matches BASE_RAMP_WIDTH (scaleW(200)). */
  rampWidthPx: 600,
  progressiveTier: 0,
  towerHeightPx: 280,
};

export const DEFAULT_CUSTOM_GOAL: CustomGoalConfig = {
  name: 'My Custom Goal',
  description: 'Blend distance and jump height',
  rules: [
    { id: 'r1', name: 'Move right', metric: 'distance_right', weight: 1.0 },
    { id: 'r2', name: 'Jump bonus', metric: 'jump_height', weight: 0.5, target: 40, bonus: 20 },
  ],
};

export type LinkKindFields = Pick<
  PhysicsMuscle,
  | 'minLength'
  | 'maxLength'
  | 'strength'
  | 'linkKind'
  | 'extendRate'
  | 'retractRate'
  | 'softMaxDeltaPerTick'
>;

export type BrainDrivenFields = LinkKindFields &
  Pick<
    PhysicsMuscle,
    | 'aeroType'
    | 'id'
    | 'nodeA'
    | 'nodeB'
    | 'leverBoneA'
    | 'leverSlotA'
    | 'leverBoneB'
    | 'leverSlotB'
  >;

/**
 * Studio / physics clamp for piston compression & expansion rates (px/tick).
 * World units after CREATURE_WORLD_SCALE (legacy authoring was ~2.5–500).
 */
export const MIN_PISTON_RATE = 0.05;
export const MAX_PISTON_RATE = 50;
/** Default piston rates match the pre-D150 telescope floor before stroke scaling. */
export const DEFAULT_PISTON_EXTEND_RATE = 0.4;
export const DEFAULT_PISTON_RETRACT_RATE = 0.4;

/** Soft-muscle command rate clamps (px/tick); same band as pistons. */
export const MIN_SOFT_MUSCLE_RATE = 0.05;
export const MAX_SOFT_MUSCLE_RATE = 50;
/** Seed when enabling a soft-muscle body/muscle rate cap in Studio. */
export const DEFAULT_SOFT_MUSCLE_RATE = 0.4;

export function clampPistonRate(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PISTON_EXTEND_RATE;
  return Math.max(MIN_PISTON_RATE, Math.min(MAX_PISTON_RATE, value));
}

export function clampSoftMuscleRate(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SOFT_MUSCLE_RATE;
  return Math.max(MIN_SOFT_MUSCLE_RATE, Math.min(MAX_SOFT_MUSCLE_RATE, value));
}

/** Resolve authored piston rates with defaults. */
export function pistonRates(muscle: Pick<PhysicsMuscle, 'extendRate' | 'retractRate'>): {
  extendRate: number;
  retractRate: number;
} {
  return {
    extendRate: clampPistonRate(muscle.extendRate ?? DEFAULT_PISTON_EXTEND_RATE),
    retractRate: clampPistonRate(muscle.retractRate ?? DEFAULT_PISTON_RETRACT_RATE),
  };
}

/**
 * Seed piston rates from the current stroke so a fresh piston starts near
 * the former global telescope jump-stroke budget, then remains fully editable.
 */
export function defaultPistonRatesForStroke(minLength: number, maxLength: number): {
  extendRate: number;
  retractRate: number;
} {
  const span = Math.max(0, maxLength - minLength);
  const rate = clampPistonRate(Math.max(DEFAULT_PISTON_EXTEND_RATE, span * 0.25));
  return { extendRate: rate, retractRate: rate };
}

/**
 * Soft-muscle |ΔtargetLength| budget for this tick.
 * `null` = unlimited (legacy / opt-out). Muscle `0` forces unlimited even when
 * the creature default is set; muscle `> 0` overrides the creature default.
 */
export function resolveSoftMuscleMaxDelta(
  muscle: Pick<PhysicsMuscle, 'softMaxDeltaPerTick' | 'linkKind' | 'minLength' | 'maxLength' | 'strength'>,
  blueprint?: Pick<CreatureBlueprint, 'softMuscleMaxDeltaPerTick'> | null
): number | null {
  if (resolveLinkKind(muscle) !== 'muscle') return null;
  const local = muscle.softMaxDeltaPerTick;
  if (typeof local === 'number' && Number.isFinite(local)) {
    if (local <= 0) return null;
    return clampSoftMuscleRate(local);
  }
  const body = blueprint?.softMuscleMaxDeltaPerTick;
  if (typeof body === 'number' && Number.isFinite(body) && body > 0) {
    return clampSoftMuscleRate(body);
  }
  return null;
}

type BlueprintMuscle = Omit<PhysicsMuscle, 'targetLength'>;

function stripMuscleLevers(muscle: BlueprintMuscle): BlueprintMuscle {
  const {
    leverBoneA: _a,
    leverSlotA: _sa,
    leverBoneB: _b,
    leverSlotB: _sb,
    ...rest
  } = muscle;
  return rest;
}

function normalizeSoftMuscleLevers(muscle: BlueprintMuscle): BlueprintMuscle {
  const next: BlueprintMuscle = { ...muscle };
  if (typeof muscle.leverBoneA === 'number' && Number.isFinite(muscle.leverBoneA)) {
    next.leverBoneA = Math.floor(muscle.leverBoneA);
    next.leverSlotA = isValidLeverSlot(muscle.leverSlotA) ? muscle.leverSlotA : 'mid';
  } else {
    delete next.leverBoneA;
    delete next.leverSlotA;
  }
  if (typeof muscle.leverBoneB === 'number' && Number.isFinite(muscle.leverBoneB)) {
    next.leverBoneB = Math.floor(muscle.leverBoneB);
    next.leverSlotB = isValidLeverSlot(muscle.leverSlotB) ? muscle.leverSlotB : 'mid';
  } else {
    delete next.leverBoneB;
    delete next.leverSlotB;
  }
  return next;
}

/**
 * Drop invalid bone-slot levers (wrong kind, self-host, missing bone).
 * Call after per-muscle normalize so host kinds are resolved.
 */
export function sanitizeMuscleLevers(muscles: BlueprintMuscle[]): BlueprintMuscle[] {
  return muscles.map((muscle, index) => {
    if (resolveLinkKind(muscle) !== 'muscle' || !muscleHasLever(muscle)) {
      return resolveLinkKind(muscle) === 'muscle' ? muscle : stripMuscleLevers(muscle);
    }
    const next: BlueprintMuscle = { ...muscle };
    const validHost = (hostIdx: number | undefined): hostIdx is number => {
      if (hostIdx === undefined || hostIdx === index) return false;
      const host = muscles[hostIdx];
      return !!host && isRigidBone(host);
    };
    if (!validHost(next.leverBoneA)) {
      delete next.leverBoneA;
      delete next.leverSlotA;
    }
    if (!validHost(next.leverBoneB)) {
      delete next.leverBoneB;
      delete next.leverSlotB;
    }
    return next;
  });
}

/** Migrate legacy telescope links to piston with stroke-seeded rates. */
export function normalizeBlueprintMuscle(muscle: BlueprintMuscle): BlueprintMuscle {
  // Repair inverted stroke bounds from imported / legacy blueprints so every
  // downstream consumer (rate limits, wave previews, clamps) can assume
  // minLength ≤ maxLength.
  if (muscle.minLength > muscle.maxLength) {
    muscle = {
      ...muscle,
      minLength: muscle.maxLength,
      maxLength: muscle.minLength,
    };
  }
  const kind =
    muscle.linkKind === 'telescope'
      ? 'piston'
      : muscle.linkKind === 'muscle' ||
          muscle.linkKind === 'bone' ||
          muscle.linkKind === 'piston'
        ? muscle.linkKind
        : undefined;
  // NOTE: fields that do not apply to a link kind are *deleted*, not written
  // as explicit `undefined` keys — JSON persistence drops undefined keys, so
  // explicit-undefined writes made normalized blueprints deep-compare unequal
  // to their saved round-trips and to authored templates.
  if (kind === 'piston' || muscle.linkKind === 'telescope') {
    const seeded = defaultPistonRatesForStroke(muscle.minLength, muscle.maxLength);
    const next = stripMuscleLevers({
      ...muscle,
      linkKind: 'piston',
      strength: 1.0,
      extendRate: clampPistonRate(muscle.extendRate ?? seeded.extendRate),
      retractRate: clampPistonRate(muscle.retractRate ?? seeded.retractRate),
    });
    delete next.softMaxDeltaPerTick;
    return next;
  }
  if (kind === 'bone') {
    const next = stripMuscleLevers({ ...muscle, linkKind: 'bone' });
    delete next.extendRate;
    delete next.retractRate;
    delete next.softMaxDeltaPerTick;
    return next;
  }
  if (kind === 'muscle') {
    const softCap =
      typeof muscle.softMaxDeltaPerTick === 'number' && Number.isFinite(muscle.softMaxDeltaPerTick)
        ? muscle.softMaxDeltaPerTick <= 0
          ? 0
          : clampSoftMuscleRate(muscle.softMaxDeltaPerTick)
        : undefined;
    const next = normalizeSoftMuscleLevers({ ...muscle, linkKind: 'muscle' });
    delete next.extendRate;
    delete next.retractRate;
    if (softCap !== undefined) next.softMaxDeltaPerTick = softCap;
    else delete next.softMaxDeltaPerTick;
    return next;
  }
  // Infer without rewriting linkKind when omitted — resolveLinkKind handles it.
  if (resolveLinkKind(muscle) !== 'muscle') return stripMuscleLevers(muscle);
  return normalizeSoftMuscleLevers(muscle);
}

/** Normalize blueprint muscles + optional soft body rate cap. */
export function normalizeCreatureBlueprint(blueprint: CreatureBlueprint): CreatureBlueprint {
  const softBody =
    typeof blueprint.softMuscleMaxDeltaPerTick === 'number' &&
    Number.isFinite(blueprint.softMuscleMaxDeltaPerTick) &&
    blueprint.softMuscleMaxDeltaPerTick > 0
      ? clampSoftMuscleRate(blueprint.softMuscleMaxDeltaPerTick)
      : undefined;
  const next: CreatureBlueprint = {
    ...blueprint,
    muscles: sanitizeMuscleLevers(blueprint.muscles.map(normalizeBlueprintMuscle)),
  };
  if (softBody !== undefined) next.softMuscleMaxDeltaPerTick = softBody;
  else delete next.softMuscleMaxDeltaPerTick;
  return next;
}

export function resolveLinkKind(muscle: LinkKindFields): MuscleLinkKind {
  if (muscle.linkKind === 'telescope') return 'piston';
  if (
    muscle.linkKind === 'muscle' ||
    muscle.linkKind === 'bone' ||
    muscle.linkKind === 'piston'
  ) {
    return muscle.linkKind;
  }
  // Fixed span is always a solid bone.
  if (muscle.minLength === muscle.maxLength) return 'bone';
  // Legacy near-max strength with a length *range* used to be inferred as a
  // frozen bone, which silently killed hard struts that lost `linkKind`
  // (they ship strength 1.0). Treat variable + stiff as a piston.
  if (muscle.strength >= 0.98) return 'piston';
  return 'muscle';
}

/** Fixed-length solid bone (not a piston). */
export function isRigidBone(muscle: LinkKindFields): boolean {
  return resolveLinkKind(muscle) === 'bone';
}

/**
 * @deprecated D150 — telescope collapsed into piston. Always false after
 * normalize; kept so older call sites compile during migration.
 */
export function isTelescope(_muscle: LinkKindFields): boolean {
  return false;
}

/** Authorable-rate prismatic hard strut. */
export function isPiston(muscle: LinkKindFields): boolean {
  return resolveLinkKind(muscle) === 'piston';
}

/** Variable-length hard strut (piston; legacy telescope normalizes to piston). */
export function isVariableHardLink(muscle: LinkKindFields): boolean {
  return resolveLinkKind(muscle) === 'piston';
}

/** Hard distance constraint (fixed bone or piston) for capsule collision. */
export function isHardLengthConstraint(muscle: LinkKindFields): boolean {
  const kind = resolveLinkKind(muscle);
  return kind === 'bone' || kind === 'piston';
}

export function sameUnorderedNodePair(
  a: Pick<PhysicsMuscle, 'nodeA' | 'nodeB'>,
  b: Pick<PhysicsMuscle, 'nodeA' | 'nodeB'>
): boolean {
  return (
    (a.nodeA === b.nodeA && a.nodeB === b.nodeB) ||
    (a.nodeA === b.nodeB && a.nodeB === b.nodeA)
  );
}

export function findParallelSoftMuscle<T extends BrainDrivenFields>(
  hard: T,
  muscles: T[]
): T | undefined {
  return muscles.find(
    m =>
      m.id !== hard.id &&
      sameUnorderedNodePair(m, hard) &&
      resolveLinkKind(m) === 'muscle' &&
      !muscleHasLever(m)
  );
}

export function findParallelHardLink<T extends BrainDrivenFields>(
  soft: T,
  muscles: T[]
): T | undefined {
  // Levered soft muscles are a separate topology — never slave a hard link to them.
  if (muscleHasLever(soft)) return undefined;
  return muscles.find(
    m => m.id !== soft.id && sameUnorderedNodePair(m, soft) && isHardLengthConstraint(m)
  );
}

/** Hard link whose length is driven by a parallel soft muscle (no own action). */
export function isHardLengthSlave<T extends BrainDrivenFields>(
  muscle: T,
  muscles: T[]
): boolean {
  return isHardLengthConstraint(muscle) && !!findParallelSoftMuscle(muscle, muscles);
}

/**
 * Actuator that consumes a genome output. Parachutes stay flexible but inflate
 * passively. Fixed bones never drive. Pistons drive unless a parallel soft
 * muscle on the same node pair owns the action.
 */
export function isBrainDrivenMuscle(
  muscle: BrainDrivenFields,
  muscles?: BrainDrivenFields[]
): boolean {
  if (muscle.aeroType === 'parachute') return false;
  const kind = resolveLinkKind(muscle);
  if (kind === 'bone') return false;
  if (kind === 'piston') {
    if (muscles && findParallelSoftMuscle(muscle, muscles)) return false;
    return true;
  }
  return true;
}

/** Brain-driven soft muscles and lone pistons (excludes bones, parachutes, hard slaves). */
export function countFlexibleMuscles(muscles: BrainDrivenFields[]): number {
  return muscles.reduce((n, m) => n + (isBrainDrivenMuscle(m, muscles) ? 1 : 0), 0);
}

/** Motor wheels each consume one brain output (−1…1 drive). */
export function countMotorWheels(
  nodes: Pick<{ isMotorWheel?: boolean }, 'isMotorWheel'>[]
): number {
  return nodes.reduce((n, node) => n + (node.isMotorWheel ? 1 : 0), 0);
}

/** Default drive strength when motorPower is unset (world px/tick). */
export const DEFAULT_MOTOR_POWER = 0.45;
/**
 * Studio slider / blueprint clamp for motor wheel drive strength.
 * World units (legacy authoring max was 20).
 */
export const MAX_MOTOR_POWER = 2.0;
export const MIN_MOTOR_POWER = 0.05;
export const MOTOR_POWER_STEP = 0.05;

/**
 * Node mass clamps in world units (legacy 0.5–5.0 × CREATURE_WORLD_SCALE³).
 * Typical template nodes are ~0.0015.
 */
export const MIN_NODE_MASS = 0.0005;
export const MAX_NODE_MASS = 0.005;
export const DEFAULT_NODE_MASS = 0.0015;
export const NODE_MASS_STEP = 0.0001;

/** Collider radius clamps in world px (typical nodes 1–2; wheels up to ~5). */
export const MIN_NODE_RADIUS = 1;
export const MAX_NODE_RADIUS = 5;
export const DEFAULT_NODE_RADIUS = 1;

/** Default / clamp for wing, paraglider, and parachute area (world px²). */
export const DEFAULT_AERO_AREA = 4;
export const DEFAULT_PARACHUTE_AREA = 9;
export const MIN_AERO_AREA = 0.5;
export const MAX_AERO_AREA = 16;
export const AERO_AREA_STEP = 0.5;

/** Studio clamp for muscle / telescope compression & expansion extremes (world px). */
export const MIN_LINK_LENGTH = 1;
export const MAX_LINK_LENGTH = 50;

/** Default resting length for new muscle / telescope / piston links (50% of max). */
export function restingLengthFromMaxExpansion(maxLength: number): number {
  return Math.round(maxLength * 0.5);
}

/** Clamp authored resting length into [minLength, maxLength]. */
export function clampRestingLength(
  value: number,
  minLength: number,
  maxLength: number,
): number {
  const lo = Math.min(minLength, maxLength);
  const hi = Math.max(minLength, maxLength);
  return Math.max(lo, Math.min(hi, Math.round(value)));
}

export function clampLinkLength(value: number): number {
  return Math.max(MIN_LINK_LENGTH, Math.min(MAX_LINK_LENGTH, Math.round(value)));
}

export function clampNodeMass(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_NODE_MASS;
  return Math.max(MIN_NODE_MASS, Math.min(MAX_NODE_MASS, value));
}

export function clampNodeRadius(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_NODE_RADIUS;
  return Math.max(MIN_NODE_RADIUS, Math.min(MAX_NODE_RADIUS, Math.round(value)));
}

export function clampMotorPower(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MOTOR_POWER;
  return Math.max(MIN_MOTOR_POWER, Math.min(MAX_MOTOR_POWER, value));
}

export function clampAeroArea(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AERO_AREA;
  return Math.max(MIN_AERO_AREA, Math.min(MAX_AERO_AREA, value));
}

export function effectiveAeroArea(
  muscle: Pick<PhysicsMuscle, 'aeroArea' | 'originalLength' | 'thickness' | 'aeroType'>
): number {
  if (muscle.aeroArea !== undefined && !Number.isNaN(muscle.aeroArea)) {
    return Math.max(MIN_AERO_AREA, Math.min(MAX_AERO_AREA, muscle.aeroArea));
  }
  const fromGeom = muscle.originalLength * (muscle.thickness ?? 1) * 0.45;
  const boost =
    muscle.aeroType === 'paraglider' ? 1.35 : muscle.aeroType === 'parachute' ? 1.6 : 1;
  return Math.max(MIN_AERO_AREA, Math.min(MAX_AERO_AREA, fromGeom * boost));
}

/**
 * Extra sensors for winged bodies (F06 / D078):
 * COM vx, COM vy, sinθ, cosθ, ω, ground clearance.
 */
export const FLIGHT_SENSOR_COUNT = 6;

/**
 * C1 object-relative pack (always present; zeros when no in-range private object):
 * relX, relY, proximity — see `objectRelativeSensorValues`.
 */
export const OBJECT_SENSOR_COUNT = 3;
/** Max COM→object centre distance (px) that yields a non-zero observation. */
export const OBJECT_SENSOR_RANGE_PX = 480;

/**
 * C2 contact summary pack (always present after the object pack):
 * anyNodeFloor, anyNodeStructure, anyNodeObject, linkStructure, linkObject.
 * See `contactSensorValues`. Per-node Touch channels also encode class.
 */
export const CONTACT_SENSOR_COUNT = 5;

/** Raise a node's contact class without clearing a higher-priority class. */
export function markNodeContact(node: PhysicsNode, cls: ContactClass): void {
  if (cls <= CONTACT_NONE) return;
  const prev = node.contactClass ?? CONTACT_NONE;
  if (cls > prev) node.contactClass = cls;
}

/** Encode contact class for one brain input: none=0, floor=1/3, structure=2/3, object=1. */
export function encodeContactClass(cls: ContactClass): number {
  if (cls <= CONTACT_NONE) return 0;
  return cls / CONTACT_OBJECT;
}

/**
 * Per-node Touch observation (C2).
 * Default: encoded contact class. Ablation strips class to floor-or-none from
 * `isGround` so locomotion still sees support but cannot discriminate surfaces.
 */
export function nodeContactSensorValue(
  node: PhysicsNode,
  ablateClass = false
): number {
  if (ablateClass) {
    return node.isGround ? encodeContactClass(CONTACT_FLOOR) : 0;
  }
  const cls = (node.contactClass ?? CONTACT_NONE) as ContactClass;
  if (cls > CONTACT_NONE) return encodeContactClass(cls);
  return node.isGround ? encodeContactClass(CONTACT_FLOOR) : 0;
}

/**
 * Bounded contact summary (D147 / C2). Observation only — never applies force.
 *
 * Contract:
 * - Indices 0–2: any node currently in floor / structure / object class.
 * - Indices 3–4: hard-link capsule structure / object contact this frame.
 * - Ablation zeros the pack (per-node channels separately fall back to floor).
 */
export function contactSensorValues(
  creature: Pick<
    Creature,
    'nodes' | 'linkContactStructure' | 'linkContactObject'
  >,
  ablate = false
): [number, number, number, number, number] {
  if (ablate) return [0, 0, 0, 0, 0];
  let floor = 0;
  let structure = 0;
  let object = 0;
  for (const node of creature.nodes) {
    const cls = node.contactClass ?? CONTACT_NONE;
    if (cls === CONTACT_FLOOR) floor = 1;
    else if (cls === CONTACT_STRUCTURE) structure = 1;
    else if (cls === CONTACT_OBJECT) object = 1;
    else if (node.isGround) floor = 1;
  }
  return [
    floor,
    structure,
    object,
    creature.linkContactStructure ? 1 : 0,
    creature.linkContactObject ? 1 : 0,
  ];
}

type ObjectSensorSample = Pick<WorldObject, 'type' | 'x' | 'y'>;

/**
 * Pick the goal's primary private interactive object for sensing.
 * Prefer a unique ball, else hoop, else nearest box/pin.
 */
export function selectObjectSensorTarget(
  objects: ReadonlyArray<ObjectSensorSample>,
  comX: number,
  comY: number
): ObjectSensorSample | null {
  if (objects.length === 0) return null;
  const nearest = (pool: ReadonlyArray<ObjectSensorSample>) => {
    let best: ObjectSensorSample | null = null;
    let bestDist = Infinity;
    for (const obj of pool) {
      const dist = Math.hypot(obj.x - comX, obj.y - comY);
      if (dist < bestDist) {
        bestDist = dist;
        best = obj;
      }
    }
    return best;
  };
  const balls = objects.filter(o => o.type === 'ball');
  if (balls.length === 1) return balls[0];
  if (balls.length > 1) return nearest(balls);
  const hoops = objects.filter(o => o.type === 'hoop');
  if (hoops.length > 0) return nearest(hoops);
  const boxes = objects.filter(o => o.type === 'box');
  if (boxes.length > 0) return nearest(boxes);
  return nearest(objects);
}

/**
 * Bounded object-relative observation toward the private goal object.
 *
 * Contract (D145 / C1):
 * - Range-limited: beyond `rangePx`, or with no target, returns `[0, 0, 0]`.
 * - In range: `[dx/R, dy/R, 1 − dist/R]` with each component in `[-1, 1]` /
 *   `[0, 1]` respectively (dx/dy from COM to object centre).
 * - Observation only — never applies force.
 */
export function objectRelativeSensorValues(
  comX: number,
  comY: number,
  objects: ReadonlyArray<ObjectSensorSample>,
  rangePx: number = OBJECT_SENSOR_RANGE_PX
): [number, number, number] {
  const range = Math.max(1, rangePx);
  const target = selectObjectSensorTarget(objects, comX, comY);
  if (!target) return [0, 0, 0];
  const dx = target.x - comX;
  const dy = target.y - comY;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return [0, 0, 0];
  return [
    Math.max(-1, Math.min(1, dx / range)),
    Math.max(-1, Math.min(1, dy / range)),
    Math.max(0, Math.min(1, 1 - dist / range)),
  ];
}

/** Expected NEAT I/O sizes for a body blueprint. */
export function genomeIOForBlueprint(blueprint: CreatureBlueprint): { inputs: number; outputs: number } {
  const hasPara = blueprint.muscles.some(m => m.aeroType === 'paraglider');
  const hasWing = blueprint.muscles.some(m => m.aeroType === 'wing');
  return {
    // +5 para: speed, openness, sink, distToRamp, onRamp
    // +6 wing: vx, vy, sinθ, cosθ, ω, clearance (F06)
    // +3 object: relX, relY, proximity (C1 / D145) — always present
    // +5 contact: node floor/structure/object + link structure/object (C2 / D147)
    // Per-node Touch slot encodes contact class (same count as pre-C2 binary touch).
    inputs:
      2 +
      3 * blueprint.nodes.length +
      (hasWing ? FLIGHT_SENSOR_COUNT : 0) +
      (hasPara ? 5 : 0) +
      OBJECT_SENSOR_COUNT +
      CONTACT_SENSOR_COUNT,
    outputs: countFlexibleMuscles(blueprint.muscles) + countMotorWheels(blueprint.nodes),
  };
}

export function genomeMatchesBlueprint(genome: Genome, blueprint: CreatureBlueprint): boolean {
  const expected = genomeIOForBlueprint(blueprint);
  const inputs = genome.nodes.filter(n => n.type === 'input').length;
  const outputs = genome.nodes.filter(n => n.type === 'output').length;
  return inputs === expected.inputs && outputs === expected.outputs;
}
