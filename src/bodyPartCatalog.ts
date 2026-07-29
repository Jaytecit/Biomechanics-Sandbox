/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shipped Kenney body-part library (CC0). See src/assets/bodyParts/licenses/.
 */

import { readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export type BodyPartPack = 'monster' | 'modular';

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
  | 'other';

export type BodyPartAnchorHint = 'node' | 'muscle' | 'either';

export interface BodyPartDef {
  id: string;
  label: string;
  category: BodyPartCategory;
  pack: BodyPartPack;
  /** Bundled PNG resolved by Vite (?url) or absolute path in Node smoke tests. */
  url: string;
  pivotX: number;
  pivotY: number;
  defaultScale: number;
  mirrorAllowed: boolean;
  anchorHint: BodyPartAnchorHint;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));
const assetsRoot = join(moduleDir, 'assets', 'bodyParts');

function loadPngModulesFromFs(): Record<string, string> {
  const modules: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.toLowerCase().endsWith('.png')) continue;
      const relFromSrc = relative(moduleDir, fullPath).replace(/\\/g, '/');
      modules[`../${relFromSrc}`] = fullPath;
    }
  };
  walk(assetsRoot);
  return modules;
}

function loadPngModules(): Record<string, string> {
  if (typeof import.meta.glob === 'function') {
    return import.meta.glob<string>('../assets/bodyParts/**/*.png', {
      eager: true,
      query: '?url',
      import: 'default',
    });
  }
  return loadPngModulesFromFs();
}

const pngModules = loadPngModules();

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
    const assetsIdx = normalized.indexOf('/assets/bodyParts/');
    if (assetsIdx < 0) continue;
    const relativePath = normalized.slice(assetsIdx + '/assets/bodyParts/'.length);
    const name = fileName(relativePath);
    const pack: BodyPartPack = relativePath.startsWith('kenney-modular/') ? 'modular' : 'monster';
    const category = inferCategory(relativePath, name);
    const { pivotX, pivotY } = inferPivot(category);
    const id = `${pack}:${name}`;
    items.push({
      id,
      label: humanLabel(name),
      category,
      pack,
      url,
      pivotX,
      pivotY,
      defaultScale: pack === 'modular' ? 0.9 : 1,
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
  'other',
];

export function getBodyPartDef(assetId: string | undefined): BodyPartDef | undefined {
  if (!assetId) return undefined;
  return BODY_PART_BY_ID.get(assetId);
}
