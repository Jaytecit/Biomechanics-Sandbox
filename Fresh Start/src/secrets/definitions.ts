/**
 * E5.1 — Secret goal definitions + flavor text.
 * Titles/descriptions stay here until a discovery is recorded.
 */
import type { TaskEpisodeMetrics } from '../brain/taskScore';
import type { TaskId } from '../brain/types';
import type { CreatureDesign } from '../creature/types';

export type SecretGoalFlavor = 'triumph' | 'mishap' | 'disaster';

export type SecretGoalId =
  | 'run_zero_hero'
  | 'run_faceplant'
  | 'run_backpedal'
  | 'jump_belly_flop'
  | 'jump_sky_tease'
  | 'climb_retreat'
  | 'motor_wheelie'
  | 'flight_grounded'
  | 'flight_feather'
  | 'meta_collector';

/** Scoring thresholds — product logic, not physics feel tunables. */
const ZERO_DIST = 0.35;
const BACKPEDAL_DIST = -1.5;
const FACEPLANT_DIST_MIN = 0.5;
const BELLY_AIR = 0.8;
const BELLY_UPRIGHT_MAX = 0.45;
const SKY_HEIGHT = 2.5;
const CLIMB_PEAK_MIN = 1.2;
const CLIMB_END_DIST_MAX = 1.0;
const MOTOR_UPRIGHT_MAX = 0.4;
const FLIGHT_GROUNDED_AIR = 0.25;
const FLIGHT_FEATHER_AIR = 2.5;
const COLLECTOR_MIN = 3;

export interface SecretGoalEvalContext {
  task: TaskId;
  metrics: TaskEpisodeMetrics;
  design: CreatureDesign;
  episodeSeconds: number;
  generation?: number;
  /** Already-discovered secret ids */
  discoveredIds: Set<string>;
  priorDiscoveryCount: number;
}

export interface SecretGoalDefinition {
  id: SecretGoalId;
  title: string;
  description: string;
  flavor: SecretGoalFlavor;
  /** Tasks that intentionally reward this — discovery blocked while training them. */
  blockedTasks: TaskId[];
  requiresWheels?: boolean;
  requiresAero?: boolean;
  isMeta?: boolean;
  check: (ctx: SecretGoalEvalContext) => boolean;
}

export const SECRET_GOALS: SecretGoalDefinition[] = [
  {
    id: 'run_zero_hero',
    title: 'Zero Hero',
    description: 'Held your ground with heroic resolve — and zero progress.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' &&
      !ctx.metrics.fell &&
      Math.abs(ctx.metrics.distance) < ZERO_DIST,
  },
  {
    id: 'run_faceplant',
    title: 'Faceplant Sprint',
    description: 'Moved a little, then introduced your face to the floor.',
    flavor: 'disaster',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'run' &&
      ctx.metrics.fell &&
      ctx.metrics.distance >= FACEPLANT_DIST_MIN,
  },
  {
    id: 'run_backpedal',
    title: 'Backpedal Hero',
    description: 'Committed fully to the wrong direction.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) => ctx.task === 'run' && ctx.metrics.distance < BACKPEDAL_DIST,
  },
  {
    id: 'jump_belly_flop',
    title: 'Belly Flop',
    description: 'Airtime achieved. Dignity optional.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'jump' &&
      ctx.metrics.airTime >= BELLY_AIR &&
      ctx.metrics.uprightQuality < BELLY_UPRIGHT_MAX,
  },
  {
    id: 'jump_sky_tease',
    title: 'Sky Tease',
    description: 'A surprising leap while chasing something else entirely.',
    flavor: 'triumph',
    blockedTasks: ['jump'],
    check: (ctx) =>
      ctx.task !== 'jump' && ctx.metrics.peakHeight >= SKY_HEIGHT,
  },
  {
    id: 'climb_retreat',
    title: 'Summit Retreat',
    description: 'Reached up… then ended near where you started.',
    flavor: 'mishap',
    blockedTasks: [],
    check: (ctx) =>
      ctx.task === 'climb' &&
      ctx.metrics.peakHeight >= CLIMB_PEAK_MIN &&
      Math.abs(ctx.metrics.distance) < CLIMB_END_DIST_MAX,
  },
  {
    id: 'motor_wheelie',
    title: 'Wheelie Fail',
    description: 'Wheels yes. Balance no.',
    flavor: 'mishap',
    blockedTasks: [],
    requiresWheels: true,
    check: (ctx) =>
      ctx.task === 'motor' &&
      ctx.metrics.uprightQuality < MOTOR_UPRIGHT_MAX,
  },
  {
    id: 'flight_grounded',
    title: 'Grounded Eagle',
    description: 'Wings installed. Takeoff postponed indefinitely.',
    flavor: 'mishap',
    blockedTasks: [],
    requiresAero: true,
    check: (ctx) =>
      ctx.task === 'flight' && ctx.metrics.airTime < FLIGHT_GROUNDED_AIR,
  },
  {
    id: 'flight_feather',
    title: 'Feather Fall',
    description: 'A long float discovered off-task.',
    flavor: 'triumph',
    blockedTasks: ['flight'],
    requiresAero: true,
    check: (ctx) =>
      ctx.task !== 'flight' && ctx.metrics.airTime >= FLIGHT_FEATHER_AIR,
  },
  {
    id: 'meta_collector',
    title: 'Trophy Collector',
    description: 'Three secrets in the ledger. The cabinet is growing.',
    flavor: 'triumph',
    blockedTasks: [],
    isMeta: true,
    check: (ctx) => ctx.priorDiscoveryCount >= COLLECTOR_MIN,
  },
];

export function secretGoalById(id: SecretGoalId): SecretGoalDefinition | undefined {
  return SECRET_GOALS.find((g) => g.id === id);
}

export function revealedTitle(id: SecretGoalId): string {
  return secretGoalById(id)?.title ?? id;
}
