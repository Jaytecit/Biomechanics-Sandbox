/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PhysicsNode,
  PhysicsMuscle,
  Obstacle,
  Creature,
  EvolutionGoal,
  SimulationConfig,
  WorldObject,
  CustomGoalConfig,
  CustomGoalRule,
  isHardLengthConstraint,
  isRigidBone,
  isBrainDrivenMuscle,
  isVariableHardLink,
  isPiston,
  isHardLengthSlave,
  findParallelSoftMuscle,
  resolveLinkKind,
  pistonRates,
  DEFAULT_MOTOR_POWER,
  isIsolatedJumpGoal,
} from './types';
import { evaluateGenome } from './neat';
import {
  buildRuntimeSolidBodies,
  isLinkWhollyInsideSolid,
  projectSolidBodies,
} from './solidSegments';
import {
  creatureHasHingeStops,
  projectHingeStops,
} from './hingeStops';
import type { RuntimeSolidBody } from './types';
import {
  GROUND_Y,
  WORLD_GRAVITY,
  LENGTH_ACTUATION_EPS_PX,
  RELAXATION_ITERATIONS,
  GAIT_HISTORY_LENGTH,
  telescopeCommandDeltaBudget,
  STAIR_STEP_WIDTH,
  STAIR_STEP_HEIGHT,
  STAIR_AHEAD_STEPS,
  OBSTACLE_COLLISION_PASSES,
  COLLISION_SWEEP_STEP,
  AGENT_SPAWN_X,
  ARENA_SCREEN_WIDTH,
  COURSE_START_X,
  TYPICAL_NODE_RADIUS,
  clampDifficulty,
  scaleW,
  scaleD,
  JUMP_LAND_RETURN_TOLERANCE,
  WALK_MAX_CONTACT_POINTS,
  WALK_STRIDE_MIN_PROGRESS,
  WALK_SWING_MIN_FRAMES,
  WALK_STEP_MIN_INTERVAL,
  WALK_STEP_POINTS,
  WALK_ALTERNATE_BONUS,
  SHUFFLE_OSC_WEIGHT,
  HOP_CHAIN_GROUND_MAX,
  JUMP_MIN_CLEARANCE,
  JUMP_MIN_FRAMES,
  measureNodeExtents,
  flightRewardMinClearance,
  jumpRewardMinClearance,
  jumpLandMinHeight,
  flightLandCeiling,
  glideCorridorBand,
  FLIGHT_MIN_CLEARANCE_FLOOR,
} from './physicsConstants';
import {
  buildGoalArena,
  buildGoalWorldObjects,
  applyArenaModifiers,
  progressiveFactor,
  FINISH_LINE_X,
  makeFinish,
} from './arenas';
import {
  buildHoopTerrain,
  hasTerrain,
  sampleTerrainHeight,
  extendEndlessTerrain,
  hoopFinishX,
  snapObstaclesToTerrain,
} from './terrain';
import { applyWingForces, applyParagliderForces, applyParachuteForces, sailOpenness, hasParaglider, hasWing, hasParachute } from './aero';
import {
  evaluateParaPilotOutputs,
  updateParaPhaseGates,
  isParaRampGoal,
  paraRampFitness,
  paraRampAirBoutScore,
  findTakeoffRamp,
} from './paraPilot';
import { cloneGenome } from './neat';
import { createParaPilot } from './types';
import { closestPointOnSegment } from './canonicalGeometry';
import { normalizeSeed, seededRandom } from './determinism';

export {
  GROUND_Y,
  WORLD_GRAVITY,
  RELAXATION_ITERATIONS,
  GAIT_HISTORY_LENGTH,
  STAIR_STEP_WIDTH,
  STAIR_STEP_HEIGHT,
  STAIR_AHEAD_STEPS,
  OBSTACLE_COLLISION_PASSES,
  AGENT_SPAWN_X,
  ARENA_SCREEN_WIDTH,
  COURSE_START_X,
  extendEndlessTerrain,
  hasTerrain,
  clampDifficulty,
};

interface ContactObstacleSets {
  terrainActive: boolean;
  solid: Obstacle[];
  rigidCapsule: Obstacle[];
  pits: Obstacle[];
  ramps: Obstacle[];
  iterative: Obstacle[];
}

interface ContactObstacleCacheEntry {
  length: number;
  normal?: ContactObstacleSets;
  hoop?: ContactObstacleSets;
}

const contactObstacleCache = new WeakMap<
  Obstacle[],
  ContactObstacleCacheEntry
>();

function contactObstacleSets(
  obstacles: Obstacle[],
  useHoop: boolean
): ContactObstacleSets {
  let entry = contactObstacleCache.get(obstacles);
  // Endless terrain extends its obstacle array in place. Length invalidation
  // keeps that case correct while ordinary static scenes reuse their layout.
  if (!entry || entry.length !== obstacles.length) {
    entry = { length: obstacles.length };
    contactObstacleCache.set(obstacles, entry);
  }
  const cached = useHoop ? entry.hoop : entry.normal;
  if (cached) return cached;

  const solid = obstacles
    .filter(
      obstacle =>
        obstacle.type !== 'ice' &&
        obstacle.type !== 'bar' &&
        obstacle.type !== 'pit' &&
        obstacle.type !== 'finish' &&
        obstacle.type !== 'checkpoint' &&
        obstacle.type !== 'target' &&
        obstacle.type !== 'terrain' &&
        // Inside a hoop, only collide rocks/boulders as external solids.
        !(useHoop && obstacle.type !== 'box')
    )
    .slice()
    .sort((a, b) => a.y - b.y);
  const sets: ContactObstacleSets = {
    terrainActive: hasTerrain(obstacles),
    solid,
    rigidCapsule: solid.filter(
      obstacle =>
        obstacle.type === 'box' ||
        obstacle.type === 'stair' ||
        obstacle.type === 'ramp'
    ),
    pits: obstacles.filter(obstacle => obstacle.type === 'pit'),
    ramps: solid.filter(obstacle => obstacle.type === 'ramp'),
    iterative: solid.filter(obstacle => obstacle.type !== 'ramp'),
  };
  if (useHoop) entry.hoop = sets;
  else entry.normal = sets;
  return sets;
}

/**
 * Capture freestream velocity for aero **before** muscle constraint projection.
 * Velocity is (x − oldX) / PHYSICS_DT with PHYSICS_DT ≡ 1. Constraint solves
 * move `x` without updating `oldX`, which would otherwise invent airspeed.
 */
export function snapshotAeroVelocities(nodes: PhysicsNode[]) {
  for (const node of nodes) {
    node.aeroVx = node.x - node.oldX;
    node.aeroVy = node.y - node.oldY;
  }
}

/**
 * Clamp commanded length change for hard variable struts / hard slaves
 * (px per tick). Telescopes use the global stroke-relative budget; pistons
 * use authored extend/retract rates.
 */
function rateLimitHardLengthTarget(
  muscle: PhysicsMuscle,
  desired: number
): number {
  const clamped = Math.max(muscle.minLength, Math.min(muscle.maxLength, desired));
  // Soft springs are not rate-limited.
  if (resolveLinkKind(muscle) === 'muscle' && !isHardLengthConstraint(muscle)) {
    return clamped;
  }
  if (!isHardLengthConstraint(muscle)) return clamped;
  const prev = muscle.targetLength;
  let maxDelta: number;
  if (isPiston(muscle)) {
    const rates = pistonRates(muscle);
    maxDelta = clamped >= prev ? rates.extendRate : rates.retractRate;
  } else {
    maxDelta = telescopeCommandDeltaBudget(muscle.minLength, muscle.maxLength);
  }
  return Math.max(prev - maxDelta, Math.min(prev + maxDelta, clamped));
}

/**
 * Initializes the physics state of a creature from its blueprint and starting coordinates.
 * When `goal` is provided, each agent gets its own ball/crate copies so the pack cannot
 * contaminate each other's object-manipulation scores.
 */
export function spawnCreature(
  creature: Omit<
    Creature,
    | 'nodes'
    | 'muscles'
    | 'startX'
    | 'startY'
    | 'highestY'
    | 'currentX'
    | 'currentY'
    | 'fitness'
    | 'isAlive'
    | 'uprightFrames'
    | 'gaitHistory'
    | 'peakSpeed'
    | 'peakLandSpeed'
    | 'currentSpeed'
    | 'airbornePeakHeight'
    | 'uprightLandingScore'
    | 'jumpTakeoffX'
    | 'clearedBar'
    | 'stairPeakHeight'
    | 'rampPeakHeight'
    | 'obstacleClimbMountCount'
    | 'obstacleClimbSupportedHeight'
    | 'obstacleClimbSupportedX'
    | 'obstacleClimbCandidateOrder'
    | 'obstacleClimbCandidateFrames'
    | 'privateWorld'
    | 'episodeFrames'
    | 'fellInPit'
    | 'gapCleared'
    | 'crossedFinish'
    | 'finishFrame'
    | 'checkpointReached'
    | 'loopProgress'
    | 'loopCompleted'
    | 'loopLastAngle'
    | 'loopAngleAccum'
    | 'wheelLandScore'
    | 'hurdlesCleared'
    | 'hurdlesHitMask'
    | 'parkingFrames'
    | 'targetHits'
    | 'targetHitMask'
    | 'goalScored'
    | 'pinsDown'
    | 'hoopTravel'
    | 'hoopOutsideFrames'
    | 'hoopGroundedTravel'
    | 'hoopLoftFrames'
    | 'hoopPeakLoft'
    | 'flightFrames'
    | 'flightDistance'
    | 'flightPeakClearance'
    | 'flightHeightIntegral'
    | 'sailReefedSpeedPeak'
    | 'sailDeploySpeed'
    | 'sailOpenGlideDist'
    | 'sailEarlyOpenFrames'
    | 'sailPrevOpenness'
    | 'flightStreak'
    | 'flightLongestStreak'
    | 'glideCorridorFrames'
    | 'glideCorridorDist'
    | 'paraPhase'
    | 'paraBlendFrames'
    | 'paraBlendFrom'
    | 'paraDeployAirFrames'
    | 'paraLaunchSpeed'
    | 'paraLaunchHeight'
    | 'paraPeakX'
  >,
  spawnX: number,
  spawnY: number,
  goal?: EvolutionGoal,
  difficulty = 1
): Creature {
  const { blueprint } = creature;
  const nodes: PhysicsNode[] = blueprint.nodes.map((n, idx) => {
    const relPos = blueprint.relativePositions[idx] || { x: 0, y: 0 };
    const x = spawnX + relPos.x;
    const y = spawnY + relPos.y;
    const isMotorWheel = !!n.isMotorWheel;
    return {
      ...n,
      isWheel: !!(n.isWheel || isMotorWheel),
      isMotorWheel,
      motorPower: isMotorWheel ? (n.motorPower ?? DEFAULT_MOTOR_POWER) : n.motorPower,
      isFoot: !!n.isFoot && !(n.isWheel || isMotorWheel),
      isHingeStop: !!n.isHingeStop,
      x,
      y,
      oldX: x,
      oldY: y,
      vx: 0,
      vy: 0,
      isGround: false,
      spinAngle: 0,
    };
  });

  const muscles: PhysicsMuscle[] = blueprint.muscles.map(m => ({
    ...m,
    targetLength: m.originalLength,
    _constraintTargetSeen: m.originalLength,
  }));

  const solidBodies = buildRuntimeSolidBodies(blueprint.solidSegments, nodes);

  let totalX = 0;
  let totalY = 0;
  for (const n of nodes) {
    totalX += n.x;
    totalY += n.y;
  }
  let startX = totalX / nodes.length;
  let startY = totalY / nodes.length;

  const privateWorld = goal ? buildGoalWorldObjects(goal, blueprint, difficulty) : [];

  // Hamster hoop: center the creature inside the hoop resting on flat spawn pad
  if (goal === EvolutionGoal.MOTOR_LOOP) {
    const hoop = privateWorld.find(o => o.type === 'hoop');
    if (hoop) {
      const dx = hoop.x - startX;
      const dy = hoop.y - startY;
      for (const n of nodes) {
        n.x += dx;
        n.y += dy;
        n.oldX = n.x;
        n.oldY = n.y;
      }
      startX = hoop.x;
      startY = hoop.y;
    }
  }

  // Cliff Launch removed (D060) — Para Ramp uses grounded spawn on the runway.

  const skipGroundPlant = goal === EvolutionGoal.MOTOR_LOOP;
  settleSpawnOnGround(
    nodes,
    muscles,
    solidBodies.length > 0 ? solidBodies : undefined,
    skipGroundPlant
  );

  totalX = 0;
  totalY = 0;
  for (const n of nodes) {
    totalX += n.x;
    totalY += n.y;
  }
  startX = totalX / nodes.length;
  startY = totalY / nodes.length;

  const restExtents = measureNodeExtents(nodes);

  const paraPilot =
    goal === EvolutionGoal.PARA_RAMP_GLIDE && hasParaglider({ muscles: blueprint.muscles })
      ? creature.paraPilot ?? createParaPilot(creature.genome, cloneGenome)
      : creature.paraPilot;

  return {
    ...creature,
    paraPilot,
    paraPhase: paraPilot ? ('runUp' as const) : undefined,
    paraBlendFrames: 0,
    paraBlendFrom: undefined,
    paraDeployAirFrames: 0,
    paraLaunchSpeed: 0,
    paraLaunchHeight: 0,
    paraPeakX: startX,
    nodes,
    muscles,
    solidBodies: solidBodies.length > 0 ? solidBodies : undefined,
    startX,
    startY,
    restBodyHeight: restExtents.height,
    restBodyWidth: restExtents.width,
    highestY: startY,
    currentX: startX,
    currentY: startY,
    fitness: 0,
    isAlive: true,
    uprightFrames: 0,
    stayTallIntegral: 0,
    stayTallSupportedFrames: 0,
    stayTallFallFrames: 0,
    peakSpeed: 0,
    peakLandSpeed: 0,
    currentSpeed: 0,
    airbornePeakHeight: 0,
    uprightLandingScore: 0,
    jumpTakeoffX: undefined,
    jumpHangBoutFrames: 0,
    jumpHangBoutPeakClearance: 0,
    jumpHangBestBoutScore: 0,
    walkGaitNodeIds: [],
    walkPrevGrounded: nodes.map(() => false),
    walkPlantFrontierX: undefined,
    walkBodyFrontierX: undefined,
    walkStrideDistanceRight: 0,
    walkStrideDistanceLeft: 0,
    walkStepCountRight: 0,
    walkStepCountLeft: 0,
    walkAlternateStepCountRight: 0,
    walkAlternateStepCountLeft: 0,
    walkStepScoreRight: 0,
    walkStepScoreLeft: 0,
    walkLastStepNodeId: undefined,
    walkLastStepFrame: undefined,
    walkNodeAirFrames: nodes.map(() => 0),
    shuffleOscDistanceRight: 0,
    shuffleOscDistanceLeft: 0,
    shufflePlantFrontierX: undefined,
    shuffleBodyFrontierX: undefined,
    groundedStreak: 0,
    hadAerialBout: false,
    aerialBoutIsHop: false,
    aerialBoutPeakLowestClearance: 0,
    aerialBoutPeakSpeed: 0,
    jumpHeightBestClearance: 0,
    jumpSpeedBestBoutScore: 0,
    hopDistanceRight: 0,
    hopDistanceLeft: 0,
    hopPeakSpeed: 0,
    hopBoutCount: 0,
    lastIsolatedJumpSnapshot: undefined,
    clearedBar: false,
    stairPeakHeight: 0,
    rampPeakHeight: 0,
    obstacleClimbMountCount: 0,
    obstacleClimbSupportedHeight: 0,
    obstacleClimbSupportedX: startX,
    obstacleClimbCandidateOrder: undefined,
    obstacleClimbCandidateFrames: 0,
    beamSupportedFrames: 0,
    beamSupportedDistance: 0,
    beamSupportedPosture: 0,
    beamContactActive: false,
    beamLastSupportedX: undefined,
    beamCompleted: false,
    bridgeSupportedFrames: 0,
    bridgeSupportedDistance: 0,
    bridgeContactActive: false,
    bridgeLastSupportedX: undefined,
    bridgeCompleted: false,
    episodeFrames: 0,
    fellInPit: false,
    gapCleared: false,
    aerialCrossingLanded: false,
    crossedFinish: false,
    finishFrame: undefined,
    checkpointReached: -1,
    roughSupportedDistance: 0,
    roughSupportedX: startX,
    technicalSupportedDistance: 0,
    technicalSupportedX: startX,
    hoopTravel: 0,
    hoopOutsideFrames: 0,
    hoopGroundedTravel: 0,
    hoopLoftFrames: 0,
    hoopPeakLoft: 0,
    loopProgress: 0,
    loopCompleted: false,
    loopLastAngle: undefined,
    loopAngleAccum: 0,
    wheelLandScore: 0,
    hurdlesCleared: 0,
    hurdlesHitMask: 0,
    parkingFrames: 0,
    targetHits: 0,
    targetHitMask: 0,
    goalScored: false,
    ballCreatureContacted: false,
    pinsDown: 0,
    hazardProgressCount: 0,
    hazardProgressX: startX,
    hazardUprightProgress: 0,
    carryBallContactChainFrames: 0,
    carryBallBestContactChainFrames: 0,
    carryBallTransportDistance: 0,
    carryBallTransportPeakLift: 0,
    carryBallContactActive: false,
    carryBallLastX: undefined,
    carryBallLastY: undefined,
    flightFrames: 0,
    flightDistance: 0,
    flightDistanceLeft: 0,
    flightPeakClearance: 0,
    flightHeightIntegral: 0,
    flightTimeBoutFrames: 0,
    flightTimeBoutPeak: 0,
    flightTimeBoutIntegral: 0,
    flightTimeBoutFlapBase: 0,
    flightTimeBoutWorkBase: 0,
    flightTimeBoutSymBase: 0,
    flightTimeBoutSymQualityBase: 0,
    flightTimeBestBoutScore: 0,
    flightAirspeedBoutPeak: 0,
    flightAirspeedBoutFrames: 0,
    flightAirspeedBoutDist: 0,
    flightAirspeedBoutPeakClearance: 0,
    flightAirspeedBestBoutScore: 0,
    aerialCrossingBestShaping: 0,
    paraAirBestBoutScore: 0,
    peakAirSpeed: 0,
    bodyAngle: undefined,
    bodyOmega: 0,
    wingFlapFrames: 0,
    wingFlapWork: 0,
    wingSymFlapFrames: 0,
    wingSymFlapQuality: 0,
    airborneRotation: 0,
    flightLandScore: 0,
    landClimbScore: 0,
    landDescentScore: 0,
    landOvershootPenalty: 0,
    landReachedCeiling: false,
    landBeganDescent: false,
    sailReefedSpeedPeak: 0,
    sailDeploySpeed: 0,
    sailOpenGlideDist: 0,
    sailEarlyOpenFrames: 0,
    sailPrevOpenness: undefined,
    flightStreak: 0,
    flightLongestStreak: 0,
    glideCorridorFrames: 0,
    glideCorridorDist: 0,
    glideBoutFrames: 0,
    glideBoutDistance: 0,
    glideBoutHeightIntegral: 0,
    glideBoutPeakClearance: 0,
    glideBoutCorridorFrames: 0,
    glideBoutCorridorDist: 0,
    glideBoutOpenDist: 0,
    glideBoutTechniqueBonus: 0,
    glideBestBoutScore: 0,
    flightHeightBoutFrames: 0,
    flightHeightBoutPeak: 0,
    flightHeightBoutIntegral: 0,
    flightHeightBoutTakeoffClear: 0,
    flightHeightBoutPoweredClimb: 0,
    flightHeightBoutFlapBase: 0,
    flightHeightBoutWorkBase: 0,
    flightHeightBoutSymBase: 0,
    flightHeightBoutSymQualityBase: 0,
    flightHeightBoutPrevFlap: 0,
    flightHeightBestBoutScore: 0,
    attemptBoutFrames: 0,
    attemptBoutRight: 0,
    attemptBoutLeft: 0,
    attemptBoutPeakClearance: 0,
    attemptBoutRotation: 0,
    jumpRightBestBoutScore: 0,
    jumpLeftBestBoutScore: 0,
    flightRightBestBoutScore: 0,
    flightLeftBestBoutScore: 0,
    jumpAcrobaticsBestBoutScore: 0,
    flightAcrobaticsBestBoutScore: 0,
    flightLandBestBoutScore: 0,
    privateWorld,
    gaitHistory: muscles.map(() => []),
  };
}

export function createWorldObjects(goal: EvolutionGoal, difficulty = 1): WorldObject[] {
  return buildGoalWorldObjects(goal, undefined, difficulty);
}

function applyWind(nodes: PhysicsNode[], config: SimulationConfig, simTime: number) {
  if (!config.arena.windEnabled) return;
  const gust = 1 + 0.65 * Math.sin(simTime * 0.035) * Math.sin(simTime * 0.011);
  const force = config.arena.windStrength * gust;
  for (const node of nodes) {
    node.x += force / Math.max(0.4, node.mass);
  }
}

function collideNodeCircle(
  node: PhysicsNode,
  cx: number,
  cy: number,
  radius: number,
  pushOther?: { x: number; y: number; mass: number }
) {
  const dx = node.x - cx;
  const dy = node.y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
  const minDist = node.radius + radius;
  if (dist >= minDist) return false;

  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;
  const totalMass = node.mass + (pushOther?.mass ?? 1);
  const nodeShare = (pushOther?.mass ?? 1) / totalMass;
  const otherShare = node.mass / totalMass;

  node.x += nx * overlap * nodeShare;
  node.y += ny * overlap * nodeShare;
  if (pushOther) {
    pushOther.x -= nx * overlap * otherShare;
    pushOther.y -= ny * overlap * otherShare;
  }
  return true;
}

function resolveCircleAABBAt(
  node: PhysicsNode,
  px: number,
  py: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  friction: number,
  withFriction: boolean
): boolean {
  const inside = px >= left && px <= right && py >= top && py <= bottom;
  if (inside) {
    const target = [
      { distance: px - left, x: left - node.radius, y: py, nx: -1, ny: 0 },
      { distance: right - px, x: right + node.radius, y: py, nx: 1, ny: 0 },
      { distance: py - top, x: px, y: top - node.radius, nx: 0, ny: -1 },
      { distance: bottom - py, x: px, y: bottom + node.radius, nx: 0, ny: 1 },
    ].sort((a, b) => a.distance - b.distance)[0];
    node.x = target.x;
    node.y = target.y;
    if (target.ny < 0) {
      node.isGround = true;
      if (withFriction) applySurfaceFriction(node, friction);
    }
    if (target.nx !== 0) node.oldX = node.x;
    if (target.ny !== 0) node.oldY = node.y;
    return true;
  }

  const closestX = Math.max(left, Math.min(px, right));
  const closestY = Math.max(top, Math.min(py, bottom));
  const distVecX = px - closestX;
  const distVecY = py - closestY;
  const distance = Math.sqrt(distVecX * distVecX + distVecY * distVecY) || 0.001;

  if (distance >= node.radius) return false;

  const overlap = node.radius - distance;
  const pushX = (distVecX / distance) * overlap;
  const pushY = (distVecY / distance) * overlap;
  node.x = px + pushX;
  node.y = py + pushY;

  if (pushY < 0 && Math.abs(pushY) > Math.abs(pushX)) {
    node.isGround = true;
    if (withFriction) applySurfaceFriction(node, friction);
  }
  // Kill residual Verlet velocity into the solid to reduce multi-frame tunneling
  if (pushX !== 0 || pushY !== 0) {
    const into =
      (node.x - node.oldX) * (pushX !== 0 ? Math.sign(pushX) : 0) +
      (node.y - node.oldY) * (pushY !== 0 ? Math.sign(pushY) : 0);
    if (into < 0) {
      if (Math.abs(pushY) >= Math.abs(pushX)) node.oldY = node.y;
      if (Math.abs(pushX) >= Math.abs(pushY)) node.oldX = node.x;
    }
  }
  return true;
}

/**
 * Discrete + swept circle↔AABB. Fast motor carts previously tunneled through
 * thin hurdles/posts in a single frame when travel ≫ obstacle thickness.
 */
