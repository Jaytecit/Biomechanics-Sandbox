/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shipped Kenney body-part library (CC0). See src/assets/bodyParts/licenses/.
 */

export type BodyPartPack = 'monster' | 'modular' | 'animal';

export type BodyPartCategory =
  | 'leg'
  | 'arm'
  | 'body'
  | 'mouth'
  | 'nose'
  | 'eye'
  | 'eyebrow'
  | 'ear'
  | 'horn'
  | 'shoe'
  | 'animal'
  | 'other';

export type BodyPartAnchorHint = 'node' | 'muscle' | 'either';

export interface BodyPartDef {
  id: string;
  label: string;
  category: BodyPartCategory;
  pack: BodyPartPack;
  /** Bundled PNG URL resolved by Vite (?url). */
  url: string;
  pivotX: number;
  pivotY: number;
  defaultScale: number;
  mirrorAllowed: boolean;
  anchorHint: BodyPartAnchorHint;
}

const pngModules = import.meta.glob<string>('./assets/bodyParts/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

function fileName(path: string): string {
  return path.split(/[/\\]/).pop()?.replace(/\.png$/i, '') ?? 'part';
}

function humanLabel(name: string): string {
  return name
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase());
}

function inferCategory(relativePath: string, name: string): BodyPartCategory {
  const p = relativePath.toLowerCase();
  const n = name.toLowerCase();
  if (p.includes('/kenney-animal/')) return 'animal';
  if (p.includes('/shoes/')) return 'shoe';
  if (p.includes('/eyebrows/')) return 'eyebrow';
  if (p.includes('/eyes/')) return 'eye';
  if (p.includes('/mouth/')) return 'mouth';
  if (p.includes('/nose/')) return 'nose';
  if (n.startsWith('leg_')) return 'leg';
  if (n.startsWith('arm_')) return 'arm';
  if (n.startsWith('body_')) return 'body';
  if (n.startsWith('mouth')) return 'mouth';
  if (n.startsWith('nose_')) return 'nose';
  if (n.startsWith('eye_')) return 'eye';
  if (n.includes('_ear')) return 'ear';
  if (n.includes('_horn') || n.includes('_antenna')) return 'horn';
  return 'other';
}

function inferPack(relativePath: string): BodyPartPack {
  if (relativePath.startsWith('kenney-modular/')) return 'modular';
  if (relativePath.startsWith('kenney-animal/')) return 'animal';
  return 'monster';
}

function buildAssetId(pack: BodyPartPack, relativePath: string, name: string): string {
  if (pack === 'animal' && relativePath.includes('Round (outline)/')) {
    return `animal:${name}_outline`;
  }
  return `${pack}:${name}`;
}

function buildLabel(name: string, relativePath: string): string {
  const base = humanLabel(name);
  if (relativePath.includes('Round (outline)/')) return `${base} (outline)`;
  return base;
}

function inferDefaultScale(pack: BodyPartPack): number {
  if (pack === 'modular') return 0.9;
  if (pack === 'animal') return 0.42;
  return 1;
}

function inferPivot(category: BodyPartCategory): { pivotX: number; pivotY: number } {
  switch (category) {
    case 'leg':
    case 'shoe':
      return { pivotX: 0.5, pivotY: 0.92 };
    case 'arm':
      return { pivotX: 0.14, pivotY: 0.5 };
    case 'body':
      return { pivotX: 0.5, pivotY: 0.55 };
    case 'horn':
    case 'ear':
      return { pivotX: 0.5, pivotY: 0.82 };
    case 'animal':
      return { pivotX: 0.5, pivotY: 0.58 };
    default:
      return { pivotX: 0.5, pivotY: 0.5 };
  }
}

function inferAnchorHint(category: BodyPartCategory): BodyPartAnchorHint {
  if (category === 'arm' || category === 'leg') return 'either';
  return 'node';
}

function buildCatalog(): BodyPartDef[] {
  const items: BodyPartDef[] = [];
  for (const [modulePath, url] of Object.entries(pngModules)) {
    const normalized = modulePath.replace(/\\/g, '/');
    const marker = 'assets/bodyParts/';
    const assetsIdx = normalized.indexOf(marker);
    if (assetsIdx < 0) continue;
    const relativePath = normalized.slice(assetsIdx + marker.length);
    const name = fileName(relativePath);
    const pack = inferPack(relativePath);
    const category = inferCategory(relativePath, name);
    const { pivotX, pivotY } = inferPivot(category);
    const id = buildAssetId(pack, relativePath, name);
    items.push({
      id,
      label: buildLabel(name, relativePath),
      category,
      pack,
      url,
      pivotX,
      pivotY,
      defaultScale: inferDefaultScale(pack),
      mirrorAllowed: category !== 'shoe' && category !== 'eye',
      anchorHint: inferAnchorHint(category),
    });
  }
  return items.sort((a, b) =>
    a.pack.localeCompare(b.pack) ||
    a.category.localeCompare(b.category) ||
    a.label.localeCompare(b.label)
  );
}

export const BODY_PART_CATALOG: BodyPartDef[] = buildCatalog();

export const BODY_PART_BY_ID = new Map(BODY_PART_CATALOG.map(part => [part.id, part]));

export const BODY_PART_CATEGORIES: BodyPartCategory[] = [
  'leg',
  'arm',
  'body',
  'mouth',
  'nose',
  'eye',
  'eyebrow',
  'ear',
  'horn',
  'shoe',
  'animal',
  'other',
];

export function getBodyPartDef(assetId: string | undefined): BodyPartDef | undefined {
  if (!assetId) return undefined;
  return BODY_PART_BY_ID.get(assetId);
}
