import { AppearanceRig } from './creaturePackages';
import { creatureDrawPx } from './creatureScale';
import {
  createGooglyEyePairPrimitive,
  drawGooglyEyePair,
} from './googlyEyes';
import { drawBodyPart } from './bodyPartRender';
import { preloadAllBodyPartImages } from './bodyPartImages';
export {
  type BiologicalPreset,
  type AppearanceSkeleton,
  sanitizeAppearanceRig,
  createBiologicalPreset,
  createEmptyAppearanceRig,
  deformRigPoint,
  pointForPart,
} from './appearanceRig';

export { createGooglyEyePairPrimitive, createGooglyEyePairPrimitive as createGooglyEyePrimitive };
export { createBodyPartPrimitive } from './bodyPartRender';

import {
  type AppearanceSkeleton,
  pointForPart,
  sanitizeAppearanceRig,
} from './appearanceRig';

let bodyPartAssetsInitialized = false;

/** Warm PNG cache for studio / arena rendering (browser only). */
export function initBodyPartAssets(): void {
  if (bodyPartAssetsInitialized || typeof window === 'undefined') return;
  bodyPartAssetsInitialized = true;
  preloadAllBodyPartImages();
}

export function drawAppearance(
  ctx: CanvasRenderingContext2D,
  creature: AppearanceSkeleton,
  rawRig: AppearanceRig | undefined,
  layer: 'behind' | 'front',
  opacity = 1
) {
  if (!rawRig) return;
  const rig = sanitizeAppearanceRig(rawRig);
  const parts = rig.primitives.filter(part => part.layer === layer).sort((a, b) => a.z - b.z);
  for (const part of parts) {
    ctx.save();
    ctx.globalAlpha = opacity * part.opacity;
    ctx.fillStyle = part.fill;
    ctx.strokeStyle = part.stroke;
    ctx.lineCap = 'round';
    if (part.kind === 'capsule' && part.anchorMuscle !== undefined) {
      const muscle = creature.muscles[part.anchorMuscle];
      const a = muscle && creature.nodes[muscle.nodeA];
      const b = muscle && creature.nodes[muscle.nodeB];
      if (a && b) {
        const width = Math.abs(part.points[1]?.y ?? 0);
        ctx.lineWidth = width > 0 ? width : Math.max(creatureDrawPx(7), Math.min(a.radius, b.radius) * 1.35);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = part.fill;
        ctx.stroke();
        ctx.lineWidth = Math.max(creatureDrawPx(1.5), Math.min(creatureDrawPx(3), ctx.lineWidth * 0.12));
        ctx.strokeStyle = part.stroke;
        ctx.stroke();
      }
    } else if (part.kind === 'ellipse') {
      const centerPoint = part.points[0] ?? { x: 0, y: 0 };
      const sizePoint = part.points[1] ?? { x: 10, y: 8 };
      const center = pointForPart(part, centerPoint, creature);
      const radiusX = Math.max(creatureDrawPx(2), Math.abs(sizePoint.x));
      const radiusY = Math.max(creatureDrawPx(2), Math.abs(sizePoint.y));
      let rotation = 0;
      if (part.anchorMuscle !== undefined) {
        const muscle = creature.muscles[part.anchorMuscle];
        const a = muscle && creature.nodes[muscle.nodeA];
        const b = muscle && creature.nodes[muscle.nodeB];
        if (a && b) rotation = Math.atan2(b.y - a.y, b.x - a.x);
      }
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, radiusX, radiusY, rotation, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = creatureDrawPx(2);
      ctx.stroke();
    } else if (part.kind === 'eye' && part.anchorNode !== undefined) {
      const anchor = creature.nodes[part.anchorNode];
      if (anchor) {
        const px = anchor.x + (part.points[0]?.x ?? 0) * anchor.radius;
        const py = anchor.y + (part.points[0]?.y ?? 0) * anchor.radius;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(creatureDrawPx(3), anchor.radius * 0.38), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + anchor.radius * 0.12, py, Math.max(creatureDrawPx(1.5), anchor.radius * 0.13), 0, Math.PI * 2);
        ctx.fillStyle = '#111827';
        ctx.fill();
      }
    } else if (part.kind === 'googlyEye' && part.anchorNode !== undefined) {
      const anchor = creature.nodes[part.anchorNode];
      if (anchor) {
        drawGooglyEyePair(ctx, part, anchor, creature.id ?? 'studio');
      }
    } else if (part.kind === 'bodyPart' && part.assetId) {
      drawBodyPart(ctx, part, creature, opacity);
    } else if (part.points.length > 1) {
      const points = part.points.map(point => pointForPart(part, point, creature));
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      if (part.kind !== 'stroke' && points.length >= 3) {
        ctx.closePath();
        ctx.fill();
      }
      ctx.lineWidth = creatureDrawPx(2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