export function collideNodeAABB(
  node: PhysicsNode,
  left: number,
  top: number,
  right: number,
  bottom: number,
  friction: number,
  withFriction: boolean
) {
  if (
    Math.max(node.oldX, node.x) + node.radius < left ||
    Math.min(node.oldX, node.x) - node.radius > right ||
    Math.max(node.oldY, node.y) + node.radius < top ||
    Math.min(node.oldY, node.y) - node.radius > bottom
  ) {
    return false;
  }

  const travel = Math.hypot(node.x - node.oldX, node.y - node.oldY);
  const step = Math.max(2.5, Math.min(COLLISION_SWEEP_STEP, node.radius * 0.4));

  if (travel <= step) {
    return resolveCircleAABBAt(
      node,
      node.x,
      node.y,
      left,
      top,
      right,
      bottom,
      friction,
      withFriction
    );
  }

  const steps = Math.ceil(travel / step);
  const x0 = node.oldX;
  const y0 = node.oldY;
  const x1 = node.x;
  const y1 = node.y;

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    if (resolveCircleAABBAt(node, px, py, left, top, right, bottom, friction, withFriction)) {
      return true;
    }
  }
  node.x = x1;
  node.y = y1;
  return false;
}

/**
 * Swept circle contact against the ramp's vertical high end.
 *
 * The end cap must be resolved before the incline. A point approaching from the
 * right can be below the infinite slope line while still outside the triangle;
 * treating that as an incline hit projects it to the ramp top and creates a
 * large, artificial upward impulse. Preserve motion tangent to the wall so a
 * falling creature slides down the side instead of being stretched or launched.
 */
function collideNodeRampEndCap(node: PhysicsNode, obs: Obstacle): boolean {
  const wallX = obs.x + obs.width;
  const top = obs.y;
  const bottom = obs.y + obs.height;
  const x0 = node.oldX;
  const y0 = node.oldY;
  const x1 = node.x;
  const y1 = node.y;
  const vx = x1 - x0;
  const vy = y1 - y0;
  // The high end is one-sided. Nodes travelling up the incline must be allowed
  // to leave across the lip; treating that outward crossing as a hit catches
  // the wheel on the rounded corner and turns link correction into a launch.
  // The cap only blocks bodies that started on its exterior/right side.
  if (x0 < wallX && vx >= 0) return false;
  const candidates: number[] = [];
  const isCapContact = (t: number): boolean => {
    if (t < 0 || t > 1) return false;
    const px = x0 + vx * t;
    const py = y0 + vy * t;
    if (px < wallX) return false;
    const closestY = Math.max(top, Math.min(py, bottom));
    return Math.hypot(px - wallX, py - closestY) <= node.radius + 1e-7;
  };
  if (isCapContact(0)) candidates.push(0);

  // Contact with the straight portion of the vertical capsule is the
  // intersection of three linear intervals.
  let enter = 0;
  let exit = 1;
  const clipAtMost = (start: number, delta: number, limit: number): boolean => {
    if (Math.abs(delta) < 1e-9) return start <= limit;
    const crossing = (limit - start) / delta;
    if (delta > 0) exit = Math.min(exit, crossing);
    else enter = Math.max(enter, crossing);
    return enter <= exit + 1e-9;
  };
  if (
    clipAtMost(-x0, -vx, -wallX) &&
    clipAtMost(x0, vx, wallX + node.radius) &&
    clipAtMost(-y0, -vy, -top) &&
    clipAtMost(y0, vy, bottom) &&
    isCapContact(enter)
  ) {
    candidates.push(Math.max(0, enter));
  }

  // The top and bottom are circular caps. Solve the moving-point/circle
  // quadratic exactly, then validate against the one-sided vertical segment.
  const speedSquared = vx * vx + vy * vy;
  if (speedSquared > 1e-12) {
    for (const capY of [top, bottom]) {
      const relX = x0 - wallX;
      const relY = y0 - capY;
      const qb = 2 * (relX * vx + relY * vy);
      const qc = relX * relX + relY * relY - node.radius * node.radius;
      const discriminant = qb * qb - 4 * speedSquared * qc;
      if (discriminant < 0) continue;
      const root = (-qb - Math.sqrt(discriminant)) / (2 * speedSquared);
      if (isCapContact(root)) candidates.push(root);
    }
  }
  if (candidates.length === 0) return false;

  const t = Math.min(...candidates);
  const px = x0 + vx * t;
  const py = y0 + vy * t;
  const closestY = Math.max(top, Math.min(py, bottom));
  const dx = px - wallX;
  const dy = py - closestY;
  const distance = Math.hypot(dx, dy);
  const nx = distance > 1e-6 ? dx / distance : (x0 >= wallX ? 1 : -1);
  const ny = distance > 1e-6 ? dy / distance : 0;
  const overlap = node.radius - distance;
  const contactX = px + nx * overlap;
  const contactY = py + ny * overlap;
  const normalSpeed = vx * nx + vy * ny;
  const enteringSpeed = Math.min(0, normalSpeed);
  const slideVx = vx - enteringSpeed * nx;
  const slideVy = vy - enteringSpeed * ny;
  const remaining = 1 - t;

  node.x = contactX + slideVx * remaining;
  node.y = contactY + slideVy * remaining;
  node.oldX = node.x - slideVx;
  node.oldY = node.y - slideVy;
  return true;
}

/** Swept contact against the triangular solid ramp, including its high end cap. */
export function collideNodeRamp(
  node: PhysicsNode,
  obs: Obstacle,
  friction: number,
  withFriction: boolean
): boolean {
  // Broad phase: a fast agent that is already far beyond the course must not
  // pay O(travel / sweepStep) for every historical ramp on every contact pass.
  // Use the complete swept circle bounds so genuine one-frame crossings still
  // reach the narrow phase.
  if (
    Math.max(node.oldX, node.x) + node.radius < obs.x ||
    Math.min(node.oldX, node.x) - node.radius > obs.x + obs.width ||
    Math.max(node.oldY, node.y) + node.radius < obs.y ||
    Math.min(node.oldY, node.y) - node.radius > obs.y + obs.height
  ) {
    return false;
  }

  if (collideNodeRampEndCap(node, obs)) return true;

  const ax = obs.x;
  const ay = obs.y + obs.height;
  const dx = obs.width;
  const dy = -obs.height;
  const length = Math.hypot(dx, dy) || 1;
  const nx = dy / length;
  const ny = -dx / length;
  const x0 = node.oldX;
  const y0 = node.oldY;
  const x1 = node.x;
  const y1 = node.y;
  const vx = x1 - x0;
  const vy = y1 - y0;
  const lengthSquared = dx * dx + dy * dy;

  // Every incline condition is linear over the node's swept path: horizontal
  // ramp bounds, projection onto the finite segment, signed clearance from the
  // incline, and the authored ground limit. Clip their valid time intervals
  // instead of sampling the path at ~1.5 px increments.
  let enter = 0;
  let exit = 1;
  const clipAtMost = (start: number, delta: number, limit: number): boolean => {
    if (Math.abs(delta) < 1e-9) return start <= limit;
    const crossing = (limit - start) / delta;
    if (delta > 0) exit = Math.min(exit, crossing);
    else enter = Math.max(enter, crossing);
    return enter <= exit + 1e-9;
  };
  const projection0 = ((x0 - ax) * dx + (y0 - ay) * dy) / lengthSquared;
  const projectionDelta = (vx * dx + vy * dy) / lengthSquared;
  const signed0 = (x0 - ax) * nx + (y0 - ay) * ny;
  const signedDelta = vx * nx + vy * ny;
  const intersectsIncline =
    clipAtMost(-x0, -vx, -obs.x) &&
    clipAtMost(x0, vx, obs.x + obs.width) &&
    clipAtMost(-projection0, -projectionDelta, 0) &&
    clipAtMost(projection0, projectionDelta, 1) &&
    clipAtMost(signed0, signedDelta, node.radius - 1e-7) &&
    clipAtMost(y0, vy, GROUND_Y + node.radius);
  if (!intersectsIncline || exit < 0 || enter > 1) return false;

  // Keep forward travel while projecting vertically to the exact circle
  // offset of the slope. This avoids an artificial backward impulse at the
  // ground-to-ramp seam.
  const finalX = Math.max(obs.x, Math.min(obs.x + obs.width, x1));
  const progress = (finalX - obs.x) / obs.width;
  const surfaceY = obs.y + obs.height * (1 - progress);
  const verticalClearance = node.radius / Math.max(0.2, -ny);
  node.x = x1;
  node.y = Math.min(y1, surfaceY - verticalClearance);
  if (node.oldY > node.y) node.oldY = node.y;
  node.isGround = ny < -0.2;
  if (node.isGround && withFriction) applySurfaceFriction(node, friction);
  return true;
}

/** Vertical pit walls and top corners prevent lip tunnelling without filling the gap. */
export function collideNodePitLips(node: PhysicsNode, obstacles: Obstacle[]): boolean {
  let hit = false;
  for (const pit of obstacles) {
    if (pit.type !== 'pit') continue;
    for (const lipX of [pit.x, pit.x + pit.width]) {
      if (
        node.y + node.radius < GROUND_Y - 1 ||
        node.y - node.radius > GROUND_Y + pit.height
      ) continue;
      const closest = closestPointOnSegment(
        { x: node.x, y: node.y },
        { x: lipX, y: GROUND_Y },
        { x: lipX, y: GROUND_Y + pit.height }
      );
      const dx = node.x - closest.x;
      const dy = node.y - closest.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= node.radius) continue;
      const nx = distance > 1e-6 ? dx / distance : (node.oldX <= lipX ? -1 : 1);
      const ny = distance > 1e-6 ? dy / distance : 0;
      const push = node.radius - distance;
      node.x += nx * push;
      node.y += ny * push;
      if (Math.abs(nx) > 0.5) node.oldX = node.x;
      hit = true;
    }
  }
  return hit;
}

/**
 * Resolve pit lips and the authored pit bottom. Pits remain failure zones, but
 * their finite `height` is now physical rather than visual-only, preventing
 * failed creatures from falling without bound.
 */
export function collideNodePit(
  node: PhysicsNode,
  obstacles: Obstacle[],
  friction: number,
  withFriction: boolean
): boolean {
  let hit = collideNodePitLips(node, obstacles);
  for (const pit of obstacles) {
    if (pit.type !== 'pit') continue;
    if (node.x < pit.x || node.x > pit.x + pit.width) continue;

    const floorY = pit.y + pit.height;
    const foot = node.y + node.radius;
    if (foot < floorY) continue;

    node.y = floorY - node.radius;
    if (node.oldY > node.y) node.oldY = node.y;
    node.isGround = true;
    if (withFriction) applySurfaceFriction(node, friction);
    hit = true;
  }
  return hit;
}

/**
 * Rigid links have a slim physical capsule. Flexible muscles and all cosmetic
 * appearance remain non-solid. Corrections are distributed to the two endpoints.
 */
function collideRigidBoneRamp(
  a: PhysicsNode,
  b: PhysicsNode,
  radius: number,
  ramp: Obstacle
): boolean {
  const boneDx = b.x - a.x;
  const boneDy = b.y - a.y;
  const rampDx = ramp.width;
  const rampDy = -ramp.height;
  const rampLength = Math.hypot(rampDx, rampDy) || 1;
  const rampLengthSquared = rampDx * rampDx + rampDy * rampDy;
  const nx = rampDy / rampLength;
  const ny = -rampDx / rampLength;
  const rampAx = ramp.x;
  const rampAy = ramp.y + ramp.height;
  let enter = 0;
  let exit = 1;
  const clipAtMost = (start: number, delta: number, limit: number): boolean => {
    if (Math.abs(delta) < 1e-9) return start <= limit;
    const crossing = (limit - start) / delta;
    if (delta > 0) exit = Math.min(exit, crossing);
    else enter = Math.max(enter, crossing);
    return enter <= exit + 1e-9;
  };
  const projection0 =
    ((a.x - rampAx) * rampDx + (a.y - rampAy) * rampDy) /
    rampLengthSquared;
  const projectionDelta =
    (boneDx * rampDx + boneDy * rampDy) / rampLengthSquared;
  if (
    !clipAtMost(-a.x, -boneDx, -ramp.x) ||
    !clipAtMost(a.x, boneDx, ramp.x + ramp.width) ||
    !clipAtMost(-projection0, -projectionDelta, 0) ||
    !clipAtMost(projection0, projectionDelta, 1) ||
    !clipAtMost(a.y, boneDy, GROUND_Y + radius) ||
    exit < 0 ||
    enter > 1
  ) {
    return false;
  }

  const signed0 = (a.x - rampAx) * nx + (a.y - rampAy) * ny;
  const signedDelta = boneDx * nx + boneDy * ny;
  const t = Math.max(0, Math.min(1, signedDelta < 0 ? exit : enter));
  const signed = signed0 + signedDelta * t;
  if (signed >= radius) return false;

  const pointX = a.x + boneDx * t;
  const pointY = a.y + boneDy * t;
  const progress = (pointX - ramp.x) / ramp.width;
  const surfaceY = ramp.y + ramp.height * (1 - progress);
  const verticalClearance = radius / Math.max(0.2, -ny);
  const correctionY = surfaceY - verticalClearance - pointY;
  if (correctionY >= -1e-8) return false;

  const wa = 1 - t;
  const wb = t;
  const normalization = wa * wa + wb * wb;
  a.y += correctionY * wa / normalization;
  b.y += correctionY * wb / normalization;
  return true;
}

function collideRigidBoneCapsules(
  creature: Creature,
  solidObstacles: Obstacle[],
  pitObstacles: Obstacle[],
  friction: number
) {
  // Most goals have no obstacle that a rigid-link interior can contact. Avoid
  // subdividing every bone on every one of the five contact passes in that
  // overwhelmingly common case.
  if (solidObstacles.length === 0 && pitObstacles.length === 0) return;

  for (const muscle of creature.muscles) {
    if (!isHardLengthConstraint(muscle)) continue;
    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;
    const radius = Math.max(2, Math.min(a.radius, b.radius) * 0.32);
    const left = Math.min(a.x, b.x, a.oldX, b.oldX) - radius;
    const right = Math.max(a.x, b.x, a.oldX, b.oldX) + radius;
    const top = Math.min(a.y, b.y, a.oldY, b.oldY) - radius;
    const bottom = Math.max(a.y, b.y, a.oldY, b.oldY) + radius;
    let sampledSolids: Obstacle[] | undefined;
    for (const obstacle of solidObstacles) {
      if (
        right < obstacle.x ||
        left > obstacle.x + obstacle.width ||
        bottom < obstacle.y ||
        top > obstacle.y + obstacle.height
      ) {
        continue;
      }
      if (obstacle.type === 'ramp') {
        collideRigidBoneRamp(a, b, radius, obstacle);
      } else {
        (sampledSolids ??= []).push(obstacle);
      }
    }
    let relevantPits: Obstacle[] | undefined;
    for (const pit of pitObstacles) {
      if (
        right >= pit.x - radius &&
        left <= pit.x + pit.width + radius &&
        bottom >= GROUND_Y - radius &&
        top <= pit.y + pit.height + radius
      ) {
        (relevantPits ??= []).push(pit);
      }
    }
    if (!sampledSolids && !relevantPits) continue;

    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const samples = Math.max(1, Math.ceil(length / Math.max(4, radius * 1.25)));
    // Reuse one scratch node for this link. Complex bodies can otherwise create
    // tens of thousands of short-lived objects per simulation tick.
    const sample: PhysicsNode = {
      id: -1,
      x: 0,
      y: 0,
      oldX: 0,
      oldY: 0,
      vx: 0,
      vy: 0,
      mass: 0,
      radius,
      friction: 0,
      isGround: false,
    };
    for (let index = 1; index < samples; index += 1) {
      const t = index / samples;
      sample.x = a.x + (b.x - a.x) * t;
      sample.y = a.y + (b.y - a.y) * t;
      // Endpoint nodes already receive complete swept contact tests. Capsule
      // subdivision exists to prevent a long link's interior from resting
      // through a solid, so each interior point only needs a final-pose test.
      // Re-sweeping every sample nests spatial subdivision inside temporal
      // subdivision and explodes for long, fast rigid bodies near a ramp.
      sample.oldX = sample.x;
      sample.oldY = sample.y;
      sample.mass = a.mass * (1 - t) + b.mass * t;
      sample.friction = a.friction * (1 - t) + b.friction * t;
      sample.isGround = false;
      const beforeX = sample.x;
      const beforeY = sample.y;
      if (sampledSolids) {
        for (const obstacle of sampledSolids) {
          if (obstacle.type === 'box') {
            collideNodeAABB(sample, obstacle.x, obstacle.y, obstacle.x + obstacle.width, obstacle.y + obstacle.height, friction, false);
          } else if (obstacle.type === 'stair') {
            collideNodeStair(sample, obstacle, friction, false);
          }
        }
      }
      if (relevantPits) {
        collideNodePit(sample, relevantPits, friction, false);
      }
      const correctionX = sample.x - beforeX;
      const correctionY = sample.y - beforeY;
      if (Math.abs(correctionX) + Math.abs(correctionY) < 1e-8) continue;
      const wa = 1 - t;
      const wb = t;
      const normalization = wa * wa + wb * wb;
      a.x += correctionX * wa / normalization;
      a.y += correctionY * wa / normalization;
      b.x += correctionX * wb / normalization;
      b.y += correctionY * wb / normalization;
    }
  }
}

/**
 * Stairs collide as tread tops + riser faces (not full solid volumes).
 * Full AABB solids let fast agents tunnel in and get ejected through the staircase.
 */
export function collideNodeStair(
  node: PhysicsNode,
  obs: Obstacle,
  friction: number,
  withFriction: boolean
): boolean {
  const left = obs.x;
  const right = obs.x + obs.width;
  const top = obs.y;
  const radius = node.radius;
  const foot = node.y + radius;
  const prevFoot = node.oldY + radius;
  let hit = false;

  // --- Tread (top surface): one-way support from above ---
  const overTread = node.x + radius * 0.55 > left && node.x - radius * 0.55 < right;
  if (overTread) {
    const drop = Math.max(0, foot - prevFoot);
    const landingWindow = Math.max(16, radius + 10, drop + 6);
    const comingFromAbove = prevFoot <= top + 3;
    const restingOnTop = foot >= top && foot <= top + landingWindow && node.y < top + radius;
    if ((comingFromAbove && foot >= top && foot <= top + landingWindow) || restingOnTop) {
      node.y = top - radius;
      // Kill downward Verlet momentum so the next frame does not re-penetrate
      if (node.oldY > node.y) node.oldY = node.y;
      node.isGround = true;
      if (withFriction) applySurfaceFriction(node, friction);
      hit = true;
    }
  }

  // --- Riser (front face): only the step lip, not the entire buried column ---
  const riserBottom = Math.min(GROUND_Y, top + STAIR_STEP_HEIGHT + radius);
  const inRiserBand = node.y + radius > top + 1 && node.y - radius < riserBottom;
  if (inRiserBand) {
    const penetratingFace = node.x + radius > left && node.x < left + radius + 6;
    const fromLeft = node.oldX <= left + radius + 1;
    // Do not shove sideways while clearly standing on this tread
    const standingOnThisTread =
      node.isGround && node.x >= left && node.x <= right && Math.abs(foot - top) < 4;
    if (penetratingFace && fromLeft && !standingOnThisTread) {
      node.x = left - radius;
      hit = true;
    }
  }

  return hit;
}

/** Ride the centerline of a vertical loop (Hot-Wheels style). */
function collideNodeLoop(
  node: PhysicsNode,
  obs: Obstacle,
  friction: number,
  withFriction: boolean
): boolean {
  const cx = obs.x;
  const cy = obs.y;
  const R = obs.height;
  const tube = Math.max(14, obs.width);
  const dx = node.x - cx;
  const dy = node.y - cy;
  const dist = Math.hypot(dx, dy) || 0.001;
  if (Math.abs(dist - R) > tube + node.radius) return false;

  const nx = dx / dist;
  const ny = dy / dist;
  // Tangential unit (perpendicular)
  const tx = -ny;
  const ty = nx;
  const prevTx = (node.x - node.oldX) * tx + (node.y - node.oldY) * ty;

  node.x = cx + nx * R;
  node.y = cy + ny * R;
  // Preserve tangential Verlet velocity; kill radial penetration
  node.oldX = node.x - tx * prevTx;
  node.oldY = node.y - ty * prevTx;
  node.isGround = true;
  if (withFriction) applySurfaceFriction(node, friction * 0.35);
  return true;
}

function pitUnderNode(node: PhysicsNode, obstacles: Obstacle[]): Obstacle | undefined {
  for (const obs of obstacles) {
    if (obs.type !== 'pit') continue;
    if (node.x >= obs.x && node.x <= obs.x + obs.width) return obs;
  }
  return undefined;
}

function nodeOverPit(node: PhysicsNode, obstacles: Obstacle[]): boolean {
  return pitUnderNode(node, obstacles) !== undefined;
}

/** Count motor wheels resting on elevated box pads (Launch & Land target). */
function motorWheelsOnBoxPad(creature: Creature, obstacles: Obstacle[]): number {
  let count = 0;
  for (const node of creature.nodes) {
    if (!node.isMotorWheel || !node.isGround) continue;
    for (const obs of obstacles) {
      if (obs.type !== 'box') continue;
      if (node.x < obs.x - 1 || node.x > obs.x + obs.width + 1) continue;
      if (Math.abs(node.y + node.radius - obs.y) < 6) {
        count += 1;
        break;
      }
    }
  }
  return count;
}

/** Height of the stair/platform surface under a grounded node, else 0. */
function supportHeightUnderNode(node: PhysicsNode, obstacles: Obstacle[]): number {
  if (!node.isGround) return 0;
  let best = 0;
  for (const obs of obstacles) {
    if (obs.type !== 'stair' && obs.type !== 'box' && obs.type !== 'ramp') {
      continue;
    }
    if (obs.type === 'ramp') {
      if (node.x < obs.x || node.x > obs.x + obs.width) continue;
      const progress = (node.x - obs.x) / obs.width;
      const rampTopY = obs.y + obs.height * (1 - progress);
      if (Math.abs(node.y + node.radius - rampTopY) < 5) {
        best = Math.max(best, GROUND_Y - rampTopY);
      }
      continue;
    }
    if (node.x < obs.x - 1 || node.x > obs.x + obs.width + 1) continue;
    if (Math.abs(node.y + node.radius - obs.y) < 5) {
      best = Math.max(best, GROUND_Y - obs.y);
    }
  }
  // Flat ground counts as 0 support height for climb metrics
  return best;
}

const OBSTACLE_CLIMB_STABLE_SUPPORT_FRAMES = 3;

function nodeHasBoxTopSupport(node: PhysicsNode, box: Obstacle): boolean {
  if (!node.isGround || box.type !== 'box') return false;
  const horizontalOverlap =
    node.x + node.radius * 0.55 > box.x &&
    node.x - node.radius * 0.55 < box.x + box.width;
  return horizontalOverlap && Math.abs(node.y + node.radius - box.y) < 5;
}

/**
 * Records only stable support on the next authored obstacle top. The strict
 * order makes the count itself reconstructable provenance: count N proves
 * authored boxes 0..N-1 were mounted, while jumps and course bypasses score 0.
 */
function trackOrderedObstacleClimbMounts(
  creature: Creature,
  obstacles: Obstacle[]
): void {
  const expected = Math.max(0, creature.obstacleClimbMountCount ?? 0);
  const box = obstacles.find(
    obstacle =>
      obstacle.type === 'box' &&
      obstacle.climbOrder === expected
  );
  if (!box) {
    creature.obstacleClimbCandidateOrder = undefined;
    creature.obstacleClimbCandidateFrames = 0;
    return;
  }

  const supported = creature.nodes.some(node => nodeHasBoxTopSupport(node, box));
  if (!supported) {
    creature.obstacleClimbCandidateOrder = undefined;
    creature.obstacleClimbCandidateFrames = 0;
    return;
  }

  if (creature.obstacleClimbCandidateOrder !== expected) {
    creature.obstacleClimbCandidateOrder = expected;
    creature.obstacleClimbCandidateFrames = 1;
  } else {
    creature.obstacleClimbCandidateFrames =
      (creature.obstacleClimbCandidateFrames ?? 0) + 1;
  }

  if (
    (creature.obstacleClimbCandidateFrames ?? 0) <
    OBSTACLE_CLIMB_STABLE_SUPPORT_FRAMES
  ) {
    return;
  }

  creature.obstacleClimbMountCount = expected + 1;
  creature.obstacleClimbSupportedHeight = Math.max(
    creature.obstacleClimbSupportedHeight ?? 0,
    GROUND_Y - box.y
  );
  creature.obstacleClimbSupportedX = Math.max(
    creature.obstacleClimbSupportedX ?? creature.startX,
    box.x + box.width / 2
  );
  creature.obstacleClimbCandidateOrder = undefined;
  creature.obstacleClimbCandidateFrames = 0;
}

