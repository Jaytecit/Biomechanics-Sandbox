import { CreatureBlueprint } from './types';
import { CREATURE_TEMPLATES } from './templates';
import {
  builtinAndSavedBlueprints,
  deletePackage,
  loadCreaturePackages,
  saveNewPackage,
  savePackageRevision,
} from './creaturePackages';

export function builtinTemplateNames(): Set<string> {
  return new Set(CREATURE_TEMPLATES.map(template => template.name));
}
export function isBuiltinTemplate(name: string): boolean {
  return builtinTemplateNames().has(name);
}
export function loadSavedCreatures(): CreatureBlueprint[] {
  return loadCreaturePackages().map(item => ({ ...structuredClone(item.blueprint), name: item.displayName }));
}
/** Compatibility wrapper for existing UI. Stable-ID APIs live in creaturePackages.ts. */
export function upsertSavedCreature(blueprint: CreatureBlueprint): CreatureBlueprint[] {
  const existing = loadCreaturePackages().find(item => item.displayName === blueprint.name);
  const result = existing
    ? savePackageRevision(existing.id, { blueprint, displayName: blueprint.name })
    : saveNewPackage(blueprint, { displayName: blueprint.name, source: 'studio-draft' });
  if (!result.ok) throw new Error(result.error);
  return loadSavedCreatures();
}
export function removeSavedCreature(name: string): CreatureBlueprint[] {
  if (isBuiltinTemplate(name)) return loadSavedCreatures();
  for (const item of loadCreaturePackages().filter(pkg => pkg.displayName === name)) {
    const result = deletePackage(item.id);
    if (!result.ok) throw new Error(result.error);
  }
  return loadSavedCreatures();
}
export function loadAllTemplates(): CreatureBlueprint[] {
  return builtinAndSavedBlueprints();
}
