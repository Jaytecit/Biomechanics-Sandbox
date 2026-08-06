/**
 * D15 — shareable training recipes / experiment packs (metadata only).
 * Firewall: no parent NEAT/physics constants.
 */
import type { CreatureDesign } from '../creature/types';
import type { EnvironmentDesign } from '../env/types';
import type { GaKnobSet } from '../brain/trainingRecipes';
import type { NetworkShape } from '../brain/types';
import type { TaskId } from '../brain/types';

export const EXPERIMENT_PACK_VERSION = 1 as const;

/** Named knob set only (how you search). */
export interface TrainingRecipeSave {
  kind: 'training_recipe';
  version: typeof EXPERIMENT_PACK_VERSION;
  name: string;
  knobs: GaKnobSet;
  createdAt: number;
}

/** Full experiment: body + env + goal + recipe + optional brain. */
export interface ExperimentPack {
  kind: 'experiment_pack';
  version: typeof EXPERIMENT_PACK_VERSION;
  name: string;
  goalId: string;
  task: TaskId;
  design: CreatureDesign;
  environment?: EnvironmentDesign;
  knobs: GaKnobSet;
  brain?: {
    shape: NetworkShape;
    weights: number[];
    fitness: number;
  };
  createdAt: number;
}

const RECIPE_KEY = 'freshstart_named_recipes_v1';

export function loadNamedRecipes(): TrainingRecipeSave[] {
  try {
    const raw = localStorage.getItem(RECIPE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrainingRecipeSave[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveNamedRecipe(recipe: TrainingRecipeSave): void {
  const list = loadNamedRecipes().filter((r) => r.name !== recipe.name);
  list.unshift(recipe);
  try {
    localStorage.setItem(RECIPE_KEY, JSON.stringify(list.slice(0, 40)));
  } catch {
    /* ignore */
  }
}

export function deleteNamedRecipe(name: string): void {
  const list = loadNamedRecipes().filter((r) => r.name !== name);
  try {
    localStorage.setItem(RECIPE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function exportExperimentPackJson(pack: ExperimentPack): string {
  return JSON.stringify(pack, null, 2);
}

export function parseExperimentPack(json: string): ExperimentPack {
  const data = JSON.parse(json) as ExperimentPack;
  if (data.kind !== 'experiment_pack' || data.version !== EXPERIMENT_PACK_VERSION) {
    throw new Error('Not a Solemn Sandbox experiment pack v1');
  }
  if (!data.design || !data.knobs || !data.goalId) {
    throw new Error('Experiment pack missing design, knobs, or goal');
  }
  return data;
}

export function exportRecipeJson(recipe: TrainingRecipeSave): string {
  return JSON.stringify(recipe, null, 2);
}
