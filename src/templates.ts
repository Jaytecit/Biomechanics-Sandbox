/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreatureBlueprint } from './types';

/** Built-in anatomy templates permanently shipped with the app. */
export const CREATURE_TEMPLATES: CreatureBlueprint[] = [
  {
    "name": "Sprongo",
    "nodes": [
      {
        "id": 0,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#f59e0b",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 1,
        "mass": 1.5,
        "radius": 10,
        "friction": 1,
        "color": "#f59e0b",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": true,
        "isHingeStop": false
      },
      {
        "id": 2,
        "mass": 1.5,
        "radius": 10,
        "friction": 1,
        "color": "#ec4899",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": true,
        "isHingeStop": false
      }
    ],
    "muscles": [
      {
        "id": 0,
        "nodeA": 2,
        "nodeB": 0,
        "originalLength": 95,
        "minLength": 95,
        "maxLength": 95,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 1,
        "nodeA": 0,
        "nodeB": 1,
        "originalLength": 95,
        "minLength": 95,
        "maxLength": 95,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 2,
        "nodeA": 2,
        "nodeB": 1,
        "originalLength": 89,
        "minLength": 10,
        "maxLength": 178,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      }
    ],
    "relativePositions": [
      {
        "x": 180,
        "y": -90
      },
      {
        "x": 150,
        "y": 0
      },
      {
        "x": 210,
        "y": 0
      }
    ]
  },
  {
    "name": "Glide Cart",
    "nodes": [
      {
        "id": 0,
        "mass": 1.5,
        "radius": 20,
        "friction": 0.05,
        "color": "#3b82f6",
        "isWheel": true,
        "isMotorWheel": true,
        "motorPower": 7.9,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 1,
        "mass": 1.5,
        "radius": 20,
        "friction": 0.05,
        "color": "#10b981",
        "isWheel": true,
        "isMotorWheel": true,
        "motorPower": 7.9,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 2,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 3,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 4,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#8b5cf6",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 5,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      }
    ],
    "muscles": [
      {
        "id": 0,
        "nodeA": 2,
        "nodeB": 3,
        "originalLength": 210,
        "minLength": 210,
        "maxLength": 210,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 1,
        "nodeA": 3,
        "nodeB": 1,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 2,
        "nodeA": 1,
        "nodeB": 0,
        "originalLength": 330,
        "minLength": 330,
        "maxLength": 330,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 3,
        "nodeA": 0,
        "nodeB": 2,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 4,
        "nodeA": 4,
        "nodeB": 5,
        "originalLength": 231,
        "minLength": 198,
        "maxLength": 462,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle",
        "aeroType": "paraglider",
        "aeroArea": 120
      },
      {
        "id": 5,
        "nodeA": 4,
        "nodeB": 2,
        "originalLength": 47,
        "minLength": 40,
        "maxLength": 94,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      },
      {
        "id": 6,
        "nodeA": 3,
        "nodeB": 5,
        "originalLength": 47,
        "minLength": 40,
        "maxLength": 94,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      }
    ],
    "relativePositions": [
      {
        "x": -150,
        "y": -30
      },
      {
        "x": 180,
        "y": -30
      },
      {
        "x": -90,
        "y": -90
      },
      {
        "x": 120,
        "y": -90
      },
      {
        "x": -150,
        "y": -120
      },
      {
        "x": 180,
        "y": -120
      }
    ],
    "solidSegments": [
      {
        "id": "solid-1",
        "nodeIds": [
          0,
          2,
          3,
          1
        ]
      }
    ]
  },
  {
    "name": "Chute Cart",
    "nodes": [
      {
        "id": 0,
        "mass": 1.5,
        "radius": 20,
        "friction": 0.05,
        "color": "#3b82f6",
        "isWheel": true,
        "isMotorWheel": true,
        "motorPower": 7.9,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 1,
        "mass": 1.5,
        "radius": 20,
        "friction": 0.05,
        "color": "#10b981",
        "isWheel": true,
        "isMotorWheel": true,
        "motorPower": 7.9,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 2,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 3,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 4,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#8b5cf6",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 5,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      }
    ],
    "muscles": [
      {
        "id": 0,
        "nodeA": 2,
        "nodeB": 3,
        "originalLength": 210,
        "minLength": 210,
        "maxLength": 210,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 1,
        "nodeA": 3,
        "nodeB": 1,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 2,
        "nodeA": 1,
        "nodeB": 0,
        "originalLength": 330,
        "minLength": 330,
        "maxLength": 330,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 3,
        "nodeA": 0,
        "nodeB": 2,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 4,
        "nodeA": 4,
        "nodeB": 2,
        "originalLength": 47,
        "minLength": 40,
        "maxLength": 94,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      },
      {
        "id": 5,
        "nodeA": 3,
        "nodeB": 5,
        "originalLength": 47,
        "minLength": 40,
        "maxLength": 94,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      },
      {
        "id": 6,
        "nodeA": 4,
        "nodeB": 5,
        "originalLength": 231,
        "minLength": 166,
        "maxLength": 462,
        "strength": 0.25,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle",
        "aeroType": "parachute",
        "aeroArea": 160
      }
    ],
    "relativePositions": [
      {
        "x": -150,
        "y": -30
      },
      {
        "x": 180,
        "y": -30
      },
      {
        "x": -90,
        "y": -90
      },
      {
        "x": 120,
        "y": -90
      },
      {
        "x": -150,
        "y": -120
      },
      {
        "x": 180,
        "y": -120
      }
    ],
    "solidSegments": [
      {
        "id": "solid-1",
        "nodeIds": [
          0,
          2,
          3,
          1
        ]
      }
    ]
  },
  {
    "name": "RoboBird",
    "nodes": [
      {
        "id": 0,
        "mass": 0.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#8b5cf6",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 1,
        "mass": 0.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#8b5cf6",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 2,
        "mass": 0.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 3,
        "mass": 0.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#3b82f6",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 4,
        "mass": 0.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 5,
        "mass": 0.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 6,
        "mass": 0.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#ec4899",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      }
    ],
    "muscles": [
      {
        "id": 0,
        "nodeA": 1,
        "nodeB": 2,
        "originalLength": 60,
        "minLength": 60,
        "maxLength": 60,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 1,
        "nodeA": 3,
        "nodeB": 1,
        "originalLength": 283,
        "minLength": 283,
        "maxLength": 283,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 2,
        "nodeA": 2,
        "nodeB": 4,
        "originalLength": 283,
        "minLength": 283,
        "maxLength": 283,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 3,
        "nodeA": 3,
        "nodeB": 0,
        "originalLength": 207,
        "minLength": 177,
        "maxLength": 413,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle",
        "aeroType": "wing",
        "aeroArea": 100
      },
      {
        "id": 4,
        "nodeA": 0,
        "nodeB": 4,
        "originalLength": 207,
        "minLength": 177,
        "maxLength": 413,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle",
        "aeroType": "wing",
        "aeroArea": 100
      },
      {
        "id": 5,
        "nodeA": 1,
        "nodeB": 5,
        "originalLength": 60,
        "minLength": 60,
        "maxLength": 60,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 6,
        "nodeA": 2,
        "nodeB": 6,
        "originalLength": 60,
        "minLength": 60,
        "maxLength": 60,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 7,
        "nodeA": 0,
        "nodeB": 5,
        "originalLength": 138,
        "minLength": 148,
        "maxLength": 276,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "piston",
        "extendRate": 32,
        "retractRate": 32
      },
      {
        "id": 8,
        "nodeA": 0,
        "nodeB": 6,
        "originalLength": 138,
        "minLength": 148,
        "maxLength": 276,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "piston",
        "extendRate": 32,
        "retractRate": 32
      },
      {
        "id": 9,
        "nodeA": 5,
        "nodeB": 6,
        "originalLength": 60,
        "minLength": 60,
        "maxLength": 60,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 10,
        "nodeA": 3,
        "nodeB": 5,
        "originalLength": 256,
        "minLength": 256,
        "maxLength": 256,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 11,
        "nodeA": 6,
        "nodeB": 4,
        "originalLength": 256,
        "minLength": 256,
        "maxLength": 256,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      }
    ],
    "relativePositions": [
      {
        "x": 0,
        "y": -300
      },
      {
        "x": -30,
        "y": -30
      },
      {
        "x": 30,
        "y": -30
      },
      {
        "x": -270,
        "y": -180
      },
      {
        "x": 270,
        "y": -180
      },
      {
        "x": -30,
        "y": -90
      },
      {
        "x": 30,
        "y": -90
      }
    ],
    "solidSegments": [
      {
        "id": "solid-1",
        "nodeIds": [
          1,
          2,
          5,
          6
        ]
      }
    ]
  },
  {
    "name": "Tool Eggs",
    "nodes": [
      {
        "id": 0,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#f59e0b",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 1,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 2,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#f59e0b",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 3,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#8b5cf6",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 4,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#f59e0b",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": true,
        "isHingeStop": false
      },
      {
        "id": 5,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#f59e0b",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": true,
        "isHingeStop": false
      },
      {
        "id": 6,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 7,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#f59e0b",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 8,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 9,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#ec4899",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      }
    ],
    "muscles": [
      {
        "id": 0,
        "nodeA": 0,
        "nodeB": 1,
        "originalLength": 180,
        "minLength": 180,
        "maxLength": 180,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 1,
        "nodeA": 1,
        "nodeB": 3,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 2,
        "nodeA": 3,
        "nodeB": 2,
        "originalLength": 60,
        "minLength": 60,
        "maxLength": 60,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 3,
        "nodeA": 2,
        "nodeB": 0,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 4,
        "nodeA": 6,
        "nodeB": 4,
        "originalLength": 90,
        "minLength": 90,
        "maxLength": 90,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 5,
        "nodeA": 4,
        "nodeB": 7,
        "originalLength": 108,
        "minLength": 108,
        "maxLength": 108,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 6,
        "nodeA": 7,
        "nodeB": 6,
        "originalLength": 60,
        "minLength": 60,
        "maxLength": 60,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 7,
        "nodeA": 9,
        "nodeB": 8,
        "originalLength": 60,
        "minLength": 60,
        "maxLength": 60,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 8,
        "nodeA": 8,
        "nodeB": 5,
        "originalLength": 108,
        "minLength": 108,
        "maxLength": 108,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 9,
        "nodeA": 5,
        "nodeB": 9,
        "originalLength": 90,
        "minLength": 90,
        "maxLength": 90,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 10,
        "nodeA": 0,
        "nodeB": 6,
        "originalLength": 108,
        "minLength": 108,
        "maxLength": 108,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 11,
        "nodeA": 2,
        "nodeB": 7,
        "originalLength": 67,
        "minLength": 67,
        "maxLength": 67,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 12,
        "nodeA": 3,
        "nodeB": 8,
        "originalLength": 67,
        "minLength": 67,
        "maxLength": 67,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 13,
        "nodeA": 1,
        "nodeB": 9,
        "originalLength": 108,
        "minLength": 108,
        "maxLength": 108,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 14,
        "nodeA": 9,
        "nodeB": 0,
        "originalLength": 179,
        "minLength": 154,
        "maxLength": 358,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      },
      {
        "id": 15,
        "nodeA": 6,
        "nodeB": 1,
        "originalLength": 179,
        "minLength": 154,
        "maxLength": 358,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      },
      {
        "id": 16,
        "nodeA": 7,
        "nodeB": 8,
        "originalLength": 126,
        "minLength": 108,
        "maxLength": 252,
        "strength": 0.6,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "muscle"
      }
    ],
    "relativePositions": [
      {
        "x": -90,
        "y": -180
      },
      {
        "x": 90,
        "y": -180
      },
      {
        "x": -30,
        "y": -120
      },
      {
        "x": 30,
        "y": -120
      },
      {
        "x": -150,
        "y": 0
      },
      {
        "x": 150,
        "y": 0
      },
      {
        "x": -150,
        "y": -90
      },
      {
        "x": -90,
        "y": -90
      },
      {
        "x": 90,
        "y": -90
      },
      {
        "x": 150,
        "y": -90
      }
    ],
    "solidSegments": [
      {
        "id": "solid-1",
        "nodeIds": [
          2,
          0,
          3,
          1
        ]
      },
      {
        "id": "solid-2",
        "nodeIds": [
          6,
          7,
          4
        ]
      },
      {
        "id": "solid-3",
        "nodeIds": [
          8,
          9,
          5
        ]
      }
    ]
  },
  {
    "name": "Motor Cart",
    "nodes": [
      {
        "id": 0,
        "mass": 1.5,
        "radius": 20,
        "friction": 0.05,
        "color": "#3b82f6",
        "isWheel": true,
        "isMotorWheel": true,
        "motorPower": 7.9,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 1,
        "mass": 1.5,
        "radius": 20,
        "friction": 0.05,
        "color": "#10b981",
        "isWheel": true,
        "isMotorWheel": true,
        "motorPower": 7.9,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 2,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      },
      {
        "id": 3,
        "mass": 1.5,
        "radius": 10,
        "friction": 0.5,
        "color": "#10b981",
        "isWheel": false,
        "isMotorWheel": false,
        "isFoot": false,
        "isHingeStop": false
      }
    ],
    "muscles": [
      {
        "id": 0,
        "nodeA": 2,
        "nodeB": 3,
        "originalLength": 210,
        "minLength": 210,
        "maxLength": 210,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 1,
        "nodeA": 3,
        "nodeB": 1,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 2,
        "nodeA": 1,
        "nodeB": 0,
        "originalLength": 330,
        "minLength": 330,
        "maxLength": 330,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      },
      {
        "id": 3,
        "nodeA": 0,
        "nodeB": 2,
        "originalLength": 85,
        "minLength": 85,
        "maxLength": 85,
        "strength": 1,
        "phaseOffset": 0,
        "thickness": 1,
        "linkKind": "bone"
      }
    ],
    "relativePositions": [
      {
        "x": -150,
        "y": -30
      },
      {
        "x": 180,
        "y": -30
      },
      {
        "x": -90,
        "y": -90
      },
      {
        "x": 120,
        "y": -90
      }
    ],
    "solidSegments": [
      {
        "id": "solid-1",
        "nodeIds": [
          0,
          2,
          3,
          1
        ]
      }
    ]
  }
];
