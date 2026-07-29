/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Permanent default finished models shipped with the codebase.
 * Display names are clean (no elite / gen suffixes).
 */

import { CreatureBlueprint, EvolutionGoal, Genome } from './types';

export type DefaultModelSeed = {
  id: string;
  name: string;
  generation: number;
  fitness: number;
  trainedGoal: EvolutionGoal;
  createdAt: string;
  blueprint: CreatureBlueprint;
  genome: Genome;
};

export const DEFAULT_MODEL_SEEDS: DefaultModelSeed[] = [
  {
    id: "builtin_sprongo",
    name: "Sprongo",
    generation: 6,
    fitness: 603.7442634387736,
    trainedGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    createdAt: "2026-07-29T10:58:00.750Z",
    blueprint: {
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
    genome: {
        "nodes": [
            {
                "id": 0,
                "type": "input",
                "label": "Input 0"
            },
            {
                "id": 1,
                "type": "input",
                "label": "Input 1"
            },
            {
                "id": 2,
                "type": "input",
                "label": "Input 2"
            },
            {
                "id": 3,
                "type": "input",
                "label": "Input 3"
            },
            {
                "id": 4,
                "type": "input",
                "label": "Input 4"
            },
            {
                "id": 5,
                "type": "input",
                "label": "Input 5"
            },
            {
                "id": 6,
                "type": "input",
                "label": "Input 6"
            },
            {
                "id": 7,
                "type": "input",
                "label": "Input 7"
            },
            {
                "id": 8,
                "type": "input",
                "label": "Input 8"
            },
            {
                "id": 9,
                "type": "input",
                "label": "Input 9"
            },
            {
                "id": 10,
                "type": "input",
                "label": "Input 10"
            },
            {
                "id": 11,
                "type": "output",
                "label": "Output 0"
            }
        ],
        "connections": [
            {
                "fromNode": 0,
                "toNode": 11,
                "weight": 0.39816080009661425,
                "enabled": true,
                "innovation": 41309
            },
            {
                "fromNode": 1,
                "toNode": 11,
                "weight": 0.4024814991986905,
                "enabled": true,
                "innovation": 41310
            },
            {
                "fromNode": 2,
                "toNode": 11,
                "weight": 0.38521954960174587,
                "enabled": true,
                "innovation": 41311
            },
            {
                "fromNode": 3,
                "toNode": 11,
                "weight": 0.002357026890254077,
                "enabled": true,
                "innovation": 41312
            },
            {
                "fromNode": 4,
                "toNode": 11,
                "weight": 0.31844042354636704,
                "enabled": true,
                "innovation": 41313
            },
            {
                "fromNode": 5,
                "toNode": 11,
                "weight": -0.0013613771529661367,
                "enabled": true,
                "innovation": 41314
            },
            {
                "fromNode": 6,
                "toNode": 11,
                "weight": 0.2951529409936251,
                "enabled": true,
                "innovation": 41315
            },
            {
                "fromNode": 7,
                "toNode": 11,
                "weight": -0.2706774144472981,
                "enabled": true,
                "innovation": 41316
            },
            {
                "fromNode": 8,
                "toNode": 11,
                "weight": -0.38445179054725376,
                "enabled": true,
                "innovation": 41317
            },
            {
                "fromNode": 9,
                "toNode": 11,
                "weight": 0.12291542187240179,
                "enabled": true,
                "innovation": 41318
            },
            {
                "fromNode": 10,
                "toNode": 11,
                "weight": -0.38095767713668494,
                "enabled": true,
                "innovation": 41319
            }
        ]
    },
  },
  {
    id: "builtin_glide_cart",
    name: "Glide Cart",
    generation: 10,
    fitness: 0,
    trainedGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    createdAt: "2026-07-29T10:58:47.822Z",
    blueprint: {
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
    genome: {
        "nodes": [
            {
                "id": 0,
                "type": "input",
                "label": "Input 0"
            },
            {
                "id": 1,
                "type": "input",
                "label": "Input 1"
            },
            {
                "id": 2,
                "type": "input",
                "label": "Input 2"
            },
            {
                "id": 3,
                "type": "input",
                "label": "Input 3"
            },
            {
                "id": 4,
                "type": "input",
                "label": "Input 4"
            },
            {
                "id": 5,
                "type": "input",
                "label": "Input 5"
            },
            {
                "id": 6,
                "type": "input",
                "label": "Input 6"
            },
            {
                "id": 7,
                "type": "input",
                "label": "Input 7"
            },
            {
                "id": 8,
                "type": "input",
                "label": "Input 8"
            },
            {
                "id": 9,
                "type": "input",
                "label": "Input 9"
            },
            {
                "id": 10,
                "type": "input",
                "label": "Input 10"
            },
            {
                "id": 11,
                "type": "input",
                "label": "Input 11"
            },
            {
                "id": 12,
                "type": "input",
                "label": "Input 12"
            },
            {
                "id": 13,
                "type": "input",
                "label": "Input 13"
            },
            {
                "id": 14,
                "type": "input",
                "label": "Input 14"
            },
            {
                "id": 15,
                "type": "input",
                "label": "Input 15"
            },
            {
                "id": 16,
                "type": "input",
                "label": "Input 16"
            },
            {
                "id": 17,
                "type": "input",
                "label": "Input 17"
            },
            {
                "id": 18,
                "type": "input",
                "label": "Input 18"
            },
            {
                "id": 19,
                "type": "input",
                "label": "Input 19"
            },
            {
                "id": 20,
                "type": "input",
                "label": "Input 20"
            },
            {
                "id": 21,
                "type": "input",
                "label": "Input 21"
            },
            {
                "id": 22,
                "type": "input",
                "label": "Input 22"
            },
            {
                "id": 23,
                "type": "input",
                "label": "Input 23"
            },
            {
                "id": 24,
                "type": "input",
                "label": "Input 24"
            },
            {
                "id": 25,
                "type": "output",
                "label": "Output 0"
            },
            {
                "id": 26,
                "type": "output",
                "label": "Output 1"
            },
            {
                "id": 27,
                "type": "output",
                "label": "Output 2"
            },
            {
                "id": 28,
                "type": "output",
                "label": "Output 3"
            },
            {
                "id": 29,
                "type": "output",
                "label": "Output 4"
            }
        ],
        "connections": [
            {
                "fromNode": 0,
                "toNode": 25,
                "weight": -0.35039077939406493,
                "enabled": true,
                "innovation": 41441
            },
            {
                "fromNode": 0,
                "toNode": 26,
                "weight": 0.005881633243758788,
                "enabled": true,
                "innovation": 41442
            },
            {
                "fromNode": 0,
                "toNode": 27,
                "weight": -0.15875429483903225,
                "enabled": true,
                "innovation": 41443
            },
            {
                "fromNode": 0,
                "toNode": 28,
                "weight": 0.05889171367819934,
                "enabled": true,
                "innovation": 41444
            },
            {
                "fromNode": 0,
                "toNode": 29,
                "weight": 0.28941285320694266,
                "enabled": true,
                "innovation": 41445
            },
            {
                "fromNode": 1,
                "toNode": 25,
                "weight": 0.23002423699533647,
                "enabled": true,
                "innovation": 41446
            },
            {
                "fromNode": 1,
                "toNode": 26,
                "weight": 0.49614293227626693,
                "enabled": true,
                "innovation": 41447
            },
            {
                "fromNode": 1,
                "toNode": 27,
                "weight": -0.3956032793958867,
                "enabled": true,
                "innovation": 41448
            },
            {
                "fromNode": 1,
                "toNode": 28,
                "weight": 0.16246968665602435,
                "enabled": true,
                "innovation": 41449
            },
            {
                "fromNode": 1,
                "toNode": 29,
                "weight": 0.2166575267797467,
                "enabled": true,
                "innovation": 41450
            },
            {
                "fromNode": 2,
                "toNode": 25,
                "weight": 0.1005178792819783,
                "enabled": true,
                "innovation": 41451
            },
            {
                "fromNode": 2,
                "toNode": 26,
                "weight": 0.446566026874605,
                "enabled": true,
                "innovation": 41452
            },
            {
                "fromNode": 2,
                "toNode": 27,
                "weight": -0.09869425973615198,
                "enabled": true,
                "innovation": 41453
            },
            {
                "fromNode": 2,
                "toNode": 28,
                "weight": -0.19185157193148294,
                "enabled": true,
                "innovation": 41454
            },
            {
                "fromNode": 2,
                "toNode": 29,
                "weight": -0.05043845477466147,
                "enabled": true,
                "innovation": 41455
            },
            {
                "fromNode": 3,
                "toNode": 25,
                "weight": 0.025430624372789756,
                "enabled": true,
                "innovation": 41456
            },
            {
                "fromNode": 3,
                "toNode": 26,
                "weight": 0.006104178457117526,
                "enabled": true,
                "innovation": 41457
            },
            {
                "fromNode": 3,
                "toNode": 27,
                "weight": -0.07449595874922321,
                "enabled": true,
                "innovation": 41458
            },
            {
                "fromNode": 3,
                "toNode": 28,
                "weight": -0.02365386881128151,
                "enabled": true,
                "innovation": 41459
            },
            {
                "fromNode": 3,
                "toNode": 29,
                "weight": -0.03800060555143592,
                "enabled": true,
                "innovation": 41460
            },
            {
                "fromNode": 4,
                "toNode": 25,
                "weight": -0.468388778811207,
                "enabled": true,
                "innovation": 41461
            },
            {
                "fromNode": 4,
                "toNode": 26,
                "weight": 0.12806928115991634,
                "enabled": true,
                "innovation": 41462
            },
            {
                "fromNode": 4,
                "toNode": 27,
                "weight": 0.20036456844251704,
                "enabled": true,
                "innovation": 41463
            },
            {
                "fromNode": 4,
                "toNode": 28,
                "weight": -0.44684218247954566,
                "enabled": true,
                "innovation": 41464
            },
            {
                "fromNode": 4,
                "toNode": 29,
                "weight": -0.3235699124589161,
                "enabled": true,
                "innovation": 41465
            },
            {
                "fromNode": 5,
                "toNode": 25,
                "weight": -0.09401935203448819,
                "enabled": true,
                "innovation": 41466
            },
            {
                "fromNode": 5,
                "toNode": 26,
                "weight": -0.17668075674168637,
                "enabled": true,
                "innovation": 41467
            },
            {
                "fromNode": 5,
                "toNode": 27,
                "weight": -0.09429896991717435,
                "enabled": true,
                "innovation": 41468
            },
            {
                "fromNode": 5,
                "toNode": 28,
                "weight": -0.0582838299068984,
                "enabled": true,
                "innovation": 41469
            },
            {
                "fromNode": 5,
                "toNode": 29,
                "weight": 0.44206889993779563,
                "enabled": true,
                "innovation": 41470
            },
            {
                "fromNode": 6,
                "toNode": 25,
                "weight": -0.19393405998117508,
                "enabled": true,
                "innovation": 41471
            },
            {
                "fromNode": 6,
                "toNode": 26,
                "weight": -0.3631792667569148,
                "enabled": true,
                "innovation": 41472
            },
            {
                "fromNode": 6,
                "toNode": 27,
                "weight": -0.35420515999282776,
                "enabled": true,
                "innovation": 41473
            },
            {
                "fromNode": 6,
                "toNode": 28,
                "weight": 0.05043690874256035,
                "enabled": true,
                "innovation": 41474
            },
            {
                "fromNode": 6,
                "toNode": 29,
                "weight": 0.1508748493275962,
                "enabled": true,
                "innovation": 41475
            },
            {
                "fromNode": 7,
                "toNode": 25,
                "weight": 0.09055482861263842,
                "enabled": true,
                "innovation": 41476
            },
            {
                "fromNode": 7,
                "toNode": 26,
                "weight": 0.40967429048037873,
                "enabled": true,
                "innovation": 41477
            },
            {
                "fromNode": 7,
                "toNode": 27,
                "weight": -0.01756002964270842,
                "enabled": true,
                "innovation": 41478
            },
            {
                "fromNode": 7,
                "toNode": 28,
                "weight": 0.04224810320143246,
                "enabled": true,
                "innovation": 41479
            },
            {
                "fromNode": 7,
                "toNode": 29,
                "weight": -0.3913035922378403,
                "enabled": true,
                "innovation": 41480
            },
            {
                "fromNode": 8,
                "toNode": 25,
                "weight": 0.00722987154897603,
                "enabled": true,
                "innovation": 41481
            },
            {
                "fromNode": 8,
                "toNode": 26,
                "weight": 0.32534979879530834,
                "enabled": true,
                "innovation": 41482
            },
            {
                "fromNode": 8,
                "toNode": 27,
                "weight": 0.13475118612294157,
                "enabled": true,
                "innovation": 41483
            },
            {
                "fromNode": 8,
                "toNode": 28,
                "weight": 0.3609629661882999,
                "enabled": true,
                "innovation": 41484
            },
            {
                "fromNode": 8,
                "toNode": 29,
                "weight": -0.3724171176264792,
                "enabled": true,
                "innovation": 41485
            },
            {
                "fromNode": 9,
                "toNode": 25,
                "weight": 0.4380782390257715,
                "enabled": true,
                "innovation": 41486
            },
            {
                "fromNode": 9,
                "toNode": 26,
                "weight": -0.47596321676105036,
                "enabled": true,
                "innovation": 41487
            },
            {
                "fromNode": 9,
                "toNode": 27,
                "weight": -0.28376839926094233,
                "enabled": true,
                "innovation": 41488
            },
            {
                "fromNode": 9,
                "toNode": 28,
                "weight": -0.03028543151834051,
                "enabled": true,
                "innovation": 41489
            },
            {
                "fromNode": 9,
                "toNode": 29,
                "weight": -0.38426082503289705,
                "enabled": true,
                "innovation": 41490
            },
            {
                "fromNode": 10,
                "toNode": 25,
                "weight": -0.45978926473457016,
                "enabled": true,
                "innovation": 41491
            },
            {
                "fromNode": 10,
                "toNode": 26,
                "weight": -0.1334583128620438,
                "enabled": true,
                "innovation": 41492
            },
            {
                "fromNode": 10,
                "toNode": 27,
                "weight": -0.08255719713201304,
                "enabled": true,
                "innovation": 41493
            },
            {
                "fromNode": 10,
                "toNode": 28,
                "weight": 0.09115947556582871,
                "enabled": true,
                "innovation": 41494
            },
            {
                "fromNode": 10,
                "toNode": 29,
                "weight": -0.30042450198742754,
                "enabled": true,
                "innovation": 41495
            },
            {
                "fromNode": 11,
                "toNode": 25,
                "weight": 0.1908662705253873,
                "enabled": true,
                "innovation": 41496
            },
            {
                "fromNode": 11,
                "toNode": 26,
                "weight": -0.3934471427908175,
                "enabled": true,
                "innovation": 41497
            },
            {
                "fromNode": 11,
                "toNode": 27,
                "weight": -0.19894295659706296,
                "enabled": true,
                "innovation": 41498
            },
            {
                "fromNode": 11,
                "toNode": 28,
                "weight": -0.08889479416151613,
                "enabled": true,
                "innovation": 41499
            },
            {
                "fromNode": 11,
                "toNode": 29,
                "weight": 0.10293268438635383,
                "enabled": true,
                "innovation": 41500
            },
            {
                "fromNode": 12,
                "toNode": 25,
                "weight": 0.35261627661689077,
                "enabled": true,
                "innovation": 41501
            },
            {
                "fromNode": 12,
                "toNode": 26,
                "weight": -0.06108144599865817,
                "enabled": true,
                "innovation": 41502
            },
            {
                "fromNode": 12,
                "toNode": 27,
                "weight": -0.13216576282039205,
                "enabled": true,
                "innovation": 41503
            },
            {
                "fromNode": 12,
                "toNode": 28,
                "weight": 0.2512615393901073,
                "enabled": true,
                "innovation": 41504
            },
            {
                "fromNode": 12,
                "toNode": 29,
                "weight": 0.15890137640303426,
                "enabled": true,
                "innovation": 41505
            },
            {
                "fromNode": 13,
                "toNode": 25,
                "weight": -0.031110498502621486,
                "enabled": true,
                "innovation": 41506
            },
            {
                "fromNode": 13,
                "toNode": 26,
                "weight": -0.10908553217225114,
                "enabled": true,
                "innovation": 41507
            },
            {
                "fromNode": 13,
                "toNode": 27,
                "weight": 0.1366070700613008,
                "enabled": true,
                "innovation": 41508
            },
            {
                "fromNode": 13,
                "toNode": 28,
                "weight": -0.010573443108697234,
                "enabled": true,
                "innovation": 41509
            },
            {
                "fromNode": 13,
                "toNode": 29,
                "weight": 0.19449416953267507,
                "enabled": true,
                "innovation": 41510
            },
            {
                "fromNode": 14,
                "toNode": 25,
                "weight": 0.17433744647259364,
                "enabled": true,
                "innovation": 41511
            },
            {
                "fromNode": 14,
                "toNode": 26,
                "weight": -0.15217591359228633,
                "enabled": true,
                "innovation": 41512
            },
            {
                "fromNode": 14,
                "toNode": 27,
                "weight": -0.3242374312566647,
                "enabled": true,
                "innovation": 41513
            },
            {
                "fromNode": 14,
                "toNode": 28,
                "weight": -0.08592109005840698,
                "enabled": true,
                "innovation": 41514
            },
            {
                "fromNode": 14,
                "toNode": 29,
                "weight": 0.4636148661113605,
                "enabled": true,
                "innovation": 41515
            },
            {
                "fromNode": 15,
                "toNode": 25,
                "weight": 0.4554659550730612,
                "enabled": true,
                "innovation": 41516
            },
            {
                "fromNode": 15,
                "toNode": 26,
                "weight": -0.1332430852057943,
                "enabled": true,
                "innovation": 41517
            },
            {
                "fromNode": 15,
                "toNode": 27,
                "weight": -0.4900555139216306,
                "enabled": true,
                "innovation": 41518
            },
            {
                "fromNode": 15,
                "toNode": 28,
                "weight": 0.15319935418531105,
                "enabled": true,
                "innovation": 41519
            },
            {
                "fromNode": 15,
                "toNode": 29,
                "weight": 0.3200515116285739,
                "enabled": true,
                "innovation": 41520
            },
            {
                "fromNode": 16,
                "toNode": 25,
                "weight": 0.43246510478326694,
                "enabled": true,
                "innovation": 41521
            },
            {
                "fromNode": 16,
                "toNode": 26,
                "weight": -0.18545880861745134,
                "enabled": true,
                "innovation": 41522
            },
            {
                "fromNode": 16,
                "toNode": 27,
                "weight": 0.1521278812509672,
                "enabled": true,
                "innovation": 41523
            },
            {
                "fromNode": 16,
                "toNode": 28,
                "weight": 0.09195504307971691,
                "enabled": true,
                "innovation": 41524
            },
            {
                "fromNode": 16,
                "toNode": 29,
                "weight": 0.16498999801059455,
                "enabled": true,
                "innovation": 41525
            },
            {
                "fromNode": 17,
                "toNode": 25,
                "weight": -0.4870747259570568,
                "enabled": true,
                "innovation": 41526
            },
            {
                "fromNode": 17,
                "toNode": 26,
                "weight": -0.46531455624679996,
                "enabled": true,
                "innovation": 41527
            },
            {
                "fromNode": 17,
                "toNode": 27,
                "weight": 0.4616283225754909,
                "enabled": true,
                "innovation": 41528
            },
            {
                "fromNode": 17,
                "toNode": 28,
                "weight": -0.1639774169362086,
                "enabled": true,
                "innovation": 41529
            },
            {
                "fromNode": 17,
                "toNode": 29,
                "weight": -0.008666770280801317,
                "enabled": true,
                "innovation": 41530
            },
            {
                "fromNode": 18,
                "toNode": 25,
                "weight": -0.1161279179363034,
                "enabled": true,
                "innovation": 41531
            },
            {
                "fromNode": 18,
                "toNode": 26,
                "weight": -0.17224089563499212,
                "enabled": true,
                "innovation": 41532
            },
            {
                "fromNode": 18,
                "toNode": 27,
                "weight": -0.06869026318049187,
                "enabled": true,
                "innovation": 41533
            },
            {
                "fromNode": 18,
                "toNode": 28,
                "weight": 0.37570053948976756,
                "enabled": true,
                "innovation": 41534
            },
            {
                "fromNode": 18,
                "toNode": 29,
                "weight": 0.3860535051269556,
                "enabled": true,
                "innovation": 41535
            },
            {
                "fromNode": 19,
                "toNode": 25,
                "weight": 0.06053417812321005,
                "enabled": true,
                "innovation": 41536
            },
            {
                "fromNode": 19,
                "toNode": 26,
                "weight": -0.35095302972875264,
                "enabled": true,
                "innovation": 41537
            },
            {
                "fromNode": 19,
                "toNode": 27,
                "weight": -0.4665767142583098,
                "enabled": true,
                "innovation": 41538
            },
            {
                "fromNode": 19,
                "toNode": 28,
                "weight": 0.054101019782450854,
                "enabled": true,
                "innovation": 41539
            },
            {
                "fromNode": 19,
                "toNode": 29,
                "weight": -0.07466837739216192,
                "enabled": true,
                "innovation": 41540
            },
            {
                "fromNode": 20,
                "toNode": 25,
                "weight": 0.1189510364958083,
                "enabled": true,
                "innovation": 41541
            },
            {
                "fromNode": 20,
                "toNode": 26,
                "weight": 0.44208173897987846,
                "enabled": true,
                "innovation": 41542
            },
            {
                "fromNode": 20,
                "toNode": 27,
                "weight": 0.4732551985491442,
                "enabled": true,
                "innovation": 41543
            },
            {
                "fromNode": 20,
                "toNode": 28,
                "weight": 0.19807530830722053,
                "enabled": true,
                "innovation": 41544
            },
            {
                "fromNode": 20,
                "toNode": 29,
                "weight": -0.4947345905029148,
                "enabled": true,
                "innovation": 41545
            },
            {
                "fromNode": 21,
                "toNode": 25,
                "weight": -0.31013884230802935,
                "enabled": true,
                "innovation": 41546
            },
            {
                "fromNode": 21,
                "toNode": 26,
                "weight": 0.10774177650469507,
                "enabled": true,
                "innovation": 41547
            },
            {
                "fromNode": 21,
                "toNode": 27,
                "weight": -0.1461836863953876,
                "enabled": true,
                "innovation": 41548
            },
            {
                "fromNode": 21,
                "toNode": 28,
                "weight": 0.4560330106203777,
                "enabled": true,
                "innovation": 41549
            },
            {
                "fromNode": 21,
                "toNode": 29,
                "weight": 0.46017814819864555,
                "enabled": true,
                "innovation": 41550
            },
            {
                "fromNode": 22,
                "toNode": 25,
                "weight": 0.1711564339483086,
                "enabled": true,
                "innovation": 41551
            },
            {
                "fromNode": 22,
                "toNode": 26,
                "weight": 0.3645923292427482,
                "enabled": true,
                "innovation": 41552
            },
            {
                "fromNode": 22,
                "toNode": 27,
                "weight": 0.4850706910515864,
                "enabled": true,
                "innovation": 41553
            },
            {
                "fromNode": 22,
                "toNode": 28,
                "weight": 0.4924939601477686,
                "enabled": true,
                "innovation": 41554
            },
            {
                "fromNode": 22,
                "toNode": 29,
                "weight": -0.3718543010261257,
                "enabled": true,
                "innovation": 41555
            },
            {
                "fromNode": 23,
                "toNode": 25,
                "weight": 0.37771563935096564,
                "enabled": true,
                "innovation": 41556
            },
            {
                "fromNode": 23,
                "toNode": 26,
                "weight": 0.22265705639257682,
                "enabled": true,
                "innovation": 41557
            },
            {
                "fromNode": 23,
                "toNode": 27,
                "weight": -0.47186578200582663,
                "enabled": true,
                "innovation": 41558
            },
            {
                "fromNode": 23,
                "toNode": 28,
                "weight": 0.10163064338725547,
                "enabled": true,
                "innovation": 41559
            },
            {
                "fromNode": 23,
                "toNode": 29,
                "weight": -0.009274457208445774,
                "enabled": true,
                "innovation": 41560
            },
            {
                "fromNode": 24,
                "toNode": 25,
                "weight": -0.23516415938479085,
                "enabled": true,
                "innovation": 41561
            },
            {
                "fromNode": 24,
                "toNode": 26,
                "weight": 0.46836673844079424,
                "enabled": true,
                "innovation": 41562
            },
            {
                "fromNode": 24,
                "toNode": 27,
                "weight": 0.08976423291051383,
                "enabled": true,
                "innovation": 41563
            },
            {
                "fromNode": 24,
                "toNode": 28,
                "weight": 0.0898524027630504,
                "enabled": true,
                "innovation": 41564
            },
            {
                "fromNode": 24,
                "toNode": 29,
                "weight": 0.475331924006417,
                "enabled": true,
                "innovation": 41565
            }
        ]
    },
  },
  {
    id: "builtin_chute_cart",
    name: "Chute Cart",
    generation: 11,
    fitness: 2969.39642345583,
    trainedGoal: EvolutionGoal.FLIGHT_TIME,
    createdAt: "2026-07-29T10:59:09.300Z",
    blueprint: {
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
    genome: {
        "nodes": [
            {
                "id": 0,
                "type": "input",
                "label": "Input 0"
            },
            {
                "id": 1,
                "type": "input",
                "label": "Input 1"
            },
            {
                "id": 2,
                "type": "input",
                "label": "Input 2"
            },
            {
                "id": 3,
                "type": "input",
                "label": "Input 3"
            },
            {
                "id": 4,
                "type": "input",
                "label": "Input 4"
            },
            {
                "id": 5,
                "type": "input",
                "label": "Input 5"
            },
            {
                "id": 6,
                "type": "input",
                "label": "Input 6"
            },
            {
                "id": 7,
                "type": "input",
                "label": "Input 7"
            },
            {
                "id": 8,
                "type": "input",
                "label": "Input 8"
            },
            {
                "id": 9,
                "type": "input",
                "label": "Input 9"
            },
            {
                "id": 10,
                "type": "input",
                "label": "Input 10"
            },
            {
                "id": 11,
                "type": "input",
                "label": "Input 11"
            },
            {
                "id": 12,
                "type": "input",
                "label": "Input 12"
            },
            {
                "id": 13,
                "type": "input",
                "label": "Input 13"
            },
            {
                "id": 14,
                "type": "input",
                "label": "Input 14"
            },
            {
                "id": 15,
                "type": "input",
                "label": "Input 15"
            },
            {
                "id": 16,
                "type": "input",
                "label": "Input 16"
            },
            {
                "id": 17,
                "type": "input",
                "label": "Input 17"
            },
            {
                "id": 18,
                "type": "input",
                "label": "Input 18"
            },
            {
                "id": 19,
                "type": "input",
                "label": "Input 19"
            },
            {
                "id": 20,
                "type": "output",
                "label": "Output 0"
            },
            {
                "id": 21,
                "type": "output",
                "label": "Output 1"
            },
            {
                "id": 22,
                "type": "output",
                "label": "Output 2"
            },
            {
                "id": 23,
                "type": "output",
                "label": "Output 3"
            }
        ],
        "connections": [
            {
                "fromNode": 0,
                "toNode": 20,
                "weight": 0.3373918701739581,
                "enabled": true,
                "innovation": 43941
            },
            {
                "fromNode": 0,
                "toNode": 21,
                "weight": 0.16612218788845146,
                "enabled": true,
                "innovation": 43942
            },
            {
                "fromNode": 0,
                "toNode": 22,
                "weight": -0.2488205118319975,
                "enabled": true,
                "innovation": 43943
            },
            {
                "fromNode": 0,
                "toNode": 23,
                "weight": 0.1712123152485584,
                "enabled": true,
                "innovation": 43944
            },
            {
                "fromNode": 1,
                "toNode": 20,
                "weight": -0.43326239126704935,
                "enabled": true,
                "innovation": 43945
            },
            {
                "fromNode": 1,
                "toNode": 21,
                "weight": -0.10903059950347038,
                "enabled": true,
                "innovation": 43946
            },
            {
                "fromNode": 1,
                "toNode": 22,
                "weight": 0.21665694882426834,
                "enabled": true,
                "innovation": 43947
            },
            {
                "fromNode": 1,
                "toNode": 23,
                "weight": -0.2741809432155,
                "enabled": true,
                "innovation": 43948
            },
            {
                "fromNode": 2,
                "toNode": 20,
                "weight": 0.23296093979126886,
                "enabled": true,
                "innovation": 43949
            },
            {
                "fromNode": 2,
                "toNode": 21,
                "weight": -0.04129206999657653,
                "enabled": true,
                "innovation": 43950
            },
            {
                "fromNode": 2,
                "toNode": 22,
                "weight": 0.2298450888357878,
                "enabled": true,
                "innovation": 43951
            },
            {
                "fromNode": 2,
                "toNode": 23,
                "weight": -0.2157146693846531,
                "enabled": true,
                "innovation": 43952
            },
            {
                "fromNode": 3,
                "toNode": 20,
                "weight": -0.23570596630792262,
                "enabled": true,
                "innovation": 43953
            },
            {
                "fromNode": 3,
                "toNode": 21,
                "weight": -0.18840888831603952,
                "enabled": true,
                "innovation": 43954
            },
            {
                "fromNode": 3,
                "toNode": 22,
                "weight": 0.3788738307508329,
                "enabled": true,
                "innovation": 43955
            },
            {
                "fromNode": 3,
                "toNode": 23,
                "weight": 0.3673918974388367,
                "enabled": true,
                "innovation": 43956
            },
            {
                "fromNode": 4,
                "toNode": 20,
                "weight": 0.1904728836157431,
                "enabled": true,
                "innovation": 43957
            },
            {
                "fromNode": 4,
                "toNode": 21,
                "weight": -0.0662083434824946,
                "enabled": true,
                "innovation": 43958
            },
            {
                "fromNode": 4,
                "toNode": 22,
                "weight": -0.3701477707502763,
                "enabled": true,
                "innovation": 43959
            },
            {
                "fromNode": 4,
                "toNode": 23,
                "weight": -0.4875819517459299,
                "enabled": true,
                "innovation": 43960
            },
            {
                "fromNode": 5,
                "toNode": 20,
                "weight": -0.10511642711521596,
                "enabled": true,
                "innovation": 43961
            },
            {
                "fromNode": 5,
                "toNode": 21,
                "weight": 0.048221796933116234,
                "enabled": true,
                "innovation": 43962
            },
            {
                "fromNode": 5,
                "toNode": 22,
                "weight": 0.1517896602395291,
                "enabled": true,
                "innovation": 43963
            },
            {
                "fromNode": 5,
                "toNode": 23,
                "weight": 0.3511876146110514,
                "enabled": true,
                "innovation": 43964
            },
            {
                "fromNode": 6,
                "toNode": 20,
                "weight": -0.3234953542410445,
                "enabled": true,
                "innovation": 43965
            },
            {
                "fromNode": 6,
                "toNode": 21,
                "weight": 0.05872752301218198,
                "enabled": true,
                "innovation": 43966
            },
            {
                "fromNode": 6,
                "toNode": 22,
                "weight": 0.47035758493287305,
                "enabled": true,
                "innovation": 43967
            },
            {
                "fromNode": 6,
                "toNode": 23,
                "weight": -0.2657830019110583,
                "enabled": true,
                "innovation": 43968
            },
            {
                "fromNode": 7,
                "toNode": 20,
                "weight": 0.2701631653205231,
                "enabled": true,
                "innovation": 43969
            },
            {
                "fromNode": 7,
                "toNode": 21,
                "weight": 0.40097484079254375,
                "enabled": true,
                "innovation": 43970
            },
            {
                "fromNode": 7,
                "toNode": 22,
                "weight": 0.05200504050232424,
                "enabled": true,
                "innovation": 43971
            },
            {
                "fromNode": 7,
                "toNode": 23,
                "weight": 0.40744758125177527,
                "enabled": true,
                "innovation": 43972
            },
            {
                "fromNode": 8,
                "toNode": 20,
                "weight": -0.23115085384151957,
                "enabled": true,
                "innovation": 43973
            },
            {
                "fromNode": 8,
                "toNode": 21,
                "weight": -0.08300455501005055,
                "enabled": true,
                "innovation": 43974
            },
            {
                "fromNode": 8,
                "toNode": 22,
                "weight": -0.27821883032203887,
                "enabled": true,
                "innovation": 43975
            },
            {
                "fromNode": 8,
                "toNode": 23,
                "weight": 0.48068621109762866,
                "enabled": true,
                "innovation": 43976
            },
            {
                "fromNode": 9,
                "toNode": 20,
                "weight": -0.009358247904878603,
                "enabled": true,
                "innovation": 43977
            },
            {
                "fromNode": 9,
                "toNode": 21,
                "weight": -0.20051356790197405,
                "enabled": true,
                "innovation": 43978
            },
            {
                "fromNode": 9,
                "toNode": 22,
                "weight": -0.39578462237122514,
                "enabled": true,
                "innovation": 43979
            },
            {
                "fromNode": 9,
                "toNode": 23,
                "weight": 0.022162751021981397,
                "enabled": true,
                "innovation": 43980
            },
            {
                "fromNode": 10,
                "toNode": 20,
                "weight": -0.13960872532016977,
                "enabled": true,
                "innovation": 43981
            },
            {
                "fromNode": 10,
                "toNode": 21,
                "weight": -0.0399775106825373,
                "enabled": true,
                "innovation": 43982
            },
            {
                "fromNode": 10,
                "toNode": 22,
                "weight": 0.4794911321359958,
                "enabled": true,
                "innovation": 43983
            },
            {
                "fromNode": 10,
                "toNode": 23,
                "weight": -0.4044422088093388,
                "enabled": true,
                "innovation": 43984
            },
            {
                "fromNode": 11,
                "toNode": 20,
                "weight": -0.21444597103682228,
                "enabled": true,
                "innovation": 43985
            },
            {
                "fromNode": 11,
                "toNode": 21,
                "weight": 0.3229667932538969,
                "enabled": true,
                "innovation": 43986
            },
            {
                "fromNode": 11,
                "toNode": 22,
                "weight": -0.4012785697740813,
                "enabled": true,
                "innovation": 43987
            },
            {
                "fromNode": 11,
                "toNode": 23,
                "weight": -0.2821672821133542,
                "enabled": true,
                "innovation": 43988
            },
            {
                "fromNode": 12,
                "toNode": 20,
                "weight": -0.26025307805505427,
                "enabled": true,
                "innovation": 43989
            },
            {
                "fromNode": 12,
                "toNode": 21,
                "weight": -0.2609482982411474,
                "enabled": true,
                "innovation": 43990
            },
            {
                "fromNode": 12,
                "toNode": 22,
                "weight": -0.48667009685078766,
                "enabled": true,
                "innovation": 43991
            },
            {
                "fromNode": 12,
                "toNode": 23,
                "weight": 0.3109815189874875,
                "enabled": true,
                "innovation": 43992
            },
            {
                "fromNode": 13,
                "toNode": 20,
                "weight": -0.4172137562991146,
                "enabled": true,
                "innovation": 43993
            },
            {
                "fromNode": 13,
                "toNode": 21,
                "weight": -0.16906230371580544,
                "enabled": true,
                "innovation": 43994
            },
            {
                "fromNode": 13,
                "toNode": 22,
                "weight": 0.40780943854058116,
                "enabled": true,
                "innovation": 43995
            },
            {
                "fromNode": 13,
                "toNode": 23,
                "weight": -0.2852932001135975,
                "enabled": true,
                "innovation": 43996
            },
            {
                "fromNode": 14,
                "toNode": 20,
                "weight": 0.34102184004200764,
                "enabled": true,
                "innovation": 43997
            },
            {
                "fromNode": 14,
                "toNode": 21,
                "weight": -0.1777071738827014,
                "enabled": true,
                "innovation": 43998
            },
            {
                "fromNode": 14,
                "toNode": 22,
                "weight": 0.07072200307203669,
                "enabled": true,
                "innovation": 43999
            },
            {
                "fromNode": 14,
                "toNode": 23,
                "weight": -0.04080613448731418,
                "enabled": true,
                "innovation": 44000
            },
            {
                "fromNode": 15,
                "toNode": 20,
                "weight": 0.05922894145284274,
                "enabled": true,
                "innovation": 44001
            },
            {
                "fromNode": 15,
                "toNode": 21,
                "weight": -0.007576010316778681,
                "enabled": true,
                "innovation": 44002
            },
            {
                "fromNode": 15,
                "toNode": 22,
                "weight": 0.06305765912836503,
                "enabled": true,
                "innovation": 44003
            },
            {
                "fromNode": 15,
                "toNode": 23,
                "weight": -0.371651930539168,
                "enabled": true,
                "innovation": 44004
            },
            {
                "fromNode": 16,
                "toNode": 20,
                "weight": 0.07938577879029152,
                "enabled": true,
                "innovation": 44005
            },
            {
                "fromNode": 16,
                "toNode": 21,
                "weight": -0.4074087115214836,
                "enabled": true,
                "innovation": 44006
            },
            {
                "fromNode": 16,
                "toNode": 22,
                "weight": 0.15312419633275176,
                "enabled": true,
                "innovation": 44007
            },
            {
                "fromNode": 16,
                "toNode": 23,
                "weight": 0.03690559381678249,
                "enabled": true,
                "innovation": 44008
            },
            {
                "fromNode": 17,
                "toNode": 20,
                "weight": -0.4433462396320703,
                "enabled": true,
                "innovation": 44009
            },
            {
                "fromNode": 17,
                "toNode": 21,
                "weight": -0.42658322093528467,
                "enabled": true,
                "innovation": 44010
            },
            {
                "fromNode": 17,
                "toNode": 22,
                "weight": 0.4544292092625468,
                "enabled": true,
                "innovation": 44011
            },
            {
                "fromNode": 17,
                "toNode": 23,
                "weight": -0.04270085922482281,
                "enabled": true,
                "innovation": 44012
            },
            {
                "fromNode": 18,
                "toNode": 20,
                "weight": -0.49660682907123577,
                "enabled": true,
                "innovation": 44013
            },
            {
                "fromNode": 18,
                "toNode": 21,
                "weight": -0.1768218080755639,
                "enabled": true,
                "innovation": 44014
            },
            {
                "fromNode": 18,
                "toNode": 22,
                "weight": -0.16870807492401607,
                "enabled": true,
                "innovation": 44015
            },
            {
                "fromNode": 18,
                "toNode": 23,
                "weight": -0.3138440828230452,
                "enabled": true,
                "innovation": 44016
            },
            {
                "fromNode": 19,
                "toNode": 20,
                "weight": -0.3651173268165552,
                "enabled": true,
                "innovation": 44017
            },
            {
                "fromNode": 19,
                "toNode": 21,
                "weight": 0.46388127814234614,
                "enabled": true,
                "innovation": 44018
            },
            {
                "fromNode": 19,
                "toNode": 22,
                "weight": 0.4498370579506672,
                "enabled": true,
                "innovation": 44019
            },
            {
                "fromNode": 19,
                "toNode": 23,
                "weight": 0.12432687455504376,
                "enabled": true,
                "innovation": 44020
            }
        ]
    },
  },
  {
    id: "builtin_robobird",
    name: "RoboBird",
    generation: 14,
    fitness: 268.17106199593695,
    trainedGoal: EvolutionGoal.FLIGHT_TIME,
    createdAt: "2026-07-29T11:00:04.990Z",
    blueprint: {
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
    genome: {
        "nodes": [
            {
                "id": 0,
                "type": "input",
                "label": "Input 0"
            },
            {
                "id": 1,
                "type": "input",
                "label": "Input 1"
            },
            {
                "id": 2,
                "type": "input",
                "label": "Input 2"
            },
            {
                "id": 3,
                "type": "input",
                "label": "Input 3"
            },
            {
                "id": 4,
                "type": "input",
                "label": "Input 4"
            },
            {
                "id": 5,
                "type": "input",
                "label": "Input 5"
            },
            {
                "id": 6,
                "type": "input",
                "label": "Input 6"
            },
            {
                "id": 7,
                "type": "input",
                "label": "Input 7"
            },
            {
                "id": 8,
                "type": "input",
                "label": "Input 8"
            },
            {
                "id": 9,
                "type": "input",
                "label": "Input 9"
            },
            {
                "id": 10,
                "type": "input",
                "label": "Input 10"
            },
            {
                "id": 11,
                "type": "input",
                "label": "Input 11"
            },
            {
                "id": 12,
                "type": "input",
                "label": "Input 12"
            },
            {
                "id": 13,
                "type": "input",
                "label": "Input 13"
            },
            {
                "id": 14,
                "type": "input",
                "label": "Input 14"
            },
            {
                "id": 15,
                "type": "input",
                "label": "Input 15"
            },
            {
                "id": 16,
                "type": "input",
                "label": "Input 16"
            },
            {
                "id": 17,
                "type": "input",
                "label": "Input 17"
            },
            {
                "id": 18,
                "type": "input",
                "label": "Input 18"
            },
            {
                "id": 19,
                "type": "input",
                "label": "Input 19"
            },
            {
                "id": 20,
                "type": "input",
                "label": "Input 20"
            },
            {
                "id": 21,
                "type": "input",
                "label": "Input 21"
            },
            {
                "id": 22,
                "type": "input",
                "label": "Input 22"
            },
            {
                "id": 23,
                "type": "input",
                "label": "Input 23"
            },
            {
                "id": 24,
                "type": "input",
                "label": "Input 24"
            },
            {
                "id": 25,
                "type": "input",
                "label": "Input 25"
            },
            {
                "id": 26,
                "type": "input",
                "label": "Input 26"
            },
            {
                "id": 27,
                "type": "input",
                "label": "Input 27"
            },
            {
                "id": 28,
                "type": "input",
                "label": "Input 28"
            },
            {
                "id": 29,
                "type": "output",
                "label": "Output 0"
            },
            {
                "id": 30,
                "type": "output",
                "label": "Output 1"
            },
            {
                "id": 31,
                "type": "output",
                "label": "Output 2"
            },
            {
                "id": 32,
                "type": "output",
                "label": "Output 3"
            }
        ],
        "connections": [
            {
                "fromNode": 0,
                "toNode": 29,
                "weight": -0.4798674952716836,
                "enabled": true,
                "innovation": 48441
            },
            {
                "fromNode": 0,
                "toNode": 30,
                "weight": 0.40213105656939674,
                "enabled": true,
                "innovation": 48442
            },
            {
                "fromNode": 0,
                "toNode": 31,
                "weight": -0.18267086377708652,
                "enabled": true,
                "innovation": 48443
            },
            {
                "fromNode": 0,
                "toNode": 32,
                "weight": -0.4121570448129248,
                "enabled": true,
                "innovation": 48444
            },
            {
                "fromNode": 1,
                "toNode": 29,
                "weight": 0.485088893504633,
                "enabled": true,
                "innovation": 48445
            },
            {
                "fromNode": 1,
                "toNode": 30,
                "weight": 0.24799880573501154,
                "enabled": true,
                "innovation": 48446
            },
            {
                "fromNode": 1,
                "toNode": 31,
                "weight": -0.32156432057964013,
                "enabled": true,
                "innovation": 48447
            },
            {
                "fromNode": 1,
                "toNode": 32,
                "weight": -0.3350369471093939,
                "enabled": true,
                "innovation": 48448
            },
            {
                "fromNode": 2,
                "toNode": 29,
                "weight": 0.4542091924637115,
                "enabled": true,
                "innovation": 48449
            },
            {
                "fromNode": 2,
                "toNode": 30,
                "weight": -0.07569837816022407,
                "enabled": true,
                "innovation": 48450
            },
            {
                "fromNode": 2,
                "toNode": 31,
                "weight": 0.3349886718545465,
                "enabled": true,
                "innovation": 48451
            },
            {
                "fromNode": 2,
                "toNode": 32,
                "weight": -0.05525938628819804,
                "enabled": true,
                "innovation": 48452
            },
            {
                "fromNode": 3,
                "toNode": 29,
                "weight": -0.15143922342437777,
                "enabled": true,
                "innovation": 48453
            },
            {
                "fromNode": 3,
                "toNode": 30,
                "weight": 0.3546609663065253,
                "enabled": true,
                "innovation": 48454
            },
            {
                "fromNode": 3,
                "toNode": 31,
                "weight": -0.025273159584135896,
                "enabled": true,
                "innovation": 48455
            },
            {
                "fromNode": 3,
                "toNode": 32,
                "weight": -0.07051903442192753,
                "enabled": true,
                "innovation": 48456
            },
            {
                "fromNode": 4,
                "toNode": 29,
                "weight": -0.18268582853443638,
                "enabled": true,
                "innovation": 48457
            },
            {
                "fromNode": 4,
                "toNode": 30,
                "weight": -0.023355120050182365,
                "enabled": true,
                "innovation": 48458
            },
            {
                "fromNode": 4,
                "toNode": 31,
                "weight": 0.41519035954820505,
                "enabled": true,
                "innovation": 48459
            },
            {
                "fromNode": 4,
                "toNode": 32,
                "weight": -0.007325983480239273,
                "enabled": true,
                "innovation": 48460
            },
            {
                "fromNode": 5,
                "toNode": 29,
                "weight": -0.09414988495974219,
                "enabled": true,
                "innovation": 48461
            },
            {
                "fromNode": 5,
                "toNode": 30,
                "weight": -0.2811159424428269,
                "enabled": true,
                "innovation": 48462
            },
            {
                "fromNode": 5,
                "toNode": 31,
                "weight": -0.14620506821891122,
                "enabled": true,
                "innovation": 48463
            },
            {
                "fromNode": 5,
                "toNode": 32,
                "weight": 0.19144976727436958,
                "enabled": true,
                "innovation": 48464
            },
            {
                "fromNode": 6,
                "toNode": 29,
                "weight": -0.1496565734597296,
                "enabled": true,
                "innovation": 48465
            },
            {
                "fromNode": 6,
                "toNode": 30,
                "weight": -0.13362732534762334,
                "enabled": true,
                "innovation": 48466
            },
            {
                "fromNode": 6,
                "toNode": 31,
                "weight": -0.18712406149336702,
                "enabled": true,
                "innovation": 48467
            },
            {
                "fromNode": 6,
                "toNode": 32,
                "weight": 0.1969337239863438,
                "enabled": true,
                "innovation": 48468
            },
            {
                "fromNode": 7,
                "toNode": 29,
                "weight": -0.015299312773397022,
                "enabled": true,
                "innovation": 48469
            },
            {
                "fromNode": 7,
                "toNode": 30,
                "weight": 0.475276830533084,
                "enabled": true,
                "innovation": 48470
            },
            {
                "fromNode": 7,
                "toNode": 31,
                "weight": -0.07190005026533441,
                "enabled": true,
                "innovation": 48471
            },
            {
                "fromNode": 7,
                "toNode": 32,
                "weight": -0.02484248261497668,
                "enabled": true,
                "innovation": 48472
            },
            {
                "fromNode": 8,
                "toNode": 29,
                "weight": -0.16504360493211734,
                "enabled": true,
                "innovation": 48473
            },
            {
                "fromNode": 8,
                "toNode": 30,
                "weight": 0.4953094205566425,
                "enabled": true,
                "innovation": 48474
            },
            {
                "fromNode": 8,
                "toNode": 31,
                "weight": 0.2822439012167769,
                "enabled": true,
                "innovation": 48475
            },
            {
                "fromNode": 8,
                "toNode": 32,
                "weight": -0.28080889747932136,
                "enabled": true,
                "innovation": 48476
            },
            {
                "fromNode": 9,
                "toNode": 29,
                "weight": 0.363174226160769,
                "enabled": true,
                "innovation": 48477
            },
            {
                "fromNode": 9,
                "toNode": 30,
                "weight": -0.09239917399055342,
                "enabled": true,
                "innovation": 48478
            },
            {
                "fromNode": 9,
                "toNode": 31,
                "weight": -0.17355932953472997,
                "enabled": true,
                "innovation": 48479
            },
            {
                "fromNode": 9,
                "toNode": 32,
                "weight": -0.03727879342260165,
                "enabled": true,
                "innovation": 48480
            },
            {
                "fromNode": 10,
                "toNode": 29,
                "weight": -0.2939844175935207,
                "enabled": true,
                "innovation": 48481
            },
            {
                "fromNode": 10,
                "toNode": 30,
                "weight": 0.3323979519834196,
                "enabled": true,
                "innovation": 48482
            },
            {
                "fromNode": 10,
                "toNode": 31,
                "weight": 0.0933720259779448,
                "enabled": true,
                "innovation": 48483
            },
            {
                "fromNode": 10,
                "toNode": 32,
                "weight": 0.3918748576361959,
                "enabled": true,
                "innovation": 48484
            },
            {
                "fromNode": 11,
                "toNode": 29,
                "weight": 0.19169456425009834,
                "enabled": true,
                "innovation": 48485
            },
            {
                "fromNode": 11,
                "toNode": 30,
                "weight": -0.1482633881947104,
                "enabled": true,
                "innovation": 48486
            },
            {
                "fromNode": 11,
                "toNode": 31,
                "weight": -0.3482157508973802,
                "enabled": true,
                "innovation": 48487
            },
            {
                "fromNode": 11,
                "toNode": 32,
                "weight": -0.19121464652825038,
                "enabled": true,
                "innovation": 48488
            },
            {
                "fromNode": 12,
                "toNode": 29,
                "weight": 0.2093864075059816,
                "enabled": true,
                "innovation": 48489
            },
            {
                "fromNode": 12,
                "toNode": 30,
                "weight": -0.06542210815106453,
                "enabled": true,
                "innovation": 48490
            },
            {
                "fromNode": 12,
                "toNode": 31,
                "weight": -0.26596700254079797,
                "enabled": true,
                "innovation": 48491
            },
            {
                "fromNode": 12,
                "toNode": 32,
                "weight": -0.24877322460920337,
                "enabled": true,
                "innovation": 48492
            },
            {
                "fromNode": 13,
                "toNode": 29,
                "weight": 0.4399693609876253,
                "enabled": true,
                "innovation": 48493
            },
            {
                "fromNode": 13,
                "toNode": 30,
                "weight": 0.3710038139842141,
                "enabled": true,
                "innovation": 48494
            },
            {
                "fromNode": 13,
                "toNode": 31,
                "weight": -0.06273610808756003,
                "enabled": true,
                "innovation": 48495
            },
            {
                "fromNode": 13,
                "toNode": 32,
                "weight": -0.37074838662345944,
                "enabled": true,
                "innovation": 48496
            },
            {
                "fromNode": 14,
                "toNode": 29,
                "weight": 0.04448985737852218,
                "enabled": true,
                "innovation": 48497
            },
            {
                "fromNode": 14,
                "toNode": 30,
                "weight": 0.03711347681784061,
                "enabled": true,
                "innovation": 48498
            },
            {
                "fromNode": 14,
                "toNode": 31,
                "weight": 0.4680966985938557,
                "enabled": true,
                "innovation": 48499
            },
            {
                "fromNode": 14,
                "toNode": 32,
                "weight": 0.4606117707951968,
                "enabled": true,
                "innovation": 48500
            },
            {
                "fromNode": 15,
                "toNode": 29,
                "weight": -0.29593523316168313,
                "enabled": true,
                "innovation": 48501
            },
            {
                "fromNode": 15,
                "toNode": 30,
                "weight": 0.09360633343886748,
                "enabled": true,
                "innovation": 48502
            },
            {
                "fromNode": 15,
                "toNode": 31,
                "weight": 0.24092289753675744,
                "enabled": true,
                "innovation": 48503
            },
            {
                "fromNode": 15,
                "toNode": 32,
                "weight": 0.23534055740937931,
                "enabled": true,
                "innovation": 48504
            },
            {
                "fromNode": 16,
                "toNode": 29,
                "weight": 0.2487446967623217,
                "enabled": true,
                "innovation": 48505
            },
            {
                "fromNode": 16,
                "toNode": 30,
                "weight": 0.3385892230690256,
                "enabled": true,
                "innovation": 48506
            },
            {
                "fromNode": 16,
                "toNode": 31,
                "weight": 0.3370852587285168,
                "enabled": true,
                "innovation": 48507
            },
            {
                "fromNode": 16,
                "toNode": 32,
                "weight": -0.23498992099622684,
                "enabled": true,
                "innovation": 48508
            },
            {
                "fromNode": 17,
                "toNode": 29,
                "weight": -0.19966899110627712,
                "enabled": true,
                "innovation": 48509
            },
            {
                "fromNode": 17,
                "toNode": 30,
                "weight": 0.2043817599610368,
                "enabled": true,
                "innovation": 48510
            },
            {
                "fromNode": 17,
                "toNode": 31,
                "weight": -0.1363780529257882,
                "enabled": true,
                "innovation": 48511
            },
            {
                "fromNode": 17,
                "toNode": 32,
                "weight": 0.465754130729945,
                "enabled": true,
                "innovation": 48512
            },
            {
                "fromNode": 18,
                "toNode": 29,
                "weight": 0.06944180037040926,
                "enabled": true,
                "innovation": 48513
            },
            {
                "fromNode": 18,
                "toNode": 30,
                "weight": 0.024449355726080868,
                "enabled": true,
                "innovation": 48514
            },
            {
                "fromNode": 18,
                "toNode": 31,
                "weight": 0.3796889149059537,
                "enabled": true,
                "innovation": 48515
            },
            {
                "fromNode": 18,
                "toNode": 32,
                "weight": -0.20775657390438584,
                "enabled": true,
                "innovation": 48516
            },
            {
                "fromNode": 19,
                "toNode": 29,
                "weight": 0.4483599910788266,
                "enabled": true,
                "innovation": 48517
            },
            {
                "fromNode": 19,
                "toNode": 30,
                "weight": 0.44776654251764314,
                "enabled": true,
                "innovation": 48518
            },
            {
                "fromNode": 19,
                "toNode": 31,
                "weight": 0.20353465726809516,
                "enabled": true,
                "innovation": 48519
            },
            {
                "fromNode": 19,
                "toNode": 32,
                "weight": 0.2564185408827653,
                "enabled": true,
                "innovation": 48520
            },
            {
                "fromNode": 20,
                "toNode": 29,
                "weight": 0.09669012592564796,
                "enabled": true,
                "innovation": 48521
            },
            {
                "fromNode": 20,
                "toNode": 30,
                "weight": -0.19719106517997143,
                "enabled": true,
                "innovation": 48522
            },
            {
                "fromNode": 20,
                "toNode": 31,
                "weight": -0.23294828115834676,
                "enabled": true,
                "innovation": 48523
            },
            {
                "fromNode": 20,
                "toNode": 32,
                "weight": -0.08265130801855136,
                "enabled": true,
                "innovation": 48524
            },
            {
                "fromNode": 21,
                "toNode": 29,
                "weight": 0.33147604534266517,
                "enabled": true,
                "innovation": 48525
            },
            {
                "fromNode": 21,
                "toNode": 30,
                "weight": 0.0958256830985692,
                "enabled": true,
                "innovation": 48526
            },
            {
                "fromNode": 21,
                "toNode": 31,
                "weight": -0.1461057986504255,
                "enabled": true,
                "innovation": 48527
            },
            {
                "fromNode": 21,
                "toNode": 32,
                "weight": -0.15008470668265006,
                "enabled": true,
                "innovation": 48528
            },
            {
                "fromNode": 22,
                "toNode": 29,
                "weight": -0.2676110188831262,
                "enabled": true,
                "innovation": 48529
            },
            {
                "fromNode": 22,
                "toNode": 30,
                "weight": -0.3816478232471182,
                "enabled": true,
                "innovation": 48530
            },
            {
                "fromNode": 22,
                "toNode": 31,
                "weight": 0.07901982838556876,
                "enabled": true,
                "innovation": 48531
            },
            {
                "fromNode": 22,
                "toNode": 32,
                "weight": -0.026770493904802684,
                "enabled": true,
                "innovation": 48532
            },
            {
                "fromNode": 23,
                "toNode": 29,
                "weight": 0.2562727810975156,
                "enabled": true,
                "innovation": 48533
            },
            {
                "fromNode": 23,
                "toNode": 30,
                "weight": 0.47861009894113193,
                "enabled": true,
                "innovation": 48534
            },
            {
                "fromNode": 23,
                "toNode": 31,
                "weight": -0.12835011545306785,
                "enabled": true,
                "innovation": 48535
            },
            {
                "fromNode": 23,
                "toNode": 32,
                "weight": 0.3900826943897683,
                "enabled": true,
                "innovation": 48536
            },
            {
                "fromNode": 24,
                "toNode": 29,
                "weight": -0.177359356558615,
                "enabled": true,
                "innovation": 48537
            },
            {
                "fromNode": 24,
                "toNode": 30,
                "weight": 0.49289140840034384,
                "enabled": true,
                "innovation": 48538
            },
            {
                "fromNode": 24,
                "toNode": 31,
                "weight": 0.2743679937228112,
                "enabled": true,
                "innovation": 48539
            },
            {
                "fromNode": 24,
                "toNode": 32,
                "weight": -0.4029937217274062,
                "enabled": true,
                "innovation": 48540
            },
            {
                "fromNode": 25,
                "toNode": 29,
                "weight": 0.2769516635541578,
                "enabled": true,
                "innovation": 48541
            },
            {
                "fromNode": 25,
                "toNode": 30,
                "weight": -0.49058497571779414,
                "enabled": true,
                "innovation": 48542
            },
            {
                "fromNode": 25,
                "toNode": 31,
                "weight": -0.192266010882866,
                "enabled": true,
                "innovation": 48543
            },
            {
                "fromNode": 25,
                "toNode": 32,
                "weight": -0.25177566938064544,
                "enabled": true,
                "innovation": 48544
            },
            {
                "fromNode": 26,
                "toNode": 29,
                "weight": 0.13409803298830214,
                "enabled": true,
                "innovation": 48545
            },
            {
                "fromNode": 26,
                "toNode": 30,
                "weight": -0.4930666784847766,
                "enabled": true,
                "innovation": 48546
            },
            {
                "fromNode": 26,
                "toNode": 31,
                "weight": 0.04058374026772438,
                "enabled": true,
                "innovation": 48547
            },
            {
                "fromNode": 26,
                "toNode": 32,
                "weight": -0.0583087656787763,
                "enabled": true,
                "innovation": 48548
            },
            {
                "fromNode": 27,
                "toNode": 29,
                "weight": 0.21177053436152227,
                "enabled": true,
                "innovation": 48549
            },
            {
                "fromNode": 27,
                "toNode": 30,
                "weight": -0.3536845905261229,
                "enabled": true,
                "innovation": 48550
            },
            {
                "fromNode": 27,
                "toNode": 31,
                "weight": -0.06418754274551075,
                "enabled": true,
                "innovation": 48551
            },
            {
                "fromNode": 27,
                "toNode": 32,
                "weight": 0.43709990516166397,
                "enabled": true,
                "innovation": 48552
            },
            {
                "fromNode": 28,
                "toNode": 29,
                "weight": -0.10241464364320163,
                "enabled": true,
                "innovation": 48553
            },
            {
                "fromNode": 28,
                "toNode": 30,
                "weight": -0.2929458211673528,
                "enabled": true,
                "innovation": 48554
            },
            {
                "fromNode": 28,
                "toNode": 31,
                "weight": 0.2646366713629166,
                "enabled": true,
                "innovation": 48555
            },
            {
                "fromNode": 28,
                "toNode": 32,
                "weight": 0.28104839986154806,
                "enabled": true,
                "innovation": 48556
            }
        ]
    },
  },
  {
    id: "builtin_tool_eggs",
    name: "Tool Eggs",
    generation: 17,
    fitness: 1175.4880352421192,
    trainedGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    createdAt: "2026-07-29T11:00:52.888Z",
    blueprint: {
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
    genome: {
        "nodes": [
            {
                "id": 0,
                "type": "input",
                "label": "Input 0"
            },
            {
                "id": 1,
                "type": "input",
                "label": "Input 1"
            },
            {
                "id": 2,
                "type": "input",
                "label": "Input 2"
            },
            {
                "id": 3,
                "type": "input",
                "label": "Input 3"
            },
            {
                "id": 4,
                "type": "input",
                "label": "Input 4"
            },
            {
                "id": 5,
                "type": "input",
                "label": "Input 5"
            },
            {
                "id": 6,
                "type": "input",
                "label": "Input 6"
            },
            {
                "id": 7,
                "type": "input",
                "label": "Input 7"
            },
            {
                "id": 8,
                "type": "input",
                "label": "Input 8"
            },
            {
                "id": 9,
                "type": "input",
                "label": "Input 9"
            },
            {
                "id": 10,
                "type": "input",
                "label": "Input 10"
            },
            {
                "id": 11,
                "type": "input",
                "label": "Input 11"
            },
            {
                "id": 12,
                "type": "input",
                "label": "Input 12"
            },
            {
                "id": 13,
                "type": "input",
                "label": "Input 13"
            },
            {
                "id": 14,
                "type": "input",
                "label": "Input 14"
            },
            {
                "id": 15,
                "type": "input",
                "label": "Input 15"
            },
            {
                "id": 16,
                "type": "input",
                "label": "Input 16"
            },
            {
                "id": 17,
                "type": "input",
                "label": "Input 17"
            },
            {
                "id": 18,
                "type": "input",
                "label": "Input 18"
            },
            {
                "id": 19,
                "type": "input",
                "label": "Input 19"
            },
            {
                "id": 20,
                "type": "input",
                "label": "Input 20"
            },
            {
                "id": 21,
                "type": "input",
                "label": "Input 21"
            },
            {
                "id": 22,
                "type": "input",
                "label": "Input 22"
            },
            {
                "id": 23,
                "type": "input",
                "label": "Input 23"
            },
            {
                "id": 24,
                "type": "input",
                "label": "Input 24"
            },
            {
                "id": 25,
                "type": "input",
                "label": "Input 25"
            },
            {
                "id": 26,
                "type": "input",
                "label": "Input 26"
            },
            {
                "id": 27,
                "type": "input",
                "label": "Input 27"
            },
            {
                "id": 28,
                "type": "input",
                "label": "Input 28"
            },
            {
                "id": 29,
                "type": "input",
                "label": "Input 29"
            },
            {
                "id": 30,
                "type": "input",
                "label": "Input 30"
            },
            {
                "id": 31,
                "type": "input",
                "label": "Input 31"
            },
            {
                "id": 32,
                "type": "output",
                "label": "Output 0"
            },
            {
                "id": 33,
                "type": "output",
                "label": "Output 1"
            },
            {
                "id": 34,
                "type": "output",
                "label": "Output 2"
            }
        ],
        "connections": [
            {
                "fromNode": 0,
                "toNode": 32,
                "weight": -0.4756205366925975,
                "enabled": true,
                "innovation": 51141
            },
            {
                "fromNode": 0,
                "toNode": 33,
                "weight": 0.49884719963155777,
                "enabled": true,
                "innovation": 51142
            },
            {
                "fromNode": 0,
                "toNode": 34,
                "weight": -0.2646265488072509,
                "enabled": true,
                "innovation": 51143
            },
            {
                "fromNode": 1,
                "toNode": 32,
                "weight": 0.12494840467238844,
                "enabled": true,
                "innovation": 51144
            },
            {
                "fromNode": 1,
                "toNode": 33,
                "weight": -0.4762025291000769,
                "enabled": true,
                "innovation": 51145
            },
            {
                "fromNode": 1,
                "toNode": 34,
                "weight": -0.28912712503134763,
                "enabled": true,
                "innovation": 51146
            },
            {
                "fromNode": 2,
                "toNode": 32,
                "weight": -0.1551943360081277,
                "enabled": true,
                "innovation": 51147
            },
            {
                "fromNode": 2,
                "toNode": 33,
                "weight": -0.2541467951376819,
                "enabled": true,
                "innovation": 51148
            },
            {
                "fromNode": 2,
                "toNode": 34,
                "weight": 0.35790575462635643,
                "enabled": true,
                "innovation": 51149
            },
            {
                "fromNode": 3,
                "toNode": 32,
                "weight": 0.452870126953288,
                "enabled": true,
                "innovation": 51150
            },
            {
                "fromNode": 3,
                "toNode": 33,
                "weight": -0.32676641484403957,
                "enabled": true,
                "innovation": 51151
            },
            {
                "fromNode": 3,
                "toNode": 34,
                "weight": -0.25453139530157776,
                "enabled": true,
                "innovation": 51152
            },
            {
                "fromNode": 4,
                "toNode": 32,
                "weight": 0.4336850490816314,
                "enabled": true,
                "innovation": 51153
            },
            {
                "fromNode": 4,
                "toNode": 33,
                "weight": 0.27879460068629425,
                "enabled": true,
                "innovation": 51154
            },
            {
                "fromNode": 4,
                "toNode": 34,
                "weight": 0.2130438691186236,
                "enabled": true,
                "innovation": 51155
            },
            {
                "fromNode": 5,
                "toNode": 32,
                "weight": 0.30192719084649267,
                "enabled": true,
                "innovation": 51156
            },
            {
                "fromNode": 5,
                "toNode": 33,
                "weight": 0.07025004621410025,
                "enabled": true,
                "innovation": 51157
            },
            {
                "fromNode": 5,
                "toNode": 34,
                "weight": 0.37273887131784766,
                "enabled": true,
                "innovation": 51158
            },
            {
                "fromNode": 6,
                "toNode": 32,
                "weight": -0.06634160104361586,
                "enabled": true,
                "innovation": 51159
            },
            {
                "fromNode": 6,
                "toNode": 33,
                "weight": -0.22473752048245577,
                "enabled": true,
                "innovation": 51160
            },
            {
                "fromNode": 6,
                "toNode": 34,
                "weight": -0.3437569035577386,
                "enabled": true,
                "innovation": 51161
            },
            {
                "fromNode": 7,
                "toNode": 32,
                "weight": -0.34430011855592235,
                "enabled": true,
                "innovation": 51162
            },
            {
                "fromNode": 7,
                "toNode": 33,
                "weight": -0.20844485930971168,
                "enabled": true,
                "innovation": 51163
            },
            {
                "fromNode": 7,
                "toNode": 34,
                "weight": -0.10043900632841196,
                "enabled": true,
                "innovation": 51164
            },
            {
                "fromNode": 8,
                "toNode": 32,
                "weight": 0.26180296752767496,
                "enabled": true,
                "innovation": 51165
            },
            {
                "fromNode": 8,
                "toNode": 33,
                "weight": 0.28316704946883375,
                "enabled": true,
                "innovation": 51166
            },
            {
                "fromNode": 8,
                "toNode": 34,
                "weight": 0.4871156576763327,
                "enabled": true,
                "innovation": 51167
            },
            {
                "fromNode": 9,
                "toNode": 32,
                "weight": 0.3275316161678552,
                "enabled": true,
                "innovation": 51168
            },
            {
                "fromNode": 9,
                "toNode": 33,
                "weight": 0.38148153617892233,
                "enabled": true,
                "innovation": 51169
            },
            {
                "fromNode": 9,
                "toNode": 34,
                "weight": -0.49530859450754205,
                "enabled": true,
                "innovation": 51170
            },
            {
                "fromNode": 10,
                "toNode": 32,
                "weight": -0.4355787086265759,
                "enabled": true,
                "innovation": 51171
            },
            {
                "fromNode": 10,
                "toNode": 33,
                "weight": 0.1980865815609626,
                "enabled": true,
                "innovation": 51172
            },
            {
                "fromNode": 10,
                "toNode": 34,
                "weight": 0.15779269218539205,
                "enabled": true,
                "innovation": 51173
            },
            {
                "fromNode": 11,
                "toNode": 32,
                "weight": 0.2754157434762078,
                "enabled": true,
                "innovation": 51174
            },
            {
                "fromNode": 11,
                "toNode": 33,
                "weight": -0.34042071251901707,
                "enabled": true,
                "innovation": 51175
            },
            {
                "fromNode": 11,
                "toNode": 34,
                "weight": -0.0044488453130003824,
                "enabled": true,
                "innovation": 51176
            },
            {
                "fromNode": 12,
                "toNode": 32,
                "weight": -0.08034405209787132,
                "enabled": true,
                "innovation": 51177
            },
            {
                "fromNode": 12,
                "toNode": 33,
                "weight": 0.327663249149185,
                "enabled": true,
                "innovation": 51178
            },
            {
                "fromNode": 12,
                "toNode": 34,
                "weight": 0.16521070814311345,
                "enabled": true,
                "innovation": 51179
            },
            {
                "fromNode": 13,
                "toNode": 32,
                "weight": -0.10715955963883639,
                "enabled": true,
                "innovation": 51180
            },
            {
                "fromNode": 13,
                "toNode": 33,
                "weight": 0.11125579927267792,
                "enabled": true,
                "innovation": 51181
            },
            {
                "fromNode": 13,
                "toNode": 34,
                "weight": 0.2575246708984239,
                "enabled": true,
                "innovation": 51182
            },
            {
                "fromNode": 14,
                "toNode": 32,
                "weight": -0.15574820623762453,
                "enabled": true,
                "innovation": 51183
            },
            {
                "fromNode": 14,
                "toNode": 33,
                "weight": -0.42770555277458466,
                "enabled": true,
                "innovation": 51184
            },
            {
                "fromNode": 14,
                "toNode": 34,
                "weight": -0.41993398406492066,
                "enabled": true,
                "innovation": 51185
            },
            {
                "fromNode": 15,
                "toNode": 32,
                "weight": 0.13963386597059946,
                "enabled": true,
                "innovation": 51186
            },
            {
                "fromNode": 15,
                "toNode": 33,
                "weight": 0.23139391288869438,
                "enabled": true,
                "innovation": 51187
            },
            {
                "fromNode": 15,
                "toNode": 34,
                "weight": 0.2952354751287032,
                "enabled": true,
                "innovation": 51188
            },
            {
                "fromNode": 16,
                "toNode": 32,
                "weight": -0.4174112059700311,
                "enabled": true,
                "innovation": 51189
            },
            {
                "fromNode": 16,
                "toNode": 33,
                "weight": 0.07889185075427052,
                "enabled": true,
                "innovation": 51190
            },
            {
                "fromNode": 16,
                "toNode": 34,
                "weight": 0.13228936542448333,
                "enabled": true,
                "innovation": 51191
            },
            {
                "fromNode": 17,
                "toNode": 32,
                "weight": -0.131955908148225,
                "enabled": true,
                "innovation": 51192
            },
            {
                "fromNode": 17,
                "toNode": 33,
                "weight": -0.14311973149953938,
                "enabled": true,
                "innovation": 51193
            },
            {
                "fromNode": 17,
                "toNode": 34,
                "weight": 0.10225835122176874,
                "enabled": true,
                "innovation": 51194
            },
            {
                "fromNode": 18,
                "toNode": 32,
                "weight": -0.056897449914390275,
                "enabled": true,
                "innovation": 51195
            },
            {
                "fromNode": 18,
                "toNode": 33,
                "weight": 0.11768942160822482,
                "enabled": true,
                "innovation": 51196
            },
            {
                "fromNode": 18,
                "toNode": 34,
                "weight": 0.3339225917424379,
                "enabled": true,
                "innovation": 51197
            },
            {
                "fromNode": 19,
                "toNode": 32,
                "weight": 0.16334566020887786,
                "enabled": true,
                "innovation": 51198
            },
            {
                "fromNode": 19,
                "toNode": 33,
                "weight": -0.44586721881676405,
                "enabled": true,
                "innovation": 51199
            },
            {
                "fromNode": 19,
                "toNode": 34,
                "weight": 0.16524265126951798,
                "enabled": true,
                "innovation": 51200
            },
            {
                "fromNode": 20,
                "toNode": 32,
                "weight": -0.2078085469935449,
                "enabled": true,
                "innovation": 51201
            },
            {
                "fromNode": 20,
                "toNode": 33,
                "weight": 0.3907506139616871,
                "enabled": true,
                "innovation": 51202
            },
            {
                "fromNode": 20,
                "toNode": 34,
                "weight": 0.4126124071541105,
                "enabled": true,
                "innovation": 51203
            },
            {
                "fromNode": 21,
                "toNode": 32,
                "weight": -0.2831091199857977,
                "enabled": true,
                "innovation": 51204
            },
            {
                "fromNode": 21,
                "toNode": 33,
                "weight": -0.49928781379311615,
                "enabled": true,
                "innovation": 51205
            },
            {
                "fromNode": 21,
                "toNode": 34,
                "weight": -0.3953572430294723,
                "enabled": true,
                "innovation": 51206
            },
            {
                "fromNode": 22,
                "toNode": 32,
                "weight": -0.149306239645563,
                "enabled": true,
                "innovation": 51207
            },
            {
                "fromNode": 22,
                "toNode": 33,
                "weight": -0.19745673935096475,
                "enabled": true,
                "innovation": 51208
            },
            {
                "fromNode": 22,
                "toNode": 34,
                "weight": -0.06354221675663863,
                "enabled": true,
                "innovation": 51209
            },
            {
                "fromNode": 23,
                "toNode": 32,
                "weight": -0.43907593866485106,
                "enabled": true,
                "innovation": 51210
            },
            {
                "fromNode": 23,
                "toNode": 33,
                "weight": -0.12921320764243727,
                "enabled": true,
                "innovation": 51211
            },
            {
                "fromNode": 23,
                "toNode": 34,
                "weight": -0.0005111200351753942,
                "enabled": true,
                "innovation": 51212
            },
            {
                "fromNode": 24,
                "toNode": 32,
                "weight": -0.42397518035635606,
                "enabled": true,
                "innovation": 51213
            },
            {
                "fromNode": 24,
                "toNode": 33,
                "weight": -0.3352223821279976,
                "enabled": true,
                "innovation": 51214
            },
            {
                "fromNode": 24,
                "toNode": 34,
                "weight": 0.007072040770720767,
                "enabled": true,
                "innovation": 51215
            },
            {
                "fromNode": 25,
                "toNode": 32,
                "weight": -0.0026723762897890024,
                "enabled": true,
                "innovation": 51216
            },
            {
                "fromNode": 25,
                "toNode": 33,
                "weight": -0.05390005731614156,
                "enabled": true,
                "innovation": 51217
            },
            {
                "fromNode": 25,
                "toNode": 34,
                "weight": -0.03313523490809378,
                "enabled": true,
                "innovation": 51218
            },
            {
                "fromNode": 26,
                "toNode": 32,
                "weight": 0.039189704618286636,
                "enabled": true,
                "innovation": 51219
            },
            {
                "fromNode": 26,
                "toNode": 33,
                "weight": 0.06800245037691954,
                "enabled": true,
                "innovation": 51220
            },
            {
                "fromNode": 26,
                "toNode": 34,
                "weight": 0.2245309684385739,
                "enabled": true,
                "innovation": 51221
            },
            {
                "fromNode": 27,
                "toNode": 32,
                "weight": -0.24661370206281408,
                "enabled": true,
                "innovation": 51222
            },
            {
                "fromNode": 27,
                "toNode": 33,
                "weight": 0.24396261346124537,
                "enabled": true,
                "innovation": 51223
            },
            {
                "fromNode": 27,
                "toNode": 34,
                "weight": 0.19158751331342916,
                "enabled": true,
                "innovation": 51224
            },
            {
                "fromNode": 28,
                "toNode": 32,
                "weight": 0.21798993130310573,
                "enabled": true,
                "innovation": 51225
            },
            {
                "fromNode": 28,
                "toNode": 33,
                "weight": 0.10453169710414834,
                "enabled": true,
                "innovation": 51226
            },
            {
                "fromNode": 28,
                "toNode": 34,
                "weight": 0.4592441917744178,
                "enabled": true,
                "innovation": 51227
            },
            {
                "fromNode": 29,
                "toNode": 32,
                "weight": 0.28749445235217164,
                "enabled": true,
                "innovation": 51228
            },
            {
                "fromNode": 29,
                "toNode": 33,
                "weight": -0.16859721038157327,
                "enabled": true,
                "innovation": 51229
            },
            {
                "fromNode": 29,
                "toNode": 34,
                "weight": -0.2165755845034708,
                "enabled": true,
                "innovation": 51230
            },
            {
                "fromNode": 30,
                "toNode": 32,
                "weight": 0.48957518282850765,
                "enabled": true,
                "innovation": 51231
            },
            {
                "fromNode": 30,
                "toNode": 33,
                "weight": -0.10074811823631957,
                "enabled": true,
                "innovation": 51232
            },
            {
                "fromNode": 30,
                "toNode": 34,
                "weight": 0.1031640043127261,
                "enabled": true,
                "innovation": 51233
            },
            {
                "fromNode": 31,
                "toNode": 32,
                "weight": 0.22555858471042756,
                "enabled": true,
                "innovation": 51234
            },
            {
                "fromNode": 31,
                "toNode": 33,
                "weight": 0.26370811715343767,
                "enabled": true,
                "innovation": 51235
            },
            {
                "fromNode": 31,
                "toNode": 34,
                "weight": 0.02506932305523346,
                "enabled": true,
                "innovation": 51236
            }
        ]
    },
  },
  {
    id: "builtin_motor_cart",
    name: "Motor Cart",
    generation: 1,
    fitness: 0,
    trainedGoal: EvolutionGoal.MOTOR_DRIVE,
    createdAt: "2026-07-29T11:08:10.852Z",
    blueprint: {
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
    },
    genome: {
        "nodes": [
            {
                "id": 0,
                "type": "input",
                "label": "Input 0"
            },
            {
                "id": 1,
                "type": "input",
                "label": "Input 1"
            },
            {
                "id": 2,
                "type": "input",
                "label": "Input 2"
            },
            {
                "id": 3,
                "type": "input",
                "label": "Input 3"
            },
            {
                "id": 4,
                "type": "input",
                "label": "Input 4"
            },
            {
                "id": 5,
                "type": "input",
                "label": "Input 5"
            },
            {
                "id": 6,
                "type": "input",
                "label": "Input 6"
            },
            {
                "id": 7,
                "type": "input",
                "label": "Input 7"
            },
            {
                "id": 8,
                "type": "input",
                "label": "Input 8"
            },
            {
                "id": 9,
                "type": "input",
                "label": "Input 9"
            },
            {
                "id": 10,
                "type": "input",
                "label": "Input 10"
            },
            {
                "id": 11,
                "type": "input",
                "label": "Input 11"
            },
            {
                "id": 12,
                "type": "input",
                "label": "Input 12"
            },
            {
                "id": 13,
                "type": "input",
                "label": "Input 13"
            },
            {
                "id": 14,
                "type": "output",
                "label": "Output 0"
            },
            {
                "id": 15,
                "type": "output",
                "label": "Output 1"
            }
        ],
        "connections": [
            {
                "fromNode": 0,
                "toNode": 14,
                "weight": -0.3911320939635363,
                "enabled": true,
                "innovation": 881
            },
            {
                "fromNode": 0,
                "toNode": 15,
                "weight": -0.41073424224530597,
                "enabled": true,
                "innovation": 882
            },
            {
                "fromNode": 1,
                "toNode": 14,
                "weight": -0.33206537572797845,
                "enabled": true,
                "innovation": 883
            },
            {
                "fromNode": 1,
                "toNode": 15,
                "weight": 0.09763242699259511,
                "enabled": true,
                "innovation": 884
            },
            {
                "fromNode": 2,
                "toNode": 14,
                "weight": 0.16576060497428946,
                "enabled": true,
                "innovation": 885
            },
            {
                "fromNode": 2,
                "toNode": 15,
                "weight": -0.34014870661644336,
                "enabled": true,
                "innovation": 886
            },
            {
                "fromNode": 3,
                "toNode": 14,
                "weight": -0.30012876787480625,
                "enabled": true,
                "innovation": 887
            },
            {
                "fromNode": 3,
                "toNode": 15,
                "weight": -0.1878446759813156,
                "enabled": true,
                "innovation": 888
            },
            {
                "fromNode": 4,
                "toNode": 14,
                "weight": 0.32215269199461816,
                "enabled": true,
                "innovation": 889
            },
            {
                "fromNode": 4,
                "toNode": 15,
                "weight": -0.013584125728407836,
                "enabled": true,
                "innovation": 890
            },
            {
                "fromNode": 5,
                "toNode": 14,
                "weight": -0.1864393259542405,
                "enabled": true,
                "innovation": 891
            },
            {
                "fromNode": 5,
                "toNode": 15,
                "weight": -0.26416492016240545,
                "enabled": true,
                "innovation": 892
            },
            {
                "fromNode": 6,
                "toNode": 14,
                "weight": 0.3776497190762407,
                "enabled": true,
                "innovation": 893
            },
            {
                "fromNode": 6,
                "toNode": 15,
                "weight": 0.11672418815904406,
                "enabled": true,
                "innovation": 894
            },
            {
                "fromNode": 7,
                "toNode": 14,
                "weight": 0.06477590565895874,
                "enabled": true,
                "innovation": 895
            },
            {
                "fromNode": 7,
                "toNode": 15,
                "weight": 0.3555893712480571,
                "enabled": true,
                "innovation": 896
            },
            {
                "fromNode": 8,
                "toNode": 14,
                "weight": 0.3618564482808425,
                "enabled": true,
                "innovation": 897
            },
            {
                "fromNode": 8,
                "toNode": 15,
                "weight": 0.40924430341514795,
                "enabled": true,
                "innovation": 898
            },
            {
                "fromNode": 9,
                "toNode": 14,
                "weight": 0.4130610963798421,
                "enabled": true,
                "innovation": 899
            },
            {
                "fromNode": 9,
                "toNode": 15,
                "weight": -0.4575960032702562,
                "enabled": true,
                "innovation": 900
            },
            {
                "fromNode": 10,
                "toNode": 14,
                "weight": 0.02524688415890286,
                "enabled": true,
                "innovation": 901
            },
            {
                "fromNode": 10,
                "toNode": 15,
                "weight": 0.48928990713050236,
                "enabled": true,
                "innovation": 902
            },
            {
                "fromNode": 11,
                "toNode": 14,
                "weight": -0.18783027506862282,
                "enabled": true,
                "innovation": 903
            },
            {
                "fromNode": 11,
                "toNode": 15,
                "weight": 0.0936525439774949,
                "enabled": true,
                "innovation": 904
            },
            {
                "fromNode": 12,
                "toNode": 14,
                "weight": 0.2665828029190579,
                "enabled": true,
                "innovation": 905
            },
            {
                "fromNode": 12,
                "toNode": 15,
                "weight": 0.15231296745423872,
                "enabled": true,
                "innovation": 906
            },
            {
                "fromNode": 13,
                "toNode": 14,
                "weight": -0.18494067141769277,
                "enabled": true,
                "innovation": 907
            },
            {
                "fromNode": 13,
                "toNode": 15,
                "weight": 0.38546796407163053,
                "enabled": true,
                "innovation": 908
            }
        ]
    },
  }
];

export const DEFAULT_FINISHED_MODEL_IDS = new Set(
  DEFAULT_MODEL_SEEDS.map(s => s.id)
);
