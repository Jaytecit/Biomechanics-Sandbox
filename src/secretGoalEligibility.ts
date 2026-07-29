/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Morphology / model-type gates for secret discoveries — not shown in UI.
 */

import { EvolutionGoal, type Creature } from './types';
import type { GoalCategory } from './goalCatalog';
import { deriveModelTraits, type BodyTrait } from './savedModels';
import type { SecretGoalDefinition, SecretGoalId } from './secretGoals';
import { SECRET_GOALS } from './secretGoals';

export interface SecretGoalEligibility {
  allTraits?: BodyTrait[];
  anyTraits?: BodyTrait[];
  excludeTraits?: BodyTrait[];
  minHiddenNodes?: number;
  minNodes?: number;
  maxNodes?: number;
  minMotorWheels?: number;
  minAeroSurfaces?: number;
  minGeneration?: number;
  /** Blueprint name must match one of these exactly */
  modelNames?: string[];
}

export interface CreatureMorphProfile {
  blueprintName: string;
  generation: number;
  traits: BodyTrait[];
  nodeCount: number;
  muscleCount: number;
  motorWheels: number;
  aeroSurfaces: number;
  hiddenNodes: number;
}

export function deriveCreatureMorphProfile(creature: Creature): CreatureMorphProfile {
  const t = deriveModelTraits(
    creature.blueprint,
    creature.genome,
    EvolutionGoal.LOCOMOTION_RIGHT,
    creature.paraPilot
  );
  return {
    blueprintName: creature.blueprint.name,
    generation: creature.generation,
    traits: t.bodyTraits,
    nodeCount: t.nodeCount,
    muscleCount: t.muscleCount,
    motorWheels: t.motorWheels,
    aeroSurfaces: t.aeroSurfaces,
    hiddenNodes: t.hiddenNodes,
  };
}

function hasTrait(profile: CreatureMorphProfile, trait: BodyTrait): boolean {
  return profile.traits.includes(trait);
}

function hasAllTraits(profile: CreatureMorphProfile, traits: BodyTrait[]): boolean {
  return traits.every(tr => hasTrait(profile, tr));
}

function hasAnyTrait(profile: CreatureMorphProfile, traits: BodyTrait[]): boolean {
  return traits.some(tr => hasTrait(profile, tr));
}

export function creatureMeetsEligibility(
  creature: Creature,
  eligibility: SecretGoalEligibility | undefined,
  context: 'sandbox' | 'arena'
): boolean {
  if (!eligibility || Object.keys(eligibility).length === 0) return true;
  const profile = deriveCreatureMorphProfile(creature);

  if (eligibility.minGeneration !== undefined) {
    const genFloor =
      context === 'arena' ? Math.max(3, eligibility.minGeneration - 2) : eligibility.minGeneration;
    if (profile.generation < genFloor) return false;
  }
  if (eligibility.modelNames?.length) {
    if (!eligibility.modelNames.includes(profile.blueprintName)) return false;
  }
  if (eligibility.allTraits?.length && !hasAllTraits(profile, eligibility.allTraits)) return false;
  if (eligibility.anyTraits?.length && !hasAnyTrait(profile, eligibility.anyTraits)) return false;
  if (eligibility.excludeTraits?.some(tr => hasTrait(profile, tr))) return false;
  if (eligibility.minHiddenNodes !== undefined && profile.hiddenNodes < eligibility.minHiddenNodes) {
    return false;
  }
  if (eligibility.minNodes !== undefined && profile.nodeCount < eligibility.minNodes) return false;
  if (eligibility.maxNodes !== undefined && profile.nodeCount > eligibility.maxNodes) return false;
  if (eligibility.minMotorWheels !== undefined && profile.motorWheels < eligibility.minMotorWheels) {
    return false;
  }
  if (eligibility.minAeroSurfaces !== undefined && profile.aeroSurfaces < eligibility.minAeroSurfaces) {
    return false;
  }
  return true;
}

