import type { CreatureDesign } from './types';

/** Braced triangle — holds pose under gravity (Keiwan lesson: brace your design). */
export const TRIANGLE_WALKER: CreatureDesign = {
  name: 'Triangle Walker',
  joints: [
    { id: 1, x: -1.2, y: 1.0, isFoot: true },
    { id: 2, x: 1.2, y: 1.0, isFoot: true },
    { id: 3, x: 0.0, y: 2.6, isHead: true },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 2 },
    { id: 2, startJointId: 2, endJointId: 3 },
    { id: 3, startJointId: 3, endJointId: 1 },
  ],
  muscles: [
    { id: 1, startBoneId: 1, endBoneId: 2, canExpand: true },
    { id: 2, startBoneId: 2, endBoneId: 3, canExpand: true },
    { id: 3, startBoneId: 3, endBoneId: 1, canExpand: true },
  ],
};

/** Under-braced serial chain — collapses / pancakes without cross-bracing. */
export const FLOPPY_CHAIN: CreatureDesign = {
  name: 'Floppy Chain',
  joints: [
    { id: 1, x: -2.0, y: 0.8, isFoot: true },
    { id: 2, x: -0.7, y: 1.6 },
    { id: 3, x: 0.7, y: 1.6 },
    { id: 4, x: 2.0, y: 0.8, isFoot: true },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 2 },
    { id: 2, startJointId: 2, endJointId: 3 },
    { id: 3, startJointId: 3, endJointId: 4 },
  ],
  muscles: [
    { id: 1, startBoneId: 1, endBoneId: 2, canExpand: true },
    { id: 2, startBoneId: 2, endBoneId: 3, canExpand: true },
  ],
};

/** Simple hopper: base bone + two legs with cross muscle. */
export const SIMPLE_HOPPER: CreatureDesign = {
  name: 'Simple Hopper',
  joints: [
    { id: 1, x: -0.9, y: 0.7, isFoot: true },
    { id: 2, x: 0.9, y: 0.7, isFoot: true },
    { id: 3, x: -0.5, y: 2.2, isHead: true },
    { id: 4, x: 0.5, y: 2.2, isHead: true },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 2 },
    { id: 2, startJointId: 1, endJointId: 3 },
    { id: 3, startJointId: 2, endJointId: 4 },
    { id: 4, startJointId: 3, endJointId: 4 },
  ],
  muscles: [
    { id: 1, startBoneId: 2, endBoneId: 3, canExpand: true, strength: 480 },
    { id: 2, startBoneId: 1, endBoneId: 4, canExpand: true, strength: 420 },
    { id: 3, startBoneId: 2, endBoneId: 4, canExpand: true },
    { id: 4, startBoneId: 3, endBoneId: 1, canExpand: true },
  ],
};

/**
 * Theoretically fast biped for Run / Max Speed / Sprint in this sandbox.
 *
 * Why this shape (not a wheeled cheat):
 * - Fitness only credits +X travel and (for run) foot-lift density; plant-slide
 *   brake punishes scooting while grounded → want long airborne strides.
 * - Mass proximal (hips), light distal (feet/knees) → low swing inertia, quick steps.
 * - Long tibias + strong hip/knee channels → large plant→clear Δx per lift.
 * - Slight +X head lean biases upright posture into the rewarded direction.
 * - Drive groups L/R/trunk shrink the brain to an alternating gait prior.
 */
export const DART_STRIDER: CreatureDesign = {
  name: 'Dart Strider',
  joints: [
    { id: 1, x: -0.55, y: 0.48, mass: 0.35, isFoot: true },
    { id: 2, x: 0.55, y: 0.48, mass: 0.35, isFoot: true },
    { id: 3, x: -0.72, y: 1.32, mass: 0.5 },
    { id: 4, x: 0.72, y: 1.32, mass: 0.5 },
    { id: 5, x: -0.28, y: 2.22, mass: 1.65 },
    { id: 6, x: 0.28, y: 2.22, mass: 1.65 },
    { id: 7, x: 0.22, y: 3.05, mass: 0.65, isHead: true },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 3, mass: 0.35 }, // L tibia
    { id: 2, startJointId: 2, endJointId: 4, mass: 0.35 }, // R tibia
    { id: 3, startJointId: 3, endJointId: 5, mass: 0.55 }, // L femur
    { id: 4, startJointId: 4, endJointId: 6, mass: 0.55 }, // R femur
    { id: 5, startJointId: 5, endJointId: 6, mass: 0.95 }, // pelvis
    { id: 6, startJointId: 5, endJointId: 7, mass: 0.5 }, // L torso
    { id: 7, startJointId: 6, endJointId: 7, mass: 0.5 }, // R torso
    { id: 8, startJointId: 3, endJointId: 6, mass: 0.3 }, // cross brace
    { id: 9, startJointId: 4, endJointId: 5, mass: 0.3 }, // cross brace
  ],
  muscles: [
    // G1 left stance/swing, G2 right, G3 trunk pitch
    {
      id: 1,
      startBoneId: 3,
      endBoneId: 5,
      canExpand: true,
      strength: 720,
      driveGroup: 1,
    },
    {
      id: 2,
      startBoneId: 4,
      endBoneId: 5,
      canExpand: true,
      strength: 720,
      driveGroup: 2,
    },
    {
      id: 3,
      startBoneId: 1,
      endBoneId: 3,
      canExpand: true,
      strength: 640,
      driveGroup: 1,
    },
    {
      id: 4,
      startBoneId: 2,
      endBoneId: 4,
      canExpand: true,
      strength: 640,
      driveGroup: 2,
    },
    {
      id: 5,
      startBoneId: 1,
      endBoneId: 5,
      canExpand: true,
      strength: 560,
      driveGroup: 1,
    },
    {
      id: 6,
      startBoneId: 2,
      endBoneId: 6,
      canExpand: true,
      strength: 560,
      driveGroup: 2,
    },
    {
      id: 7,
      startBoneId: 3,
      endBoneId: 4,
      canExpand: true,
      strength: 500,
    },
    {
      id: 8,
      startBoneId: 6,
      endBoneId: 7,
      canExpand: true,
      strength: 380,
      driveGroup: 3,
    },
    {
      id: 9,
      startBoneId: 8,
      endBoneId: 9,
      canExpand: true,
      strength: 280,
    },
  ],
};

