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

/** Light glider with aeroArea on wing bones (E6.6). */
export const SIMPLE_GLIDER: CreatureDesign = {
  name: 'Simple Glider',
  joints: [
    { id: 1, x: -1.4, y: 2.2 },
    { id: 2, x: 1.4, y: 2.2 },
    { id: 3, x: 0.0, y: 1.6 },
    { id: 4, x: 0.0, y: 0.7 },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 3, aeroArea: 1.8 },
    { id: 2, startJointId: 2, endJointId: 3, aeroArea: 1.8 },
    { id: 3, startJointId: 3, endJointId: 4, aeroArea: 0.4 },
    { id: 4, startJointId: 1, endJointId: 2, aeroArea: 2.2 },
  ],
  muscles: [
    { id: 1, startBoneId: 1, endBoneId: 2, canExpand: true, strength: 260 },
    { id: 2, startBoneId: 3, endBoneId: 4, canExpand: true, strength: 220 },
  ],
};

export const PRESETS: CreatureDesign[] = [
  TRIANGLE_WALKER,
  SIMPLE_HOPPER,
  FLOPPY_CHAIN,
  MOTOR_CART,
  SIMPLE_GLIDER,
];