const WALK_MODELS = ['Sprongo', 'Tool Eggs'] as const;
const FLIGHT_MODELS = ['RoboBird', 'Glide Cart', 'Chute Cart'] as const;
const MOTOR_MODELS = ['Motor Cart', 'Glide Cart', 'Chute Cart'] as const;
const ALL_BUILTIN = [...WALK_MODELS, ...FLIGHT_MODELS, ...MOTOR_MODELS];

function idxInCategory(id: SecretGoalId, category: GoalCategory): number {
  const inCat = SECRET_GOALS.filter(g => g.category === category);
  return inCat.findIndex(g => g.id === id);
}

function pickModel(pool: readonly string[], index: number): string[] {
  return [pool[index % pool.length]!];
}

function baseForCategory(category: GoalCategory): SecretGoalEligibility {
  switch (category) {
    case 'locomotion':
      return {
        allTraits: ['soft-muscles'],
        excludeTraits: ['motor-drive', 'winged', 'wheeled', 'paraglider', 'parachute'],
        minGeneration: 6,
        minHiddenNodes: 1,
      };
    case 'shuffle':
      return {
        allTraits: ['soft-muscles'],
        excludeTraits: ['motor-drive', 'winged', 'wheeled'],
        minGeneration: 5,
        minHiddenNodes: 2,
      };
    case 'jump':
      return {
        allTraits: ['soft-muscles'],
        excludeTraits: ['motor-drive', 'wheeled'],
        minGeneration: 6,
        minHiddenNodes: 2,
      };
    case 'flight':
      return {
        anyTraits: ['winged', 'paraglider', 'parachute', 'multi-head'],
        excludeTraits: ['motor-drive'],
        minGeneration: 7,
        minAeroSurfaces: 1,
      };
    case 'climb':
      return {
        anyTraits: ['soft-muscles', 'rigid-bones'],
        excludeTraits: ['winged', 'motor-drive'],
        minGeneration: 6,
        minHiddenNodes: 1,
      };
    case 'object':
      return {
        allTraits: ['soft-muscles'],
        excludeTraits: ['winged', 'paraglider'],
        minGeneration: 5,
        minHiddenNodes: 1,
      };
    case 'motor':
      return {
        anyTraits: ['motor-drive', 'wheeled'],
        excludeTraits: ['winged'],
        minGeneration: 5,
        minMotorWheels: 1,
      };
    case 'sports':
      return {
        minGeneration: 6,
        minHiddenNodes: 1,
      };
    case 'precision':
      return {
        minGeneration: 7,
        minHiddenNodes: 2,
      };
    case 'custom':
      return { minGeneration: 4 };
    default:
      return { minGeneration: 5 };
  }
}