/** Grip damps horizontal velocity; wheels roll with light drag and update spin. */
function applySurfaceFriction(node: PhysicsNode, gripFriction: number) {
  const vx = node.x - node.oldX;
  if (node.isWheel) {
    // Passive rolling: keep nearly all horizontal momentum
    const rollDrag = 0.02;
    node.x = node.oldX + vx * (1 - rollDrag);
    node.oldY = node.y;
    node.spinAngle = (node.spinAngle ?? 0) - vx / Math.max(1, node.radius);
  } else {
    const grip = Math.min(1, Math.max(0, gripFriction));
    node.x = node.oldX + vx * (1 - grip);
    node.oldY = node.y;
  }
}

function groundYAt(obstacles: Obstacle[], x: number): number {
  return hasTerrain(obstacles) ? sampleTerrainHeight(obstacles, x) : GROUND_Y;
}

/** One-way support on heightfield segments. */
function collideNodeTerrain(
  node: PhysicsNode,
  obstacles: Obstacle[],
  friction: number,
  withFriction: boolean
) {
  if (nodeOverPit(node, obstacles)) return;
  const surface = sampleTerrainHeight(obstacles, node.x);
  if (node.y >= surface - node.radius) {
    node.y = surface - node.radius;
    if (node.oldY > node.y) node.oldY = node.y;
    node.isGround = true;
    if (withFriction) applySurfaceFriction(node, friction);
  }
}

function collideCircleAABB(
  cx: number,
  cy: number,
  radius: number,
  left: number,
  top: number,
  right: number,
  bottom: number
): { nx: number; ny: number; overlap: number } | null {
  const closestX = Math.max(left, Math.min(cx, right));
  const closestY = Math.max(top, Math.min(cy, bottom));
  const dx = cx - closestX;
  const dy = cy - closestY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
  if (dist >= radius) return null;
  return { nx: dx / dist, ny: dy / dist, overlap: radius - dist };
}

function stepWorldObject(
  obj: WorldObject,
  obstacles: Obstacle[],
  gravity: number,
  groundFriction: number
) {
  if (obj.type === 'hoop') {
    stepHoop(obj, obstacles, gravity, groundFriction);
    return;
  }

  const tempX = obj.x;
  const tempY = obj.y;
  let vx = (obj.x - obj.oldX) * 0.985;
  let vy = (obj.y - obj.oldY) * 0.985;
  obj.x += vx;
  obj.y += vy + gravity;
  obj.oldX = tempX;
  obj.oldY = tempY;

  const halfW = obj.width / 2;
  const halfH = obj.height / 2;
  const bottom = obj.type === 'ball' ? obj.radius : halfH;
  const surface = groundYAt(obstacles, obj.x);

  if (obj.y >= surface - bottom) {
    const overPit = obstacles.some(
      o => o.type === 'pit' && obj.x >= o.x && obj.x <= o.x + o.width
    );
    if (!overPit) {
      obj.y = surface - bottom;
      obj.oldY = obj.y;
      const hVx = obj.x - obj.oldX;
      obj.x = obj.oldX + hVx * (1 - groundFriction);
    }
  }

  for (const obs of obstacles) {
    if (obs.type === 'ice' || obs.type === 'terrain' || obs.type === 'finish' || obs.type === 'checkpoint') {
      continue;
    }
    const left = obs.x;
    const right = obs.x + obs.width;
    const top = obs.y;
    const rightEdge = right;
    if (obj.type === 'ball') {
      const closestX = Math.max(left, Math.min(obj.x, rightEdge));
      const closestY = Math.max(top, Math.min(obj.y, obs.y + obs.height));
      const dx = obj.x - closestX;
      const dy = obj.y - closestY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      if (dist < obj.radius) {
        const overlap = obj.radius - dist;
        obj.x += (dx / dist) * overlap;
        obj.y += (dy / dist) * overlap;
        if (dy < 0) obj.oldY = obj.y;
      }
    } else {
      const oLeft = obj.x - halfW;
      const oRight = obj.x + halfW;
      const oTop = obj.y - halfH;
      const oBottom = obj.y + halfH;
      if (oRight > left && oLeft < right && oBottom > top && oTop < obs.y + obs.height) {
        const pushUp = oBottom - top;
        obj.y -= pushUp;
        obj.oldY = obj.y;
      }
    }
  }
}

/** Roll the hoop on heightfield + rocks; update spin from arc length. */
function stepHoop(
  hoop: WorldObject,
  obstacles: Obstacle[],
  gravity: number,
  groundFriction: number
) {
  const tube = hoop.tubeThickness ?? 14;
  const outerR = hoop.radius + tube;
  const tempX = hoop.x;
  const tempY = hoop.y;
  let vx = (hoop.x - hoop.oldX) * 0.988;
  let vy = (hoop.y - hoop.oldY) * 0.988;
  // Soft speed clamp to avoid Verlet explosions
  const speed = Math.hypot(vx, vy);
  if (speed > 8) {
    vx = (vx / speed) * 8;
    vy = (vy / speed) * 8;
  }
  hoop.x += vx;
  hoop.y += vy + gravity * 0.85;
  hoop.oldX = tempX;
  hoop.oldY = tempY;

  const surface = groundYAt(obstacles, hoop.x);
  const foot = hoop.y + outerR;
  if (foot > surface) {
    const sink = foot - surface;
    hoop.y -= sink;
    if (hoop.oldY > hoop.y) hoop.oldY = hoop.y;
    const hVx = hoop.x - hoop.oldX;
    hoop.x = hoop.oldX + hVx * (1 - groundFriction * 0.25);
  }

  // Rocks / boulders / pads
  for (const obs of obstacles) {
    if (obs.type !== 'box' && obs.type !== 'stair') continue;
    const hit = collideCircleAABB(
      hoop.x,
      hoop.y,
      outerR,
      obs.x,
      obs.y,
      obs.x + obs.width,
      obs.y + obs.height
    );
    if (!hit) continue;
    hoop.x += hit.nx * hit.overlap;
    hoop.y += hit.ny * hit.overlap;
    if (hit.ny < -0.4) {
      if (hoop.oldY > hoop.y) hoop.oldY = hoop.y;
    }
  }

  const dx = hoop.x - hoop.oldX;
  hoop.angle = (hoop.angle ?? 0) - dx / Math.max(1, outerR);
}

/**
 * Contain nodes inside the hoop rim and couple motor-wheel torque into roll.
 */
function resolveHoopContainment(
  creature: Creature,
  hoop: WorldObject,
  motorDrives: Map<number, number>
) {
  let escaped = 0;
  let impulseX = 0;
  let impulseY = 0;

  for (const node of creature.nodes) {
    const dx = node.x - hoop.x;
    const dy = node.y - hoop.y;
    const dist = Math.hypot(dx, dy) || 0.001;
    const maxDist = Math.max(4, hoop.radius - node.radius - 1);
    const nx = dx / dist;
    const ny = dy / dist;
    const tx = -ny;
    const ty = nx;

    // Truly escaped past the tube (not just resting on the rim)
    if (dist > hoop.radius + (hoop.tubeThickness ?? 14) + node.radius) {
      escaped += 1;
    }

    if (dist > maxDist) {
      const overlap = dist - maxDist;
      const totalMass = node.mass + hoop.mass;
      const nodeShare = hoop.mass / totalMass;
      const hoopShare = node.mass / totalMass;
      node.x -= nx * overlap * nodeShare;
      node.y -= ny * overlap * nodeShare;
      // Soft reaction into the hoop (weight shift → roll)
      impulseX += nx * overlap * hoopShare * 0.45;
      impulseY += ny * overlap * hoopShare * 0.45;
      node.isGround = true;
      const nodeVx = node.x - node.oldX;
      const nodeVy = node.y - node.oldY;
      const tang = nodeVx * tx + nodeVy * ty;
      const grip = node.isWheel ? 0.08 : 0.18;
      const damp = tang * grip;
      node.oldX += tx * damp * 0.4;
      node.oldY += ty * damp * 0.4;
      impulseX += tx * damp * 0.2;
      impulseY += ty * damp * 0.2;
    } else if (dist > maxDist - 8) {
      node.isGround = true;
    }

    // Positive drive → roll right: at the bottom, animal runs left (tx=-1)
    if (node.isMotorWheel && dist > maxDist - 12) {
      const drive = motorDrives.get(node.id) ?? 0;
      if (drive !== 0) {
        node.oldX += tx * drive * 0.5;
        node.oldY += ty * drive * 0.5;
        impulseX -= tx * drive * 0.75;
        impulseY -= ty * drive * 0.75;
        node.spinAngle = (node.spinAngle ?? 0) + drive / Math.max(1, node.radius);
      }
    }
  }

  hoop.x += impulseX;
  hoop.y += impulseY;

  if (escaped > creature.nodes.length * 0.5) {
    creature.hoopOutsideFrames = (creature.hoopOutsideFrames ?? 0) + 1;
  }
}

function resolveCreatureObjectCollisions(
  creature: Creature,
  objects: WorldObject[],
  motorDrives: Map<number, number> = new Map()
) {
  for (const obj of objects) {
    if (obj.type === 'hoop') {
      resolveHoopContainment(creature, obj, motorDrives);
      continue;
    }
    let directBallContact = false;
    for (const node of creature.nodes) {
      if (obj.type === 'ball') {
        directBallContact =
          collideNodeCircle(node, obj.x, obj.y, obj.radius, obj) ||
          directBallContact;
      } else {
        const halfW = obj.width / 2;
        const halfH = obj.height / 2;
        const left = obj.x - halfW;
        const right = obj.x + halfW;
        const top = obj.y - halfH;
        const bottom = obj.y + halfH;
        const closestX = Math.max(left, Math.min(node.x, right));
        const closestY = Math.max(top, Math.min(node.y, bottom));
        const dx = node.x - closestX;
        const dy = node.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (dist < node.radius) {
          const overlap = node.radius - dist;
          const nx = dx / dist;
          const ny = dy / dist;
          const totalMass = node.mass + obj.mass;
          node.x += nx * overlap * (obj.mass / totalMass);
          node.y += ny * overlap * (obj.mass / totalMass);
          obj.x -= nx * overlap * (node.mass / totalMass);
          obj.y -= ny * overlap * (node.mass / totalMass);
        }
      }
    }
    if (obj.type === 'ball') {
      trackCarryBallContact(creature, obj, directBallContact);
    }
  }
}

const CARRY_BALL_MIN_LIFT = 4;
const CARRY_BALL_MIN_TRANSPORT_STEP = 0.05;

/**
 * Records reconstructable Carry Ball provenance from the collision solver.
 * A movement sample counts only when both its endpoints have direct resolved
 * contact. This excludes the first touch, proximity, wind-only motion, and
 * later free-ball travel. Lift is unlocked only on a rightward transport
 * sample, so stationary ball camping cannot farm height.
 */
function trackCarryBallContact(
  creature: Creature,
  ball: WorldObject,
  directContact: boolean
): void {
  const continuedChain =
    directContact &&
    creature.carryBallContactActive === true &&
    creature.carryBallLastX !== undefined &&
    creature.carryBallLastY !== undefined;

  if (directContact) {
    creature.ballCreatureContacted = true;
    creature.carryBallContactChainFrames =
      (creature.carryBallContactChainFrames ?? 0) + 1;
    creature.carryBallBestContactChainFrames = Math.max(
      creature.carryBallBestContactChainFrames ?? 0,
      creature.carryBallContactChainFrames
    );
  } else {
    creature.carryBallContactChainFrames = 0;
  }

  if (continuedChain) {
    const dx = ball.x - (creature.carryBallLastX as number);
    const lift = Math.max(0, ball.startY - ball.y);
    if (dx >= CARRY_BALL_MIN_TRANSPORT_STEP && lift >= CARRY_BALL_MIN_LIFT) {
      creature.carryBallTransportDistance =
        (creature.carryBallTransportDistance ?? 0) + dx;
      creature.carryBallTransportPeakLift = Math.max(
        creature.carryBallTransportPeakLift ?? 0,
        lift
      );
    }
  }

  creature.carryBallContactActive = directContact;
  creature.carryBallLastX = ball.x;
  creature.carryBallLastY = ball.y;
}

function recordGait(creature: Creature) {
  if (!creature.gaitHistory) {
    creature.gaitHistory = creature.muscles.map(() => []);
  }
  for (let i = 0; i < creature.muscles.length; i++) {
    const muscle = creature.muscles[i];
    const nodeA = creature.nodes[muscle.nodeA];
    const nodeB = creature.nodes[muscle.nodeB];
    if (!nodeA || !nodeB) continue;
    const len = Math.sqrt((nodeB.x - nodeA.x) ** 2 + (nodeB.y - nodeA.y) ** 2) || 1;
    const ratio = len / (muscle.originalLength || 1);
    const series = creature.gaitHistory[i] || (creature.gaitHistory[i] = []);
    series.push(ratio);
    if (series.length > GAIT_HISTORY_LENGTH) series.shift();
  }
}

function uprightScore(creature: Creature): number {
  const heightReward = Math.max(0, GROUND_Y - creature.currentY);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const node of creature.nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
  }
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const verticalRatio = height / width;
  return Math.max(0, heightReward * (0.5 + Math.min(1.5, verticalRatio)));
}

/** Public upright posture score for UI telemetry. */
export function getUprightScore(creature: Creature): number {
  return uprightScore(creature);
}

function metricValue(
  rule: CustomGoalRule,
  creature: Creature,
  objects: WorldObject[],
  obstacles: Obstacle[] = []
): number {
  const ball = objects.find(o => o.type === 'ball');
  const box = objects.find(o => o.type === 'box');

  switch (rule.metric) {
    case 'distance_right':
      return Math.max(0, creature.currentX - creature.startX);
    case 'distance_left':
      return Math.max(0, creature.startX - creature.currentX);
    case 'jump_height':
      return Math.max(
        creature.jumpHeightBestClearance ?? 0,
        creature.aerialBoutIsHop ? 0 : creature.aerialBoutPeakLowestClearance ?? 0
      );
    case 'upright':
      return uprightScore(creature);
    case 'ball_carry': {
      if (!ball) return 0;
      const transport = creature.carryBallTransportDistance ?? 0;
      const transportedLift = creature.carryBallTransportPeakLift ?? 0;
      return transport * 1.5 + transportedLift * 1.2;
    }
    case 'box_push': {
      if (!box) return 0;
      let minDist = Infinity;
      for (const n of creature.nodes) {
        const d = Math.hypot(n.x - box.x, n.y - box.y);
        minDist = Math.min(minDist, d);
      }
      const near = minDist < 60 ? 1 : Math.max(0, 1 - (minDist - 60) / 100);
      return near * Math.max(0, box.x - box.startX);
    }
    case 'survival':
      return creature.uprightFrames ?? 0;
    case 'speed':
      return creature.peakSpeed ?? 0;
    case 'stair_height': {
      const supported = creature.stairPeakHeight ?? 0;
      const forward = Math.max(0, creature.currentX - creature.startX);
      return supported * 2.8 + forward * 0.12;
    }
    case 'jump_land':
      return creature.uprightLandingScore ?? 0;
    case 'clear_bar': {
      const bar = obstacles.find(o => o.type === 'bar');
      const jumpH = Math.max(0, creature.startY - creature.highestY);
      if (!bar) return jumpH;
      const clearBonus = creature.clearedBar ? (bar.barClearHeight ?? bar.height) * 1.5 : 0;
      return jumpH + clearBonus;
    }
    case 'manual':
      // Manual rules contribute a flat weighted bonus (user-defined "reward") each evaluation
      return rule.bonus ?? rule.weight;
    default:
      return 0;
  }
}

export function evaluateCustomGoal(
  creature: Creature,
  customGoal: CustomGoalConfig,
  objects: WorldObject[],
  obstacles: Obstacle[] = []
): number {
  let total = 0;
  for (const rule of customGoal.rules) {
    const value = metricValue(rule, creature, objects, obstacles);
    if (rule.metric === 'manual') {
      total += (rule.bonus ?? 0) * (rule.weight || 1);
      continue;
    }
    total += value * rule.weight;
    if (rule.target !== undefined && rule.bonus !== undefined && value >= rule.target) {
      total += rule.bonus;
    }
  }
  return Math.max(0, total);
}

function clearBarFitness(creature: Creature, obstacles: Obstacle[]): number {
  const bar = obstacles.find(o => o.type === 'bar');
  const jumpH = Math.max(
    creature.jumpHeightBestClearance ?? 0,
    creature.aerialBoutIsHop ? 0 : creature.aerialBoutPeakLowestClearance ?? 0
  );
  if (!bar) return jumpH;
  const barTop = bar.y;
  const approach = Math.max(0, Math.min(1, (creature.currentX - (bar.x - 40)) / 80));
  const clearance = Math.max(0, jumpH - (GROUND_Y - barTop));
  const clearBonus = creature.clearedBar ? 80 + clearance * 2 : clearance * 0.5 * approach;
  return jumpH * 0.35 + clearBonus;
}

function jumpLandFitness(creature: Creature): number {
  // Best single hop that returned near takeoff — small hops do not accumulate.
  return creature.uprightLandingScore ?? 0;
}

/**
 * Flight Height: best sustained aero-climb bout (D110 / D143).
 * Peak clearance alone selected ballistic hops; cruise altitude under a
 * sustained-flight gate plus powered flap climb is the task signal.
 * Matched L/R (bird-like) strokes earn an explicit symmetry bonus and, via
 * aero, also unlock the strongest lift so height follows the same skill.
 */
function flightHeightBoutScore(
  frames: number,
  peak: number,
  integral: number,
  takeoffClear: number,
  poweredClimb: number,
  flapFrames: number,
  flapWork: number,
  symFrames = 0,
  symQuality = 0,
  minClear = FLIGHT_MIN_CLEARANCE_FLOOR
): number {
  const excessPeak = flightExcessClearance(peak, minClear);
  const mean = integral / frames;
  const excessMean = flightExcessClearance(mean, minClear);
  // Height only unlocks after a real airborne streak above the body-scaled floor.
  if (frames < 12 || excessPeak < 1) return 0;
  const sustainGate = Math.min(1, Math.max(0, frames - 24) / 72);
  // Wing stroke evidence.
  const flapGate = Math.min(1, Math.max(0, flapFrames) / 28);
  // Paragliders rarely flap; a long uninterrupted glide still counts as aero work.
  const glideEvidence = Math.min(1, Math.max(0, frames - 90) / 90);
  const aeroEvidence = Math.max(flapGate, glideEvidence);
  // Contact bounce / ballistic hop without aero work must not score.
  if (aeroEvidence < 0.08) return 0;

  const leapiness =
    excessPeak > minClear * 0.8
      ? Math.max(0, peak / Math.max(minClear, mean) - 1.65)
      : 0;

  // Primary: mean cruise altitude above the flight floor while sustained.
  const cruise = Math.min(excessMean, minClear * 2.5) * 2.6 * sustainGate * aeroEvidence;
  // Peak only pays when near the cruise band and gated by sustain + aero work.
  const sustainedPeak = Math.min(excessPeak, excessMean * 1.45 + minClear * 0.15);
  const peakScore =
    sustainedPeak * 1.35 * sustainGate * (0.25 + 0.75 * aeroEvidence);
  // Post-takeoff aero climb: COM rise while wings are actively flapping.
  const climbScore =
    Math.min(minClear * 1.5, Math.max(0, poweredClimb)) *
    2.1 *
    (0.3 + 0.7 * flapGate);
  // Weak raw climb-from-takeoff shaping, still flap-gated so hops cannot farm it.
  const rawClimb = Math.max(0, peak - Math.max(0, takeoffClear));
  const climbShaping =
    Math.min(minClear * 1.2, rawClimb) * 0.35 * sustainGate * flapGate;
  const flapBonus =
    Math.min(80, Math.max(0, flapFrames)) * 0.25 +
    Math.min(120, Math.max(0, flapWork)) * 0.05;
  // Bird-like matched L/R power strokes — pays on top of raw flap effort.
  const symBonus =
    Math.min(110, Math.max(0, symFrames)) * 0.55 +
    Math.min(160, Math.max(0, symQuality)) * 0.45;
  const leapPenalty = leapiness * excessPeak * 0.55;

  return Math.max(
    0,
    cruise +
      peakScore +
      climbScore +
      climbShaping +
      flapBonus +
      symBonus -
      leapPenalty
  );
}

function activeFlightHeightBoutFitness(creature: Creature): number {
  const flapBase = creature.flightHeightBoutFlapBase ?? 0;
  const workBase = creature.flightHeightBoutWorkBase ?? 0;
  const symBase = creature.flightHeightBoutSymBase ?? 0;
  const symQBase = creature.flightHeightBoutSymQualityBase ?? 0;
  return flightHeightBoutScore(
    creature.flightHeightBoutFrames ?? 0,
    creature.flightHeightBoutPeak ?? 0,
    creature.flightHeightBoutIntegral ?? 0,
    creature.flightHeightBoutTakeoffClear ?? 0,
    creature.flightHeightBoutPoweredClimb ?? 0,
    Math.max(0, (creature.wingFlapFrames ?? 0) - flapBase),
    Math.max(0, (creature.wingFlapWork ?? 0) - workBase),
    Math.max(0, (creature.wingSymFlapFrames ?? 0) - symBase),
    Math.max(0, (creature.wingSymFlapQuality ?? 0) - symQBase),
    creatureFlightMinClearance(creature)
  );
}

function flightHeightFitness(creature: Creature): number {
  return Math.max(
    creature.flightHeightBestBoutScore ?? 0,
    activeFlightHeightBoutFitness(creature)
  );
}

function resetFlightHeightBout(creature: Creature): void {
  creature.flightHeightBoutFrames = 0;
  creature.flightHeightBoutPeak = 0;
  creature.flightHeightBoutIntegral = 0;
  creature.flightHeightBoutTakeoffClear = 0;
  creature.flightHeightBoutPoweredClimb = 0;
  creature.flightHeightBoutFlapBase = 0;
  creature.flightHeightBoutWorkBase = 0;
  creature.flightHeightBoutSymBase = 0;
  creature.flightHeightBoutSymQualityBase = 0;
  creature.flightHeightBoutPrevFlap = 0;
}

/** Rightward airborne travel. */
function flightRightFitness(creature: Creature): number {
  const minClear = creatureFlightMinClearance(creature);
  return Math.max(
    creature.flightRightBestBoutScore ?? 0,
    directionalBoutScore(
      creature.attemptBoutRight ?? 0,
      creature.attemptBoutFrames ?? 0,
      true,
      creature.attemptBoutPeakClearance ?? 0,
      minClear
    )
  );
}

/** Leftward airborne travel. */
function flightLeftFitness(creature: Creature): number {
  const minClear = creatureFlightMinClearance(creature);
  return Math.max(
    creature.flightLeftBestBoutScore ?? 0,
    directionalBoutScore(
      creature.attemptBoutLeft ?? 0,
      creature.attemptBoutFrames ?? 0,
      true,
      creature.attemptBoutPeakClearance ?? 0,
      minClear
    )
  );
}

/** Peak speed while fully airborne — best single bout only. */
function flightAirspeedBoutScore(
  peak: number,
  frames: number,
  dist: number,
  clearance: number,
  minClear = FLIGHT_MIN_CLEARANCE_FLOOR
): number {
  if (frames < 8 || clearance < minClear) return 0;
  return peak * 55 + Math.min(frames, 160) * 0.4 + dist * 0.12;
}

function activeFlightAirspeedBoutFitness(creature: Creature): number {
  return flightAirspeedBoutScore(
    creature.flightAirspeedBoutPeak ?? 0,
    creature.flightAirspeedBoutFrames ?? 0,
    creature.flightAirspeedBoutDist ?? 0,
    creature.flightAirspeedBoutPeakClearance ?? 0,
    creatureFlightMinClearance(creature)
  );
}

function flightAirspeedFitness(creature: Creature): number {
  return Math.max(
    creature.flightAirspeedBestBoutScore ?? 0,
    activeFlightAirspeedBoutFitness(creature)
  );
}

/** Sustained flight then soft upright landing (ceiling → descent shaped). */
function flightLandFitness(creature: Creature): number {
  return Math.max(
    creature.flightLandBestBoutScore ?? 0,
    activeFlightLandBoutFitness(creature)
  );
}

function activeFlightLandBoutFitness(creature: Creature): number {
  const land = creature.flightLandScore ?? 0;
  const climb = creature.landClimbScore ?? 0;
  const descent = creature.landDescentScore ?? 0;
  const overshoot = creature.landOvershootPenalty ?? 0;
  const streak = creature.attemptBoutFrames ?? creature.flightStreak ?? 0;
  return (
    land * 3.0 +
    climb * 1.0 +
    descent * 2.6 -
    overshoot * 1.85 +
    Math.min(streak, 180) * 0.12
  );
}

/** Airborne flips / rotation. */
function flightAcrobaticsFitness(creature: Creature): number {
  return Math.max(
    creature.flightAcrobaticsBestBoutScore ?? 0,
    acrobaticsBoutScore(
      creature.attemptBoutRotation ?? 0,
      creature.attemptBoutFrames ?? 0,
      creature.attemptBoutPeakClearance ?? 0,
      true,
      creatureFlightMinClearance(creature)
    )
  );
}

