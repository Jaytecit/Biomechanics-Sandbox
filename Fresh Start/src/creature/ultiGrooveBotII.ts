import type { CreatureDesign } from './types';

/**
 * Bundled disco default dancer — UltiGrooveBot II (drive groups 1–5).
 */
export const ULTI_GROOVE_BOT_II: CreatureDesign = {
  "name": "UltiGrooveBot II",
  "joints": [
    {
      "id": 1,
      "x": -3,
      "y": 1,
      "isFoot": true
    },
    {
      "id": 2,
      "x": -3,
      "y": 5
    },
    {
      "id": 3,
      "x": 0,
      "y": 4
    },
    {
      "id": 4,
      "x": 3,
      "y": 5
    },
    {
      "id": 5,
      "x": 3,
      "y": 1,
      "isFoot": true
    },
    {
      "id": 6,
      "x": 0,
      "y": 7
    },
    {
      "id": 7,
      "x": -3,
      "y": 8
    },
    {
      "id": 8,
      "x": 3,
      "y": 8
    },
    {
      "id": 9,
      "x": -6,
      "y": 6
    },
    {
      "id": 10,
      "x": 6,
      "y": 6
    },
    {
      "id": 11,
      "x": 0,
      "y": 10
    },
    {
      "id": 12,
      "x": -1,
      "y": 6
    },
    {
      "id": 13,
      "x": 1,
      "y": 6
    },
    {
      "id": 14,
      "x": -4,
      "y": 3
    },
    {
      "id": 15,
      "x": 4,
      "y": 3
    },
    {
      "id": 16,
      "x": -6,
      "y": 5
    },
    {
      "id": 17,
      "x": 6,
      "y": 5
    },
    {
      "id": 18,
      "x": -4,
      "y": 1,
      "isFoot": true
    },
    {
      "id": 19,
      "x": 4,
      "y": 1,
      "isFoot": true
    }
  ],
  "bones": [
    {
      "id": 1,
      "startJointId": 11,
      "endJointId": 6
    },
    {
      "id": 2,
      "startJointId": 6,
      "endJointId": 12
    },
    {
      "id": 3,
      "startJointId": 12,
      "endJointId": 3
    },
    {
      "id": 4,
      "startJointId": 3,
      "endJointId": 13
    },
    {
      "id": 5,
      "startJointId": 13,
      "endJointId": 6
    },
    {
      "id": 6,
      "startJointId": 6,
      "endJointId": 7
    },
    {
      "id": 7,
      "startJointId": 6,
      "endJointId": 8
    },
    {
      "id": 8,
      "startJointId": 8,
      "endJointId": 10
    },
    {
      "id": 9,
      "startJointId": 10,
      "endJointId": 17
    },
    {
      "id": 10,
      "startJointId": 7,
      "endJointId": 9
    },
    {
      "id": 11,
      "startJointId": 9,
      "endJointId": 16
    },
    {
      "id": 12,
      "startJointId": 12,
      "endJointId": 2
    },
    {
      "id": 13,
      "startJointId": 2,
      "endJointId": 14
    },
    {
      "id": 14,
      "startJointId": 14,
      "endJointId": 1
    },
    {
      "id": 15,
      "startJointId": 13,
      "endJointId": 4
    },
    {
      "id": 16,
      "startJointId": 4,
      "endJointId": 15
    },
    {
      "id": 17,
      "startJointId": 15,
      "endJointId": 5
    },
    {
      "id": 18,
      "startJointId": 1,
      "endJointId": 18
    },
    {
      "id": 19,
      "startJointId": 5,
      "endJointId": 19
    }
  ],
  "muscles": [
    {
      "id": 1,
      "startBoneId": 6,
      "endBoneId": 1,
      "canExpand": true,
      "driveGroup": 3
    },
    {
      "id": 2,
      "startBoneId": 7,
      "endBoneId": 1,
      "canExpand": true,
      "driveGroup": 3
    },
    {
      "id": 3,
      "startBoneId": 6,
      "endBoneId": 10,
      "canExpand": true,
      "driveGroup": 2
    },
    {
      "id": 4,
      "startBoneId": 7,
      "endBoneId": 8,
      "canExpand": true,
      "driveGroup": 2
    },
    {
      "id": 5,
      "startBoneId": 10,
      "endBoneId": 11,
      "canExpand": true,
      "driveGroup": 1
    },
    {
      "id": 6,
      "startBoneId": 8,
      "endBoneId": 9,
      "canExpand": true,
      "driveGroup": 1
    },
    {
      "id": 7,
      "startBoneId": 6,
      "endBoneId": 2,
      "canExpand": true,
      "driveGroup": 4
    },
    {
      "id": 8,
      "startBoneId": 7,
      "endBoneId": 5,
      "canExpand": true,
      "driveGroup": 4
    },
    {
      "id": 9,
      "startBoneId": 3,
      "endBoneId": 12,
      "canExpand": true,
      "driveGroup": 5
    },
    {
      "id": 10,
      "startBoneId": 4,
      "endBoneId": 15,
      "canExpand": true,
      "driveGroup": 5
    },
    {
      "id": 11,
      "startBoneId": 12,
      "endBoneId": 13,
      "canExpand": true,
      "driveGroup": 5
    },
    {
      "id": 12,
      "startBoneId": 15,
      "endBoneId": 16,
      "canExpand": true,
      "driveGroup": 5
    },
    {
      "id": 13,
      "startBoneId": 16,
      "endBoneId": 17,
      "canExpand": true,
      "driveGroup": 4
    },
    {
      "id": 14,
      "startBoneId": 13,
      "endBoneId": 14,
      "canExpand": true,
      "driveGroup": 4
    },
    {
      "id": 15,
      "startBoneId": 14,
      "endBoneId": 18,
      "canExpand": true,
      "driveGroup": 3
    },
    {
      "id": 16,
      "startBoneId": 17,
      "endBoneId": 19,
      "canExpand": true,
      "driveGroup": 3
    }
  ],
  "appearance": {
    "version": 1,
    "googlyEyes": [],
    "bodyParts": []
  }
};
