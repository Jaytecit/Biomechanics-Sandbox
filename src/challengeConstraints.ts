/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Challenge morphology gates — enforced at launch and while scoring.
 */

import {
  ChallengeBodyConstraints,
  ChallengeDefinition,
  countFlexibleMuscles,
  countMotorWheels,
  CreatureBlueprint,
  DEFAULT_MOTOR_POWER,
} from './types';
import { inspectBlueprint } from './zones';

export interface BlueprintMetrics {
  nodes: number;
  muscles: number;
  flexibleMuscles: number;
  motorWheels: number;
  maxMotorPower: number;
  aeroSurfaces: number;
  mass: number;
  width: number;
  height: number;
  footSpan: number;
  hasWing: boolean;
  hasParaglider: boolean;
  hasParachute: boolean;
  hasMotorWheel: boolean;
  hasPassiveWheel: boolean;
  hasAero: boolean;
}

export interface ChallengeConstraintResult {
  ok: boolean;
  reasons: string[];
  metrics: BlueprintMetrics;
}

export function measureBlueprint(blueprint: CreatureBlueprint): BlueprintMetrics {
  const traits = inspectBlueprint(blueprint);
  const positions = blueprint.relativePositions;
  const masses = blueprint.nodes.map(n => Math.max(0.01, n.mass));
  const mass = masses.reduce((sum, value) => sum + value, 0);
  const xs = positions.map(p => p.x);
  const ys = positions.map(p => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const contactXs = blueprint.nodes
    .map((node, index) => ({ node, x: positions[index].x }))
    .filter(item => item.node.isWheel || item.node.isFoot || item.node.friction >= 0.2)
    .map(item => item.x);
  const footSpan =
    contactXs.length >= 2 ? Math.max(...contactXs) - Math.min(...contactXs) : 0;
  const motorPowers = blueprint.nodes
    .filter(node => node.isMotorWheel)
    .map(node => node.motorPower ?? DEFAULT_MOTOR_POWER);
  const aeroSurfaces = blueprint.muscles.filter(
    muscle => muscle.aeroType && muscle.aeroType !== 'none'
  ).length;

  return {
    nodes: blueprint.nodes.length,
    muscles: blueprint.muscles.length,
    flexibleMuscles: countFlexibleMuscles(blueprint.muscles),
    motorWheels: countMotorWheels(blueprint.nodes),
    maxMotorPower: motorPowers.length ? Math.max(...motorPowers) : 0,
    aeroSurfaces,
    mass,
    width,
    height,
    footSpan,
    hasWing: traits.hasWing,
    hasParaglider: traits.hasParaglider,
    hasParachute: traits.hasParachute,
    hasMotorWheel: traits.hasMotorWheel,
    hasPassiveWheel: traits.hasPassiveWheel,
    hasAero: traits.hasAero,
  };
}

export function evaluateChallengeConstraints(
  blueprint: CreatureBlueprint,
  constraints?: ChallengeBodyConstraints
): ChallengeConstraintResult {
  const metrics = measureBlueprint(blueprint);
  if (!constraints) return { ok: true, reasons: [], metrics };

  const reasons: string[] = [];
  const push = (ok: boolean, message: string) => {
    if (!ok) reasons.push(message);
  };

  if (constraints.maxNodes !== undefined) {
    push(metrics.nodes <= constraints.maxNodes, `≤${constraints.maxNodes} nodes (have ${metrics.nodes})`);
  }
  if (constraints.minNodes !== undefined) {
    push(metrics.nodes >= constraints.minNodes, `≥${constraints.minNodes} nodes (have ${metrics.nodes})`);
  }
  if (constraints.maxMuscles !== undefined) {
    push(
      metrics.muscles <= constraints.maxMuscles,
      `≤${constraints.maxMuscles} links (have ${metrics.muscles})`
    );
  }
  if (constraints.minFlexibleMuscles !== undefined) {
    push(
      metrics.flexibleMuscles >= constraints.minFlexibleMuscles,
      `≥${constraints.minFlexibleMuscles} flexible muscles (have ${metrics.flexibleMuscles})`
    );
  }
  if (constraints.maxMotorWheels !== undefined) {
    push(
      metrics.motorWheels <= constraints.maxMotorWheels,
      `≤${constraints.maxMotorWheels} motor wheel(s) (have ${metrics.motorWheels})`
    );
  }
  if (constraints.minMotorWheels !== undefined) {
    push(
      metrics.motorWheels >= constraints.minMotorWheels,
      `≥${constraints.minMotorWheels} motor wheel(s) (have ${metrics.motorWheels})`
    );
  }
  if (constraints.maxMotorPower !== undefined && metrics.motorWheels > 0) {
    push(
      metrics.maxMotorPower <= constraints.maxMotorPower + 1e-6,
      `motor power ≤${constraints.maxMotorPower} (max wheel ${metrics.maxMotorPower.toFixed(1)})`
    );
  }
  if (constraints.maxAeroSurfaces !== undefined) {
    push(
      metrics.aeroSurfaces <= constraints.maxAeroSurfaces,
      `≤${constraints.maxAeroSurfaces} aero surface(s) (have ${metrics.aeroSurfaces})`
    );
  }
  if (constraints.minAeroSurfaces !== undefined) {
    push(
      metrics.aeroSurfaces >= constraints.minAeroSurfaces,
      `≥${constraints.minAeroSurfaces} aero surface(s) (have ${metrics.aeroSurfaces})`
    );
  }
  if (constraints.requireWing) {
    push(metrics.hasWing, 'requires at least one wing');
  }
  if (constraints.requireParaglider) {
    push(metrics.hasParaglider, 'requires a paraglider');
  }
  if (constraints.requireParachute) {
    push(metrics.hasParachute, 'requires a parachute');
  }
  if (constraints.forbidAero) {
    push(!metrics.hasAero, 'no wings, paragliders, or parachutes');
  }
  if (constraints.forbidMotorWheels) {
    push(!metrics.hasMotorWheel, 'no powered wheels');
  }
  if (constraints.forbidPassiveWheels) {
    push(!metrics.hasPassiveWheel, 'no passive wheels');
  }
  if (constraints.maxMass !== undefined) {
    push(metrics.mass <= constraints.maxMass + 1e-6, `mass ≤${constraints.maxMass.toFixed(1)} (have ${metrics.mass.toFixed(1)})`);
  }
  if (constraints.maxWidth !== undefined) {
    push(metrics.width <= constraints.maxWidth + 1e-6, `width ≤${Math.round(constraints.maxWidth)}px (have ${Math.round(metrics.width)})`);
  }
  if (constraints.maxHeight !== undefined) {
    push(
      metrics.height <= constraints.maxHeight + 1e-6,
      `height ≤${Math.round(constraints.maxHeight)}px (have ${Math.round(metrics.height)})`
    );
  }
  if (constraints.maxFootSpan !== undefined) {
    push(
      metrics.footSpan <= constraints.maxFootSpan + 1e-6,
      `foot span ≤${Math.round(constraints.maxFootSpan)}px (have ${Math.round(metrics.footSpan)})`
    );
  }

  const equipment = constraints.allowedEquipment;
  if (equipment?.motorWheels === false && metrics.hasMotorWheel) {
    reasons.push('powered wheels not allowed');
  }
  if (equipment?.passiveWheels === false && metrics.hasPassiveWheel) {
    reasons.push('passive wheels not allowed');
  }
  if (equipment?.aero === false && metrics.hasAero) {
    reasons.push('aero equipment not allowed');
  }

  return { ok: reasons.length === 0, reasons, metrics };
}

/** Reusable constraint envelopes aligned with zone equipment rules. */
export const CHALLENGE_PRESETS = {
  walkingMuscle: {
    forbidAero: true,
    forbidMotorWheels: true,
    forbidPassiveWheels: true,
    maxNodes: 14,
    maxMuscles: 22,
    minFlexibleMuscles: 1,
    maxMass: 28,
    maxWidth: 340,
    maxHeight: 220,
    maxFootSpan: 220,
  } satisfies ChallengeBodyConstraints,
  jumpingMuscle: {
    forbidAero: true,
    forbidMotorWheels: true,
    forbidPassiveWheels: true,
    maxNodes: 12,
    maxMuscles: 18,
    minFlexibleMuscles: 1,
    maxMass: 24,
    maxWidth: 320,
    maxHeight: 240,
  } satisfies ChallengeBodyConstraints,
  motorCart: {
    forbidAero: true,
    minMotorWheels: 1,
    maxMotorWheels: 2,
    maxMotorPower: 9,
    maxNodes: 8,
    maxMuscles: 8,
    maxMass: 14,
    maxWidth: 360,
    maxHeight: 140,
  } satisfies ChallengeBodyConstraints,
  motorTwin: {
    forbidAero: true,
    minMotorWheels: 2,
    maxMotorWheels: 2,
    maxMotorPower: 9,
    maxNodes: 8,
    maxMuscles: 10,
    maxMass: 14,
    maxWidth: 360,
    maxHeight: 140,
  } satisfies ChallengeBodyConstraints,
  wingFlapper: {
    requireWing: true,
    forbidMotorWheels: true,
    forbidPassiveWheels: true,
    minAeroSurfaces: 1,
    maxAeroSurfaces: 6,
    maxNodes: 18,
    maxMuscles: 28,
    maxMass: 22,
    maxWidth: 560,
    maxHeight: 280,
  } satisfies ChallengeBodyConstraints,
  glider: {
    requireParaglider: true,
    minMotorWheels: 0,
    maxMotorWheels: 2,
    maxMotorPower: 9,
    minAeroSurfaces: 1,
    maxAeroSurfaces: 2,
    maxNodes: 14,
    maxMuscles: 18,
    maxMass: 18,
    maxWidth: 360,
    maxHeight: 200,
  } satisfies ChallengeBodyConstraints,
  paraRig: {
    requireParaglider: true,
    minMotorWheels: 2,
    maxMotorWheels: 2,
    maxMotorPower: 9,
    minAeroSurfaces: 1,
    maxAeroSurfaces: 2,
    maxNodes: 14,
    maxMuscles: 18,
    maxMass: 18,
    maxWidth: 360,
    maxHeight: 200,
  } satisfies ChallengeBodyConstraints,
} as const;

export function formatChallengeRules(challenge: ChallengeDefinition): string {
  const parts: string[] = [];
  const c = challenge.constraints;
  if (c?.maxNodes !== undefined) parts.push(`≤${c.maxNodes} nodes`);
  if (c?.maxMotorWheels !== undefined && c.minMotorWheels) {
    parts.push(`${c.minMotorWheels}–${c.maxMotorWheels} motor wheels`);
  } else if (c?.maxMotorWheels !== undefined) {
    parts.push(`≤${c.maxMotorWheels} motor wheels`);
  } else if (c?.minMotorWheels) {
    parts.push(`≥${c.minMotorWheels} motor wheels`);
  }
  if (c?.maxMotorPower !== undefined) parts.push(`motor ≤${c.maxMotorPower}`);
  if (c?.requireWing) parts.push('wing required');
  if (c?.requireParaglider) parts.push('paraglider required');
  if (c?.forbidAero) parts.push('muscle-only');
  if (c?.maxAeroSurfaces !== undefined && !c.requireWing && !c.requireParaglider) {
    parts.push(`≤${c.maxAeroSurfaces} aero`);
  }
  if (c?.maxMass !== undefined) parts.push(`mass ≤${c.maxMass}`);
  if (c?.maxWidth !== undefined) parts.push(`width ≤${Math.round(c.maxWidth)}px`);
  if (challenge.episodeSeconds) parts.push(`${challenge.episodeSeconds}s episode`);
  if (challenge.recommendedBody) parts.push(`try ${challenge.recommendedBody}`);
  return parts.join(' · ');
}
