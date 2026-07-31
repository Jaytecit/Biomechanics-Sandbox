/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CreatureBlueprint,
  MAX_LINK_LENGTH,
  MAX_MOTOR_POWER,
  MAX_NODE_RADIUS,
} from './types';
import { AppearanceRig } from './creaturePackages';

/** Linear scale from legacy authoring units to arena world units. */
export const CREATURE_WORLD_SCALE = 0.1;

/**
 * Legacy detection must sit strictly above current world clamps
 * ({@link MAX_NODE_RADIUS}, {@link MAX_LINK_LENGTH}). Using `>=` those clamps
 * falsely re-scaled authored-at-max world bodies on every Studio reload
 * (nodes stayed ~1px via roundLen floor; links vanished → “dots only”).
 */
const LEGACY_RADIUS_MIN = MAX_NODE_RADIUS + 1; // > 5
const LEGACY_LINK_LEN_MIN = MAX_LINK_LENGTH + 1; // > 50
/** World bodies rarely exceed ±40; legacy authoring often ±80–200. */
const LEGACY_POSITION_MIN = 80;

/**
 * Simulation visualizer zoom after creature scale-down.
 * Legacy 100% (1×) is farthest out; default 1000% (10×) matches prior on-screen size.
 */
export const CREATURE_VIEW_ZOOM_MIN = 1;
export const CREATURE_VIEW_ZOOM_MAX = 1 / CREATURE_WORLD_SCALE;
export const CREATURE_VIEW_ZOOM_DEFAULT = CREATURE_VIEW_ZOOM_MAX;
export const CREATURE_VIEW_ZOOM_STEP = 0.5;

/** Scale legacy absolute canvas stroke/font sizes to match CREATURE_WORLD_SCALE. */
export function creatureDrawPx(value: number): number {
  return value * CREATURE_WORLD_SCALE;
}

/** Convert a legacy authoring length (px) into current world px. */
export function worldLen(legacyPx: number): number {
  return legacyPx * CREATURE_WORLD_SCALE;
}

/**
 * Brain observation divisor for body-relative positions / clearances.
 * Legacy used `/100` against ~60–120px bodies; world bodies are ~10× smaller,
 * so the same divisor collapsed proprioception into noise (~0.05) and stalled
 * learning. Keep observations O(1) at the current creature scale.
 */
export const BODY_OBS_LENGTH_DIVISOR = 100 * CREATURE_WORLD_SCALE;

/** Brain observation divisors for COM / tip airspeeds (legacy speeds were ~10×). */
export const BODY_OBS_SPEED_DIV_FAST = 6 * CREATURE_WORLD_SCALE;
export const BODY_OBS_SPEED_DIV_MED = 4 * CREATURE_WORLD_SCALE;
export const BODY_OBS_SPEED_DIV_VERT = 3 * CREATURE_WORLD_SCALE;

/** World-space font size for a node id label inside the creature canvas. */
export function creatureNodeLabelFontSize(radius: number): number {
  return Math.max(creatureDrawPx(0.45), radius * 0.75);
}

function roundLen(value: number, scale: number): number {
  const scaled = value * scale;
  if (value > 0 && scaled > 0 && scaled < 1) return 1;
  return Math.round(scaled);
}

function roundPos(value: number, scale: number): number {
  return Math.round(value * scale);
}

/** True when blueprint still uses pre–CREATURE_WORLD_SCALE studio authoring units. */
export function isLegacyScaleBlueprint(blueprint: CreatureBlueprint): boolean {
  // Radius above the world clamp is unambiguous legacy (Studio clamps to ≤5).
  if (blueprint.nodes.some(n => n.radius >= LEGACY_RADIUS_MIN)) return true;
  // Large extents are legacy authoring space (world bodies are much smaller).
  if (
    blueprint.relativePositions.some(
      p => Math.abs(p.x) >= LEGACY_POSITION_MIN || Math.abs(p.y) >= LEGACY_POSITION_MIN
    )
  ) {
    return true;
  }
  // Length alone is not enough: world maxLength may equal MAX_LINK_LENGTH (50).
  // Only treat oversized lengths as legacy when geometry is also large-ish.
  const oversizedLength = blueprint.muscles.some(
    m =>
      m.maxLength >= LEGACY_LINK_LEN_MIN ||
      m.originalLength >= LEGACY_LINK_LEN_MIN ||
      m.minLength >= LEGACY_LINK_LEN_MIN
  );
  if (!oversizedLength) return false;
  const maxAbsPos = blueprint.relativePositions.reduce(
    (m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y)),
    0
  );
  return maxAbsPos >= 40 || blueprint.nodes.some(n => n.radius >= 3);
}

/**
 * Detect bodies that were falsely double-scaled by the old `>= 50` / `>= 5`
 * legacy heuristic (extent collapsed, link lengths floored, radii stuck at 1).
 */
export function looksDoubleScaledBlueprint(blueprint: CreatureBlueprint): boolean {
  if (isLegacyScaleBlueprint(blueprint)) return false;
  if (blueprint.nodes.length < 4) return false;
  const maxAbsPos = blueprint.relativePositions.reduce(
    (m, p) => Math.max(m, Math.abs(p.x), Math.abs(p.y)),
    0
  );
  const maxLen = blueprint.muscles.reduce(
    (m, muscle) => Math.max(m, muscle.maxLength, muscle.originalLength, muscle.minLength),
    0
  );
  const maxRadius = blueprint.nodes.reduce((m, n) => Math.max(m, n.radius), 0);
  // Typical world walker: extent ~15–30, lengths ~8–20. After false ×0.1:
  // extent ~2–3, lengths ~1–2, radius 1.
  return maxAbsPos > 0 && maxAbsPos <= 6 && maxLen > 0 && maxLen <= 6 && maxRadius <= 2;
}

