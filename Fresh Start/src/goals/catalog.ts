/**
 * E1 — Goal catalog framework (thin wrappers over TaskId + zone membership).
 * E2 — Zone routing without eligibility gates.
 * E6 — Expanded skill goals (Rapier-native scoring in taskScore.ts).
 */
import type { TaskId } from '../brain/types';
import type { ZoneId } from '../zones/zones';

export type GoalId = TaskId;

export interface GoalDef {
  id: GoalId;
  task: TaskId;
  title: string;
  blurb: string;
  /** Zones that list this goal. `free` always includes every goal. */
  zones: ZoneId[];
}

export const GOAL_CATALOG: GoalDef[] = [
  {
    id: 'run',
    task: 'run',
    title: 'Run',
    blurb: 'Forward locomotion with foot-lift quality.',
    zones: ['walking', 'free'],
  },
  {
    id: 'speed',
    task: 'speed',
    title: 'Max Speed',
    blurb: 'Peak burst plus travel on flat ground.',
    zones: ['walking', 'free'],
  },
  {
    id: 'sprint',
    task: 'sprint',
    title: 'Sprint Finish',
    blurb: 'Race checkpoints to the finish — faster finish scores more. Place start/finish markers in World.',
    zones: ['walking', 'free'],
  },
  {
    id: 'stay',
    task: 'stay',
    title: 'Stay Tall',
    blurb: 'Sustain a tall, supported posture.',
    zones: ['walking', 'free'],
  },
  {
    id: 'rough',
    task: 'rough',
    title: 'Rough terrain',
    blurb: 'Forward locomotion over hills with foot-lift quality.',
    zones: ['walking', 'free'],
  },
  {
    id: 'jump',
    task: 'jump',
    title: 'Jump Height',
    blurb: 'Peak height and hang time.',
    zones: ['jumping', 'free'],
  },
  {
    id: 'hang',
    task: 'hang',
    title: 'Hang Time',
    blurb: 'Maximize airborne time in one jump.',
    zones: ['jumping', 'free'],
  },
  {
    id: 'longjump',
    task: 'longjump',
    title: 'Long Jump',
    blurb: 'Jump as far right as you can.',
    zones: ['jumping', 'free'],
  },
  {
    id: 'climb',
    task: 'climb',
    title: 'Climb',
    blurb: 'Ascend the step course.',
    zones: ['free'],
  },
  {
    id: 'motor',
    task: 'motor',
    title: 'Motor',
    blurb: 'Wheeled forward drive.',
    zones: ['motor', 'free'],
  },
  {
    id: 'flight',
    task: 'flight',
    title: 'Flight',
    blurb: 'Sustain altitude with aero parts — mean height beats one-flap coasts.',
    zones: ['flying', 'free'],
  },
  {
    id: 'dance',
    task: 'dance',
    title: 'Dance',
    blurb:
      'Multi-track curriculum: imitate reactive disco, then refine freestyle for upright + beat sync (solo, Disco only).',
    zones: ['disco'],
  },
];

export function getGoal(id: GoalId): GoalDef {
  const g = GOAL_CATALOG.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown goal ${id}`);
  return g;
}

/** Goals visible in a zone (`free` shows evolve goals; `disco` is audio-only). */
export function goalsForZone(zone: ZoneId): GoalDef[] {
  // H6 dance is imitation-trained in Disco, not GA-evolved.
  if (zone === 'free') {
    return GOAL_CATALOG.filter((g) => g.id !== 'dance');
  }
  if (zone === 'disco') return [];
  return GOAL_CATALOG.filter((g) => g.zones.includes(zone));
}

/** Default goal when entering a zone. */
export function defaultGoalForZone(zone: ZoneId): GoalDef {
  const list = goalsForZone(zone);
  return list[0] ?? GOAL_CATALOG[0];
}

const GOAL_STORAGE_KEY = 'freshstart_active_goal_v1';

export function loadActiveGoalId(fallback: GoalId = 'run'): GoalId {
  try {
    const raw = localStorage.getItem(GOAL_STORAGE_KEY);
    if (raw && GOAL_CATALOG.some((g) => g.id === raw)) return raw as GoalId;
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveActiveGoalId(id: GoalId): void {
  try {
    localStorage.setItem(GOAL_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}