function acrobaticsBoutScore(
  rot: number,
  air: number,
  peak: number,
  flight: boolean,
  minClear = flight ? FLIGHT_MIN_CLEARANCE_FLOOR : JUMP_MIN_CLEARANCE
): number {
  if (peak < minClear) return 0;
  const flips = Math.floor(rot / (Math.PI * 2));
  const airGate = Math.min(1, air / (flight ? 48 : 18));
  const heightGate = Math.min(1, flightExcessClearance(peak, minClear) / Math.max(1, minClear * 0.75));
  const rotationWeight = flight ? 28 : 26;
  const flipWeight = flight ? 90 : 85;
  const peakWeight = flight ? 0.4 : 0.35;
  return (
    (
      rot * rotationWeight +
      flips * flipWeight +
      Math.min(flightExcessClearance(peak, minClear), minClear * 1.5) * peakWeight
    ) *
      airGate *
      heightGate +
    air * (flight ? 0.15 : 0.2)
  );
}

function directionalBoutScore(
  distance: number,
  frames: number,
  flight: boolean,
  peakClearance = 0,
  minClear = flight ? FLIGHT_MIN_CLEARANCE_FLOOR : JUMP_MIN_CLEARANCE
): number {
  if (frames < (flight ? 8 : JUMP_MIN_FRAMES) || peakClearance < minClear) return 0;
  return flight
    ? distance * 1.85 + Math.min(frames, 200) * 0.35
    : distance * 1.7 + Math.min(peakClearance, minClear * 3) * 0.25;
}

function finalizeAttemptBout(creature: Creature, goal: EvolutionGoal): void {
  const frames = creature.attemptBoutFrames ?? 0;
  const peak = creature.attemptBoutPeakClearance ?? 0;
  const isHop = creature.aerialBoutIsHop === true;
  const flightMin = creatureFlightMinClearance(creature);
  const jumpMin = creatureJumpMinClearance(creature);
  if (frames > 0) {
    if (goal === EvolutionGoal.LONG_JUMP && !isHop) {
      creature.jumpRightBestBoutScore = Math.max(
        creature.jumpRightBestBoutScore ?? 0,
        directionalBoutScore(creature.attemptBoutRight ?? 0, frames, false, peak, jumpMin)
      );
    } else if (goal === EvolutionGoal.JUMP_LEFT && !isHop) {
      creature.jumpLeftBestBoutScore = Math.max(
        creature.jumpLeftBestBoutScore ?? 0,
        directionalBoutScore(creature.attemptBoutLeft ?? 0, frames, false, peak, jumpMin)
      );
    } else if (goal === EvolutionGoal.FLIGHT_RIGHT) {
      creature.flightRightBestBoutScore = Math.max(
        creature.flightRightBestBoutScore ?? 0,
        directionalBoutScore(creature.attemptBoutRight ?? 0, frames, true, peak, flightMin)
      );
    } else if (goal === EvolutionGoal.FLIGHT_LEFT) {
      creature.flightLeftBestBoutScore = Math.max(
        creature.flightLeftBestBoutScore ?? 0,
        directionalBoutScore(creature.attemptBoutLeft ?? 0, frames, true, peak, flightMin)
      );
    } else if (goal === EvolutionGoal.JUMP_ACROBATICS && !isHop) {
      creature.jumpAcrobaticsBestBoutScore = Math.max(
        creature.jumpAcrobaticsBestBoutScore ?? 0,
        acrobaticsBoutScore(
          creature.attemptBoutRotation ?? 0,
          frames,
          peak,
          false,
          jumpMin
        )
      );
    } else if (goal === EvolutionGoal.FLIGHT_ACROBATICS) {
      creature.flightAcrobaticsBestBoutScore = Math.max(
        creature.flightAcrobaticsBestBoutScore ?? 0,
        acrobaticsBoutScore(
          creature.attemptBoutRotation ?? 0,
          frames,
          peak,
          true,
          flightMin
        )
      );
    }
  }
  creature.attemptBoutFrames = 0;
  creature.attemptBoutRight = 0;
  creature.attemptBoutLeft = 0;
  creature.attemptBoutPeakClearance = 0;
  creature.attemptBoutRotation = 0;
}

/** Hang Time: best isolated jump bout; hop chains never score. */
function jumpHangBoutScore(frames: number, peakClearance: number, minClear = JUMP_MIN_CLEARANCE): number {
  // Contact-solver flicker and sub-clearance stutter steps are not jumps.
  if (frames < JUMP_MIN_FRAMES || peakClearance < minClear) return 0;
  // Duration is the task. Clearance is bounded shaping and can never outweigh
  // thirty additional airborne frames.
  return Math.max(0, frames) * 2 + Math.min(minClear * 1.5, Math.max(0, peakClearance)) * 0.5;
}

function jumpSpeedBoutScore(
  peakSpeed: number,
  frames: number,
  peakClearance: number,
  minClear = JUMP_MIN_CLEARANCE
): number {
  if (frames < JUMP_MIN_FRAMES || peakClearance < minClear) return 0;
  return peakSpeed * 50 + Math.min(peakClearance, minClear * 3) * 0.3 + Math.min(frames, 80) * 0.35;
}

function recordHopBout(
  creature: Creature,
  right: number,
  left: number,
  peakSpeed: number,
  frames: number,
  peakClearance: number
): void {
  if (frames < 1) return;
  // Micro-skims below the jump clearance floor are not hops.
  if (peakClearance < creatureJumpMinClearance(creature)) return;
  creature.hopDistanceRight = (creature.hopDistanceRight ?? 0) + Math.max(0, right);
  creature.hopDistanceLeft = (creature.hopDistanceLeft ?? 0) + Math.max(0, left);
  const boutSpeed =
    frames > 0 ? (Math.max(0, right) + Math.max(0, left)) / frames : 0;
  creature.hopPeakSpeed = Math.max(
    creature.hopPeakSpeed ?? 0,
    peakSpeed,
    boutSpeed
  );
  creature.hopBoutCount = (creature.hopBoutCount ?? 0) + 1;
}

function revokeLastIsolatedJumpToHop(creature: Creature): void {
  const snap = creature.lastIsolatedJumpSnapshot;
  if (!snap) return;
  if ((creature.jumpHangBestBoutScore ?? 0) === snap.hangScore) {
    creature.jumpHangBestBoutScore = 0;
  }
  if ((creature.jumpRightBestBoutScore ?? 0) === snap.rightScore) {
    creature.jumpRightBestBoutScore = 0;
  }
  if ((creature.jumpLeftBestBoutScore ?? 0) === snap.leftScore) {
    creature.jumpLeftBestBoutScore = 0;
  }
  if ((creature.jumpHeightBestClearance ?? 0) === snap.heightClearance) {
    creature.jumpHeightBestClearance = 0;
  }
  if ((creature.jumpSpeedBestBoutScore ?? 0) === snap.speedScore) {
    creature.jumpSpeedBestBoutScore = 0;
  }
  if ((creature.jumpAcrobaticsBestBoutScore ?? 0) === snap.acroScore) {
    creature.jumpAcrobaticsBestBoutScore = 0;
  }
  if ((creature.uprightLandingScore ?? 0) === snap.landScore) {
    creature.uprightLandingScore = 0;
  }
  recordHopBout(
    creature,
    snap.rightDist,
    snap.leftDist,
    snap.peakSpeed,
    snap.frames,
    snap.peakClearance
  );
  creature.lastIsolatedJumpSnapshot = undefined;
}

function finalizeIsolatedOrHopBout(creature: Creature): void {
  const frames = creature.jumpHangBoutFrames ?? 0;
  const peak =
    creature.aerialBoutPeakLowestClearance ??
    creature.jumpHangBoutPeakClearance ??
    0;
  const right = creature.attemptBoutRight ?? 0;
  const left = creature.attemptBoutLeft ?? 0;
  const peakSpeed = creature.aerialBoutPeakSpeed ?? 0;
  const isHop = creature.aerialBoutIsHop === true;
  const jumpMin = creatureJumpMinClearance(creature);

  if (frames <= 0) return;

  if (isHop) {
    recordHopBout(creature, right, left, peakSpeed, frames, peak);
    creature.lastIsolatedJumpSnapshot = undefined;
    return;
  }

  const hangScore = jumpHangBoutScore(frames, peak, jumpMin);
  const rightScore = directionalBoutScore(right, frames, false, peak, jumpMin);
  const leftScore = directionalBoutScore(left, frames, false, peak, jumpMin);
  const acroScore = acrobaticsBoutScore(
    creature.attemptBoutRotation ?? 0,
    frames,
    peak,
    false,
    jumpMin
  );
  const heightClearance =
    peak >= jumpMin && frames >= JUMP_MIN_FRAMES ? peak : 0;

  creature.jumpHangBestBoutScore = Math.max(
    creature.jumpHangBestBoutScore ?? 0,
    hangScore
  );
  creature.jumpHeightBestClearance = Math.max(
    creature.jumpHeightBestClearance ?? 0,
    heightClearance
  );
  const speedScore = jumpSpeedBoutScore(peakSpeed, frames, peak, jumpMin);
  creature.jumpSpeedBestBoutScore = Math.max(
    creature.jumpSpeedBestBoutScore ?? 0,
    speedScore
  );

  creature.lastIsolatedJumpSnapshot = {
    hangScore,
    rightScore,
    leftScore,
    heightClearance,
    speedScore,
    acroScore,
    landScore: creature.uprightLandingScore ?? 0,
    rightDist: right,
    leftDist: left,
    peakSpeed,
    frames,
    peakClearance: peak,
  };
}

/**
 * Rising-edge plant accounting for Run (step-strict) and Shuffle (vibration-ok).
 *
 * Run Right/Left credit a plant only after swing clearance, a minimum interval,
 * and co-progress of plant + body frontiers — high-frequency grounded flicker
 * cannot mint steps. Each credited step also earns step points (with an
 * alternate-contact bonus).
 *
 * When any node is marked `isFoot`, only those nodes enter the gait set and
 * receive plant credit (D138). Unmarked bodies keep the auto contact-node gait.
 * Alternate-step credit and the Run unlock require a foot→foot transfer (D139);
 * non-foot contacts never count as an alternating step.
 *
 * Shuffle tracks a separate oscillation ledger without swing/interval gates so
 * vibrating scooters can score body travel plus co-progressing plant work.
 */
export function updateWalkGait(
  creature: Creature,
  goalDirection: 1 | -1 | 0
): void {
  const prev = creature.walkPrevGrounded ?? creature.nodes.map(() => false);
  if (prev.length !== creature.nodes.length) {
    while (prev.length < creature.nodes.length) prev.push(false);
    prev.length = creature.nodes.length;
  }
  const air =
    creature.walkNodeAirFrames ??
    (creature.walkNodeAirFrames = creature.nodes.map(() => 0));
  if (air.length !== creature.nodes.length) {
    while (air.length < creature.nodes.length) air.push(0);
    air.length = creature.nodes.length;
  }
  const gait = creature.walkGaitNodeIds ?? (creature.walkGaitNodeIds = []);
  const frame = creature.episodeFrames ?? 0;
  const authoredFeet = creature.nodes.some(n => !!n.isFoot);

  for (let i = 0; i < creature.nodes.length; i += 1) {
    const grounded = creature.nodes[i].isGround;
    if (!grounded) {
      air[i] = (air[i] ?? 0) + 1;
    }
    const rising = grounded && !prev[i];
    if (rising && goalDirection !== 0) {
      // Authored feet: knees/hands/chassis contacts cannot mint walk plants.
      if (authoredFeet && !creature.nodes[i].isFoot) {
        if (grounded) air[i] = 0;
        prev[i] = grounded;
        continue;
      }
      const contactX = creature.nodes[i].x;
      let inGait = gait.includes(i);
      if (!inGait) {
        gait.push(i);
        while (gait.length > WALK_MAX_CONTACT_POINTS) gait.shift();
        inGait = gait.includes(i);
      }

      // --- Shuffle oscillation credit (no swing / interval gates) ---
      {
        const plantFrontier = creature.shufflePlantFrontierX;
        if (plantFrontier === undefined) {
          creature.shufflePlantFrontierX = contactX;
          creature.shuffleBodyFrontierX = creature.currentX;
        } else {
          const plantProgress =
            goalDirection > 0
              ? contactX - plantFrontier
              : plantFrontier - contactX;
          const bodyFrontier =
            creature.shuffleBodyFrontierX ?? creature.currentX;
          const bodyProgress =
            goalDirection > 0
              ? creature.currentX - bodyFrontier
              : bodyFrontier - creature.currentX;
          if (
            plantProgress >= WALK_STRIDE_MIN_PROGRESS &&
            bodyProgress >= WALK_STRIDE_MIN_PROGRESS
          ) {
            const credited = Math.min(plantProgress, bodyProgress);
            if (goalDirection > 0) {
              creature.shuffleOscDistanceRight =
                (creature.shuffleOscDistanceRight ?? 0) + credited;
              creature.shufflePlantFrontierX = plantFrontier + credited;
              creature.shuffleBodyFrontierX = bodyFrontier + credited;
            } else {
              creature.shuffleOscDistanceLeft =
                (creature.shuffleOscDistanceLeft ?? 0) + credited;
              creature.shufflePlantFrontierX = plantFrontier - credited;
              creature.shuffleBodyFrontierX = bodyFrontier - credited;
            }
          }
        }
      }

      // --- Run step credit (swing + interval gated) ---
      if (inGait) {
        const swung = (air[i] ?? 0) >= WALK_SWING_MIN_FRAMES;
        const lastFrame = creature.walkLastStepFrame;
        const spaced =
          lastFrame === undefined ||
          frame - lastFrame >= WALK_STEP_MIN_INTERVAL;
        if (swung && spaced) {
          const plantFrontier = creature.walkPlantFrontierX;
          if (plantFrontier === undefined) {
            creature.walkPlantFrontierX = contactX;
            creature.walkBodyFrontierX = creature.currentX;
            // First touch seeds frontiers only — not yet a scored step.
          } else {
            const plantProgress =
              goalDirection > 0
                ? contactX - plantFrontier
                : plantFrontier - contactX;
            const bodyFrontier =
              creature.walkBodyFrontierX ?? creature.currentX;
            const bodyProgress =
              goalDirection > 0
                ? creature.currentX - bodyFrontier
                : bodyFrontier - creature.currentX;
            if (
              plantProgress >= WALK_STRIDE_MIN_PROGRESS &&
              bodyProgress >= WALK_STRIDE_MIN_PROGRESS
            ) {
              const credited = Math.min(plantProgress, bodyProgress);
              // Alternation is foot-to-foot only. Knee/hand/hip transfers never
              // unlock Run or the alternate bonus (D139).
              const lastId = creature.walkLastStepNodeId;
              const lastFoot =
                lastId !== undefined && !!creature.nodes[lastId]?.isFoot;
              const currFoot = !!creature.nodes[i].isFoot;
              const alternated =
                lastId !== undefined &&
                lastId !== i &&
                lastFoot &&
                currFoot;
              const stepPts =
                WALK_STEP_POINTS + (alternated ? WALK_ALTERNATE_BONUS : 0);
              if (goalDirection > 0) {
                creature.walkStrideDistanceRight =
                  (creature.walkStrideDistanceRight ?? 0) + credited;
                creature.walkStepCountRight =
                  (creature.walkStepCountRight ?? 0) + 1;
                if (alternated) {
                  creature.walkAlternateStepCountRight =
                    (creature.walkAlternateStepCountRight ?? 0) + 1;
                }
                creature.walkStepScoreRight =
                  (creature.walkStepScoreRight ?? 0) + stepPts;
                creature.walkPlantFrontierX = plantFrontier + credited;
                creature.walkBodyFrontierX = bodyFrontier + credited;
              } else {
                creature.walkStrideDistanceLeft =
                  (creature.walkStrideDistanceLeft ?? 0) + credited;
                creature.walkStepCountLeft =
                  (creature.walkStepCountLeft ?? 0) + 1;
                if (alternated) {
                  creature.walkAlternateStepCountLeft =
                    (creature.walkAlternateStepCountLeft ?? 0) + 1;
                }
                creature.walkStepScoreLeft =
                  (creature.walkStepScoreLeft ?? 0) + stepPts;
                creature.walkPlantFrontierX = plantFrontier - credited;
                creature.walkBodyFrontierX = bodyFrontier - credited;
              }
              creature.walkLastStepNodeId = i;
              creature.walkLastStepFrame = frame;
            }
          }
        }
      }
      if (grounded) air[i] = 0;
    } else if (grounded) {
      air[i] = 0;
    }
    prev[i] = grounded;
  }
  creature.walkPrevGrounded = prev;
  creature.walkNodeAirFrames = air;
}

function locomotionDirectionFitness(
  creature: Creature,
  direction: 'right' | 'left'
): number {
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

  // Step-strict gate (D137/D139): no alternating foot transfer → no score.
  if (stepCount <= 0 || altCount <= 0) return 0;

  // Primary reward is forward body travel; stride ledger cannot exceed body (D129).
  const travel = strides > 0 ? Math.min(body, strides) : body;

  // Modest alternating-gait bonus — capped so distance always wins selection.
  const altBonus = Math.min(altCount * WALK_ALTERNATE_BONUS, travel);
  return travel + altBonus;
}

function locomotionRightFitness(creature: Creature): number {
  return locomotionDirectionFitness(creature, 'right');
}

function locomotionLeftFitness(creature: Creature): number {
  return locomotionDirectionFitness(creature, 'left');
}

function shuffleRightFitness(creature: Creature): number {
  const body = Math.max(0, creature.currentX - creature.startX);
  const osc = Math.max(0, creature.shuffleOscDistanceRight ?? 0);
  return body + SHUFFLE_OSC_WEIGHT * Math.min(osc, body);
}

function shuffleLeftFitness(creature: Creature): number {
  const body = Math.max(0, creature.startX - creature.currentX);
  const osc = Math.max(0, creature.shuffleOscDistanceLeft ?? 0);
  return body + SHUFFLE_OSC_WEIGHT * Math.min(osc, body);
}

function settleSpawnOnGround(
  nodes: PhysicsNode[],
  muscles: PhysicsMuscle[],
  solidBodies: RuntimeSolidBody[] | undefined,
  skipGroundPlant: boolean
): void {
  if (!skipGroundPlant) {
    let deepest = -Infinity;
    for (const n of nodes) {
      deepest = Math.max(deepest, n.y + n.radius);
    }
    const dy = GROUND_Y - deepest;
    for (const n of nodes) {
      n.y += dy;
    }
  }

  for (const n of nodes) {
    n.oldX = n.x;
    n.oldY = n.y;
    n.vx = 0;
    n.vy = 0;
  }

  const solidMember =
    solidBodies && solidBodies.length > 0
      ? solidMembershipFromBodies(solidBodies, nodes)
      : null;
  const hingeActive = creatureHasHingeStops(nodes);

  markLengthActuationForTick(muscles);

  for (let iter = 0; iter < 10; iter += 1) {
    for (const muscle of muscles) {
      if (
        solidMember &&
        isLinkWhollyInsideSolid(muscle.nodeA, muscle.nodeB, solidMember)
      ) {
        continue;
      }
      const nodeA = nodes[muscle.nodeA];
      const nodeB = nodes[muscle.nodeB];
      if (!nodeA || !nodeB) continue;

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const currentLength = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const target = muscle.targetLength;
      const diff = target - currentLength;
      const strength = isHardLengthConstraint(muscle) ? 1.0 : muscle.strength;
      const stepScale = isHardLengthConstraint(muscle) ? 1.0 : 0.5;
      const percent = (diff / currentLength) * strength * stepScale;
      const offsetX = dx * percent;
      const offsetY = dy * percent;

      const totalMass = nodeA.mass + nodeB.mass;
      const factorA = nodeB.mass / totalMass;
      const factorB = nodeA.mass / totalMass;

      applyLengthCorrectionDelta(
        nodeA,
        nodeB,
        offsetX * factorA,
        offsetY * factorA,
        offsetX * factorB,
        offsetY * factorB,
        muscle,
        diff
      );
    }
    if (solidBodies && solidBodies.length > 0) {
      projectSolidBodies(nodes, solidBodies, { preserveVelocity: true });
    }
    if (hingeActive) {
      projectHingeStops(nodes, muscles);
    }
  }

  if (!skipGroundPlant) {
    let deepest = -Infinity;
    for (const n of nodes) {
      deepest = Math.max(deepest, n.y + n.radius);
    }
    const dy = GROUND_Y - deepest;
    if (Math.abs(dy) > 1e-6) {
      for (const n of nodes) {
        n.y += dy;
        n.oldY = n.y;
      }
    }
  }

  for (const n of nodes) {
    n.oldX = n.x;
    n.oldY = n.y;
    n.vx = 0;
    n.vy = 0;
  }
}

/**
 * Hard-length settle after contact can lift grounded nodes off the floor and
 * leave vertical Verlet velocity that compounds into hops. Re-plant nodes that
 * were grounded before the final settle pass (D141) — but only when they are
 * still near the floor. Paraglider / wing impulses may legitimately lift a
 * previously grounded node; yanking those back to GROUND_Y killed takeoff (D142).
 */
function replantFlatGroundContacts(
  nodes: PhysicsNode[],
  groundedIds: ReadonlySet<number>,
  enabled: boolean
): void {
  if (!enabled) return;
  for (const node of nodes) {
    if (!groundedIds.has(node.id)) continue;
    // Aero lift or ramp projection already moved this node clear of the floor.
    if (node.y + node.radius < GROUND_Y - 1.5) continue;
    node.y = GROUND_Y - node.radius;
    if (node.isWheel) {
      const vx = node.x - node.oldX;
      node.oldX = node.x - vx;
    }
    node.oldY = node.y;
    node.isGround = true;
  }
}

/** Resolve flat-floor support before length constraints (prevents penetration fights). */
function preConstraintFlatGroundContact(
  nodes: PhysicsNode[],
  enabled: boolean,
  groundFriction: number
): void {
  if (!enabled) return;
  for (const node of nodes) {
    if (node.y + node.radius < GROUND_Y - 0.5) continue;
    node.y = GROUND_Y - node.radius;
    node.isGround = true;
    if (node.isWheel) {
      const vx = node.x - node.oldX;
      node.oldX = node.x - vx * 0.98;
      node.oldY = node.y;
      node.spinAngle = (node.spinAngle ?? 0) - vx / Math.max(1, node.radius);
    } else {
      applySurfaceFriction(node, groundFriction);
    }
  }
}

/**
 * D142 — Length projection velocity policy.
 *
 * Soft muscles / telescopes / pistons use classic position-only correction when
 * actuating (`targetLength` changed) or when length error exceeds
 * LENGTH_ACTUATION_EPS_PX (load-bearing tension must couple payload ↔ sail).
 * Near-target held commands preserve Verlet history to limit rest-hold drip.
 *
 * Fixed bones always preserve geometric corrections (quiet chassis). Motor
 * drive couples through `distributeMotorDriveThroughRigidBones`.
 *
 * Call `markLengthActuationForTick` once per physics tick before projections.
 */
function markLengthActuationForTick(muscles: PhysicsMuscle[]): void {
  for (const muscle of muscles) {
    const prev = muscle._constraintTargetSeen;
    muscle._actuatingThisTick =
      typeof prev === 'number' &&
      Math.abs(muscle.targetLength - prev) > 1e-4;
    muscle._constraintTargetSeen = muscle.targetLength;
  }
}

function applyLengthCorrectionDelta(
  nodeA: PhysicsNode,
  nodeB: PhysicsNode,
  dAx: number,
  dAy: number,
  dBx: number,
  dBy: number,
  muscle: PhysicsMuscle,
  lengthErrorPx: number
): void {
  nodeA.x -= dAx;
  nodeA.y -= dAy;
  nodeB.x += dBx;
  nodeB.y += dBy;

  const preserve =
    isRigidBone(muscle) || Math.abs(lengthErrorPx) < LENGTH_ACTUATION_EPS_PX;

  if (preserve) {
    nodeA.oldX -= dAx;
    nodeA.oldY -= dAy;
    nodeB.oldX += dBx;
    nodeB.oldY += dBy;
  }
  if (isRigidBone(muscle)) {
    projectRigidBoneAxialVelocity(nodeA, nodeB);
  }
}

