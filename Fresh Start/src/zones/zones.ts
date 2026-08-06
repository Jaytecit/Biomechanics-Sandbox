/** Product zone metadata (B1). No physics — UI / task routing only. */

export type ZoneId =
  | 'flying'
  | 'motor'
  | 'walking'
  | 'jumping'
  | 'free'
  | 'disco';

export interface ZoneDef {
  id: ZoneId;
  title: string;
  shortLabel: string;
  description: string;
  accent: string;
  /** Default evolve task when this zone is active. */
  defaultTask: import('../brain/types').TaskId;
}

export const ZONE_ORDER: ZoneId[] = [
  'walking',
  'jumping',
  'flying',
  'motor',
  'free',
  'disco',
];

export const ZONES: Record<ZoneId, ZoneDef> = {
  walking: {
    id: 'walking',
    title: 'Walking',
    shortLabel: 'Walk',
    description: 'Locomotion — flat run or rough hills.',
    accent: '#3d9a6a',
    defaultTask: 'run',
  },
  jumping: {
    id: 'jumping',
    title: 'Jumping',
    shortLabel: 'Jump',
    description: 'Peak height and hang time.',
    accent: '#d48a3a',
    defaultTask: 'jump',
  },
  flying: {
    id: 'flying',
    title: 'Flying',
    shortLabel: 'Fly',
    description: 'Airtime with aero-like lift/drag on tagged bones.',
    accent: '#4a8fd4',
    defaultTask: 'flight',
  },
  motor: {
    id: 'motor',
    title: 'Motor',
    shortLabel: 'Motor',
    description: 'Wheeled forward drive via motor torque.',
    accent: '#d4a04a',
    defaultTask: 'motor',
  },
  free: {
    id: 'free',
    title: 'Free',
    shortLabel: 'Free',
    description: 'Sandbox — pick any task; no equipment gates yet.',
    accent: '#9a7ad4',
    defaultTask: 'run',
  },
  disco: {
    id: 'disco',
    title: 'Disco',
    shortLabel: 'Disco',
    description:
      'Audio-reactive dance floor — lighting FX, side walls, frequency → muscle routing.',
    accent: '#e05aad',
    /** Placeholder; disco zone does not evolve against a task. */
    defaultTask: 'run',
  },
};

const ZONE_STORAGE_KEY = 'freshstart_active_zone_v1';

export function loadActiveZone(): ZoneId {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (raw && raw in ZONES) return raw as ZoneId;
  } catch {
    /* ignore */
  }
  return 'walking';
}

export function saveActiveZone(zone: ZoneId): void {
  try {
    localStorage.setItem(ZONE_STORAGE_KEY, zone);
  } catch {
    /* ignore */
  }
}