function variantFor(def: SecretGoalDefinition): SecretGoalEligibility {
  if (def.isMeta) return {};

  const i = idxInCategory(def.id, def.category);
  const base = baseForCategory(def.category);

  switch (def.category) {
    case 'locomotion': {
      const modelNames = i % 2 === 0 ? pickModel(WALK_MODELS, i) : undefined;
      return {
        ...base,
        modelNames,
        minNodes: modelNames ? undefined : i % 3 === 0 ? 8 : i % 3 === 1 ? 6 : undefined,
        minHiddenNodes: 1 + (i % 3),
        allTraits: i % 4 === 2 ? (['soft-muscles', 'rigid-bones'] as BodyTrait[]) : base.allTraits,
      };
    }
    case 'shuffle': {
      const modelNames = i % 3 === 0 ? pickModel(WALK_MODELS, i) : undefined;
      return {
        ...base,
        modelNames,
        minHiddenNodes: 2 + (i % 2),
        maxNodes: !modelNames && i === 5 ? 12 : undefined,
      };
    }
    case 'jump': {
      const modelNames = i % 2 === 1 ? pickModel(WALK_MODELS, i) : undefined;
      return {
        ...base,
        modelNames,
        minNodes: modelNames ? undefined : 6 + (i % 3) * 2,
        minHiddenNodes: 2 + (i % 2),
        excludeTraits: [...(base.excludeTraits ?? []), ...(i < 5 ? (['paraglider'] as BodyTrait[]) : [])],
      };
    }
    case 'flight':
      return {
        ...base,
        modelNames: pickModel(FLIGHT_MODELS, i),
        minAeroSurfaces: 1 + (i % 2),
        minHiddenNodes: 1 + (i % 3),
        anyTraits:
          i % 3 === 0
            ? (['winged'] as BodyTrait[])
            : i % 3 === 1
              ? (['paraglider', 'multi-head'] as BodyTrait[])
              : base.anyTraits,
      };
    case 'climb': {
      const modelNames = i % 2 === 0 ? pickModel(WALK_MODELS, i) : undefined;
      return {
        ...base,
        modelNames,
        allTraits: i % 3 === 1 ? (['rigid-bones'] as BodyTrait[]) : undefined,
        minNodes: modelNames ? undefined : 7 + (i % 4),
      };
    }
    case 'object':
      return {
        ...base,
        modelNames: i % 3 === 1 ? pickModel([...WALK_MODELS, ...MOTOR_MODELS], i) : undefined,
        anyTraits: i >= 5 ? (['motor-drive', 'soft-muscles'] as BodyTrait[]) : (['soft-muscles'] as BodyTrait[]),
        minHiddenNodes: 1 + (i % 3),
      };
    case 'motor':
      return {
        ...base,
        modelNames: pickModel(MOTOR_MODELS, i),
        minMotorWheels: i % 2 === 0 ? 2 : 1,
        minHiddenNodes: 1 + (i % 2),
      };
    case 'sports':
      return {
        ...base,
        modelNames: i % 2 === 0 ? pickModel(WALK_MODELS, i) : pickModel(MOTOR_MODELS, i),
        anyTraits:
          i < 4
            ? (['soft-muscles'] as BodyTrait[])
            : i < 7
              ? (['motor-drive', 'wheeled'] as BodyTrait[])
              : undefined,
        excludeTraits:
          i < 4
            ? (['motor-drive'] as BodyTrait[])
            : i >= 7
              ? (['winged'] as BodyTrait[])
              : undefined,
      };
    case 'precision': {
      const modelNames = i % 3 === 0 ? pickModel(ALL_BUILTIN, i) : undefined;
      return {
        ...base,
        modelNames,
        anyTraits:
          i % 2 === 0
            ? (['soft-muscles'] as BodyTrait[])
            : (['motor-drive', 'wheeled', 'soft-muscles'] as BodyTrait[]),
        minNodes: modelNames ? undefined : 5 + (i % 5),
      };
    }
    case 'custom':
      if (def.id === 'custom_frankenstein') {
        return { minGeneration: 5, minHiddenNodes: 2 };
      }
      if (def.id === 'custom_accidental_genius') {
        return { minGeneration: 8, minHiddenNodes: 3 };
      }
      if (def.id === 'custom_max_min') {
        return { minGeneration: 6, anyTraits: ['soft-muscles', 'winged', 'motor-drive'] };
      }
      return { ...base, minHiddenNodes: 2 + (i % 2) };
    default:
      return base;
  }
}

const ELIGIBILITY_BY_ID = Object.fromEntries(
  SECRET_GOALS.map(def => [def.id, variantFor(def)])
) as Record<SecretGoalId, SecretGoalEligibility>;

export function eligibilityForSecret(def: SecretGoalDefinition): SecretGoalEligibility {
  if (def.isMeta) return {};
  return ELIGIBILITY_BY_ID[def.id] ?? baseForCategory(def.category);
}

export function secretEligible(
  creature: Creature,
  def: SecretGoalDefinition,
  context: 'sandbox' | 'arena'
): boolean {
  return creatureMeetsEligibility(creature, eligibilityForSecret(def), context);
}