/** Remove relative velocity along a fixed bone so tension/drive couples through it. */
function projectRigidBoneAxialVelocity(nodeA: PhysicsNode, nodeB: PhysicsNode): void {
  const dx = nodeB.x - nodeA.x;
  const dy = nodeB.y - nodeA.y;
  const len = Math.hypot(dx, dy) || 0.001;
  const tx = dx / len;
  const ty = dy / len;
  const vxA = nodeA.x - nodeA.oldX;
  const vyA = nodeA.y - nodeA.oldY;
  const vxB = nodeB.x - nodeB.oldX;
  const vyB = nodeB.y - nodeB.oldY;
  const rel = (vxB - vxA) * tx + (vyB - vyA) * ty;
  if (Math.abs(rel) < 1e-10) return;
  const invA = 1 / Math.max(0.35, nodeA.mass);
  const invB = 1 / Math.max(0.35, nodeB.mass);
  const impulse = rel / (invA + invB);
  nodeA.oldX -= tx * impulse * invA;
  nodeA.oldY -= ty * impulse * invA;
  nodeB.oldX += tx * impulse * invB;
  nodeB.oldY += ty * impulse * invB;
}

/**
 * Share grounded motor impulse into rigidly connected chassis nodes so carts
 * climb ramps when axle bones preserve Verlet history (D142).
 */
function distributeMotorDriveThroughRigidBones(
  creature: Creature,
  motorDrives: Map<number, number>
): void {
  if (motorDrives.size === 0) return;
  for (const node of creature.nodes) {
    if (!node.isMotorWheel || !node.isGround) continue;
    const drive = motorDrives.get(node.id);
    if (drive === undefined || drive === 0) continue;
    node.oldX -= drive;
    node.spinAngle = (node.spinAngle ?? 0) - drive / Math.max(1, node.radius);
    for (const muscle of creature.muscles) {
      if (!isRigidBone(muscle)) continue;
      let other: PhysicsNode | undefined;
      if (creature.nodes[muscle.nodeA] === node) {
        other = creature.nodes[muscle.nodeB];
      } else if (creature.nodes[muscle.nodeB] === node) {
        other = creature.nodes[muscle.nodeA];
      }
      if (!other || other.isMotorWheel) continue;
      // Mass-weighted share: light chassis picks up more of the push.
      const share =
        (drive * 0.55 * node.mass) / Math.max(0.35, node.mass + other.mass);
      other.oldX -= share;
    }
  }
}

function projectHardLengthConstraints(creature: Creature): void {
  const membership =
    creature.solidBodies && creature.solidBodies.length > 0
      ? solidMembershipFromBodies(creature.solidBodies, creature.nodes)
      : null;
  for (const muscle of creature.muscles) {
    if (!isHardLengthConstraint(muscle)) continue;
    if (
      membership &&
      isLinkWhollyInsideSolid(muscle.nodeA, muscle.nodeB, membership)
    ) {
      continue;
    }
    const nodeA = creature.nodes[muscle.nodeA];
    const nodeB = creature.nodes[muscle.nodeB];
    if (!nodeA || !nodeB) continue;
    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const currentLength = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const diff = muscle.targetLength - currentLength;
    const percent = diff / currentLength;
    const offsetX = dx * percent;
    const offsetY = dy * percent;
    const totalMass = nodeA.mass + nodeB.mass;
    const factorA = nodeB.mass / totalMass;
    const factorB = nodeA.mass / totalMass;
    applyLengthCorrectionDelta(
      nodeA,
      nodeB,
      offsetX * factorA,
      offsetY * factorA,
      offsetX * factorB,
      offsetY * factorB,
      muscle,
      diff
    );
  }
}

/** Membership keyed by blueprint node id (equals array index after spawn). */
function solidMembershipFromBodies(
  bodies: RuntimeSolidBody[],
  nodes: PhysicsNode[]
): Map<number, string> {
  const map = new Map<number, string>();
  for (const body of bodies) {
    for (const idx of body.nodeIndices) {
      const n = nodes[idx];
      if (n) map.set(n.id, body.id);
    }
  }
  return map;
}

/**
 * After shape-matching, plant any solid that contacted the floor this frame so
 * the lowest member sits on GROUND_Y and vertical velocity is killed. Contact
 * may have been on a single corner; reshape can lift that corner off the floor
 * unless we re-plant the whole plate. Members are never moved relative to each
 * other here — only a uniform translation — so the plate stays rigid.
 *
 * D144: deepest uses every member including wheels. Skipping wheels made
 * wheeled chassis plates (e.g. Glydor) measure a large negative depth from
 * elevated body nodes and yank the whole plate into the floor.
 *
 * Always lift when members penetrate GROUND_Y. Downward reseating of a solid
 * that merely contacted this frame is only safe on true flat courses
 * (`enabled`); structured supports own contact and must not be yanked to
 * floor height.
 */
function resolveSolidFlatGround(
  creature: Creature,
  solidsThatHitGround: ReadonlySet<string>,
  enabled: boolean
): void {
  const solids = creature.solidBodies;
  if (!solids || solids.length === 0) return;
  for (const body of solids) {
    let deepest = -Infinity;
    for (const idx of body.nodeIndices) {
      const node = creature.nodes[idx];
      if (!node) continue;
      const penetration = node.y + node.radius - GROUND_Y;
      if (penetration > deepest) deepest = penetration;
    }
    if (!Number.isFinite(deepest)) continue;

    const penetrating = deepest > 0;
    const reseat =
      enabled && solidsThatHitGround.has(body.id) && deepest <= 0;
    if (!penetrating && !reseat) continue;

    // Uniform translation only (keeps shape matching intact).
    if (deepest !== 0) {
      for (const idx of body.nodeIndices) {
        const node = creature.nodes[idx];
        if (!node) continue;
        node.y -= deepest;
        node.oldY -= deepest;
      }
    }

    for (const idx of body.nodeIndices) {
      const node = creature.nodes[idx];
      if (!node || node.isWheel) continue;
      if (node.y + node.radius >= GROUND_Y - 0.75) {
        node.isGround = true;
        const vx = node.x - node.oldX;
        node.oldX = node.x - vx * 0.92;
        node.oldY = node.y;
      }
    }
  }
}

function hopRightFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const livePeak = creature.attemptBoutPeakClearance ?? 0;
  const live =
    creature.aerialBoutIsHop && livePeak >= jumpMin
      ? creature.attemptBoutRight ?? 0
      : 0;
  return Math.max(0, (creature.hopDistanceRight ?? 0) + live) * 1.7;
}

function hopLeftFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const livePeak = creature.attemptBoutPeakClearance ?? 0;
  const live =
    creature.aerialBoutIsHop && livePeak >= jumpMin
      ? creature.attemptBoutLeft ?? 0
      : 0;
  return Math.max(0, (creature.hopDistanceLeft ?? 0) + live) * 1.7;
}

function hopSpeedFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
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
  return peak * 55 + Math.min(travel, 200) * 0.15;
}

function normalizedUprightPosture(creature: Creature): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let centerY = 0;
  for (const node of creature.nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y);
    centerY += node.y;
  }
  centerY /= Math.max(1, creature.nodes.length);
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const raw =
    Math.max(0, GROUND_Y - centerY) *
    (0.5 + Math.min(1.5, height / width));
  const reference = Math.max(40, (GROUND_Y - creature.startY) * 2);
  return Math.max(0, Math.min(1, raw / reference));
}

function stayTallFitness(creature: Creature): number {
  const sustained = creature.stayTallIntegral ?? 0;
  const falls = creature.stayTallFallFrames ?? 0;
  return Math.max(0, sustained - falls * 0.35);
}

function jumpHangTimeFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const active =
    creature.aerialBoutIsHop
      ? 0
      : jumpHangBoutScore(
          creature.jumpHangBoutFrames ?? 0,
          creature.jumpHangBoutPeakClearance ?? 0,
          jumpMin
        );
  return Math.max(creature.jumpHangBestBoutScore ?? 0, active);
}

function jumpHeightFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const live =
    creature.aerialBoutIsHop
      ? 0
      : creature.aerialBoutPeakLowestClearance ?? 0;
  const gatedLive =
    (creature.jumpHangBoutFrames ?? 0) >= JUMP_MIN_FRAMES &&
    live >= jumpMin
      ? live
      : 0;
  return Math.max(creature.jumpHeightBestClearance ?? 0, gatedLive);
}

/** Jump right — isolated jump distance right (hop chains score 0). */
function jumpRightFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const active =
    creature.aerialBoutIsHop
      ? 0
      : directionalBoutScore(
          creature.attemptBoutRight ?? 0,
          creature.attemptBoutFrames ?? 0,
          false,
          creature.attemptBoutPeakClearance ?? 0,
          jumpMin
        );
  return Math.max(creature.jumpRightBestBoutScore ?? 0, active);
}

/** Jump left — isolated jump distance left. */
function jumpLeftFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const active =
    creature.aerialBoutIsHop
      ? 0
      : directionalBoutScore(
          creature.attemptBoutLeft ?? 0,
          creature.attemptBoutFrames ?? 0,
          false,
          creature.attemptBoutPeakClearance ?? 0,
          jumpMin
        );
  return Math.max(creature.jumpLeftBestBoutScore ?? 0, active);
}

/** Peak airspeed during an isolated jump. */
function jumpSpeedFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const live =
    creature.aerialBoutIsHop
      ? 0
      : jumpSpeedBoutScore(
          creature.aerialBoutPeakSpeed ?? 0,
          creature.jumpHangBoutFrames ?? 0,
          creature.aerialBoutPeakLowestClearance ?? 0,
          jumpMin
        );
  return Math.max(creature.jumpSpeedBestBoutScore ?? 0, live);
}

/** Jump flips / rotation while airborne from an isolated jump. */
function jumpAcrobaticsFitness(creature: Creature): number {
  const jumpMin = creatureJumpMinClearance(creature);
  const active =
    creature.aerialBoutIsHop
      ? 0
      : acrobaticsBoutScore(
          creature.attemptBoutRotation ?? 0,
          creature.attemptBoutFrames ?? 0,
          creature.attemptBoutPeakClearance ?? 0,
          false,
          jumpMin
        );
  return Math.max(creature.jumpAcrobaticsBestBoutScore ?? 0, active);
}

/** Longest muscle as a soft-body spine proxy for pitch / flips. */
function spineAngle(creature: Creature): number {
  if (creature.muscles.length === 0 || creature.nodes.length < 2) return 0;
  let best = creature.muscles[0];
  let bestLen = 0;
  for (const m of creature.muscles) {
    const a = creature.nodes[m.nodeA];
    const b = creature.nodes[m.nodeB];
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > bestLen) {
      bestLen = len;
      best = m;
    }
  }
  const a = creature.nodes[best.nodeA];
  const b = creature.nodes[best.nodeB];
  if (!a || !b) return 0;
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function stairClimbFitness(creature: Creature): number {
  // Only credit altitude actually stood on (prevents free-jump farming before stairs)
  const supported = creature.stairPeakHeight ?? 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  return supported * 2.8 + forward * 0.12;
}

function obstacleClimbFitness(creature: Creature): number {
  const mounts = Math.max(0, creature.obstacleClimbMountCount ?? 0);
  if (mounts === 0) return 0;
  const supportedHeight = Math.max(0, creature.obstacleClimbSupportedHeight ?? 0);
  const supportedProgress = Math.max(
    0,
    (creature.obstacleClimbSupportedX ?? creature.startX) - creature.startX
  );
  // Ordered mounts dominate. Height and position only shape progress already
  // proven by stable support on authored box tops.
  return mounts * 250 + supportedHeight * 1.5 + supportedProgress * 0.1;
}

function motorRampFitness(creature: Creature): number {
  const rampH = creature.rampPeakHeight ?? 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  return rampH * 2.5 + forward * 0.4;
}

function speedFitness(creature: Creature): number {
  const peak = creature.peakSpeed ?? 0;
  const distance = Math.max(0, creature.currentX - creature.startX);
  // Require real travel (~half body length) so thrashing-in-place cannot win on spike speed.
  const minTravel = Math.max(40, (creature.restBodyWidth ?? 0) * 0.5);
  if (distance < minTravel) return distance * 0.15;
  return peak * 45 + distance * 0.35;
}

function gapFitness(creature: Creature): number {
  const forward = Math.max(0, creature.currentX - creature.startX);
  if (creature.fellInPit) return forward * 0.05;
  const clear = creature.gapCleared ? 180 : 0;
  return clear + forward * 0.35;
}

/**
 * Launch & Land: max points from clearing the pit and sticking a both-wheel
 * pad landing. Forward progress alone (ramp camping) is almost worthless.
 * `wheelLandScore` is the best single pad landing (max, not sum).
 */
function launchLandFitness(creature: Creature): number {
  const land = creature.wheelLandScore ?? 0;
  const gap = creature.gapCleared ? 220 : 0;
  const pitPenalty = creature.fellInPit ? -120 : 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  // Approach nudge only; after clear, light pad progress — never farmable vs land.
  const progress = creature.gapCleared
    ? forward * 0.05
    : Math.min(forward, 120) * 0.012;
  return Math.max(0, land * 1.75 + gap + progress + pitPenalty);
}

function hoopFitness(creature: Creature, objects: WorldObject[]): number {
  const hoop = objects.find(o => o.type === 'hoop');
  const rawTravel = hoop
    ? Math.max(0, hoop.x - hoop.startX)
    : Math.max(0, creature.currentX - creature.startX);
  creature.hoopTravel = Math.max(creature.hoopTravel ?? 0, rawTravel);

  // Rolling on terrain dominates — lofted / ballistic hoop flight barely counts.
  const grounded = creature.hoopGroundedTravel ?? 0;
  const lofted = Math.max(0, rawTravel - grounded);
  const finish = creature.crossedFinish ? 180 : 0;
  const outsidePenalty = Math.min(80, (creature.hoopOutsideFrames ?? 0) * 0.15);
  const loftFrames = creature.hoopLoftFrames ?? 0;
  const peakLoft = creature.hoopPeakLoft ?? 0;
  const loftPenalty = loftFrames * 0.55 + Math.min(400, peakLoft) * 1.1;

  return Math.max(0, grounded + lofted * 0.04 + finish - outsidePenalty - loftPenalty);
}

function hurdlesFitness(creature: Creature): number {
  const cleared = creature.hurdlesCleared ?? 0;
  const finish = creature.crossedFinish ? 120 : 0;
  const forward = Math.max(0, creature.currentX - creature.startX);
  return cleared * 45 + finish + forward * 0.2;
}

function timeTrialFitness(creature: Creature, finishX = FINISH_LINE_X): number {
  const cps = (creature.checkpointReached ?? -1) + 1;
  if (creature.crossedFinish) {
    const frames = creature.finishFrame ?? creature.episodeFrames ?? 9999;
    return 800 + cps * 40 + Math.max(0, 700 - frames);
  }
  const progress = Math.max(0, Math.min(1, (creature.currentX - creature.startX) / (finishX - creature.startX)));
  return progress * 400 + cps * 50;
}

/** Peak ground speed while any node is planted — motor twin of Flight Airspeed. */
function landSpeedFitness(creature: Creature): number {
  const peak = creature.peakLandSpeed ?? 0;
  const distance = Math.max(0, creature.currentX - creature.startX);
  return peak * 55 + Math.min(distance, 800) * 0.2;
}

function bridgeFitness(creature: Creature): number {
  const distance = creature.bridgeSupportedDistance ?? 0;
  const frames = Math.min(100, creature.bridgeSupportedFrames ?? 0);
  return distance * 1.1 + frames * 0.2 + (creature.bridgeCompleted ? 300 : 0);
}

function parkingFitness(creature: Creature, obstacles: Obstacle[] = []): number {
  const park = creature.parkingFrames ?? 0;
  const zone = obstacles.find(o => o.type === 'finish' && o.label === 'PARK');
  const zoneCenter = zone
    ? zone.x + (zone.zoneWidth ?? zone.width) / 2
    : COURSE_START_X + 420 + 70;
  const approach = Math.max(0, 320 - Math.abs(creature.currentX - zoneCenter));
  return park * 2.5 + approach * 0.15;
}

function kickGoalFitness(creature: Creature, objects: WorldObject[]): number {
  const ball = objects.find(o => o.type === 'ball');
  const ballTravel =
    ball && creature.ballCreatureContacted
      ? Math.max(0, ball.x - ball.startX)
      : 0;
  const goal = creature.goalScored ? 300 : 0;
  return goal + Math.min(100, ballTravel * 0.2);
}

function hitTargetFitness(creature: Creature, objects: WorldObject[]): number {
  const hits = creature.targetHits ?? 0;
  const ball = objects.find(o => o.type === 'ball');
  const loft =
    ball && hits > 0 && creature.ballCreatureContacted
      ? Math.max(0, ball.startY - ball.y)
      : 0;
  return hits * 120 + Math.min(40, loft * 0.4);
}

function bowlingFitness(creature: Creature): number {
  return (creature.pinsDown ?? 0) * 40 + Math.max(0, creature.currentX - creature.startX) * 0.1;
}

function dodgeballFitness(creature: Creature): number {
  const sections = creature.hazardProgressCount ?? 0;
  const finish = creature.crossedFinish ? 300 : 0;
  const uprightProgress = Math.min(50, creature.hazardUprightProgress ?? 0);
  return sections * 150 + finish + uprightProgress;
}

function technicalCourseFitness(creature: Creature): number {
  const checkpoints = (creature.checkpointReached ?? -1) + 1;
  const sectionScore = checkpoints * 250;
  const finish = creature.crossedFinish ? 500 : 0;
  const supportedShaping = Math.min(
    100,
    (creature.technicalSupportedDistance ?? 0) * 0.1
  );
  return sectionScore + finish + supportedShaping;
}

function roughTerrainFitness(creature: Creature): number {
  const checkpoints = (creature.checkpointReached ?? -1) + 1;
  const sections = checkpoints * 200;
  const supportedShaping = Math.min(
    150,
    (creature.roughSupportedDistance ?? 0) * 0.08
  );
  const finishSpeedBonus = creature.crossedFinish
    ? Math.max(0, 100 - (creature.finishFrame ?? 1400) / 14)
    : 0;
  const completion = creature.crossedFinish ? 500 + finishSpeedBonus : 0;
  return sections + supportedShaping + completion;
}

/** Whole body clear of the floor — real flight, not one foot up. */
function isFullyAirborne(creature: Creature, minClear?: number): boolean {
  const gate = minClear ?? creatureFlightMinClearance(creature);
  for (const n of creature.nodes) {
    if (n.isGround) return false;
    if (GROUND_Y - (n.y + n.radius) < gate) return false;
  }
  return true;
}

function creatureFlightMinClearance(creature: Creature): number {
  return flightRewardMinClearance(
    creature.restBodyHeight ?? 0,
    creature.restBodyWidth ?? 0
  );
}

function creatureJumpMinClearance(creature: Creature): number {
  return jumpRewardMinClearance(creature.restBodyHeight ?? 0);
}

function creatureJumpLandMinHeight(creature: Creature): number {
  return jumpLandMinHeight(creature.restBodyHeight ?? 0);
}

function creatureFlightLandCeiling(creature: Creature): number {
  return flightLandCeiling(creature.restBodyHeight ?? 0);
}

function creatureGlideCorridor(creature: Creature): { min: number; max: number } {
  return glideCorridorBand(creature.restBodyHeight ?? 0);
}

/** Excess clearance above the flight reward floor (standing / skim → 0). */
function flightExcessClearance(clearance: number, minClear: number): number {
  return Math.max(0, clearance - minClear);
}

function flightClearance(creature: Creature): number {
  return Math.min(...creature.nodes.map(n => GROUND_Y - (n.y + n.radius)));
}

/**
 * Stay Aloft — best single fully-airborne bout (D113 / D143).
 * Landing ends the attempt; separate hops never add together.
 * Symmetrical bird-like flapping is rewarded directly and also yields more
 * lift in aero, so sustain follows the same skill.
 */
function flightTimeBoutScore(
  frames: number,
  peak: number,
  integral: number,
  flapFrames: number,
  flapWork: number,
  symFrames = 0,
  symQuality = 0,
  minClear = FLIGHT_MIN_CLEARANCE_FLOOR
): number {
  const excessPeak = flightExcessClearance(peak, minClear);
  if (frames < 8 || excessPeak < 1) return 0;
  const meanClear = frames > 0 ? integral / frames : 0;
  const excessMean = flightExcessClearance(meanClear, minClear);
  // Bout duration is the streak; episode totals never enter.
  const sustain =
    frames * 2.6 + Math.pow(Math.max(0, frames - 36), 1.18) * 0.32;
  const cruise = Math.min(excessMean, minClear * 2) * 1.15;
  const leapiness =
    excessPeak > minClear * 0.7
      ? Math.max(0, peak / Math.max(minClear, meanClear) - 1.75)
      : 0;
  const leapPenalty = leapiness * excessPeak * 0.42;
  const flapBonus =
    Math.min(140, Math.max(0, flapFrames)) * 0.5 +
    Math.min(200, Math.max(0, flapWork)) * 0.08;
  const symBonus =
    Math.min(120, Math.max(0, symFrames)) * 0.65 +
    Math.min(180, Math.max(0, symQuality)) * 0.5;
  return Math.max(0, sustain + cruise + flapBonus + symBonus - leapPenalty);
}

function activeFlightTimeBoutFitness(creature: Creature): number {
  const flapBase = creature.flightTimeBoutFlapBase ?? 0;
  const workBase = creature.flightTimeBoutWorkBase ?? 0;
  const symBase = creature.flightTimeBoutSymBase ?? 0;
  const symQBase = creature.flightTimeBoutSymQualityBase ?? 0;
  return flightTimeBoutScore(
    creature.flightTimeBoutFrames ?? 0,
    creature.flightTimeBoutPeak ?? 0,
    creature.flightTimeBoutIntegral ?? 0,
    Math.max(0, (creature.wingFlapFrames ?? 0) - flapBase),
    Math.max(0, (creature.wingFlapWork ?? 0) - workBase),
    Math.max(0, (creature.wingSymFlapFrames ?? 0) - symBase),
    Math.max(0, (creature.wingSymFlapQuality ?? 0) - symQBase),
    creatureFlightMinClearance(creature)
  );
}

function flightTimeFitness(creature: Creature): number {
  return Math.max(
    creature.flightTimeBestBoutScore ?? 0,
    activeFlightTimeBoutFitness(creature)
  );
}

function resetFlightTimeBout(creature: Creature): void {
  creature.flightTimeBoutFrames = 0;
  creature.flightTimeBoutPeak = 0;
  creature.flightTimeBoutIntegral = 0;
  creature.flightTimeBoutFlapBase = 0;
  creature.flightTimeBoutWorkBase = 0;
  creature.flightTimeBoutSymBase = 0;
  creature.flightTimeBoutSymQualityBase = 0;
}

function resetFlightAirspeedBout(creature: Creature): void {
  creature.flightAirspeedBoutPeak = 0;
  creature.flightAirspeedBoutFrames = 0;
  creature.flightAirspeedBoutDist = 0;
  creature.flightAirspeedBoutPeakClearance = 0;
}

/** Distance while flying — Proven Glider / paraglider. */
function activeGlideBoutFitness(creature: Creature): number {
  const flyDist = creature.glideBoutDistance ?? 0;
  const air = creature.glideBoutFrames ?? 0;
  const peak = creature.glideBoutPeakClearance ?? 0;
  const minClear = creatureFlightMinClearance(creature);
  const meanClear =
    air > 0 ? (creature.glideBoutHeightIntegral ?? 0) / air : 0;
  const corridor = creature.glideBoutCorridorFrames ?? 0;
  const corridorDist = creature.glideBoutCorridorDist ?? 0;
  const openGlide = creature.glideBoutOpenDist ?? 0;
  const excessPeak = flightExcessClearance(peak, minClear);
  const excessMean = flightExcessClearance(meanClear, minClear);

  // Below the body-scaled flight floor: no glide reward (standing / skim hops).
  if (air < 12 || excessPeak < 1) return 0;

  // Prefer mid-height cruise; do NOT reward ballistic peak height.
  const cruiseHeight =
    Math.min(excessMean, minClear * 2) * 2.4 +
    Math.min(excessPeak, minClear * 2.2) * 0.12;
  // Leap signature: peak much higher than mean → penalty
  const leapiness =
    excessPeak > minClear * 0.6
      ? Math.max(0, peak / Math.max(minClear, meanClear) - 1.55)
      : 0;
  const leapPenalty = leapiness * excessPeak * 0.45;

  // Sustained flight: long unbroken airtime + time in the glide corridor
  const streakBonus =
    air * 1.35 + Math.pow(Math.max(0, air - 100), 1.25) * 0.22;
  const corridorBonus = corridor * 5.2 + corridorDist * 3.8;

  // Raw airborne distance only unlocks after a real sustained streak
  const sustainGate = Math.min(1, air / 140);
  const distScore =
    flyDist * 0.85 * (0.12 + 0.88 * sustainGate) + openGlide * 0.9 * sustainGate;

  return (
    corridorBonus +
    streakBonus +
    distScore +
    cruiseHeight +
    (creature.glideBoutTechniqueBonus ?? 0) * 0.75 -
    leapPenalty
  );
}

