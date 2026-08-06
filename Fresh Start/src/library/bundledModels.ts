/**
 * Default / bundled models library (F3).
 * Fresh Start–authored bodies only (from presets + disco dancer).
 * Appearance starts empty — googly eyes are an opt-in joint add-on.
 */
import { emptyAppearance, type AppearanceRig } from '../appearance/types';
import { DISCO_DANCER } from '../creature/discoDancer';
import { PRESETS } from '../creature/presets';
import { ULTI_GROOVE_BOT_II } from '../creature/ultiGrooveBotII';
import { cloneDesign, type CreatureDesign } from '../creature/types';

export interface BundledModel {
  id: string;
  displayName: string;
  design: CreatureDesign;
  appearance: AppearanceRig;
  tags: string[];
}

export const BUNDLED_MODELS: BundledModel[] = [
  ...PRESETS.map((p) => ({
    id: `builtin_${p.name.toLowerCase().replace(/\s+/g, '_')}`,
    displayName: p.name,
    design: cloneDesign(p),
    appearance: emptyAppearance(),
    tags: ['preset'],
  })),
  {
    id: 'builtin_disco_dancer',
    displayName: DISCO_DANCER.name,
    design: cloneDesign(DISCO_DANCER),
    appearance: emptyAppearance(),
    tags: ['disco', 'preset'],
  },
  {
    id: 'builtin_ulti_groove_bot_ii',
    displayName: ULTI_GROOVE_BOT_II.name,
    design: cloneDesign(ULTI_GROOVE_BOT_II),
    appearance: emptyAppearance(),
    tags: ['disco', 'preset'],
  },
];

export function getBundledModel(id: string): BundledModel | undefined {
  return BUNDLED_MODELS.find((m) => m.id === id);
}