/**
 * Geometry already looks arena-scaled but node masses were left at legacy
 * authoring values (common on mid-migration exports).
 */
export function hasLegacyMassOnScaledGeometry(blueprint: CreatureBlueprint): boolean {
  if (isLegacyScaleBlueprint(blueprint)) return false;
  if (blueprint.nodes.some(n => n.radius >= 5)) return false;
  return blueprint.nodes.some(n => n.mass >= 0.05);
}

/** Idempotent: scale legacy blueprints once; leave arena-scale bodies unchanged. */
export function ensureScaledBlueprint(
  blueprint: CreatureBlueprint,
  scale = CREATURE_WORLD_SCALE
): CreatureBlueprint {
  let next = blueprint;
  if (isLegacyScaleBlueprint(next)) {
    next = scaleCreatureBlueprint(next, scale);
  } else if (looksDoubleScaledBlueprint(next) && scale > 0 && scale < 1) {
    // Undo one false migration pass (geometry ×0.1 with length/radius floors).
    next = scaleCreatureBlueprint(next, 1 / scale);
  } else if (hasLegacyMassOnScaledGeometry(next)) {
    const massScale = scale * scale * scale;
    next = {
      ...next,
      nodes: next.nodes.map(n => ({
        ...n,
        mass: n.mass * massScale,
      })),
    };
  }
  if (hasLegacyMotorPowerOnScaledGeometry(next)) {
    next = scaleLegacyMotorPower(next, scale);
  }
  return next;
}

/** Scale blueprint geometry/mass from studio units into arena world units. */
export function scaleCreatureBlueprint(
  blueprint: CreatureBlueprint,
  scale = CREATURE_WORLD_SCALE
): CreatureBlueprint {
  const massScale = scale * scale * scale;
  const areaScale = scale * scale;
  return {
    ...blueprint,
    nodes: blueprint.nodes.map(n => ({
      ...n,
      radius: roundLen(n.radius, scale),
      mass: n.mass * massScale,
      // Drive is a world px/tick impulse — scale with length, not mass.
      ...(n.motorPower !== undefined ? { motorPower: n.motorPower * scale } : {}),
    })),
    muscles: blueprint.muscles.map(m => ({
      ...m,
      originalLength: roundLen(m.originalLength, scale),
      minLength: roundLen(m.minLength, scale),
      maxLength: roundLen(m.maxLength, scale),
      ...(m.aeroArea !== undefined
        ? { aeroArea: m.aeroArea * areaScale }
        : {}),
      ...(m.extendRate !== undefined ? { extendRate: m.extendRate * scale } : {}),
      ...(m.retractRate !== undefined ? { retractRate: m.retractRate * scale } : {}),
      ...(m.softMaxDeltaPerTick !== undefined && m.softMaxDeltaPerTick > 0
        ? { softMaxDeltaPerTick: m.softMaxDeltaPerTick * scale }
        : {}),
    })),
    relativePositions: blueprint.relativePositions.map(p => ({
      x: roundPos(p.x, scale),
      y: roundPos(p.y, scale),
    })),
    solidSegments: blueprint.solidSegments?.map(s => ({ ...s })),
    ...(blueprint.softMuscleMaxDeltaPerTick !== undefined &&
    blueprint.softMuscleMaxDeltaPerTick > 0
      ? { softMuscleMaxDeltaPerTick: blueprint.softMuscleMaxDeltaPerTick * scale }
      : {}),
  };
}

/**
 * World-scale bodies that still carry legacy motorPower (geometry was scaled
 * earlier, drive was not). Detected when any motor exceeds the world max.
 */
export function hasLegacyMotorPowerOnScaledGeometry(
  blueprint: CreatureBlueprint
): boolean {
  if (isLegacyScaleBlueprint(blueprint)) return false;
  return blueprint.nodes.some(
    n => n.motorPower !== undefined && n.motorPower > MAX_MOTOR_POWER
  );
}

/** Scale leftover legacy motorPower on already-scaled geometry once. */
export function scaleLegacyMotorPower(
  blueprint: CreatureBlueprint,
  scale = CREATURE_WORLD_SCALE
): CreatureBlueprint {
  return {
    ...blueprint,
    nodes: blueprint.nodes.map(n =>
      n.motorPower !== undefined && n.motorPower > MAX_MOTOR_POWER
        ? { ...n, motorPower: n.motorPower * scale }
        : n
    ),
  };
}

/** Scale appearance rig coordinates captured in legacy studio units. */
export function scaleAppearanceRig(
  rig: AppearanceRig,
  scale = CREATURE_WORLD_SCALE
): AppearanceRig {
  return {
    ...rig,
    primitives: rig.primitives.map(p => ({
      ...p,
      ...(p.boneRestLength !== undefined
        ? { boneRestLength: p.boneRestLength * scale }
        : {}),
      points: p.points.map(pt => ({
        ...pt,
        x: pt.x * scale,
        y: pt.y * scale,
        weights: pt.weights?.map(w => ({
          ...w,
          ...(w.x !== undefined ? { x: w.x * scale } : {}),
          ...(w.y !== undefined ? { y: w.y * scale } : {}),
        })),
      })),
    })),
  };
}
