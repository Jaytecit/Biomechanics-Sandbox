import {
  CreatureBlueprint,
  EvolutionGoal,
  countFlexibleMuscles,
  countMotorWheels,
  effectiveAeroArea,
  isHardLengthConstraint,
  isBrainDrivenMuscle,
} from './types';
import { GOAL_ORDER } from './goalCatalog';
import { inspectBlueprint } from './zones';
import { normalizeSeed, seededRandom } from './determinism';

export type CapabilityStatus = 'equipped' | 'plausible but unproven' | 'missing prerequisite' | 'not applicable';
export interface CapabilityReport {
  seed: number;
  label: 'Untrained potential probe';
  confidence: 'low' | 'medium';
  structural: {
    mass: number; width: number; height: number; centerX: number; centerY: number;
    nodes: number; rigidLinks: number; flexibleActuators: number; motorWheels: number;
    contractionRange: number; muscleWorkProxy: number; powerToMassProxy: number;
    contactCount: number; supportSpan: number; aeroArea: number; wingLoadingProxy: number | null;
    controlSurfaces: number; symmetry: number;
  };
  envelopes: {
    groundSpeed: number; jumpClearance: number; airtime: number;
    climbResponse: number; sinkResponse: number; glideRatio: number; stability: number;
  };
  goals: Record<EvolutionGoal, { status: CapabilityStatus; reason: string }>;
  caveat: string;
}

