import { AppearancePrimitive, AppearanceRig } from './creaturePackages';
import {
  createGooglyEyePairPrimitive,
  drawGooglyEyePair,
} from './googlyEyes';
import { drawBodyPart } from './bodyPartRender';
import { preloadAllBodyPartImages } from './bodyPartImages';
import { CreatureBlueprint } from './types';

export { createGooglyEyePairPrimitive, createGooglyEyePairPrimitive as createGooglyEyePrimitive };
export { createBodyPartPrimitive } from './bodyPartRender';

preloadAllBodyPartImages();

export type BiologicalPreset = 'leaf' | 'fox' | 'ocean' | 'plum';

export interface AppearanceSkeleton {
  nodes: Array<{
    x: number;
    y: number;
    radius: number;
    id?: number;
    oldX?: number;
    oldY?: number;
  }>;
  muscles: Array<{ nodeA: number; nodeB: number }>;
  /** Optional stable key for per-creature cosmetic sim state (arena creatures). */
  id?: string;
}

export function sanitizeAppearanceRig(value: unknown): AppearanceRig {
  const rig = value as AppearanceRig;
  const allowedKinds = new Set([
    'ellipse',
    'capsule',
    'polygon',
    'stroke',
    'eye',
    'googlyEye',
    'bodyPart',
    'fin',
    'ear',
    'tail',
    'patch',
    'rigidPlate',
  ]);
  const primitives = Array.isArray(rig?.primitives)
    ? rig.primitives.filter(part =>
        part && typeof part.id === 'string' && Array.isArray(part.points)
        && (part.layer === 'behind' || part.layer === 'front')
        && (!part.kind || allowedKinds.has(part.kind))
      ).map(part => ({
        ...part,
        z: Number.isFinite(part.z) ? part.z : 0,
        opacity: Math.max(0, Math.min(1, Number.isFinite(part.opacity) ? part.opacity : 1)),
        assetId: typeof part.assetId === 'string' ? part.assetId : undefined,
      }))
    : [];
  return { version: 1, hideSkeleton: !!rig?.hideSkeleton, primitives };
}

export function createBiologicalPreset(
  blueprint: CreatureBlueprint,
  fill = '#84cc16',
  accent = '#365314',
  preset: BiologicalPreset = 'leaf'
): AppearanceRig {
  const primitives: AppearancePrimitive[] = blueprint.muscles.map((muscle, index) => {
    const a = blueprint.nodes.find(node => node.id === muscle.nodeA);
    const b = blueprint.nodes.find(node => node.id === muscle.nodeB);
    const width = Math.max(12, Math.min(a?.radius ?? 10, b?.radius ?? 10) * 1.7);
    return {
      id: `limb-${muscle.id}`,
      kind: 'capsule',
      anchorMuscle: index,
      layer: 'behind',
      z: index,
      fill,
      stroke: accent,
      opacity: 0.94,
      points: [{ x: 0, y: 0 }, { x: 1, y: width }],
    };
  });
  primitives.push(...blueprint.nodes.map((node, index): AppearancePrimitive => ({
    id: `joint-skin-${node.id}`,
    kind: 'ellipse',
    anchorNode: index,
    layer: 'behind',
    z: 20 + index,
    fill,
    stroke: accent,
    opacity: 0.96,
    points: [
      { x: 0, y: 0 },
      { x: Math.max(11, node.radius * 1.25), y: Math.max(10, node.radius * 1.15) },
    ],
  })));
  const muscleCount = blueprint.muscles.length;
  const firstMuscle = 0;
  const middleMuscle = Math.max(0, Math.floor((muscleCount - 1) / 2));
  const lastMuscle = Math.max(0, muscleCount - 1);
  const point = (muscle: number, x: number, y: number) => ({
    x,
    y,
    weights: [{ muscle, weight: 1 }],
  });

  if (muscleCount > 0 && preset === 'leaf') {
    primitives.push({
      id: 'leaf-back',
      kind: 'fin',
      anchorMuscle: middleMuscle,
      layer: 'behind',
      z: 30,
      fill: '#bef264',
      stroke: accent,
      opacity: 0.9,
      points: [
        point(middleMuscle, 0.18, 0),
        point(middleMuscle, 0.5, -18),
        point(middleMuscle, 0.82, 0),
        point(middleMuscle, 0.5, 10),
      ],
    });
  } else if (muscleCount > 0 && preset === 'fox') {
    primitives.push(
      {
        id: 'fox-ear-one',
        kind: 'ear',
        anchorMuscle: firstMuscle,
        layer: 'front',
        z: 90,
        fill: '#fb923c',
        stroke: accent,
        opacity: 1,
        points: [
          point(firstMuscle, 0.02, -2),
          point(firstMuscle, 0.14, -22),
          point(firstMuscle, 0.26, -2),
        ],
      },
      {
        id: 'fox-ear-two',
        kind: 'ear',
        anchorMuscle: firstMuscle,
        layer: 'front',
        z: 91,
        fill: '#fdba74',
        stroke: accent,
        opacity: 1,
        points: [
          point(firstMuscle, 0.2, -1),
          point(firstMuscle, 0.34, -18),
          point(firstMuscle, 0.43, 0),
        ],
      },
      {
        id: 'fox-tail',
        kind: 'tail',
        anchorMuscle: lastMuscle,
        layer: 'behind',
        z: 40,
        fill: '#fdba74',
        stroke: accent,
        opacity: 0.95,
        points: [
          point(lastMuscle, 0.78, -5),
          point(lastMuscle, 1.1, -15),
          point(lastMuscle, 1.48, -20),
          point(lastMuscle, 1.35, -4),
          point(lastMuscle, 1.05, 3),
          point(lastMuscle, 0.8, 5),
        ],
      }
    );
  } else if (muscleCount > 0 && preset === 'ocean') {
    primitives.push(
      {
        id: 'ocean-fin',
        kind: 'fin',
        anchorMuscle: middleMuscle,
        layer: 'front',
        z: 70,
        fill: '#67e8f9',
        stroke: accent,
        opacity: 0.9,
        points: [
          point(middleMuscle, 0.22, 0),
          point(middleMuscle, 0.52, -23),
          point(middleMuscle, 0.76, 0),
        ],
      },
      {
        id: 'ocean-tail',
        kind: 'fin',
        anchorMuscle: lastMuscle,
        layer: 'behind',
        z: 35,
        fill: '#22d3ee',
        stroke: accent,
        opacity: 0.9,
        points: [
          point(lastMuscle, 0.82, 0),
          point(lastMuscle, 1.22, -18),
          point(lastMuscle, 1.1, 0),
          point(lastMuscle, 1.22, 18),
        ],
      }
    );
  } else if (muscleCount > 0 && preset === 'plum') {
    primitives.push(
      {
        id: 'plum-crest',
        kind: 'ear',
        anchorMuscle: firstMuscle,
        layer: 'front',
        z: 90,
        fill: '#e9d5ff',
        stroke: accent,
        opacity: 0.95,
        points: [
          point(firstMuscle, 0.05, 0),
          point(firstMuscle, 0.18, -20),
          point(firstMuscle, 0.3, -3),
          point(firstMuscle, 0.42, -17),
          point(firstMuscle, 0.5, 0),
        ],
      },
      {
        id: 'plum-patch',
        kind: 'patch',
        anchorMuscle: middleMuscle,
        layer: 'front',
        z: 65,
        fill: '#f5d0fe',
        stroke: accent,
        opacity: 0.75,
        points: [
          point(middleMuscle, 0.28, -7),
          point(middleMuscle, 0.7, -7),
          point(middleMuscle, 0.7, 7),
          point(middleMuscle, 0.28, 7),
        ],
      }
    );
  }
  primitives.push({
    id: 'face-eye',
    kind: 'eye',
    anchorNode: 0,
    layer: 'front',
    z: 100,
    fill: '#ffffff',
    stroke: '#111827',
    opacity: 1,
    points: [{ x: 0.35, y: -0.2 }],
  });
  return { version: 1, hideSkeleton: false, primitives };
}

