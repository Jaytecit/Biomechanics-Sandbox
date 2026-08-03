/**
 * Kenney CC0 sprite body-part catalog (A2).
 * Browser/Vite: URLs from bodyPartUrls (import.meta.glob).
 * Do not import this module from Node smoke scripts that avoid Vite.
 */
import { BODY_PART_URLS } from './bodyPartUrls';
import type { BodyPartCategory, BodyPartDef, BodyPartPack } from './bodyPartTypes';

export type { BodyPartCategory, BodyPartDef, BodyPartPack } from './bodyPartTypes';

function inferPack(path: string): BodyPartPack {
  if (path.includes('kenney-animal')) return 'animal';
  if (path.includes('kenney-modular')) return 'modular';
  if (path.includes('kenney-monster')) return 'monster';
  return 'other';
}

function inferCategory(path: string, file: string): BodyPartCategory {
  const p = path.toLowerCase();
  const f = file.toLowerCase();
  if (p.includes('/eyes/') || f.includes('eye')) return 'eye';
  if (p.includes('/mouth/') || f.includes('mouth')) return 'mouth';
  if (p.includes('/nose/') || f.includes('nose')) return 'nose';
  if (p.includes('/shoes') || f.includes('shoe')) return 'shoe';
  if (f.startsWith('leg_') || f.includes('leg')) return 'leg';
  if (f.startsWith('arm_') || f.includes('arm')) return 'arm';
  if (f.startsWith('body_') || f.includes('body')) return 'body';
  if (p.includes('/face/')) return 'face';
  return 'other';
}

function buildCatalog(modules: Record<string, string>): BodyPartDef[] {
  const out: BodyPartDef[] = [];
  for (const [path, url] of Object.entries(modules)) {
    if (path.includes('/licenses/')) continue;
    const file = path.split('/').pop() ?? path;
    const base = file.replace(/\.png$/i, '');
    const pack = inferPack(path);
    const category = inferCategory(path, file);
    out.push({
      id: `${pack}/${base}`.toLowerCase().replace(/\s+/g, '_'),
      label: base.replace(/[_-]+/g, ' '),
      category,
      pack,
      url,
      pivotX: 0.5,
      pivotY: 0.5,
      defaultScale: category === 'eye' ? 0.35 : 0.55,
      mirrorAllowed: true,
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export const BODY_PART_CATALOG: BodyPartDef[] = buildCatalog(BODY_PART_URLS);

const byId = new Map(BODY_PART_CATALOG.map((d) => [d.id, d]));

export function getBodyPart(id: string): BodyPartDef | undefined {
  return byId.get(id);
}

export function bodyPartsByCategory(category: BodyPartCategory): BodyPartDef[] {
  return BODY_PART_CATALOG.filter((d) => d.category === category);
}

const imageCache = new Map<string, HTMLImageElement>();

export function getBodyPartImage(assetId: string): HTMLImageElement | null {
  const def = byId.get(assetId);
  if (!def) return null;
  let img = imageCache.get(assetId);
  if (img) return img.complete ? img : null;
  img = new Image();
  img.src = def.url;
  imageCache.set(assetId, img);
  return img.complete ? img : null;
}

export function preloadBodyPartImages(ids?: string[]): Promise<void> {
  const list = ids ?? BODY_PART_CATALOG.map((d) => d.id);
  return Promise.all(
    list.map(
      (id) =>
        new Promise<void>((resolve) => {
          const def = byId.get(id);
          if (!def) {
            resolve();
            return;
          }
          const existing = imageCache.get(id);
          if (existing?.complete) {
            resolve();
            return;
          }
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = def.url;
          imageCache.set(id, img);
        }),
    ),
  ).then(() => undefined);
}