/** Glide Range keeps the best single uninterrupted fully-airborne bout. */
function glideRangeFitness(creature: Creature): number {
  return Math.max(
    creature.glideBestBoutScore ?? 0,
    activeGlideBoutFitness(creature)
  );
}

/**
 * Reward reefed run-up → open at real speed → long open glide.
 * Penalize dragging an open sail while still slow on the ground.
 */
function sailTechniqueBonus(creature: Creature): number {
  if (!hasParaglider(creature)) return 0;

  const reefPeak = creature.sailReefedSpeedPeak ?? 0;
  const deploy = creature.sailDeploySpeed ?? 0;
  const openGlide = creature.sailOpenGlideDist ?? 0;
  const early = creature.sailEarlyOpenFrames ?? 0;

  // Speed built while reefed (cap so it shapes takeoff, not infinite rolling)
  const runup = Math.min(reefPeak, 45) * 5;

  // Strong reward for first full open at real takeoff speed (15+ px/f; carts hit 80+)
  const nice = 15;
  let deployBonus = 0;
  if (deploy >= nice) {
    deployBonus = 90 + (Math.min(deploy, 55) - nice) * 6;
  } else if (deploy > 0) {
    deployBonus = deploy * 1.2; // opened too early — weak credit
  }

  const openGlideBonus = openGlide * 1.1; // corridor/streak now carry the long-flight weight
  const earlyPenalty = Math.min(120, early * 0.35);

  return runup + deployBonus + openGlideBonus - earlyPenalty;
}

/** Launch/deploy shaping only; Glide Range tracks open-air distance per bout. */
function sailLaunchTechniqueBonus(creature: Creature): number {
  return (
    sailTechniqueBonus(creature) -
    (creature.sailOpenGlideDist ?? 0) * 1.1
  );
}

/** Flight shaping for one airborne bout (capped below supported completion). */
function aerialCrossingBoutShaping(creature: Creature): number {
  const frames = creature.attemptBoutFrames ?? 0;
  const dist = creature.attemptBoutRight ?? 0;
  if (frames < 3) return 0;
  return Math.min(
    180,
    dist * 0.5 +
      Math.min(120, frames) * 0.25 +
      sailTechniqueBonus(creature) * 0.2
  );
}

/** Cross a pit under power of flight — hop stacking cannot grow shaping. */
function aerialCrossingFitness(creature: Creature): number {
  const flightShaping = Math.max(
    creature.aerialCrossingBestShaping ?? 0,
    aerialCrossingBoutShaping(creature)
  );
  return (creature.aerialCrossingLanded ? 400 : 0) + flightShaping;
}

function balanceBeamFitness(creature: Creature): number {
  const supportedDistance = creature.beamSupportedDistance ?? 0;
  const supportedFrames = Math.min(100, creature.beamSupportedFrames ?? 0);
  const supportedPosture = Math.min(100, creature.beamSupportedPosture ?? 0);
  const completion = creature.beamCompleted ? 250 : 0;
  return (
    supportedDistance * 1.2 +
    supportedFrames * 0.2 +
    supportedPosture * 0.1 +
    completion
  );
}

export function calculateFitness(
  creature: Creature,
  goal: EvolutionGoal,
  objects: WorldObject[] = [],
  customGoal?: CustomGoalConfig,
  obstacles: Obstacle[] = [],
  paraStage?: import('./types').ParaPilotStage
): number {
  switch (goal) {
    case EvolutionGoal.LOCOMOTION_RIGHT:
      return locomotionRightFitness(creature);
    case EvolutionGoal.LOCOMOTION_LEFT:
      return locomotionLeftFitness(creature);
    case EvolutionGoal.SHUFFLE_RIGHT:
      return shuffleRightFitness(creature);
    case EvolutionGoal.SHUFFLE_LEFT:
      return shuffleLeftFitness(creature);
    case EvolutionGoal.HIGH_JUMP:
      return jumpHeightFitness(creature);
    case EvolutionGoal.CLEAR_BAR:
      return clearBarFitness(creature, obstacles);
    case EvolutionGoal.SPEED:
      return speedFitness(creature);
    case EvolutionGoal.JUMP_LAND_UPRIGHT:
      return jumpLandFitness(creature);
    case EvolutionGoal.LONG_JUMP:
      return jumpRightFitness(creature);
    case EvolutionGoal.JUMP_HANG_TIME:
      return jumpHangTimeFitness(creature);
    case EvolutionGoal.JUMP_LEFT:
      return jumpLeftFitness(creature);
    case EvolutionGoal.JUMP_SPEED:
      return jumpSpeedFitness(creature);
    case EvolutionGoal.JUMP_ACROBATICS:
      return jumpAcrobaticsFitness(creature);
    case EvolutionGoal.HOP_RIGHT:
      return hopRightFitness(creature);
    case EvolutionGoal.HOP_LEFT:
      return hopLeftFitness(creature);
    case EvolutionGoal.HOP_SPEED:
      return hopSpeedFitness(creature);
    case EvolutionGoal.STAIR_CLIMB:
      return stairClimbFitness(creature);
    case EvolutionGoal.STAY_UPRIGHT:
      return stayTallFitness(creature);
    case EvolutionGoal.OBSTACLE_CLIMB:
      return obstacleClimbFitness(creature);
    case EvolutionGoal.BALANCE_BEAM:
      return balanceBeamFitness(creature);
    case EvolutionGoal.CARRY_BALL:
      return metricValue(
        { id: 'b', name: 'ball', metric: 'ball_carry', weight: 1 },
        creature,
        objects,
        obstacles
      );
    case EvolutionGoal.PUSH_BOX:
      return metricValue(
        { id: 'p', name: 'box', metric: 'box_push', weight: 1 },
        creature,
        objects,
        obstacles
      );
    case EvolutionGoal.MOTOR_DRIVE:
    case EvolutionGoal.MOTOR_ICE:
      return Math.max(0, creature.currentX - creature.startX);
    case EvolutionGoal.MOTOR_RAMP:
      return motorRampFitness(creature);
    case EvolutionGoal.MOTOR_GAP:
      return gapFitness(creature);
    case EvolutionGoal.MOTOR_LAUNCH_LAND:
      return launchLandFitness(creature);
    case EvolutionGoal.MOTOR_LOOP:
      return hoopFitness(creature, objects);
    case EvolutionGoal.MOTOR_HURDLES:
      return hurdlesFitness(creature);
    case EvolutionGoal.MOTOR_LANDSPEED:
      return landSpeedFitness(creature);
    case EvolutionGoal.SPRINT_FINISH: {
      const finish = obstacles.find(o => o.type === 'finish' && o.label === 'FINISH');
      return timeTrialFitness(creature, finish?.x ?? FINISH_LINE_X);
    }
    case EvolutionGoal.ROUGH_TERRAIN_TRAVERSE:
      return roughTerrainFitness(creature);
    case EvolutionGoal.MOTOR_BRIDGE:
      return bridgeFitness(creature);
    case EvolutionGoal.MOTOR_SLALOM:
      return technicalCourseFitness(creature);
    case EvolutionGoal.PARKING_ZONE:
      return parkingFitness(creature, obstacles);
    case EvolutionGoal.KICK_GOAL:
      return kickGoalFitness(creature, objects);
    case EvolutionGoal.HIT_TARGET:
      return hitTargetFitness(creature, objects);
    case EvolutionGoal.BOWLING_PINS:
      return bowlingFitness(creature);
    case EvolutionGoal.DODGEBALL:
      return dodgeballFitness(creature);
    case EvolutionGoal.FLIGHT_TIME:
      return flightTimeFitness(creature);
    case EvolutionGoal.FLIGHT_HEIGHT:
      return flightHeightFitness(creature);
    case EvolutionGoal.FLIGHT_RIGHT:
      return flightRightFitness(creature);
    case EvolutionGoal.FLIGHT_LEFT:
      return flightLeftFitness(creature);
    case EvolutionGoal.FLIGHT_AIRSPEED:
      return flightAirspeedFitness(creature);
    case EvolutionGoal.FLIGHT_LAND:
      return flightLandFitness(creature);
    case EvolutionGoal.FLIGHT_ACROBATICS:
      return flightAcrobaticsFitness(creature);
    case EvolutionGoal.GLIDE_RANGE:
      return glideRangeFitness(creature);
    case EvolutionGoal.AERIAL_CROSSING:
      return aerialCrossingFitness(creature);
    case EvolutionGoal.PARA_RAMP_GLIDE:
      return paraRampFitness(creature, paraStage ?? 'runUp');
    case EvolutionGoal.CUSTOM:
      return evaluateCustomGoal(creature, customGoal || { name: 'Custom', rules: [] }, objects, obstacles);
    default:
      return 0;
  }
}

/**
 * Physics update step for a single creature.
 */
