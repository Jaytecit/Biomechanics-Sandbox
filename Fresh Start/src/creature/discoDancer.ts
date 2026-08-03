import type { CreatureDesign } from './types';

/**
 * Bundled disco dancer (H3) — Fresh Start–authored braced figure with several muscles.
 * Not imported from parent soft-body disco preset.
 */
export const DISCO_DANCER: CreatureDesign = {
  name: 'Disco Dancer',
  joints: [
    { id: 1, x: 0, y: 2.4, isHead: true },
    { id: 2, x: -0.7, y: 1.5 },
    { id: 3, x: 0.7, y: 1.5 },
    { id: 4, x: -0.9, y: 0.45, isFoot: true },
    { id: 5, x: 0.9, y: 0.45, isFoot: true },
    { id: 6, x: -1.3, y: 2.1 },
    { id: 7, x: 1.3, y: 2.1 },
  ],
  bones: [
    { id: 1, startJointId: 1, endJointId: 2 },
    { id: 2, startJointId: 1, endJointId: 3 },
    { id: 3, startJointId: 2, endJointId: 3 },
    { id: 4, startJointId: 2, endJointId: 4 },
    { id: 5, startJointId: 3, endJointId: 5 },
    { id: 6, startJointId: 1, endJointId: 6 },
    { id: 7, startJointId: 1, endJointId: 7 },
  ],
  muscles: [
    { id: 1, startBoneId: 1, endBoneId: 2, canExpand: true },
    { id: 2, startBoneId: 4, endBoneId: 3, canExpand: true },
    { id: 3, startBoneId: 5, endBoneId: 3, canExpand: true },
    { id: 4, startBoneId: 6, endBoneId: 1, canExpand: true },
    { id: 5, startBoneId: 7, endBoneId: 2, canExpand: true },
  ],
};