export function deformRigPoint(
  point: AppearancePrimitive['points'][number],
  creature: AppearanceSkeleton
): { x: number; y: number } {
  if (!point.weights?.length) return { x: point.x, y: point.y };
  let x = 0;
  let y = 0;
  let total = 0;
  for (const influence of point.weights) {
    const muscle = creature.muscles[influence.muscle];
    if (!muscle || influence.weight <= 0) continue;
    const a = creature.nodes[muscle.nodeA];
    const b = creature.nodes[muscle.nodeB];
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const localAlong = influence.x ?? point.x;
    const localOffset = influence.y ?? point.y;
    const localX = a.x + dx * localAlong - (dy / length) * localOffset;
    const localY = a.y + dy * localAlong + (dx / length) * localOffset;
    x += localX * influence.weight;
    y += localY * influence.weight;
    total += influence.weight;
  }
  return total > 0 ? { x: x / total, y: y / total } : { x: point.x, y: point.y };
}

export function pointForPart(
  part: AppearancePrimitive,
  point: AppearancePrimitive['points'][number],
  creature: AppearanceSkeleton
): { x: number; y: number } {
  if (point.weights?.length) return deformRigPoint(point, creature);
  if (part.anchorNode !== undefined) {
    const anchor = creature.nodes[part.anchorNode];
    if (anchor) return { x: anchor.x + point.x, y: anchor.y + point.y };
  }
  if (part.anchorMuscle !== undefined) {
    const muscle = creature.muscles[part.anchorMuscle];
    const a = muscle && creature.nodes[muscle.nodeA];
    const b = muscle && creature.nodes[muscle.nodeB];
    if (a && b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      return {
        x: a.x + dx * point.x - (dy / length) * point.y,
        y: a.y + dy * point.x + (dx / length) * point.y,
      };
    }
  }
  return { x: point.x, y: point.y };
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
        ctx.lineWidth = width > 0 ? width : Math.max(7, Math.min(a.radius, b.radius) * 1.35);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = part.fill;
        ctx.stroke();
        ctx.lineWidth = Math.max(1.5, Math.min(3, ctx.lineWidth * 0.12));
        ctx.strokeStyle = part.stroke;
        ctx.stroke();
      }
    } else if (part.kind === 'ellipse') {
      const centerPoint = part.points[0] ?? { x: 0, y: 0 };
      const sizePoint = part.points[1] ?? { x: 10, y: 8 };
      const center = pointForPart(part, centerPoint, creature);
      const radiusX = Math.max(2, Math.abs(sizePoint.x));
      const radiusY = Math.max(2, Math.abs(sizePoint.y));
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
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (part.kind === 'eye' && part.anchorNode !== undefined) {
      const anchor = creature.nodes[part.anchorNode];
      if (anchor) {
        const px = anchor.x + (part.points[0]?.x ?? 0) * anchor.radius;
        const py = anchor.y + (part.points[0]?.y ?? 0) * anchor.radius;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(3, anchor.radius * 0.38), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + anchor.radius * 0.12, py, Math.max(1.5, anchor.radius * 0.13), 0, Math.PI * 2);
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
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }
}