export function analyzeCapability(blueprint: CreatureBlueprint, seedInput = 21004): CapabilityReport {
  const seed = normalizeSeed(seedInput, 21004);
  const rng = seededRandom(seed);
  const positions = blueprint.relativePositions;
  const mass = blueprint.nodes.reduce((sum, node) => sum + Math.max(0.01, node.mass), 0);
  const minX = Math.min(...positions.map(point => point.x));
  const maxX = Math.max(...positions.map(point => point.x));
  const minY = Math.min(...positions.map(point => point.y));
  const maxY = Math.max(...positions.map(point => point.y));
  const centerX = blueprint.nodes.reduce((sum, node, index) => sum + positions[index].x * node.mass, 0) / mass;
  const centerY = blueprint.nodes.reduce((sum, node, index) => sum + positions[index].y * node.mass, 0) / mass;
  const flexible = blueprint.muscles.filter(muscle => isBrainDrivenMuscle(muscle, blueprint.muscles));
  const rigid = blueprint.muscles.filter(muscle => isHardLengthConstraint(muscle)).length;
  const motorWheels = countMotorWheels(blueprint.nodes);
  const contacts = blueprint.nodes.filter(node => node.isWheel || node.friction >= 0.2).length;
  const contactXs = blueprint.nodes.map((node, index) => ({ node, x: positions[index].x }))
    .filter(item => item.node.isWheel || item.node.friction >= 0.2).map(item => item.x);
  const supportSpan = contactXs.length ? Math.max(...contactXs) - Math.min(...contactXs) : 0;
  const contractionRange = flexible.reduce((sum, muscle) =>
    sum + Math.max(0, muscle.maxLength - muscle.minLength), 0);
  const work = flexible.reduce((sum, muscle) =>
    sum + Math.max(0, muscle.maxLength - muscle.minLength) * muscle.strength, 0);
  const motorPower = blueprint.nodes.reduce((sum, node) => sum + (node.isMotorWheel ? node.motorPower ?? 0.45 : 0), 0);
  const aeroMuscles = blueprint.muscles.filter(muscle => muscle.aeroType && muscle.aeroType !== 'none');
  const aeroArea = aeroMuscles.reduce((sum, muscle) => sum + effectiveAeroArea(muscle), 0);
  const traits = inspectBlueprint(blueprint);
  const symmetryPairs = positions.flatMap((point, index) =>
    positions.slice(index + 1).map(other => Math.abs(point.x + other.x) + Math.abs(point.y - other.y))
  );
  const symmetry = symmetryPairs.length
    ? Math.max(0, 1 - Math.min(...symmetryPairs) / Math.max(1, maxX - minX + maxY - minY))
    : 0;
  const stability = Math.max(0, Math.min(1, (supportSpan / Math.max(20, maxX - minX)) * 0.7 + contacts * 0.05));
  const powerToMass = (work * 0.035 + motorPower * 8) / mass;
  const pulseNoise = 0.98 + rng() * 0.04;
  const groundSpeed = Math.max(0, (motorPower * 0.7 + work * 0.006) / Math.sqrt(mass)) * pulseNoise;
  const jumpClearance = Math.max(0, work / mass * 0.9) * stability;
  const airtime = Math.sqrt(Math.max(0, jumpClearance) / 0.2) * 2;
  const glideRatio = aeroArea > 0 ? Math.max(0, aeroArea / Math.max(10, mass * 9)) : 0;

  const goals = {} as CapabilityReport['goals'];
  for (const goal of GOAL_ORDER) {
    let status: CapabilityStatus = 'plausible but unproven';
    let reason = 'Structure has no obvious blocker; learning is still unproven.';
    if (goal === EvolutionGoal.CUSTOM) {
      status = 'not applicable'; reason = 'Depends on the selected validated custom rules.';
    }
    if ([
      EvolutionGoal.MOTOR_DRIVE, EvolutionGoal.MOTOR_RAMP, EvolutionGoal.MOTOR_ICE,
      EvolutionGoal.MOTOR_GAP, EvolutionGoal.MOTOR_LAUNCH_LAND, EvolutionGoal.MOTOR_LOOP,
      EvolutionGoal.MOTOR_HURDLES, EvolutionGoal.MOTOR_LANDSPEED, EvolutionGoal.MOTOR_BRIDGE,
      EvolutionGoal.MOTOR_SLALOM,
    ].includes(goal)) {
      status = motorWheels > 0 ? 'equipped' : 'missing prerequisite';
      reason = motorWheels > 0 ? `${motorWheels} powered wheel(s); control remains untrained.` : 'Requires at least one powered wheel.';
    } else if ([
      EvolutionGoal.FLIGHT_TIME, EvolutionGoal.FLIGHT_HEIGHT, EvolutionGoal.FLIGHT_RIGHT,
      EvolutionGoal.FLIGHT_LEFT, EvolutionGoal.FLIGHT_AIRSPEED, EvolutionGoal.FLIGHT_LAND,
      EvolutionGoal.FLIGHT_ACROBATICS, EvolutionGoal.GLIDE_RANGE, EvolutionGoal.AERIAL_CROSSING,
      EvolutionGoal.PARA_RAMP_GLIDE,
    ].includes(goal)) {
      status = traits.hasAero ? 'equipped' : 'missing prerequisite';
      reason = traits.hasAero ? `${aeroArea.toFixed(0)} area proxy; sustained flight remains unproven.` : 'Requires an aerodynamic surface.';
    } else if ([
      EvolutionGoal.HIGH_JUMP, EvolutionGoal.CLEAR_BAR, EvolutionGoal.JUMP_LAND_UPRIGHT,
      EvolutionGoal.LONG_JUMP, EvolutionGoal.JUMP_HANG_TIME, EvolutionGoal.JUMP_LEFT,
      EvolutionGoal.JUMP_SPEED, EvolutionGoal.JUMP_ACROBATICS,
      EvolutionGoal.HOP_RIGHT, EvolutionGoal.HOP_LEFT, EvolutionGoal.HOP_SPEED,
    ].includes(goal)) {
      status = flexible.length > 0 ? 'plausible but unproven' : 'missing prerequisite';
      reason = flexible.length > 0 ? `${flexible.length} flexible actuator(s); takeoff not yet learned.` : 'Requires a flexible actuator for muscle jump readiness.';
    }
    goals[goal] = { status, reason };
  }

  return {
    seed, label: 'Untrained potential probe', confidence: 'low',
    structural: {
      mass, width: maxX - minX, height: maxY - minY, centerX, centerY,
      nodes: blueprint.nodes.length, rigidLinks: rigid,
      flexibleActuators: countFlexibleMuscles(blueprint.muscles), motorWheels,
      contractionRange, muscleWorkProxy: work, powerToMassProxy: powerToMass,
      contactCount: contacts, supportSpan, aeroArea,
      wingLoadingProxy: aeroArea > 0 ? mass / aeroArea : null,
      controlSurfaces: aeroMuscles.length, symmetry,
    },
    envelopes: {
      groundSpeed, jumpClearance, airtime,
      climbResponse: aeroArea > 0 ? aeroArea / mass * 0.02 : 0,
      sinkResponse: aeroArea > 0 ? mass / aeroArea * 0.5 : 0,
      glideRatio, stability,
    },
    goals,
    caveat: 'Deterministic bounded pulses are diagnostics, not fitness, competition score, or proof of learning. A learned policy may perform better or worse.',
  };
}