export function updateCreaturePhysics(
  creature: Creature,
  obstacles: Obstacle[],
  simTime: number,
  config: SimulationConfig,
  objects: WorldObject[] = [],
  /** Optional scripted actuators (−1…1): flexible muscles first, then motor wheels. */
  actuatorOverride?: number[]
) {
  if (!creature.isAlive) return;

  let sumX = 0;
  let sumY = 0;
  for (const node of creature.nodes) {
    sumX += node.x;
    sumY += node.y;
  }
  const centerX = sumX / creature.nodes.length;
  const centerY = sumY / creature.nodes.length;
  const prevX = creature.currentX;
  const prevY = creature.currentY;
  const wasAirborne = !creature.nodes.some(n => n.isGround);

  creature.currentX = centerX;
  creature.currentY = centerY;

  if (centerY < creature.highestY) {
    creature.highestY = centerY;
  }

  const horizSpeed = Math.abs(centerX - prevX);
  const vertSpeed = centerY - prevY; // +Y is down
  creature.currentSpeed = horizSpeed;
  creature.peakSpeed = Math.max(creature.peakSpeed ?? 0, horizSpeed);
  if (!wasAirborne) {
    creature.peakLandSpeed = Math.max(creature.peakLandSpeed ?? 0, horizSpeed);
  }

  if (uprightScore(creature) > 40) {
    creature.uprightFrames = (creature.uprightFrames ?? 0) + 1;
  }

  const inputs: number[] = [
    Math.sin(simTime * 0.1),
    Math.cos(simTime * 0.1),
  ];

  for (const node of creature.nodes) {
    inputs.push((node.x - centerX) / 100);
    inputs.push((node.y - centerY) / 100);
    inputs.push(node.isGround ? 1.0 : 0.0);
  }

  // Winged bodies: body-rate / airflow / altitude pack (F06 / D078)
  if (hasWing(creature)) {
    const ang = creature.bodyAngle ?? 0;
    const om = creature.bodyOmega ?? 0;
    inputs.push(Math.max(-2, Math.min(2, horizSpeed / 6)));
    inputs.push(Math.max(-2, Math.min(2, vertSpeed / 3)));
    inputs.push(Math.sin(ang));
    inputs.push(Math.cos(ang));
    inputs.push(Math.max(-2, Math.min(2, om / 0.25)));
    inputs.push(Math.max(0, Math.min(2, flightClearance(creature) / 100)));
  }

  // Paraglider brains: speed, sail openness, vertical sink + ramp sensors
  if (hasParaglider(creature)) {
    inputs.push(Math.min(2, horizSpeed / 40));
    inputs.push(sailOpenness(creature));
    inputs.push(Math.max(-1.5, Math.min(1.5, vertSpeed / 4)));
    const ramp = findTakeoffRamp(obstacles);
    const rampStart = ramp?.x ?? creature.currentX + 800;
    inputs.push(Math.max(-1, Math.min(2, (rampStart - centerX) / 400)));
    inputs.push(
      ramp && centerX >= ramp.x - 20 && centerX <= ramp.x + ramp.width + 40 ? 1 : 0
    );
  }

  const flyingNow = isFullyAirborne(creature);
  let lockSailReefed = false;
  let dampMotors = false;
  let brainOutputs: number[];

  if (isParaRampGoal(config.goal)) {
    updateParaPhaseGates(creature, obstacles, horizSpeed, flyingNow, inputs);
  }

  if (actuatorOverride) {
    brainOutputs = actuatorOverride;
    lockSailReefed = isParaRampGoal(config.goal) && (creature.paraPhase ?? 'runUp') === 'runUp';
    dampMotors = isParaRampGoal(config.goal) && creature.paraPhase === 'deploy';
  } else if (isParaRampGoal(config.goal) && creature.paraPilot) {
    const evaled = evaluateParaPilotOutputs(creature, inputs);
    brainOutputs = evaled.outputs;
    lockSailReefed = evaled.lockSailReefed;
    dampMotors = evaled.dampMotors;
  } else {
    brainOutputs = evaluateGenome(creature.genome, inputs);
  }

  // Map brain outputs onto flexible muscles / lone telescopes, then motor wheels
  let actuatorIdx = 0;
  for (let mIdx = 0; mIdx < creature.muscles.length; mIdx++) {
    const muscle = creature.muscles[mIdx];
    if (!isBrainDrivenMuscle(muscle, creature.muscles)) {
      if (muscle.aeroType === 'parachute') {
        // Passive canopy: stay fully open / billowed — no genome output.
        muscle.targetLength = muscle.maxLength;
      } else if (!isHardLengthSlave(muscle, creature.muscles)) {
        // Fixed bones hold rest length; hard slaves copy after the soft pass.
        muscle.targetLength = muscle.originalLength;
      }
      continue;
    }
    const rawOutput = brainOutputs[actuatorIdx] !== undefined ? brainOutputs[actuatorIdx] : 0;
    actuatorIdx += 1;
    let normalizedOutput = (rawOutput + 1) / 2;
    // Run-up phase: force sail reefed so Head 1 only learns speed
    if (lockSailReefed && muscle.aeroType === 'paraglider') {
      normalizedOutput = 0;
    }
    const desired =
      muscle.minLength + normalizedOutput * (muscle.maxLength - muscle.minLength);
    // Soft springs jump to command; telescopes / pistons rate-limit extension.
    muscle.targetLength = isVariableHardLink(muscle)
      ? rateLimitHardLengthTarget(muscle, desired)
      : Math.max(muscle.minLength, Math.min(muscle.maxLength, desired));
  }

  // Hard companion on the same node pair slaves to the soft muscle's target.
  for (const muscle of creature.muscles) {
    if (!isHardLengthSlave(muscle, creature.muscles)) continue;
    const soft = findParallelSoftMuscle(muscle, creature.muscles);
    if (!soft) continue;
    const desired = Math.max(
      muscle.minLength,
      Math.min(muscle.maxLength, soft.targetLength)
    );
    muscle.targetLength = rateLimitHardLengthTarget(muscle, desired);
  }

  // Stash motor drive commands; applied after ground contact is resolved
  const motorDrives = new Map<number, number>();
  for (const node of creature.nodes) {
    if (!node.isMotorWheel) continue;
    const raw = brainOutputs[actuatorIdx] !== undefined ? brainOutputs[actuatorIdx] : 0;
    actuatorIdx += 1;
    let clamped = Math.max(-1, Math.min(1, raw));
    if (dampMotors) clamped *= 0.25;
    const power = node.motorPower ?? DEFAULT_MOTOR_POWER;
    motorDrives.set(node.id, clamped * power);
  }

  const gravity = config.gravity !== undefined ? config.gravity : WORLD_GRAVITY;

  for (const node of creature.nodes) {
    const tempX = node.x;
    const tempY = node.y;
    const vx = (node.x - node.oldX) * 0.99;
    const vy = (node.y - node.oldY) * 0.99;
    node.x = node.x + vx;
    node.y = node.y + vy + gravity;
    node.oldX = tempX;
    node.oldY = tempY;
    node.isGround = false;
  }

  applyWind(creature.nodes, config, simTime);

  // Aero freestream must ignore muscle projection (and later contact) Δx as airspeed.
  snapshotAeroVelocities(creature.nodes);

  const useHoop = config.goal === EvolutionGoal.MOTOR_LOOP && objects.some(o => o.type === 'hoop');
  const contactSets = contactObstacleSets(obstacles, useHoop);
  const terrainActive = contactSets.terrainActive;
  // D141 flat-floor pre/replant is only safe on true flat courses. Ramps, stairs,
  // boxes, pits, and loops own support — replanting to GROUND_Y after settle was
  // yanking Motor Cart climbers back to floor height (D142).
  const hasStructuredSupport = obstacles.some(
    o =>
      o.type === 'ramp' ||
      o.type === 'stair' ||
      o.type === 'box' ||
      o.type === 'pit' ||
      o.type === 'loop' ||
      o.type === 'terrain'
  );
  const flatFloorSupport = !useHoop && !terrainActive && !hasStructuredSupport;
  const baseFriction = config.groundFriction !== undefined ? config.groundFriction : 0.8;

  // Skip pre-constraint flat plant: it zeroed vertical aero lift every frame and
  // blocked paraglider takeoff. Narrowed post-settle replant covers walker hops.

  const solidBodies = creature.solidBodies;
  const solidMember =
    solidBodies && solidBodies.length > 0
      ? solidMembershipFromBodies(solidBodies, creature.nodes)
      : null;
  const hingeStopsActive = creatureHasHingeStops(creature.nodes);

  markLengthActuationForTick(creature.muscles);

  for (let step = 0; step < RELAXATION_ITERATIONS; step++) {
    for (const muscle of creature.muscles) {
      if (
        solidMember &&
        isLinkWhollyInsideSolid(muscle.nodeA, muscle.nodeB, solidMember)
      ) {
        continue;
      }
      const nodeA = creature.nodes[muscle.nodeA];
      const nodeB = creature.nodes[muscle.nodeB];
      if (!nodeA || !nodeB) continue;

      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const currentLength = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const target = muscle.targetLength;
      const diff = target - currentLength;
      const strength = isHardLengthConstraint(muscle) ? 1.0 : muscle.strength;
      // Hard links take a full correction step so telescopes stay rigid under load.
      const stepScale = isHardLengthConstraint(muscle) ? 1.0 : 0.5;
      const percent = (diff / currentLength) * strength * stepScale;
      const offsetX = dx * percent;
      const offsetY = dy * percent;

      const totalMass = nodeA.mass + nodeB.mass;
      const factorA = nodeB.mass / totalMass;
      const factorB = nodeA.mass / totalMass;

      applyLengthCorrectionDelta(
        nodeA,
        nodeB,
        offsetX * factorA,
        offsetY * factorA,
        offsetX * factorB,
        offsetY * factorB,
        muscle,
        diff
      );
    }
    if (solidBodies && solidBodies.length > 0) {
      projectSolidBodies(creature.nodes, solidBodies, { preserveVelocity: true });
    }
    if (hingeStopsActive) {
      projectHingeStops(creature.nodes, creature.muscles);
    }
  }

  // Extra hard-only projections so telescopes / bones converge under mass imbalance.
  for (let step = 0; step < 6; step++) {
    projectHardLengthConstraints(creature);
    if (solidBodies && solidBodies.length > 0) {
      projectSolidBodies(creature.nodes, solidBodies, { preserveVelocity: true });
    }
    if (hingeStopsActive) {
      projectHingeStops(creature.nodes, creature.muscles);
    }
  }

  // Wings: plate pressure from this frame's tip motion (flap) and airspeed — no float
  applyWingForces(creature);

  const rigidCapsuleSolids = contactSets.rigidCapsule;
  const pitObstacles = contactSets.pits;
  const rampObstacles = contactSets.ramps;
  const iterativeSolidObs = contactSets.iterative;

  // Multi-pass contacts reduce tunneling through stair risers / thin pads
  for (let pass = 0; pass < OBSTACLE_COLLISION_PASSES; pass++) {
    const withFriction = pass === OBSTACLE_COLLISION_PASSES - 1;
    for (const node of creature.nodes) {
      let friction = baseFriction;

      // Blend global ground friction with per-node grip (ignored for wheels)
      if (!node.isWheel) {
        friction = Math.min(1, Math.max(0, (baseFriction + (node.friction ?? 0.5)) * 0.5));
      }

      // Ice patches: slippery when overlapping ice rectangles on the ground strip
      if (config.arena.iceEnabled || config.goal === EvolutionGoal.MOTOR_ICE) {
        for (const obs of obstacles) {
          if (obs.type !== 'ice') continue;
          if (
            node.x >= obs.x &&
            node.x <= obs.x + obs.width &&
            node.y >= GROUND_Y - node.radius - 4
          ) {
            friction = node.isWheel ? 0.01 : 0.08;
          }
        }
      }

      if (pass === 0) {
        node.isGround = false;
      }

      const pitUnder =
        pitObstacles.length > 0 ? pitUnderNode(node, pitObstacles) : undefined;
      const overPit = pitUnder !== undefined;
      const pitFailureY = pitUnder
        ? pitUnder.y + Math.min(40, pitUnder.height)
        : Infinity;
      // Hoop agents ride the rim — skip external ground so containment owns support
      if (!useHoop) {
        if (terrainActive) {
          // Heightfield owns the floor; flat GROUND_Y would clip through valleys
          if (!overPit) {
            collideNodeTerrain(node, obstacles, friction, withFriction);
          } else if (node.y + node.radius >= pitFailureY) {
            creature.fellInPit = true;
          }
        } else {
          const surfaceY = GROUND_Y;
          if (!overPit && node.y >= surfaceY - node.radius) {
            node.y = surfaceY - node.radius;
            node.isGround = true;
            if (withFriction) applySurfaceFriction(node, friction);
          } else if (node.y + node.radius >= pitFailureY) {
            creature.fellInPit = true;
          }
        }
      }

      // Resolve taller surfaces first so lower treads don't yank through upper ones
      for (const obs of iterativeSolidObs) {
        if (obs.type === 'stair') {
          collideNodeStair(node, obs, friction, withFriction);
        } else if (obs.type === 'loop') {
          collideNodeLoop(node, obs, friction, withFriction);
        } else if (obs.type === 'box') {
          collideNodeAABB(
            node,
            obs.x,
            obs.y,
            obs.x + obs.width,
            obs.y + obs.height,
            friction,
            withFriction
          );
        }
      }
      // Ramp contact is already swept across the node's complete frame motion.
      // Replaying it on every convergence pass is redundant and especially
      // costly for fast creatures.
      if (pass === OBSTACLE_COLLISION_PASSES - 1) {
        for (const ramp of rampObstacles) {
          collideNodeRamp(node, ramp, friction, withFriction);
        }
      }
      if (pitObstacles.length > 0) {
        collideNodePit(node, pitObstacles, friction, withFriction);
      }
    }
    // Node contacts use several passes to converge around thin surfaces and
    // corners. Rigid-link interiors are already sampled after the constraint
    // solve, so repeating the identical subdivision on every pass multiplies
    // complex-body cost and can over-correct long bones. Resolve them once,
    // after iterative node contacts have settled.
    if (pass === OBSTACLE_COLLISION_PASSES - 1) {
      collideRigidBoneCapsules(
        creature,
        rigidCapsuleSolids,
        pitObstacles,
        baseFriction
      );
    }
  }

  // Re-project solids after contact so plates stay rigid under floor pushes.
  if (solidBodies && solidBodies.length > 0) {
    const solidsThatHitGround = new Set<string>();
    for (const body of solidBodies) {
      for (const idx of body.nodeIndices) {
        const node = creature.nodes[idx];
        if (node?.isGround) {
          solidsThatHitGround.add(body.id);
          break;
        }
      }
    }
    // Contact already wrote friction/bounce into oldX/oldY; reshape without
    // re-deriving ω from those residuals (avoids launch amplification).
    projectSolidBodies(creature.nodes, solidBodies, { preserveVelocity: false });
    resolveSolidFlatGround(creature, solidsThatHitGround, flatFloorSupport);
  }
  if (hingeStopsActive) {
    projectHingeStops(creature.nodes, creature.muscles);
  }

  // Track climb support peaks after contacts settle
  let stairSupport = 0;
  let rampSupport = 0;
  for (const node of creature.nodes) {
    const h = supportHeightUnderNode(node, obstacles);
    if (h <= 0) continue;
    for (const obs of obstacles) {
      if (obs.type === 'stair' && node.x >= obs.x - 1 && node.x <= obs.x + obs.width + 1) {
        if (Math.abs(node.y + node.radius - obs.y) < 5) {
          stairSupport = Math.max(stairSupport, GROUND_Y - obs.y);
        }
      }
      if (obs.type === 'ramp' && node.x >= obs.x && node.x <= obs.x + obs.width) {
        const progress = (node.x - obs.x) / obs.width;
        const rampTopY = obs.y + obs.height * (1 - progress);
        if (Math.abs(node.y + node.radius - rampTopY) < 5) {
          rampSupport = Math.max(rampSupport, GROUND_Y - rampTopY);
        }
      }
    }
  }
  creature.stairPeakHeight = Math.max(creature.stairPeakHeight ?? 0, stairSupport);
  creature.rampPeakHeight = Math.max(creature.rampPeakHeight ?? 0, rampSupport);
  if (config.goal === EvolutionGoal.OBSTACLE_CLIMB) {
    trackOrderedObstacleClimbMounts(creature, obstacles);
  }

  // Paraglider lift after ground contact so wheels can leave the floor
  // Reefed Para Ramp run-up: no canopy aero so motor carts keep lip speed for the jump.
  if (!(isParaRampGoal(config.goal) && (creature.paraPhase ?? 'runUp') === 'runUp')) {
    applyParagliderForces(creature);
  }
  // Passive parachutes always apply (no reef curriculum).
  applyParachuteForces(creature);

  // Drop pre-constraint samples so the next tick (or a direct aero unit test)
  // cannot reuse stale airspeed after callers mutate oldX/oldY.
  for (const node of creature.nodes) {
    node.aeroVx = undefined;
    node.aeroVy = undefined;
  }

  // Motor wheels: inject drive only while grounded (airborne is a no-op).
  // Hoop rim torque is applied inside resolveHoopContainment instead.
  // Rigid chassis share is applied here so preserve-on-bone (D142) still climbs.
  if (!useHoop) {
    distributeMotorDriveThroughRigidBones(creature, motorDrives);
  }

  resolveCreatureObjectCollisions(creature, objects, motorDrives);

  const groundedBeforeFinalSettle = new Set<number>();
  for (const node of creature.nodes) {
    if (node.isGround) groundedBeforeFinalSettle.add(node.id);
  }

  // Final hard-length settle after contact (telescopes / bones under load).
  projectHardLengthConstraints(creature);
  if (solidBodies && solidBodies.length > 0) {
    const solidsThatHitGround = new Set<string>();
    for (const body of solidBodies) {
      for (const idx of body.nodeIndices) {
        const node = creature.nodes[idx];
        if (node?.isGround) {
          solidsThatHitGround.add(body.id);
          break;
        }
      }
    }
    projectSolidBodies(creature.nodes, solidBodies, { preserveVelocity: false });
    resolveSolidFlatGround(creature, solidsThatHitGround, flatFloorSupport);
  }
  if (hingeStopsActive) {
    projectHingeStops(creature.nodes, creature.muscles);
  }
  // Walker hop guard only — aero bodies must be free to leave the floor after
  // paraglider / wing impulses (D142).
  if (!hasParaglider(creature) && !hasWing(creature) && !hasParachute(creature)) {
    replantFlatGroundContacts(
      creature.nodes,
      groundedBeforeFinalSettle,
      flatFloorSupport
    );
  }

  creature.episodeFrames = (creature.episodeFrames ?? 0) + 1;
  const eventCenterX =
    creature.nodes.reduce((sum, node) => sum + node.x, 0) / creature.nodes.length;
  const eventCenterY =
    creature.nodes.reduce((sum, node) => sum + node.y, 0) / creature.nodes.length;
  const hasSupportedContact = creature.nodes.some(node => node.isGround);

  if (config.goal === EvolutionGoal.DODGEBALL) {
    const orderedHazards = obstacles
      .filter(
        (obstacle): obstacle is Obstacle & { hazardOrder: number } =>
          obstacle.hazardOrder !== undefined
      )
      .sort((a, b) => a.hazardOrder - b.hazardOrder);
    const expected = creature.hazardProgressCount ?? 0;
    const nextHazard = orderedHazards[expected];
    if (nextHazard) {
      const farEdge = nextHazard.x + nextHazard.width;
      const fullHullBeyond = creature.nodes.every(
        node => node.x - node.radius > farEdge
      );
      if (prevX <= farEdge && fullHullBeyond) {
        creature.hazardProgressCount = expected + 1;
      }
    }

    const priorProgressX = creature.hazardProgressX ?? creature.startX;
    if (eventCenterX > priorProgressX) {
      const progress = eventCenterX - priorProgressX;
      creature.hazardProgressX = eventCenterX;
      creature.hazardUprightProgress =
        (creature.hazardUprightProgress ?? 0) +
        progress * normalizedUprightPosture(creature);
    }
  }

  if (config.goal === EvolutionGoal.BALANCE_BEAM) {
    const beam = obstacles.find(
      obstacle => obstacle.type === 'box' && obstacle.label === 'beam'
    );
    const beamSupport =
      beam !== undefined &&
      creature.nodes.some(node =>
        node.isGround &&
        node.x + node.radius * 0.55 > beam.x &&
        node.x - node.radius * 0.55 < beam.x + beam.width &&
        Math.abs(node.y + node.radius - beam.y) < 5
      );

    if (beam && beamSupport) {
      creature.beamSupportedFrames = (creature.beamSupportedFrames ?? 0) + 1;
      creature.beamSupportedPosture =
        (creature.beamSupportedPosture ?? 0) +
        normalizedUprightPosture(creature);
      if (
        creature.beamContactActive &&
        creature.beamLastSupportedX !== undefined
      ) {
        creature.beamSupportedDistance = Math.min(
          beam.width,
          (creature.beamSupportedDistance ?? 0) +
            Math.max(0, eventCenterX - creature.beamLastSupportedX)
        );
      }
      creature.beamContactActive = true;
      creature.beamLastSupportedX = eventCenterX;

      const nearFarEnd =
        eventCenterX >= beam.x + beam.width - Math.max(20, beam.width * 0.08);
      const traversedMost =
        (creature.beamSupportedDistance ?? 0) >= beam.width * 0.7;
      if (nearFarEnd && traversedMost) {
        creature.beamCompleted = true;
      }
    } else {
      creature.beamContactActive = false;
      creature.beamLastSupportedX = undefined;
    }
  }

  if (config.goal === EvolutionGoal.MOTOR_BRIDGE) {
    const bridge = obstacles.find(
      obstacle => obstacle.type === 'box' && obstacle.label === 'bridge'
    );
    const bridgeSupport =
      bridge !== undefined &&
      creature.nodes.some(node =>
        node.isGround &&
        node.x + node.radius * 0.55 > bridge.x &&
        node.x - node.radius * 0.55 < bridge.x + bridge.width &&
        Math.abs(node.y + node.radius - bridge.y) < 5
      );
    if (bridge && bridgeSupport) {
      creature.bridgeSupportedFrames =
        (creature.bridgeSupportedFrames ?? 0) + 1;
      if (
        creature.bridgeContactActive &&
        creature.bridgeLastSupportedX !== undefined
      ) {
        creature.bridgeSupportedDistance = Math.min(
          bridge.width,
          (creature.bridgeSupportedDistance ?? 0) +
            Math.max(0, eventCenterX - creature.bridgeLastSupportedX)
        );
      }
      creature.bridgeContactActive = true;
      creature.bridgeLastSupportedX = eventCenterX;
      if (
        eventCenterX >=
          bridge.x + bridge.width - Math.max(20, bridge.width * 0.08) &&
        (creature.bridgeSupportedDistance ?? 0) >= bridge.width * 0.7
      ) {
        creature.bridgeCompleted = true;
      }
    } else {
      creature.bridgeContactActive = false;
      creature.bridgeLastSupportedX = undefined;
    }
  }

  if (config.goal === EvolutionGoal.MOTOR_SLALOM && hasSupportedContact) {
    const priorSupportedX = creature.technicalSupportedX ?? creature.startX;
    if (eventCenterX > priorSupportedX) {
      creature.technicalSupportedDistance =
        (creature.technicalSupportedDistance ?? 0) +
        (eventCenterX - priorSupportedX);
      creature.technicalSupportedX = eventCenterX;
    }
  }

  if (
    config.goal === EvolutionGoal.ROUGH_TERRAIN_TRAVERSE &&
    hasSupportedContact
  ) {
    const priorSupportedX = creature.roughSupportedX ?? creature.startX;
    if (eventCenterX > priorSupportedX) {
      creature.roughSupportedDistance =
        (creature.roughSupportedDistance ?? 0) +
        (eventCenterX - priorSupportedX);
      creature.roughSupportedX = eventCenterX;
    }
  }

  // Clear-bar detection: whole hull above the bar during an isolated jump.
  const bar = obstacles.find(o => o.type === 'bar');
  if (bar && !creature.clearedBar && !creature.aerialBoutIsHop) {
    const wholeHullAbove = creature.nodes.every(node => node.y + node.radius < bar.y - 1);
    if (eventCenterX >= bar.x && wholeHullAbove && !hasSupportedContact) {
      creature.clearedBar = true;
    }
  }

  // Gap clear: the full physical hull passed the far lip without a pit fall.
  // Landing goals separately require supported contact after this event.
  const pit = obstacles.find(o => o.type === 'pit');
  if (pit && !creature.gapCleared && !creature.fellInPit) {
    const farLip = pit.x + pit.width;
    const fullHullBeyond = creature.nodes.every(node => node.x - node.radius > farLip);
    if (fullHullBeyond) {
      creature.gapCleared = true;
    }
  }
  if (
    config.goal === EvolutionGoal.AERIAL_CROSSING &&
    pit &&
    creature.gapCleared &&
    hasSupportedContact &&
    creature.nodes.every(node => node.x - node.radius > pit.x + pit.width)
  ) {
    creature.aerialCrossingLanded = true;
  }

  // Finish / parking zone — hoop goal uses hoop center for finish
  const hoopObj = objects.find(o => o.type === 'hoop');
  const finishProbeX = hoopObj ? hoopObj.x : eventCenterX;
  const hazardFinishEligible =
    config.goal !== EvolutionGoal.DODGEBALL ||
    (
      hasSupportedContact &&
      (creature.hazardProgressCount ?? 0) ===
        obstacles.filter(obstacle => obstacle.hazardOrder !== undefined).length
    );
  const technicalFinishEligible =
    config.goal !== EvolutionGoal.MOTOR_SLALOM ||
    (
      hasSupportedContact &&
      (creature.checkpointReached ?? -1) + 1 ===
        obstacles.filter(obstacle => obstacle.checkpointIndex !== undefined).length
    );
  const roughFinishEligible =
    config.goal !== EvolutionGoal.ROUGH_TERRAIN_TRAVERSE ||
    (
      hasSupportedContact &&
      (creature.checkpointReached ?? -1) + 1 ===
        obstacles.filter(obstacle => obstacle.checkpointIndex !== undefined).length
    );
  const checkpointAtFrameStart = creature.checkpointReached ?? -1;
  if (
    config.goal === EvolutionGoal.ROUGH_TERRAIN_TRAVERSE &&
    hasSupportedContact
  ) {
    const orderedCheckpoints = obstacles
      .filter(
        (obstacle): obstacle is Obstacle & { checkpointIndex: number } =>
          obstacle.type === 'checkpoint' && obstacle.checkpointIndex !== undefined
      )
      .sort((left, right) => left.checkpointIndex - right.checkpointIndex);
    const nextCheckpoint = orderedCheckpoints[checkpointAtFrameStart + 1];
    const supportedTravel = creature.roughSupportedDistance ?? 0;
    if (
      nextCheckpoint &&
      eventCenterX >= nextCheckpoint.x &&
      supportedTravel >= (nextCheckpoint.x - creature.startX) * 0.7
    ) {
      creature.checkpointReached = nextCheckpoint.checkpointIndex;
    }
  }
  for (const obs of obstacles) {
    if (obs.type === 'finish') {
      const zoneW = obs.zoneWidth ?? 0;
      if (zoneW > 0) {
        if (finishProbeX >= obs.x && finishProbeX <= obs.x + zoneW && eventCenterY <= obs.y + obs.height) {
          if (obs.label === 'PARK') {
            const slow = (creature.currentSpeed ?? 0) < 0.55;
            const tall = uprightScore(creature) > 35;
            const fullBodyInBay = creature.nodes.every(node =>
              node.x - node.radius >= obs.x && node.x + node.radius <= obs.x + zoneW
            );
            if (slow && tall && hasSupportedContact && fullBodyInBay) {
              creature.parkingFrames = (creature.parkingFrames ?? 0) + 1;
            }
          } else if (obs.label === 'NET') {
            // Ball-based goal checked below
          } else if (
            !creature.crossedFinish &&
            hazardFinishEligible &&
            technicalFinishEligible &&
            roughFinishEligible
          ) {
            creature.crossedFinish = true;
            creature.finishFrame = creature.episodeFrames;
          }
        }
      } else if (
        !creature.crossedFinish &&
        finishProbeX >= obs.x &&
        hazardFinishEligible &&
        technicalFinishEligible &&
        roughFinishEligible
      ) {
        creature.crossedFinish = true;
        creature.finishFrame = creature.episodeFrames;
      }
    }
    if (obs.type === 'checkpoint' && obs.checkpointIndex !== undefined) {
      if (
        eventCenterX >= obs.x &&
        prevX <= obs.x &&
        hasSupportedContact &&
        checkpointAtFrameStart + 1 === obs.checkpointIndex
      ) {
        creature.checkpointReached = obs.checkpointIndex;
      }
    }
  }

  // Track hoop travel each frame — grounded rolling vs lofted flight
  if (hoopObj) {
    const rawTravel = Math.max(0, hoopObj.x - hoopObj.startX);
    creature.hoopTravel = Math.max(creature.hoopTravel ?? 0, rawTravel);

    const surfaceY = hasTerrain(obstacles)
      ? sampleTerrainHeight(obstacles, hoopObj.x)
      : GROUND_Y;
    const rollingCenterY = surfaceY - hoopObj.radius;
    // How far above a normal roll the hoop center is (px; +Y is down)
    const loft = Math.max(0, rollingCenterY - hoopObj.y);
    creature.hoopPeakLoft = Math.max(creature.hoopPeakLoft ?? 0, loft);

    // Allow mild hops over rocks/hills; anything higher is a launch exploit
    const rollingSlack = Math.max(36, hoopObj.radius * 0.35);
    if (loft <= rollingSlack) {
      creature.hoopGroundedTravel = Math.max(creature.hoopGroundedTravel ?? 0, rawTravel);
    } else {
      creature.hoopLoftFrames = (creature.hoopLoftFrames ?? 0) + 1;
    }
  }

  // Hurdles: the whole physical node hull clears each hurdle in order.
  for (const obs of obstacles) {
    if (obs.hurdleIndex === undefined) continue;
    const bit = 1 << obs.hurdleIndex;
    if ((creature.hurdlesHitMask ?? 0) & bit) continue;
    const wholeHullAbove = creature.nodes.every(node => node.y + node.radius < obs.y - 1);
    if (eventCenterX >= obs.x && wholeHullAbove && !hasSupportedContact) {
      creature.hurdlesHitMask = (creature.hurdlesHitMask ?? 0) | bit;
      creature.hurdlesCleared = (creature.hurdlesCleared ?? 0) + 1;
    }
  }

  // Target hits with ball (unique targets)
  const ball = objects.find(o => o.type === 'ball');
  if (ball) {
    const targets = obstacles.filter(o => o.type === 'target');
    let mask = creature.targetHitMask ?? 0;
    for (let i = 0; i < targets.length; i++) {
      const obs = targets[i];
      const tr = obs.targetRadius ?? obs.width / 2;
      if (
        creature.ballCreatureContacted &&
        Math.hypot(ball.x - obs.x, ball.y - obs.y) < tr + ball.radius
      ) {
        mask |= 1 << i;
      }
    }
    creature.targetHitMask = mask;
    let hits = 0;
    for (let m = mask; m; m >>= 1) hits += m & 1;
    creature.targetHits = hits;

    const net = obstacles.find(o => o.type === 'finish' && o.label === 'NET');
    if (
      creature.ballCreatureContacted &&
      net &&
      net.zoneWidth &&
      !creature.goalScored
    ) {
      if (
        ball.x >= net.x &&
        ball.x <= net.x + net.zoneWidth &&
        ball.y <= net.y + net.height &&
        ball.y >= net.y
      ) {
        creature.goalScored = true;
      }
    }
  }

  // Bowling: pins displaced from start
  if (objects.some(o => o.id.startsWith('pin_'))) {
    let down = 0;
    for (const obj of objects) {
      if (!obj.id.startsWith('pin_')) continue;
      const moved = Math.hypot(obj.x - obj.startX, obj.y - obj.startY) > 18;
      const tipped = obj.y > obj.startY + 10;
      if (moved || tipped) down += 1;
    }
    creature.pinsDown = Math.max(creature.pinsDown ?? 0, down);
  }

  // Jump & Land / Flight Land tracking
  const nowGrounded = creature.nodes.some(n => n.isGround);
  const airborneHeight = Math.max(0, creature.startY - centerY);
  const impactSpeed = Math.abs(vertSpeed);
  // +Y is down: climbing ⇒ vertSpeed < 0, descending ⇒ vertSpeed > 0
  const climbing = vertSpeed < -0.2;
  const descending = vertSpeed > 0.28;

  if (config.goal === EvolutionGoal.STAY_UPRIGHT && nowGrounded) {
    const posture = normalizedUprightPosture(creature);
    creature.stayTallSupportedFrames =
      (creature.stayTallSupportedFrames ?? 0) + 1;
    creature.stayTallIntegral = (creature.stayTallIntegral ?? 0) + posture;
    if (posture < 0.25) {
      creature.stayTallFallFrames = (creature.stayTallFallFrames ?? 0) + 1;
    }
  }

  if (!nowGrounded) {
    creature.airbornePeakHeight = Math.max(creature.airbornePeakHeight ?? 0, airborneHeight);

    // Jump & Land: record takeoff X once per bout (non-flight vertical hop)
    if (config.goal === EvolutionGoal.JUMP_LAND_UPRIGHT) {
      if (!wasAirborne || creature.jumpTakeoffX === undefined) {
        creature.jumpTakeoffX = prevX;
      }
    }

    // Flight Land: climb to a ceiling, punish further height gain, then reward descent.
    if (config.goal === EvolutionGoal.FLIGHT_LAND) {
      const landCeiling = creatureFlightLandCeiling(creature);
      const clear = Math.max(airborneHeight, flightClearance(creature));
      if (!creature.landReachedCeiling) {
        if (climbing && clear <= landCeiling * 1.05) {
          const toward = Math.min(clear, landCeiling) / landCeiling;
          creature.landClimbScore =
            (creature.landClimbScore ?? 0) + toward * 0.35 + Math.min(1.2, -vertSpeed) * 0.25;
        }
        if (clear >= landCeiling * 0.92) {
          creature.landReachedCeiling = true;
        }
      } else {
        if (climbing && clear > landCeiling) {
          creature.landOvershootPenalty =
            (creature.landOvershootPenalty ?? 0) +
            ((clear - landCeiling) / landCeiling) * 0.55 +
            Math.min(2, -vertSpeed) * 0.65;
        }
        if (descending) {
          creature.landBeganDescent = true;
          const flare = 1 - Math.min(1, clear / Math.max(landCeiling, 1));
          creature.landDescentScore =
            (creature.landDescentScore ?? 0) +
            Math.min(2.5, vertSpeed) * 0.55 +
            flare * 0.4;
        }
        if (creature.landBeganDescent && climbing) {
          creature.landOvershootPenalty =
            (creature.landOvershootPenalty ?? 0) + Math.min(2, -vertSpeed) * 0.9;
        }
      }
    }
  } else {
    const peakAir = creature.airbornePeakHeight ?? 0;

    // Jump & Land: score only the best isolated jump that lands near takeoff X
    if (
      config.goal === EvolutionGoal.JUMP_LAND_UPRIGHT &&
      wasAirborne &&
      !creature.aerialBoutIsHop
    ) {
      const takeoffX = creature.jumpTakeoffX;
      if (takeoffX !== undefined && peakAir >= creatureJumpLandMinHeight(creature)) {
        const drift = Math.abs(centerX - takeoffX);
        const returnFactor = Math.max(0, 1 - drift / JUMP_LAND_RETURN_TOLERANCE);
        // Squared return: far landings collapse; only near-takeoff sticks.
        const returnQuality = returnFactor * returnFactor;
        if (returnQuality > 0) {
          const upright = uprightScore(creature);
          const uprightMul =
            upright > 40 ? 0.55 + Math.min(1.15, upright / 100) : 0.25;
          const soft = Math.max(0.3, 1 - impactSpeed / 9);
          const attempt = peakAir * returnQuality * uprightMul * soft * 2.2;
          creature.uprightLandingScore = Math.max(
            creature.uprightLandingScore ?? 0,
            attempt
          );
        }
      }
      creature.jumpTakeoffX = undefined;
    } else if (config.goal === EvolutionGoal.JUMP_LAND_UPRIGHT && wasAirborne) {
      creature.jumpTakeoffX = undefined;
    } else if (config.goal === EvolutionGoal.MOTOR_LAUNCH_LAND && wasAirborne) {
      // Best launch → pad landing only (max, not sum). Ramp hops never score.
      if (creature.gapCleared && peakAir >= 32) {
        const motorCount = creature.nodes.filter(n => n.isMotorWheel).length;
        const onPad = motorWheelsOnBoxPad(creature, obstacles);
        if (onPad > 0 && motorCount > 0) {
          const bothWheels = onPad >= Math.min(2, motorCount);
          // One-wheel / partial contact is a weak consolation; both wheels win.
          const wheelFactor = bothWheels ? 1 : 0.22;
          const soft = Math.max(0.2, 1 - impactSpeed / 9);
          const attempt =
            peakAir * (1.35 + (bothWheels ? 1.05 : 0.1)) * wheelFactor * soft;
          creature.wheelLandScore = Math.max(creature.wheelLandScore ?? 0, attempt);
        }
      }
    }

    // Flight Land stick: ceiling + descent + soft upright after a real streak
    const streak = creature.flightStreak ?? 0;
    if (
      config.goal === EvolutionGoal.FLIGHT_LAND &&
      wasAirborne &&
      streak >= 28 &&
      creature.landReachedCeiling &&
      creature.landBeganDescent
    ) {
      const upright = uprightScore(creature);
      const soft = Math.max(0, 1 - impactSpeed / 7.5);
      if (upright > 50 && soft > 0.15) {
        creature.flightLandScore =
          streak * soft * (0.5 + Math.min(1.1, upright / 110));
        creature.flightLandBestBoutScore = Math.max(
          creature.flightLandBestBoutScore ?? 0,
          activeFlightLandBoutFitness(creature)
        );
      }
    }
    creature.airbornePeakHeight = 0;
    creature.landReachedCeiling = false;
    creature.landBeganDescent = false;
    if (config.goal === EvolutionGoal.FLIGHT_LAND && wasAirborne) {
      creature.flightLandScore = 0;
      creature.landClimbScore = 0;
      creature.landDescentScore = 0;
      creature.landOvershootPenalty = 0;
    }
  }

  // Flight / jump air metrics: streak, distance L/R, airspeed, rotation
  const flying = isFullyAirborne(creature);
  const allPointsOff = !nowGrounded;
  const dxRight = Math.max(0, centerX - prevX);
  const dxLeft = Math.max(0, prevX - centerX);
  const angle = spineAngle(creature);
  const airSpeed = Math.hypot(horizSpeed, vertSpeed);

  // Walk gait: progressive plant sequence for Run; Shuffle shares the same
  // contact pass but scores a separate oscillation ledger.
  if (
    config.goal === EvolutionGoal.LOCOMOTION_RIGHT ||
    config.goal === EvolutionGoal.SHUFFLE_RIGHT
  ) {
    updateWalkGait(creature, 1);
  } else if (
    config.goal === EvolutionGoal.LOCOMOTION_LEFT ||
    config.goal === EvolutionGoal.SHUFFLE_LEFT
  ) {
    updateWalkGait(creature, -1);
  } else {
    updateWalkGait(creature, 0);
  }

  // Jump / hop: all points leave the floor; any contact ends the bout.
  // A quick re-takeoff continues a hop chain and revokes the prior isolated jump.
  if (allPointsOff) {
    if (!wasAirborne) {
      const chainHop =
        creature.hadAerialBout === true &&
        (creature.groundedStreak ?? 0) > 0 &&
        (creature.groundedStreak ?? 0) <= HOP_CHAIN_GROUND_MAX;
      if (chainHop) {
        revokeLastIsolatedJumpToHop(creature);
      }
      creature.aerialBoutIsHop = chainHop;
      creature.jumpHangBoutFrames = 1;
      const clear0 = Math.max(0, flightClearance(creature));
      creature.jumpHangBoutPeakClearance = clear0;
      creature.aerialBoutPeakLowestClearance = clear0;
      creature.aerialBoutPeakSpeed = airSpeed;
      if (isIsolatedJumpGoal(config.goal) || config.goal === EvolutionGoal.HOP_RIGHT ||
          config.goal === EvolutionGoal.HOP_LEFT || config.goal === EvolutionGoal.HOP_SPEED) {
        creature.attemptBoutFrames = 1;
        creature.attemptBoutRight = 0;
        creature.attemptBoutLeft = 0;
        creature.attemptBoutPeakClearance = clear0;
        creature.attemptBoutRotation = 0;
      }
    } else if ((creature.jumpHangBoutFrames ?? 0) > 0) {
      creature.jumpHangBoutFrames = (creature.jumpHangBoutFrames ?? 0) + 1;
      const clear = Math.max(0, flightClearance(creature));
      creature.jumpHangBoutPeakClearance = Math.max(
        creature.jumpHangBoutPeakClearance ?? 0,
        clear
      );
      creature.aerialBoutPeakLowestClearance = Math.max(
        creature.aerialBoutPeakLowestClearance ?? 0,
        clear
      );
      creature.aerialBoutPeakSpeed = Math.max(
        creature.aerialBoutPeakSpeed ?? 0,
        airSpeed
      );
      if (
        isIsolatedJumpGoal(config.goal) ||
        config.goal === EvolutionGoal.HOP_RIGHT ||
        config.goal === EvolutionGoal.HOP_LEFT ||
        config.goal === EvolutionGoal.HOP_SPEED
      ) {
        creature.attemptBoutFrames = (creature.attemptBoutFrames ?? 0) + 1;
        creature.attemptBoutRight = (creature.attemptBoutRight ?? 0) + dxRight;
        creature.attemptBoutLeft = (creature.attemptBoutLeft ?? 0) + dxLeft;
        creature.attemptBoutPeakClearance = Math.max(
          creature.attemptBoutPeakClearance ?? 0,
          clear
        );
        if (creature.bodyAngle !== undefined) {
          let dAng = angle - creature.bodyAngle;
          while (dAng > Math.PI) dAng -= Math.PI * 2;
          while (dAng < -Math.PI) dAng += Math.PI * 2;
          creature.attemptBoutRotation =
            (creature.attemptBoutRotation ?? 0) + Math.abs(dAng);
        }
      }
    }
    creature.groundedStreak = 0;
  } else if ((creature.jumpHangBoutFrames ?? 0) > 0) {
    finalizeIsolatedOrHopBout(creature);
    if (
      isIsolatedJumpGoal(config.goal) ||
      config.goal === EvolutionGoal.HOP_RIGHT ||
      config.goal === EvolutionGoal.HOP_LEFT ||
      config.goal === EvolutionGoal.HOP_SPEED
    ) {
      finalizeAttemptBout(creature, config.goal);
    }
    creature.hadAerialBout = true;
    creature.jumpHangBoutFrames = 0;
    creature.jumpHangBoutPeakClearance = 0;
    creature.aerialBoutPeakLowestClearance = 0;
    creature.aerialBoutPeakSpeed = 0;
    creature.aerialBoutIsHop = false;
    creature.groundedStreak = 1;
  } else {
    creature.groundedStreak = (creature.groundedStreak ?? 0) + 1;
  }

  if (flying) {
    const clear = flightClearance(creature);
    creature.flightFrames = (creature.flightFrames ?? 0) + 1;
    creature.flightDistance = (creature.flightDistance ?? 0) + dxRight;
    creature.flightDistanceLeft = (creature.flightDistanceLeft ?? 0) + dxLeft;
    creature.flightHeightIntegral = (creature.flightHeightIntegral ?? 0) + clear;
    creature.flightPeakClearance = Math.max(creature.flightPeakClearance ?? 0, clear);
    creature.peakAirSpeed = Math.max(creature.peakAirSpeed ?? 0, airSpeed);

    // Flight goals keep clearance-gated attempt bouts (not hop-classified).
    if (
      !isIsolatedJumpGoal(config.goal) &&
      config.goal !== EvolutionGoal.HOP_RIGHT &&
      config.goal !== EvolutionGoal.HOP_LEFT &&
      config.goal !== EvolutionGoal.HOP_SPEED
    ) {
      creature.attemptBoutFrames = (creature.attemptBoutFrames ?? 0) + 1;
      creature.attemptBoutRight = (creature.attemptBoutRight ?? 0) + dxRight;
      creature.attemptBoutLeft = (creature.attemptBoutLeft ?? 0) + dxLeft;
      creature.attemptBoutPeakClearance = Math.max(
        creature.attemptBoutPeakClearance ?? 0,
        clear
      );
    }

    if (creature.bodyAngle !== undefined) {
      let dAng = angle - creature.bodyAngle;
      while (dAng > Math.PI) dAng -= Math.PI * 2;
      while (dAng < -Math.PI) dAng += Math.PI * 2;
      creature.airborneRotation = (creature.airborneRotation ?? 0) + Math.abs(dAng);
      if (
        !isIsolatedJumpGoal(config.goal) &&
        config.goal !== EvolutionGoal.HOP_RIGHT &&
        config.goal !== EvolutionGoal.HOP_LEFT &&
        config.goal !== EvolutionGoal.HOP_SPEED
      ) {
        creature.attemptBoutRotation =
          (creature.attemptBoutRotation ?? 0) + Math.abs(dAng);
      }
    }

    creature.flightStreak = (creature.flightStreak ?? 0) + 1;
    creature.flightLongestStreak = Math.max(
      creature.flightLongestStreak ?? 0,
      creature.flightStreak
    );

    // Stay Aloft / Flight Height / Airspeed: one fully-airborne bout; any
    // body-part ground contact ends the attempt (isFullyAirborne → false).
    if (config.goal === EvolutionGoal.FLIGHT_TIME) {
      const flapSeen = creature.wingFlapFrames ?? 0;
      if ((creature.flightTimeBoutFrames ?? 0) === 0) {
        creature.flightTimeBoutFrames = 1;
        creature.flightTimeBoutPeak = clear;
        creature.flightTimeBoutIntegral = clear;
        creature.flightTimeBoutFlapBase = flapSeen;
        creature.flightTimeBoutWorkBase = creature.wingFlapWork ?? 0;
        creature.flightTimeBoutSymBase = creature.wingSymFlapFrames ?? 0;
        creature.flightTimeBoutSymQualityBase = creature.wingSymFlapQuality ?? 0;
      } else {
        creature.flightTimeBoutFrames =
          (creature.flightTimeBoutFrames ?? 0) + 1;
        creature.flightTimeBoutPeak = Math.max(
          creature.flightTimeBoutPeak ?? 0,
          clear
        );
        creature.flightTimeBoutIntegral =
          (creature.flightTimeBoutIntegral ?? 0) + clear;
      }
    }

    if (config.goal === EvolutionGoal.FLIGHT_HEIGHT) {
      const flapSeen = creature.wingFlapFrames ?? 0;
      if ((creature.flightHeightBoutFrames ?? 0) === 0) {
        creature.flightHeightBoutFrames = 1;
        creature.flightHeightBoutPeak = clear;
        creature.flightHeightBoutIntegral = clear;
        creature.flightHeightBoutTakeoffClear = clear;
        creature.flightHeightBoutPoweredClimb = 0;
        creature.flightHeightBoutFlapBase = flapSeen;
        creature.flightHeightBoutWorkBase = creature.wingFlapWork ?? 0;
        creature.flightHeightBoutSymBase = creature.wingSymFlapFrames ?? 0;
        creature.flightHeightBoutSymQualityBase = creature.wingSymFlapQuality ?? 0;
        creature.flightHeightBoutPrevFlap = flapSeen;
      } else {
        creature.flightHeightBoutFrames =
          (creature.flightHeightBoutFrames ?? 0) + 1;
        creature.flightHeightBoutPeak = Math.max(
          creature.flightHeightBoutPeak ?? 0,
          clear
        );
        creature.flightHeightBoutIntegral =
          (creature.flightHeightBoutIntegral ?? 0) + clear;
        const flappingNow = flapSeen > (creature.flightHeightBoutPrevFlap ?? 0);
        creature.flightHeightBoutPrevFlap = flapSeen;
        // Powered climb: COM rose this frame while a wing stroke was active.
        if (flappingNow && vertSpeed < -0.15) {
          creature.flightHeightBoutPoweredClimb =
            (creature.flightHeightBoutPoweredClimb ?? 0) +
            Math.max(0, prevY - centerY);
        }
      }
    }

    if (config.goal === EvolutionGoal.FLIGHT_AIRSPEED) {
      creature.flightAirspeedBoutFrames =
        (creature.flightAirspeedBoutFrames ?? 0) + 1;
      creature.flightAirspeedBoutPeak = Math.max(
        creature.flightAirspeedBoutPeak ?? 0,
        airSpeed
      );
      creature.flightAirspeedBoutDist =
        (creature.flightAirspeedBoutDist ?? 0) + dxRight + dxLeft;
      creature.flightAirspeedBoutPeakClearance = Math.max(
        creature.flightAirspeedBoutPeakClearance ?? 0,
        clear
      );
    }

    const open = hasParaglider(creature) ? sailOpenness(creature) : 1;
    const trackGlideBout =
      config.goal === EvolutionGoal.GLIDE_RANGE ||
      config.goal === EvolutionGoal.PARA_RAMP_GLIDE;
    if (trackGlideBout) {
      creature.glideBoutFrames = (creature.glideBoutFrames ?? 0) + 1;
      creature.glideBoutDistance = (creature.glideBoutDistance ?? 0) + dxRight;
      creature.glideBoutHeightIntegral =
        (creature.glideBoutHeightIntegral ?? 0) + clear;
      creature.glideBoutPeakClearance = Math.max(
        creature.glideBoutPeakClearance ?? 0,
        clear
      );
      if (open >= 0.65) {
        creature.glideBoutOpenDist =
          (creature.glideBoutOpenDist ?? 0) + dxRight;
      }
      if (config.goal === EvolutionGoal.GLIDE_RANGE) {
        creature.glideBoutTechniqueBonus = Math.max(
          creature.glideBoutTechniqueBonus ?? 0,
          sailLaunchTechniqueBonus(creature)
        );
      }
    }
    // Mid-height, gentle vertical motion, open sail, still moving forward
    const corridorBand = creatureGlideCorridor(creature);
    const inCorridor =
      open >= 0.65 &&
      clear >= corridorBand.min &&
      clear <= corridorBand.max &&
      vertSpeed > -1.2 &&
      vertSpeed < 2.8 &&
      horizSpeed > 2.0;
    if (inCorridor) {
      creature.glideCorridorFrames = (creature.glideCorridorFrames ?? 0) + 1;
      creature.glideCorridorDist = (creature.glideCorridorDist ?? 0) + dxRight;
      if (trackGlideBout) {
        creature.glideBoutCorridorFrames =
          (creature.glideBoutCorridorFrames ?? 0) + 1;
        creature.glideBoutCorridorDist =
          (creature.glideBoutCorridorDist ?? 0) + dxRight;
      }
    }
  } else {
    // Any body part on the ground ends the airborne reward period.
    if (
      (creature.attemptBoutFrames ?? 0) > 0 &&
      !isIsolatedJumpGoal(config.goal) &&
      config.goal !== EvolutionGoal.HOP_RIGHT &&
      config.goal !== EvolutionGoal.HOP_LEFT &&
      config.goal !== EvolutionGoal.HOP_SPEED
    ) {
      if (config.goal === EvolutionGoal.AERIAL_CROSSING) {
        creature.aerialCrossingBestShaping = Math.max(
          creature.aerialCrossingBestShaping ?? 0,
          aerialCrossingBoutShaping(creature)
        );
      }
      finalizeAttemptBout(creature, config.goal);
    }
    if (
      config.goal === EvolutionGoal.FLIGHT_TIME &&
      (creature.flightTimeBoutFrames ?? 0) > 0
    ) {
      creature.flightTimeBestBoutScore = Math.max(
        creature.flightTimeBestBoutScore ?? 0,
        activeFlightTimeBoutFitness(creature)
      );
      resetFlightTimeBout(creature);
    }
    if (
      config.goal === EvolutionGoal.FLIGHT_HEIGHT &&
      (creature.flightHeightBoutFrames ?? 0) > 0
    ) {
      creature.flightHeightBestBoutScore = Math.max(
        creature.flightHeightBestBoutScore ?? 0,
        activeFlightHeightBoutFitness(creature)
      );
      resetFlightHeightBout(creature);
    }
    if (
      config.goal === EvolutionGoal.FLIGHT_AIRSPEED &&
      (creature.flightAirspeedBoutFrames ?? 0) > 0
    ) {
      creature.flightAirspeedBestBoutScore = Math.max(
        creature.flightAirspeedBestBoutScore ?? 0,
        activeFlightAirspeedBoutFitness(creature)
      );
      resetFlightAirspeedBout(creature);
    }
    if ((creature.glideBoutFrames ?? 0) > 0) {
      if (config.goal === EvolutionGoal.GLIDE_RANGE) {
        creature.glideBestBoutScore = Math.max(
          creature.glideBestBoutScore ?? 0,
          activeGlideBoutFitness(creature)
        );
      } else if (config.goal === EvolutionGoal.PARA_RAMP_GLIDE) {
        creature.paraAirBestBoutScore = Math.max(
          creature.paraAirBestBoutScore ?? 0,
          paraRampAirBoutScore(creature, config.paraPilotStage ?? 'glide')
        );
      }
      creature.glideBoutFrames = 0;
      creature.glideBoutDistance = 0;
      creature.glideBoutHeightIntegral = 0;
      creature.glideBoutPeakClearance = 0;
      creature.glideBoutCorridorFrames = 0;
      creature.glideBoutCorridorDist = 0;
      creature.glideBoutOpenDist = 0;
      creature.glideBoutTechniqueBonus = 0;
    }
    creature.flightStreak = 0;
  }
  if (creature.bodyAngle !== undefined) {
    let dAng = angle - creature.bodyAngle;
    while (dAng > Math.PI) dAng -= Math.PI * 2;
    while (dAng < -Math.PI) dAng += Math.PI * 2;
    creature.bodyOmega = dAng;
  } else {
    creature.bodyOmega = 0;
  }
  creature.bodyAngle = angle;

  // Paraglider technique: reefed run-up → open at speed → open glide
  if (hasParaglider(creature)) {
    updateSailTechnique(creature, dxRight, horizSpeed, flying);
  }

  recordGait(creature);
  creature.fitness = calculateFitness(
    creature,
    config.goal,
    objects,
    config.customGoal,
    obstacles,
    config.paraPilotStage
  );
}

