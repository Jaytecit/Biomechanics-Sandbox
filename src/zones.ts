/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EvolutionGoal, CreatureBlueprint } from './types';
import { GOAL_CATALOG, GoalCategory, GOAL_ORDER } from './goalCatalog';

/** Exclusive creature-type arenas + unrestricted sandbox. */
export type ArenaZoneId = 'flying' | 'motor' | 'walking' | 'jumping' | 'free';

export type BlueprintTraits = {
  hasAero: boolean;
  hasWing: boolean;
  hasParaglider: boolean;
  hasParachute: boolean;
  hasMotorWheel: boolean;
  hasPassiveWheel: boolean;
};

export type ZoneEquipmentRules = {
  /** Wing / paraglider / parachute muscles */
  allowAero: boolean;
  /** Brain-driven motor wheels */
  allowMotorWheels: boolean;
  /** Passive rolling wheels */
  allowPassiveWheels: boolean;
};

export type ZoneArenaRules = {
  wind: boolean;
  ice: boolean;
  terrain: boolean;
  ramp: boolean;
  pit: boolean;
};

export interface ArenaZone {
  id: ArenaZoneId;
  title: string;
  shortLabel: string;
  description: string;
  /** Goal categories exclusive to this zone (`all` = free-for-all). */
  goalCategories: GoalCategory[] | 'all';
  defaultGoal: EvolutionGoal;
  defaultTemplateName: string;
  equipment: ZoneEquipmentRules;
  arena: ZoneArenaRules;
  accentClass: string;
  activeTabClass: string;
  /** Optional NEAT/episode defaults applied when entering this zone (F08 / D078). */
  trainingDefaults?: {
    generationDuration?: number;
    addNodeRate?: number;
    addConnectionRate?: number;
    mutationRate?: number;
  };
}

export const ZONE_STORAGE_KEY = 'biomech_active_zone_v1';

export const ARENA_ZONES: Record<ArenaZoneId, ArenaZone> = {
  flying: {
    id: 'flying',
    title: 'Flying',
    shortLabel: 'Flying',
    description: 'Wings and paragliders only. Flight goals, wind, and aerial courses.',
    goalCategories: ['flight'],
    defaultGoal: EvolutionGoal.FLIGHT_TIME,
    defaultTemplateName: 'RoboBird',
    equipment: { allowAero: true, allowMotorWheels: true, allowPassiveWheels: true },
    arena: { wind: true, ice: false, terrain: true, ramp: true, pit: true },
    /** Phase 5 (D078): longer episodes, weight-first search (no early topology bloat). */
    trainingDefaults: {
      generationDuration: 48,
      addNodeRate: 0,
      addConnectionRate: 0.05,
      mutationRate: 0.28,
    },
    accentClass: 'text-sky-700',
    activeTabClass: 'border-sky-600 bg-sky-50 text-sky-900',
  },
  motor: {
    id: 'motor',
    title: 'Motor driven',
    shortLabel: 'Motor',
    description: 'Powered wheels only. Motor courses — no wings or sails.',
    goalCategories: ['motor'],
    defaultGoal: EvolutionGoal.MOTOR_DRIVE,
    defaultTemplateName: 'Motor Cart',
    equipment: { allowAero: false, allowMotorWheels: true, allowPassiveWheels: true },
    arena: { wind: false, ice: true, terrain: true, ramp: true, pit: true },
    accentClass: 'text-amber-700',
    activeTabClass: 'border-amber-600 bg-amber-50 text-amber-950',
  },
  walking: {
    id: 'walking',
    title: 'Walking',
    shortLabel: 'Walking',
    description: 'Muscle gaits on the ground — step-strict Run plus Shuffle vibration travel. No wings, no motor drive.',
    goalCategories: ['locomotion', 'shuffle', 'climb', 'object', 'sports', 'precision'],
    defaultGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    defaultTemplateName: 'Sprongo',
    equipment: { allowAero: false, allowMotorWheels: false, allowPassiveWheels: false },
    arena: { wind: false, ice: true, terrain: true, ramp: true, pit: false },
    accentClass: 'text-emerald-700',
    activeTabClass: 'border-emerald-600 bg-emerald-50 text-emerald-900',
  },
  jumping: {
    id: 'jumping',
    title: 'Jumping',
    shortLabel: 'Jumping',
    description: 'Hop and leap curriculum. Muscle bodies only — no wings or motors.',
    goalCategories: ['jump'],
    defaultGoal: EvolutionGoal.HIGH_JUMP,
    defaultTemplateName: 'Tool Eggs',
    equipment: { allowAero: false, allowMotorWheels: false, allowPassiveWheels: false },
    arena: { wind: false, ice: false, terrain: false, ramp: false, pit: true },
    accentClass: 'text-orange-700',
    activeTabClass: 'border-orange-600 bg-orange-50 text-orange-950',
  },
  free: {
    id: 'free',
    title: 'Free for all',
    shortLabel: 'Free',
    description: 'No equipment or goal rules. Any combination is allowed.',
    goalCategories: 'all',
    defaultGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    defaultTemplateName: 'Sprongo',
    equipment: { allowAero: true, allowMotorWheels: true, allowPassiveWheels: true },
    arena: { wind: true, ice: true, terrain: true, ramp: true, pit: true },
    accentClass: 'text-violet-700',
    activeTabClass: 'border-violet-600 bg-violet-50 text-violet-950',
  },
};

export const ZONE_ORDER: ArenaZoneId[] = ['flying', 'motor', 'walking', 'jumping', 'free'];

export function getZone(id: ArenaZoneId): ArenaZone {
  return ARENA_ZONES[id];
}

