/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Championship event catalog — curated arenas for showmanship, not evolution.
 */

import {
  ArenaModifiers,
  DEFAULT_ARENA_MODIFIERS,
  EvolutionGoal,
} from '../../src/types';

export type HeatFormat = 'simultaneous' | 'time_trial';

export interface ChampionshipEvent {
  id: string;
  title: string;
  tagline: string;
  blurb: string;
  goal: EvolutionGoal;
  matchSeconds: number;
  format: HeatFormat;
  /** Spotlight colour for banners */
  accent: string;
  arena: Partial<ArenaModifiers>;
  minEntrants: number;
  maxEntrants: number;
}

export const CHAMPIONSHIP_EVENTS: ChampionshipEvent[] = [
  {
    id: 'grand_prix',
    title: 'Grand Prix',
    tagline: 'Flat-out sprint',
    blurb: 'First across the finish line energy — raw speed on open tarmac.',
    goal: EvolutionGoal.SPRINT_FINISH,
    matchSeconds: 35,
    format: 'simultaneous',
    accent: '#e8b84a',
    arena: { difficulty: 1.1, progressiveTier: 0 },
    minEntrants: 2,
    maxEntrants: 8,
  },
  {
    id: 'gap_gauntlet',
    title: 'Gap Gauntlet',
    tagline: 'Clear the void',
    blurb: 'Launch, clear the pit, stick the far side. Miss and the crowd groans.',
    goal: EvolutionGoal.MOTOR_GAP,
    matchSeconds: 40,
    format: 'simultaneous',
    accent: '#f97316',
    arena: {
      difficulty: 1.2,
      pitEnabled: true,
      gapWidthPx: 720,
      progressiveTier: 0,
    },
    minEntrants: 2,
    maxEntrants: 8,
  },
  {
    id: 'summit_ascent',
    title: 'Summit Ascent',
    tagline: 'Climb forever',
    blurb: 'Endless stairs. Highest tread wins the mountain.',
    goal: EvolutionGoal.STAIR_CLIMB,
    matchSeconds: 45,
    format: 'simultaneous',
    accent: '#38bdf8',
    arena: { difficulty: 1.15, progressiveTier: 0 },
    minEntrants: 2,
    maxEntrants: 6,
  },
  {
    id: 'sky_cup',
    title: 'Sky Cup',
    tagline: 'Stay aloft',
    blurb: 'Wings and canopies only need apply — hang time is the crown.',
    goal: EvolutionGoal.FLIGHT_TIME,
    matchSeconds: 50,
    format: 'simultaneous',
    accent: '#5eead4',
    arena: { windEnabled: true, windStrength: 0.1, difficulty: 1 },
    minEntrants: 2,
    maxEntrants: 6,
  },
  {
    id: 'glide_royale',
    title: 'Glide Royale',
    tagline: 'Distance while airborne',
    blurb: 'Cross the sky corridor. Ground scooting barely scores.',
    goal: EvolutionGoal.GLIDE_RANGE,
    matchSeconds: 55,
    format: 'simultaneous',
    accent: '#a78bfa',
    arena: { windEnabled: true, windStrength: 0.08, difficulty: 1 },
    minEntrants: 2,
    maxEntrants: 6,
  },
  {
    id: 'para_grand_prix',
    title: 'Para Grand Prix',
    tagline: 'Run-up · deploy · glide',
    blurb: 'The full curriculum course — ramp, pit, and open sail.',
    goal: EvolutionGoal.PARA_RAMP_GLIDE,
    matchSeconds: 70,
    format: 'simultaneous',
    accent: '#f472b6',
    arena: { difficulty: 1.1, progressiveTier: 0 },
    minEntrants: 2,
    maxEntrants: 6,
  },
  {
    id: 'ice_derby',
    title: 'Ice Derby',
    tagline: 'Torque on glass',
    blurb: 'Low grip patches. Motor drive and soft footwork both have a shot.',
    goal: EvolutionGoal.MOTOR_ICE,
    matchSeconds: 40,
    format: 'simultaneous',
    accent: '#7dd3fc',
    arena: { iceEnabled: true, difficulty: 1.2 },
    minEntrants: 2,
    maxEntrants: 8,
  },
  {
    id: 'freestyle_open',
    title: 'Freestyle Open',
    tagline: 'You pick the goal',
    blurb: 'Any sandbox goal and arena modifiers — exhibition heat.',
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    matchSeconds: 40,
    format: 'simultaneous',
    accent: '#e8b84a',
    arena: {},
    minEntrants: 2,
    maxEntrants: 8,
  },
];

export function eventById(id: string): ChampionshipEvent | undefined {
  return CHAMPIONSHIP_EVENTS.find(e => e.id === id);
}

export function buildEventArena(event: ChampionshipEvent): ArenaModifiers {
  return {
    ...DEFAULT_ARENA_MODIFIERS,
    ...event.arena,
  };
}