/** Track reef / deploy / open-glide signals for sail technique fitness. */
function updateSailTechnique(
  creature: Creature,
  dx: number,
  horizSpeed: number,
  flying: boolean
) {
  const open = sailOpenness(creature);
  const prev = creature.sailPrevOpenness ?? open;
  creature.sailPrevOpenness = open;

  const grounded = creature.nodes.some(n => n.isGround);

  // Build speed with sail reefed
  if (grounded && open < 0.38) {
    creature.sailReefedSpeedPeak = Math.max(creature.sailReefedSpeedPeak ?? 0, horizSpeed);
  }

  // Dragging an open canopy while still below deploy speed on the ground
  if (grounded && open > 0.55 && horizSpeed < 15) {
    creature.sailEarlyOpenFrames = (creature.sailEarlyOpenFrames ?? 0) + 1;
  }

  // First full deploy: reefed → open edge; record speed at that moment
  if (prev < 0.4 && open >= 0.72) {
    creature.sailDeploySpeed = Math.max(creature.sailDeploySpeed ?? 0, horizSpeed);
  }

  // Long glide only counts while the sail is open
  if (flying && open >= 0.65) {
    creature.sailOpenGlideDist = (creature.sailOpenGlideDist ?? 0) + dx;
  }
}

/**
 * Advance one agent's private world objects (ball/crate) for a single sim step.
 */
export function stepPrivateWorld(
  objects: WorldObject[],
  obstacles: Obstacle[],
  config: SimulationConfig,
  simTime: number
) {
  if (objects.length === 0) return;
  const gravity = config.gravity !== undefined ? config.gravity : WORLD_GRAVITY;
  const friction = config.groundFriction !== undefined ? config.groundFriction : 0.8;

  if (config.arena.windEnabled) {
    const gust = 1 + 0.65 * Math.sin(simTime * 0.035) * Math.sin(simTime * 0.011);
    const force = config.arena.windStrength * gust;
    for (const obj of objects) {
      obj.x += force / Math.max(0.4, obj.mass);
    }
  }

  for (const obj of objects) {
    stepWorldObject(obj, obstacles, gravity, friction);
  }
}

/**
 * Advance shared arena state. Object physics is per-creature.
 */
export function updateWorldState(
  objects: WorldObject[],
  obstacles: Obstacle[],
  simTime: number,
  config: SimulationConfig
) {
  // Legacy shared-object path (display templates / empty packs)
  stepPrivateWorld(objects, obstacles, config, simTime);
}

function stairRiseForIndex(index: number, difficulty: number): number {
  const d = clampDifficulty(difficulty);
  // Uneven risers: some short, some tall — harder than a uniform staircase
  const pattern = [1.0, 1.2, 0.75, 1.45, 1.05, 0.65, 1.55, 0.9];
  return STAIR_STEP_HEIGHT * d * pattern[index % pattern.length];
}

function makeStairStep(index: number, difficulty = 1, priorHeight = 0): Obstacle {
  const rise = stairRiseForIndex(index, difficulty);
  const height = priorHeight + rise;
  const x = COURSE_START_X + index * STAIR_STEP_WIDTH;
  return {
    type: 'stair',
    x,
    y: GROUND_Y - height,
    // Slight overlap so treads form a continuous walkable edge
    width: STAIR_STEP_WIDTH + 2,
    // Height is visual/bookkeeping only; collision uses tread + riser
    height,
    stairIndex: index,
  };
}

/**
 * Keep an endless staircase generated ahead of the furthest creature.
 * Mutates `obstacles` in place; returns true if stairs were appended.
 */
export function extendEndlessStairs(
  obstacles: Obstacle[],
  furthestX: number,
  difficulty = 1
): boolean {
  const stairs = obstacles.filter(o => o.type === 'stair');
  let nextIndex = 0;
  let priorHeight = 0;
  if (stairs.length > 0) {
    nextIndex = Math.max(...stairs.map(s => s.stairIndex ?? 0)) + 1;
    const last = stairs.reduce((a, b) => ((a.stairIndex ?? 0) > (b.stairIndex ?? 0) ? a : b));
    priorHeight = last.height;
  }

  const needUntilX = furthestX + STAIR_STEP_WIDTH * 14;
  let added = false;
  while (COURSE_START_X + nextIndex * STAIR_STEP_WIDTH < needUntilX) {
    const step = makeStairStep(nextIndex, difficulty, priorHeight);
    priorHeight = step.height;
    obstacles.push(step);
    nextIndex += 1;
    added = true;
    // Safety cap per call
    if (nextIndex > 4000) break;
  }
  return added;
}

/**
 * Soft-body paint: thicken (strengthen) the nearest flexible muscle at a world point.
 */
export function paintMuscleAt(
  creature: Creature,
  worldX: number,
  worldY: number,
  amount = 0.02
): boolean {
  let bestIdx = -1;
  let bestDist = 28;

  for (let i = 0; i < creature.muscles.length; i++) {
    const muscle = creature.muscles[i];
    if (isHardLengthConstraint(muscle)) continue;
    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((worldX - a.x) * dx + (worldY - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const dist = Math.hypot(worldX - px, worldY - py);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return false;
  const muscle = creature.muscles[bestIdx];
  muscle.strength = Math.min(0.97, muscle.strength + amount);
  // Keep blueprint in sync so soft-paint persists across respawns in this generation
  const bp = creature.blueprint.muscles[bestIdx];
  if (bp) bp.strength = muscle.strength;
  return true;
}

export function generateObstacles(
  goal: EvolutionGoal,
  arena?: SimulationConfig['arena']
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const difficulty = clampDifficulty(arena?.difficulty);
  const useTerrain =
    goal === EvolutionGoal.MOTOR_LOOP ||
    goal === EvolutionGoal.ROUGH_TERRAIN_TRAVERSE ||
    !!arena?.terrainEnabled;
  const seed = normalizeSeed(arena?.terrainSeed, 42);
  const courseRandom = seededRandom(normalizeSeed(arena?.courseSeed, 21001));

  if (goal === EvolutionGoal.OBSTACLE_CLIMB) {
    const tier = progressiveFactor(arena?.progressiveTier);
    let currentX = COURSE_START_X + scaleW(40);
    let climbOrder = 0;
    const box = (w: number, h: number) => {
      obstacles.push({
        type: 'box',
        x: currentX,
        y: GROUND_Y - h,
        width: w,
        height: h,
        climbOrder,
      });
      climbOrder += 1;
    };
    box(scaleW(50), Math.round(scaleD(28) * 2 * difficulty * tier));
    currentX += Math.round(scaleW(200) * difficulty);
    box(scaleW(40), Math.round(scaleD(52) * 2 * difficulty * tier));
    currentX += Math.round(scaleW(200) * difficulty);
    box(scaleW(48), Math.round(scaleD(22) * 2 * difficulty * tier));
    obstacles.push({
      type: 'box',
      x: currentX + scaleW(50),
      y: GROUND_Y - Math.round(40 * difficulty * tier),
      width: scaleW(48),
      height: Math.round(40 * difficulty * tier),
      climbOrder: climbOrder++,
    });
    obstacles.push({
      type: 'box',
      x: currentX + scaleW(100),
      y: GROUND_Y - Math.round(58 * difficulty * tier),
      width: scaleW(48),
      height: Math.round(58 * difficulty * tier),
      climbOrder: climbOrder++,
    });
    obstacles.push({
      type: 'box',
      x: currentX + scaleW(150),
      y: GROUND_Y - Math.round(78 * difficulty * tier),
      width: scaleW(90),
      height: Math.round(78 * difficulty * tier),
      climbOrder: climbOrder++,
    });
    obstacles.push({
      type: 'box',
      x: currentX + scaleW(260),
      y: GROUND_Y - Math.round(52 * difficulty * tier),
      width: scaleW(48),
      height: Math.round(52 * difficulty * tier),
      climbOrder: climbOrder++,
    });
    currentX += Math.round(scaleW(520) * difficulty);
    box(scaleW(90), Math.round(68 * difficulty * tier));
    currentX += Math.round(scaleW(240) * difficulty);
    box(scaleW(36), Math.round(100 * difficulty * tier));
    currentX += Math.round(scaleW(240) * difficulty);

    for (let i = 0; i < 24; i++) {
      const height = Math.round((40 + courseRandom() * 70) * difficulty * tier);
      obstacles.push({
        type: 'box',
        x: currentX,
        y: GROUND_Y - height,
        width: scaleW(48) + courseRandom() * scaleW(50),
        height,
        climbOrder: climbOrder++,
      });
      currentX += Math.round(scaleW(200) + courseRandom() * scaleW(120));
    }
  }

  if (goal === EvolutionGoal.STAIR_CLIMB) {
    let prior = 0;
    for (let i = 0; i < STAIR_AHEAD_STEPS; i++) {
      const step = makeStairStep(i, difficulty, prior);
      prior = step.height;
      obstacles.push(step);
    }
  }

  if (goal === EvolutionGoal.CLEAR_BAR) {
    const tier = progressiveFactor(arena?.progressiveTier);
    const barClearHeight = Math.round(120 * (0.9 + difficulty * 0.25) * tier);
    const barX = COURSE_START_X + Math.round(scaleW(480) * difficulty);
    const barY = GROUND_Y - barClearHeight;
    const uprightW = scaleW(12);
    const uprightH = barClearHeight + 24;
    obstacles.push({
      type: 'box',
      x: barX - scaleW(48),
      y: GROUND_Y - uprightH,
      width: uprightW,
      height: uprightH,
    });
    obstacles.push({
      type: 'box',
      x: barX + scaleW(36),
      y: GROUND_Y - uprightH,
      width: uprightW,
      height: uprightH,
    });
    obstacles.push({
      type: 'bar',
      x: barX,
      y: barY,
      width: scaleW(84),
      height: scaleD(5),
      barClearHeight,
    });
  }

  // Procedural terrain: selectable for any goal; always on for hamster hoop
  if (useTerrain) {
    const includeObstacles = !!arena?.terrainObstaclesEnabled;
    obstacles.push(...buildHoopTerrain(seed, difficulty, includeObstacles));
    if (goal === EvolutionGoal.MOTOR_LOOP) {
      obstacles.push(makeFinish(hoopFinishX(difficulty)));
    }
  }

  // Goal-specific arenas (hoop geometry is terrain-only above)
  if (goal !== EvolutionGoal.MOTOR_LOOP) {
    obstacles.push(...buildGoalArena(goal, arena));
  }

  applyArenaModifiers(obstacles, goal, arena);

  if (useTerrain) {
    snapObstaclesToTerrain(obstacles);
  }

  return obstacles;
}
