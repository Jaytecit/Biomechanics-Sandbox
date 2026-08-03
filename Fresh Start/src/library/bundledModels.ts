/**
 * Default / bundled models library (F3).
 * Fresh Start–authored bodies only (from presets + disco dancer).
 */
import { emptyAppearance, type AppearanceRig } from '../appearance/types';
import { DISCO_DANCER } from '../creature/discoDancer';
import { PRESETS } from '../creature/presets';
import { cloneDesign, type CreatureDesign } from '../creature/types';

export interface BundledModel {
  id: string;
  displayName: string;
  design: CreatureDesign;
  appearance: AppearanceRig;
  tags: string[];
}

function eyesOnHighestJoint(design: CreatureDesign): AppearanceRig {
  if (design.joints.length === 0) return emptyAppearance();
  let best = design.joints[0];
  for (const j of design.joints) {
    if (j.y > best.y) best = j;
  }
  return {
    version: 1,
    googlyEyes: [
      { jointId: best.id, domeRadius: 0.18, offsetX: -0.12, offsetY: 0.06 },
      { jointId: best.id, domeRadius: 0.18, offsetX: 0.12, offsetY: 0.06 },
    ],
    bodyParts: [],
  };
}

export const BUNDLED_MODELS: BundledModel[] = [
  ...PRESETS.map((p) => ({
    id: `builtin_${p.name.toLowerCase().replace(/\s+/g, '_')}`,
    displayName: p.name,
    design: cloneDesign(p),
    appearance: eyesOnHighestJoint(p),
    tags: ['preset'],
  })),
  {
    id: 'builtin_disco_dancer',
    displayName: DISCO_DANCER.name,
    design: cloneDesign(DISCO_DANCER),
    appearance: eyesOnHighestJoint(DISCO_DANCER),
    tags: ['disco', 'preset'],
  },
];

export function getBundledModel(id: string): BundledModel | undefined {
  return BUNDLED_MODELS.find((m) => m.id === id);
}
