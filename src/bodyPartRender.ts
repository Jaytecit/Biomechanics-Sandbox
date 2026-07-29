/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppearancePrimitive } from './creaturePackages';
import { getBodyPartDef } from './bodyPartCatalog';
import { getBodyPartImage } from './bodyPartImages';
import {
  resolveBodyPartPose,
  type AppearanceSkeleton,
} from './appearanceRig';

export type { BodyPartTransform, BodyPartPose } from './appearanceRig';
export { bodyPartTransform, resolveBodyPartPose, muscleBoneMetrics } from './appearanceRig';

function stretchPivot(
  def: { pivotX: number; pivotY: number; category: string },
  part: AppearancePrimitive
): { pivotX: number; pivotY: number } {
  if (!part.boneStretch) return { pivotX: def.pivotX, pivotY: def.pivotY };
  const along = part.points[0]?.x ?? 0;
  if (def.category === 'leg') {
    return along >= 0.5
      ? { pivotX: def.pivotX, pivotY: def.pivotY }
      : { pivotX: def.pivotX, pivotY: 1 - def.pivotY };
  }
  if (def.category === 'arm') {
    return along >= 0.5
      ? { pivotX: 1 - def.pivotX, pivotY: def.pivotY }
      : { pivotX: def.pivotX, pivotY: def.pivotY };
  }
  return { pivotX: def.pivotX, pivotY: def.pivotY };
}

export function createBodyPartPrimitive(
  assetId: string,
  anchorNode?: number,
  anchorMuscle?: number,
  boneLengthAtCreate?: number
): AppearancePrimitive {
  const def = getBodyPartDef(assetId);
  const onMuscle = anchorMuscle !== undefined;
  const stretchDefault = onMuscle && (def?.category === 'leg' || def?.category === 'arm');
  return {
    id: `body-part-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: 'bodyPart',
    assetId,
    anchorNode,
    anchorMuscle,
    boneAlign: onMuscle ? true : undefined,
    boneStretch: stretchDefault ? true : undefined,
    boneRestLength: stretchDefault && boneLengthAtCreate && boneLengthAtCreate > 0
      ? boneLengthAtCreate
      : undefined,
    layer: 'front',
    z: 105,
    fill: '#ffffff',
    stroke: '#64748b',
    opacity: 1,
    mirror: false,
    points: [
      { x: stretchDefault ? 0 : onMuscle ? 0.5 : 0, y: 0 },
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

  const pose = resolveBodyPartPose(part, creature, img.naturalWidth);
  if (!pose) return;

  const mirror = !!part.mirror && def.mirrorAllowed;
  const pivot = stretchPivot(def, part);

  ctx.save();
  ctx.globalAlpha *= opacity * part.opacity;
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rotation);
  const sx = (mirror ? -1 : 1) * pose.scaleX;
  const sy = pose.scaleY;
  ctx.scale(sx, sy);
  ctx.drawImage(
    img,
    -pivot.pivotX * img.naturalWidth,
    -pivot.pivotY * img.naturalHeight,
    img.naturalWidth,
    img.naturalHeight
  );
  ctx.restore();
}