export function loadStoredZone(): ArenaZoneId {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (raw && raw in ARENA_ZONES) return raw as ArenaZoneId;
  } catch {
    /* ignore */
  }
  return 'walking';
}

export function persistZone(id: ArenaZoneId): void {
  try {
    localStorage.setItem(ZONE_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function inspectBlueprint(blueprint: CreatureBlueprint): BlueprintTraits {
  const hasWing = blueprint.muscles.some(m => m.aeroType === 'wing');
  const hasParaglider = blueprint.muscles.some(m => m.aeroType === 'paraglider');
  const hasParachute = blueprint.muscles.some(m => m.aeroType === 'parachute');
  const hasMotorWheel = blueprint.nodes.some(n => !!n.isMotorWheel);
  const hasPassiveWheel = blueprint.nodes.some(n => !!n.isWheel && !n.isMotorWheel);
  return {
    hasAero: hasWing || hasParaglider || hasParachute,
    hasWing,
    hasParaglider,
    hasParachute,
    hasMotorWheel,
    hasPassiveWheel,
  };
}

/**
 * Primary home zone for a morphology (builtins + customs).
 * Hybrids with aero live in Flying; motor-only in Motor; muscle-only walk/jump share.
 */
export function primaryZoneForBlueprint(blueprint: CreatureBlueprint): ArenaZoneId {
  const t = inspectBlueprint(blueprint);
  if (t.hasAero) return 'flying';
  if (t.hasMotorWheel) return 'motor';
  return 'walking';
}

/** Zones where this body may be selected / opened (Free always included). */
export function zonesForBlueprint(blueprint: CreatureBlueprint): ArenaZoneId[] {
  const t = inspectBlueprint(blueprint);
  if (t.hasAero) return ['flying', 'free'];
  if (t.hasMotorWheel) return ['motor', 'free'];
  // Muscle-only: walking + jumping (+ free)
  return ['walking', 'jumping', 'free'];
}

export function blueprintAllowedInZone(blueprint: CreatureBlueprint, zoneId: ArenaZoneId): boolean {
  return zonesForBlueprint(blueprint).includes(zoneId);
}

export function equipmentAllowedInZone(
  traits: Partial<BlueprintTraits>,
  zoneId: ArenaZoneId
): boolean {
  const rules = ARENA_ZONES[zoneId].equipment;
  if (traits.hasAero && !rules.allowAero) return false;
  if (traits.hasMotorWheel && !rules.allowMotorWheels) return false;
  if (traits.hasPassiveWheel && !rules.allowPassiveWheels) return false;
  return true;
}

export function blueprintEquipmentOk(blueprint: CreatureBlueprint, zoneId: ArenaZoneId): boolean {
  return equipmentAllowedInZone(inspectBlueprint(blueprint), zoneId);
}

export function goalsForZone(zoneId: ArenaZoneId): EvolutionGoal[] {
  const zone = ARENA_ZONES[zoneId];
  if (zone.goalCategories === 'all') return [...GOAL_ORDER];
  const allowed = new Set(zone.goalCategories);
  return GOAL_ORDER.filter(g => allowed.has(GOAL_CATALOG[g].category));
}

export function goalAllowedInZone(goal: EvolutionGoal, zoneId: ArenaZoneId): boolean {
  return goalsForZone(zoneId).includes(goal);
}

export function filterTemplatesForZone(
  templates: CreatureBlueprint[],
  zoneId: ArenaZoneId
): CreatureBlueprint[] {
  return templates.filter(t => blueprintAllowedInZone(t, zoneId));
}

export function rejectReasonForZone(blueprint: CreatureBlueprint, zoneId: ArenaZoneId): string | null {
  if (blueprintAllowedInZone(blueprint, zoneId)) return null;
  const zone = ARENA_ZONES[zoneId];
  const t = inspectBlueprint(blueprint);
  const bits: string[] = [];
  if (t.hasWing) bits.push('wings');
  if (t.hasParaglider) bits.push('paraglider');
  if (t.hasParachute) bits.push('parachute');
  if (t.hasMotorWheel) bits.push('motor wheels');
  if (t.hasPassiveWheel) bits.push('passive wheels');
  const equip = bits.length ? bits.join(', ') : 'this morphology';
  return `"${blueprint.name}" uses ${equip}, which is not allowed in ${zone.title}. Switch to ${primaryZoneForBlueprint(blueprint) === zoneId ? 'Free for all' : ARENA_ZONES[primaryZoneForBlueprint(blueprint)].title} or Free for all.`;
}

/**
 * Zone to open when loading a body into Simulation from the Models hub.
 * Keeps the current arena when compatible; otherwise uses the body's primary zone.
 */
export function resolveSimulationZone(
  blueprint: CreatureBlueprint,
  preferredZone: ArenaZoneId
): ArenaZoneId {
  if (blueprintAllowedInZone(blueprint, preferredZone)) return preferredZone;
  return primaryZoneForBlueprint(blueprint);
}

export function sanitizeArenaForZone<T extends {
  windEnabled: boolean;
  iceEnabled: boolean;
  terrainEnabled: boolean;
  terrainObstaclesEnabled: boolean;
  rampEnabled: boolean;
  pitEnabled: boolean;
}>(arena: T, zoneId: ArenaZoneId): T {
  const rules = ARENA_ZONES[zoneId].arena;
  return {
    ...arena,
    windEnabled: rules.wind ? arena.windEnabled : false,
    iceEnabled: rules.ice ? arena.iceEnabled : false,
    terrainEnabled: rules.terrain ? arena.terrainEnabled : false,
    terrainObstaclesEnabled: rules.terrain ? arena.terrainObstaclesEnabled : false,
    rampEnabled: rules.ramp ? arena.rampEnabled : false,
    pitEnabled: rules.pit ? arena.pitEnabled : false,
  };
}
