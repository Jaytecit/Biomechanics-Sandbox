/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getBodyPartDef } from './bodyPartCatalog';

const cache = new Map<string, HTMLImageElement>();
const loading = new Map<string, Promise<HTMLImageElement>>();

export function getBodyPartImage(assetId: string): HTMLImageElement | undefined {
  return cache.get(assetId);
}

export function loadBodyPartImage(assetId: string): Promise<HTMLImageElement> {
  const cached = cache.get(assetId);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  const pending = loading.get(assetId);
  if (pending) return pending;

  const def = getBodyPartDef(assetId);
  if (!def) {
    return Promise.reject(new Error(`Unknown body part: ${assetId}`));
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      cache.set(assetId, img);
      loading.delete(assetId);
      resolve(img);
    };
    img.onerror = () => {
      loading.delete(assetId);
      reject(new Error(`Failed to load body part image: ${assetId}`));
    };
    img.src = def.url;
  });
  loading.set(assetId, promise);
  return promise;
}

/** Warm the image cache for arena / studio rendering. */
export function preloadBodyPartImages(assetIds: string[]): void {
  for (const id of assetIds) {
    loadBodyPartImage(id).catch(() => {
      // Missing assets fail silently at draw time.
    });
  }
}

export function preloadAllBodyPartImages(): void {
  import('./bodyPartCatalog').then(({ BODY_PART_CATALOG }) => {
    preloadBodyPartImages(BODY_PART_CATALOG.map(part => part.id));
  });
}
