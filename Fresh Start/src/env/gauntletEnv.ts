/**
 * Builtin Gauntlet course — multi-skill obstacle run with ordered checkpoints.
 * Geometry authored for run → climb → launch → pit cross → finish.
 */
import type { EnvironmentDesign, EnvCourseMarker } from './types';

export const BUILTIN_GAUNTLET_ENV_ID = 'builtin_gauntlet';

/** Full-course markers (start arms race timer; checkpoints gate finish). */
export function gauntletMarkers(): EnvCourseMarker[] {
  return [
    {
      id: 'gauntlet_start',
      kind: 'start',
      x: 2,
      y: 1.5,
      w: 0.6,
      h: 3,
    },
    {
      id: 'gauntlet_cp_ramp',
      kind: 'checkpoint',
      order: 0,
      x: 24,
      y: 4,
      w: 0.6,
      h: 4,
    },
    {
      id: 'gauntlet_cp_stairs',
      kind: 'checkpoint',
      order: 1,
      x: 40,
      y: 3,
      w: 0.6,
      h: 4,
    },
    {
      id: 'gauntlet_cp_tower',
      kind: 'checkpoint',
      order: 2,
      x: 51,
      y: 8,
      w: 0.8,
      h: 3.5,
    },
    {
      id: 'gauntlet_cp_landing',
      kind: 'checkpoint',
      order: 3,
      x: 85,
      y: 2,
      w: 0.6,
      h: 4,
    },
    {
      id: 'gauntlet_finish',
      kind: 'finish',
      x: 130,
      y: 1.5,
      w: 0.6,
      h: 3,
    },
  ];
}

/** Full Gauntlet environment (practice + curriculum base). */
export function gauntletEnv(): EnvironmentDesign {
  return {
    name: 'Gauntlet',
    theme: 'mint',
    obstacles: [
      {
        id: '0f6d7697-2dc7-4327-8d83-1c5b4bcb355d',
        kind: 'ramp',
        x: 12.865262474311479,
        y: 2.2188917090582643,
        w: 21.752307863136586,
        h: 0.20369518523815167,
        rot: 0.22065837354731932,
      },
      {
        id: '02b882ef-3155-42af-be75-8de4f255b5fd',
        kind: 'box',
        x: 24.25,
        y: 2.25,
        w: 2.5,
        h: 4.5,
      },
      {
        id: 'b69a200c-8442-423c-9b77-905046266a6e',
        kind: 'stair',
        x: 25.5,
        y: 3.5,
        w: 15,
        h: 4,
      },
      {
        id: 'c9f06078-92c2-4138-ae02-8b23acd97867',
        kind: 'box',
        x: 38.75,
        y: 1.75,
        w: 3.5,
        h: 3.5,
      },
      {
        id: '10f66e22-2f57-43a7-99e4-0ac65d5514c8',
        kind: 'ramp',
        x: 44.5,
        y: 3.5,
        w: 10.923355354180778,
        h: 0.12,
        rot: -0.48,
      },
      {
        id: 'a9890b85-a875-4387-b3f4-367e5fec6ac9',
        kind: 'pit',
        x: 74.50000000095774,
        y: 0,
        w: 14,
        h: 4,
      },
      {
        id: '63c3f6d1-0086-45f6-bbb4-02d60fb99f20',
        kind: 'ramp',
        x: 99.5,
        y: 2,
        w: 8.997273475950475,
        h: 0.5468729276148736,
        rot: -0.4,
      },
    ],
    regions: [
      {
        id: '7a0bb29f-77ae-4fd0-95e5-1989492fce03',
        kind: 'penalty',
        x: 44.5,
        y: 3.5,
        w: 8,
        h: 7,
        rate: 1,
      },
      {
        id: '2cf46365-44c7-4dcb-8ce9-8c23786d1278',
        kind: 'penalty',
        x: 74.5,
        y: 2,
        w: 14,
        h: 4,
        rate: 1,
      },
    ],
    markers: gauntletMarkers(),
    tower: {
      x: 51,
      baseW: 12,
      height: 7.5,
    },
    spawn: {
      x: -15,
      y: 0,
    },
  };
}
