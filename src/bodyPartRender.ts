/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppearancePrimitive } from './creaturePackages';
import { getBodyPartDef } from './bodyPartCatalog';
import { getBodyPartImage } from './bodyPartImages';
import type { AppearanceSkeleton } from './appearance';

function anchorPointForPart(
  part: AppearancePrimitive,
  creature: AppearanceSkeleton
): { x: number; y: number } {
  if (part.anchorNode !== undefined) {
    const node = creature.nodes[part.anchorNode];
    if (node) return { x: node.x, y: node.y };
  }
  if (part.anchorMuscle !== undefined) {
    const muscle = creature.muscles[part.anchorMuscle];
    const a = muscle && creature.nodes[muscle.nodeA];
    const b = muscle && creature.nodes[muscle.nodeB];
    if (a && b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return { x: 0, y: 0 };
}

export type BodyPartTransform = {
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

export function bodyPartTransform(part: AppearancePrimitive): BodyPartTransform {
  const offset = part.points[0] ?? { x: 0, y: 0 };
  const scalePt = part.points[1] ?? { x: 1, y: 1 };
  const rotPt = part.points[2] ?? { x: 0, y: 0 };
  return {
    offsetX: offset.x,
    offsetY: offset.y,
    scaleX: scalePt.x || 1,
    scaleY: scalePt.y || scalePt.x || 1,
    rotation: rotPt.x || 0,
  };
}

export function createBodyPartPrimitive(
  assetId: string,
  anchorNode?: number,
  anchorMuscle?: number
): AppearancePrimitive {
  const def = getBodyPartDef(assetId);
  return {
    id: `body-part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'bodyPart',
    assetId,
    anchorNode,
    anchorMuscle,
    layer: 'front',
    z: 105,
    fill: '#ffffff',
    stroke: '#64748b',
    opacity: 1,
    mirror: false,
    points: [
      { x: 0, y: 0 },
      { x: def?.defaultScale ?? 1, y: def?.defaultScale ?? 1 },
      { x: 0, y: 0 },
    ],
  };
}

export function drawBodyPart(
  ctx: CanvasRenderingContext2D,
  part: AppearancePrimitive,
  creature: AppearanceSkeleton,
  opacity: number
): void {
  const assetId = part.assetId;
  const def = assetId ? getBodyPartDef(assetId) : undefined;
  const img = assetId ? getBodyPartImage(assetId) : undefined;
  if (!def || !img || !img.complete || img.naturalWidth <= 0) return;

  const anchor = anchorPointForPart(part, creature);
  const { offsetX, offsetY, scaleX, scaleY, rotation } = bodyPartTransform(part);
  const mirror = !!part.mirror && def.mirrorAllowed;

  ctx.save();
  ctx.globalAlpha *= opacity * part.opacity;
  ctx.translate(anchor.x + offsetX, anchor.y + offsetY);
  ctx.rotate(rotation);
  const sx = (mirror ? -1 : 1) * scaleX;
  const sy = scaleY;
  ctx.scale(sx, sy);
  ctx.drawImage(
    img,
    -def.pivotX * img.naturalWidth,
    -def.pivotY * img.naturalHeight,
    img.naturalWidth,
    img.naturalHeight
  );
  ctx.restore();
}
