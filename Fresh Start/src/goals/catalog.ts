/**
 * E1 — Goal catalog framework (thin wrappers over TaskId + zone membership).
 * E2 — Zone routing without eligibility gates.
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
    id: 'jump',
    task: 'jump',
    title: 'Jump',
    blurb: 'Peak height and hang time.',
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
    blurb: 'Airtime with aero-tagged bones.',
    zones: ['flying', 'free'],
  },
];

export function getGoal(id: GoalId): GoalDef {
  const g = GOAL_CATALOG.find((x) => x.id === id);
  if (!g) throw new Error(`Unknown goal ${id}`);
  return g;
}

/** Goals visible in a zone (`free` shows all). */
export function goalsForZone(zone: ZoneId): GoalDef[] {
  if (zone === 'free') return GOAL_CATALOG.slice();
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