/** Two-wheel cart for motor zone (E6.5) — wheel joints + chassis brace. */
export const MOTOR_CART: CreatureDesign = {
  name: 'Motor Cart',
  joints: [
    { id: 1, x: -1.0, y: 0.55, isWheel: true, motorStrength: 36 },
    { id: 2, x: 1.0, y: 0.55, isWheel: true, motorStrength: 36 },
    { id: 3, x: -0.6, y: 1.5 },
    { id: 4, x: 0.6, y: 1.5 },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 2 },
    { id: 2, startJointId: 1, endJointId: 3 },
    { id: 3, startJointId: 2, endJointId: 4 },
    { id: 4, startJointId: 3, endJointId: 4 },
    { id: 5, startJointId: 1, endJointId: 4 },
    { id: 6, startJointId: 2, endJointId: 3 },
  ],
  muscles: [
    { id: 1, startBoneId: 2, endBoneId: 3, canExpand: true, strength: 200 },
    { id: 2, startBoneId: 5, endBoneId: 6, canExpand: true, strength: 200 },
  ],
};

/** Light glider with rigid sail surfaces (E6.6 / G10). */
export const SIMPLE_GLIDER: CreatureDesign = {
  name: 'Simple Glider',
  joints: [
    { id: 1, x: -1.4, y: 2.2 },
    { id: 2, x: 1.4, y: 2.2 },
    { id: 3, x: 0.0, y: 1.6 },
    { id: 4, x: 0.0, y: 0.7 },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 3, aeroArea: 1.8, aeroType: 'glider' },
    { id: 2, startJointId: 2, endJointId: 3, aeroArea: 1.8, aeroType: 'glider' },
    { id: 3, startJointId: 3, endJointId: 4, aeroArea: 0.4, aeroType: 'glider' },
    { id: 4, startJointId: 1, endJointId: 2, aeroArea: 2.2, aeroType: 'glider' },
  ],
  muscles: [
    { id: 1, startBoneId: 1, endBoneId: 2, canExpand: true, strength: 260 },
    { id: 2, startBoneId: 3, endBoneId: 4, canExpand: true, strength: 220 },
  ],
};

/** Paired flapping wings (G10). */
export const SIMPLE_FLAPPER: CreatureDesign = {
  name: 'Simple Flapper',
  joints: [
    { id: 1, x: -1.6, y: 2.0 },
    { id: 2, x: 1.6, y: 2.0 },
    { id: 3, x: 0.0, y: 1.7, isHead: true },
    { id: 4, x: 0.0, y: 0.85 },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 3, aeroArea: 4.5, aeroType: 'wing' },
    { id: 2, startJointId: 2, endJointId: 3, aeroArea: 4.5, aeroType: 'wing' },
    { id: 3, startJointId: 3, endJointId: 4 },
  ],
  muscles: [
    { id: 1, startBoneId: 1, endBoneId: 3, canExpand: true, strength: 380 },
    { id: 2, startBoneId: 2, endBoneId: 3, canExpand: true, strength: 380 },
    { id: 3, startBoneId: 1, endBoneId: 2, canExpand: true, strength: 240 },
  ],
};

/**
 * Body + jointed parachute canopy chain (G10).
 * Canopy segments stream when edge-on; inflate for drag when falling.
 */
export const CHUTE_DROPPER: CreatureDesign = {
  name: 'Chute Dropper',
  joints: [
    { id: 1, x: -0.55, y: 1.1, isFoot: true },
    { id: 2, x: 0.55, y: 1.1, isFoot: true },
    { id: 3, x: 0.0, y: 1.9, isHead: true },
    // Canopy chain above harness
    { id: 4, x: -0.9, y: 2.6 },
    { id: 5, x: 0.0, y: 3.0 },
    { id: 6, x: 0.9, y: 2.6 },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 2 },
    { id: 2, startJointId: 1, endJointId: 3 },
    { id: 3, startJointId: 2, endJointId: 3 },
    // Risers
    { id: 4, startJointId: 3, endJointId: 4 },
    { id: 5, startJointId: 3, endJointId: 6 },
    // Flexible canopy chain
    {
      id: 6,
      startJointId: 4,
      endJointId: 5,
      aeroArea: 2.4,
      aeroType: 'parachute',
    },
    {
      id: 7,
      startJointId: 5,
      endJointId: 6,
      aeroArea: 2.4,
      aeroType: 'parachute',
    },
  ],
  muscles: [
    { id: 1, startBoneId: 2, endBoneId: 3, canExpand: true, strength: 240 },
    { id: 2, startBoneId: 4, endBoneId: 6, canExpand: true, strength: 180 },
    { id: 3, startBoneId: 5, endBoneId: 7, canExpand: true, strength: 180 },
    { id: 4, startBoneId: 6, endBoneId: 7, canExpand: true, strength: 160 },
  ],
};

export const PRESETS: CreatureDesign[] = [
  TRIANGLE_WALKER,
  SIMPLE_HOPPER,
  DART_STRIDER,
  FLOPPY_CHAIN,
  MOTOR_CART,
  SIMPLE_GLIDER,
  SIMPLE_FLAPPER,
  CHUTE_DROPPER,
];
