/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChallengeDefinition, EvolutionGoal } from './types';

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: 'sprint_800',
    title: 'Clear 800 pts',
    description: 'Score 800+ points on Run Right within 40 generations.',
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    targetValue: 800,
    maxGenerations: 40,
    badgeLabel: 'Sprinter',
  },
  {
    id: 'jump_140',
    title: 'Jump 140 pts',
    description: 'Score 140+ points on Jump Height within 30 generations.',
    goal: EvolutionGoal.HIGH_JUMP,
    targetValue: 140,
    maxGenerations: 30,
    badgeLabel: 'Hopper',
  },
  {
    id: 'jump_right_180',
    title: 'Jump right 180',
    description: 'Score 180+ points on Jump Right within 35 generations.',
    goal: EvolutionGoal.LONG_JUMP,
    targetValue: 180,
    maxGenerations: 35,
    badgeLabel: 'Leaper',
  },
  {
    id: 'hang_time_120',
    title: 'Hang time',
    description: 'Score 120+ points on Hang Time within 35 generations.',
    goal: EvolutionGoal.JUMP_HANG_TIME,
    targetValue: 120,
    maxGenerations: 35,
    badgeLabel: 'Floater',
  },
  {
    id: 'upright_15s',
    title: 'Survive upright',
    description: 'Score 900+ points on Stay Tall within 25 generations.',
    goal: EvolutionGoal.STAY_UPRIGHT,
    targetValue: 900,
    maxGenerations: 25,
    badgeLabel: 'Tower',
  },
  {
    id: 'ball_courier',
    title: 'Ball courier',
    description: 'Score 120+ points on Carry Ball within 40 generations.',
    goal: EvolutionGoal.CARRY_BALL,
    targetValue: 120,
    maxGenerations: 40,
    badgeLabel: 'Courier',
  },
  {
    id: 'box_mover',
    title: 'Box mover',
    description: 'Score 200+ points on Push Box within 40 generations.',
    goal: EvolutionGoal.PUSH_BOX,
    targetValue: 200,
    maxGenerations: 40,
    badgeLabel: 'Hauler',
  },
  {
    id: 'stair_280',
    title: 'Stair climber',
    description: 'Score 280+ points on Stair Climb within 40 generations.',
    goal: EvolutionGoal.STAIR_CLIMB,
    targetValue: 280,
    maxGenerations: 40,
    badgeLabel: 'Climber',
  },
  {
    id: 'clear_bar_160',
    title: 'Clear the bar',
    description: 'Score 160+ points on Clear the Bar within 35 generations.',
    goal: EvolutionGoal.CLEAR_BAR,
    targetValue: 160,
    maxGenerations: 35,
    badgeLabel: 'Vaulter',
  },
  {
    id: 'speed_demon',
    title: 'Speed demon',
    description: 'Score 160+ points on Max Speed within 30 generations.',
    goal: EvolutionGoal.SPEED,
    targetValue: 160,
    maxGenerations: 30,
    badgeLabel: 'Blazer',
  },
  {
    id: 'stick_landing',
    title: 'Stick the landing',
    description:
      'Score 100+ points on Jump & Land (best single return-to-takeoff hop) within 35 generations.',
    goal: EvolutionGoal.JUMP_LAND_UPRIGHT,
    targetValue: 100,
    maxGenerations: 35,
    badgeLabel: 'Stickler',
  },
  {
    id: 'motor_drive_600',
    title: 'Motor cruise',
    description: 'Score 600+ points on Motor Drive within 30 generations.',
    goal: EvolutionGoal.MOTOR_DRIVE,
    targetValue: 600,
    maxGenerations: 30,
    badgeLabel: 'Driver',
  },
  {
    id: 'motor_ramp_220',
    title: 'Ramp climber',
    description: 'Score 220+ points on Motor Ramp within 35 generations.',
    goal: EvolutionGoal.MOTOR_RAMP,
    targetValue: 220,
    maxGenerations: 35,
    badgeLabel: 'Hillclimb',
  },
  {
    id: 'motor_ice_500',
    title: 'Ice runner',
    description: 'Score 500+ points on Motor Ice within 35 generations.',
    goal: EvolutionGoal.MOTOR_ICE,
    targetValue: 500,
    maxGenerations: 35,
    badgeLabel: 'Glider',
  },
  {
    id: 'motor_gap_350',
    title: 'Gap jumper',
    description: 'Score 350+ points clearing the motor gap within 40 generations.',
    goal: EvolutionGoal.MOTOR_GAP,
    targetValue: 350,
    maxGenerations: 40,
    badgeLabel: 'Gapper',
  },
  {
    id: 'motor_hoop_900',
    title: 'Hoop roller',
    description: 'Score 900+ points on Motor Hoop within 45 generations.',
    goal: EvolutionGoal.MOTOR_LOOP,
    targetValue: 900,
    maxGenerations: 45,
    badgeLabel: 'Hooper',
  },
  {
    id: 'motor_landspeed_6',
    title: 'Landspeed record',
    description: 'Score 330+ points on Landspeed within 35 generations.',
    goal: EvolutionGoal.MOTOR_LANDSPEED,
    targetValue: 330,
    maxGenerations: 35,
    badgeLabel: 'LandSpeed',
  },
  {
    id: 'bowling_280',
    title: 'Strike practice',
    description: 'Score 280+ points on Bowling within 40 generations.',
    goal: EvolutionGoal.BOWLING_PINS,
    targetValue: 280,
    maxGenerations: 40,
    badgeLabel: 'Bowler',
  },
  {
    id: 'goal_scorer_320',
    title: 'Goal scorer',
    description: 'Score 320+ points getting the ball in the net within 45 generations.',
    goal: EvolutionGoal.KICK_GOAL,
    targetValue: 320,
    maxGenerations: 45,
    badgeLabel: 'Striker',
  },
  {
    id: 'park_master_120',
    title: 'Parking pro',
    description: 'Score 120+ points on Parking Zone within 35 generations.',
    goal: EvolutionGoal.PARKING_ZONE,
    targetValue: 120,
    maxGenerations: 35,
    badgeLabel: 'Parker',
  },
  {
    id: 'flight_aloft_180',
    title: 'Stay aloft',
    description: 'Score 180+ points on Stay Aloft within 40 generations (Flapper recommended).',
    goal: EvolutionGoal.FLIGHT_TIME,
    targetValue: 180,
    maxGenerations: 40,
    badgeLabel: 'Aviator',
  },
  {
    id: 'flight_height_160',
    title: 'Flight height',
    description: 'Score 160+ points on Flight Height (sustained climb) within 35 generations.',
    goal: EvolutionGoal.FLIGHT_HEIGHT,
    targetValue: 160,
    maxGenerations: 35,
    badgeLabel: 'Climber',
  },
  {
    id: 'fly_right_200',
    title: 'Fly right',
    description: 'Score 200+ points on Fly Right within 40 generations.',
    goal: EvolutionGoal.FLIGHT_RIGHT,
    targetValue: 200,
    maxGenerations: 40,
    badgeLabel: 'Cruise',
  },
  {
    id: 'acro_flip_150',
    title: 'Aero flips',
    description: 'Score 150+ points on Aero Acrobatics within 45 generations.',
    goal: EvolutionGoal.FLIGHT_ACROBATICS,
    targetValue: 150,
    maxGenerations: 45,
    badgeLabel: 'Acrobat',
  },
  {
    id: 'glide_range_220',
    title: 'Glide far',
    description: 'Score 220+ points on Glide Range within 40 generations (Proven Glider recommended).',
    goal: EvolutionGoal.GLIDE_RANGE,
    targetValue: 220,
    maxGenerations: 40,
    badgeLabel: 'Glider',
  },
  {
    id: 'para_ramp_260',
    title: 'Para ramp',
    description:
      'Score 260+ points on Para Ramp within 50 generations (Proven Glider — multi-head run-up→deploy→glide).',
    goal: EvolutionGoal.PARA_RAMP_GLIDE,
    targetValue: 260,
    maxGenerations: 50,
    badgeLabel: 'Para Pilot',
  },
  {
    id: 'aerial_cross_300',
    title: 'Air crossing',
    description: 'Score 300+ points clearing the aerial pit within 45 generations.',
    goal: EvolutionGoal.AERIAL_CROSSING,
    targetValue: 300,
    maxGenerations: 45,
    badgeLabel: 'Flyer',
  },
];

const STORAGE_KEY = 'biomech_challenge_progress_v3';

export function loadChallengeProgress(): Record<
  string,
  {
    cleared: boolean;
    clearedAtGeneration?: number;
    bestScore: number;
    liveTarget?: number;
    clearCount?: number;
  }
> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveChallengeProgress(
  progress: Record<
    string,
    {
      cleared: boolean;
      clearedAtGeneration?: number;
      bestScore: number;
      liveTarget?: number;
      clearCount?: number;
    }
  >
) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // ignore quota errors
  }
}

/** Wipe challenge badges / best scores (does not change challenge definitions). */
export function clearChallengeProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
