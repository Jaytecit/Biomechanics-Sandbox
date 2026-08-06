/**
 * Resolve a saved model's creature design from a candidate pool (packages, bundled, editor).
 */
import type { CreatureDesign } from '../creature/types';
import { bodyFingerprint } from './bestEver';
import type { SavedModel } from './savedModels';

function bodyFpFromModel(model: SavedModel): string {
  const i = model.designFingerprint.indexOf(':');
  return i >= 0 ? model.designFingerprint.slice(i + 1) : model.designFingerprint;
}

/** Find a design whose body graph matches a saved model fingerprint. */
export function resolveDesignForModel(
  model: SavedModel,
  pool: CreatureDesign[],
): CreatureDesign | null {
  const target = bodyFpFromModel(model);
  for (const design of pool) {
    if (bodyFingerprint(design) === target) return design;
  }
  return null;
}

/** All unique designs from packages + bundled + optional editor design. */
export function designCandidatePool(
  packages: { design: CreatureDesign }[],
  bundled: { design: CreatureDesign }[],
  current?: CreatureDesign,
): CreatureDesign[] {
  const out: CreatureDesign[] = [];
  const seen = new Set<string>();
  const add = (d: CreatureDesign) => {
    const fp = bodyFingerprint(d);
    if (seen.has(fp)) return;
    seen.add(fp);
    out.push(d);
  };
  if (current) add(current);
  for (const p of packages) add(p.design);
  for (const b of bundled) add(b.design);
  return out;
}
