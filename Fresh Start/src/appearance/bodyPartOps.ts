/**
 * Body-part attachment ops for the creature editor (A2 deepen).
 * Design-space only — never touches Rapier.
 */
import type { CreatureDesign } from '../creature/types';
import { getBodyPart } from './bodyPartCatalog';
import {
  emptyAppearance,
  type AppearanceRig,
  type BodyPartAttachment,
} from './types';

export type BodyPartHandle = 'nw' | 'ne' | 'sw' | 'se';

export interface BodyPartFootprint {
  cx: number;
  cy: number;
  /** Half-extent in design units (square sprite). */
  half: number;
  angle: number;
}

function ensureAppearance(design: CreatureDesign): AppearanceRig {
  return design.appearance ?? emptyAppearance();
}

function withParts(
  design: CreatureDesign,
  bodyParts: BodyPartAttachment[],
): CreatureDesign {
  const appearance = ensureAppearance(design);
  return {
    ...design,
    name: design.name || 'Custom',
    appearance: { ...appearance, bodyParts },
  };
}

/** Resolve world/design position + draw angle for a body part. */
export function resolveBodyPartPose(
  design: CreatureDesign,
  part: BodyPartAttachment,
): { x: number; y: number; angle: number } | null {
  const rot = part.rotation ?? 0;
  if (part.boneId !== undefined) {
    const bone = design.bones.find((b) => b.id === part.boneId);
    if (!bone) return null;
    const a = design.joints.find((j) => j.id === bone.startJointId);
    const b = design.joints.find((j) => j.id === bone.endJointId);
    if (!a || !b) return null;
    const t = Math.min(1, Math.max(0, part.along ?? 0.5));
    const bx = a.x + (b.x - a.x) * t;
    const by = a.y + (b.y - a.y) * t;
    const angle = Math.atan2(b.y - a.y, b.x - a.x) + rot;
    return {
      x: bx + (part.offsetX ?? 0),
      y: by + (part.offsetY ?? 0),
      angle,
    };
  }
  if (part.jointId !== undefined) {
    const joint = design.joints.find((j) => j.id === part.jointId);
    if (!joint) return null;
    return {
      x: joint.x + (part.offsetX ?? 0),
      y: joint.y + (part.offsetY ?? 0),
      angle: rot,
    };
  }
  return null;
}

/** Design-space footprint for hit-test / handles (axis-aligned box around sprite). */
export function bodyPartFootprint(
  design: CreatureDesign,
  part: BodyPartAttachment,
): BodyPartFootprint | null {
  const pose = resolveBodyPartPose(design, part);
  const def = getBodyPart(part.assetId);
  if (!pose || !def) return null;
  const scale = part.scale ?? def.defaultScale;
  // scale is world-unit side length (matches drawBodyPartSprite).
  const half = Math.max(0.08, scale * 0.5);
  return { cx: pose.x, cy: pose.y, half, angle: pose.angle };
}

export function addBodyPartToBone(
  design: CreatureDesign,
  boneId: number,
  assetId: string,
): CreatureDesign {
  if (!design.bones.some((b) => b.id === boneId)) return design;
  const def = getBodyPart(assetId);
  const part: BodyPartAttachment = {
    assetId,
    boneId,
    along: 0.5,
    scale: def?.defaultScale ?? 0.28,
    rotation: 0,
  };
  const appearance = ensureAppearance(design);
  return withParts(design, [...appearance.bodyParts, part]);
}

export function addBodyPartToJoint(
  design: CreatureDesign,
  jointId: number,
  assetId: string,
): CreatureDesign {
  if (!design.joints.some((j) => j.id === jointId)) return design;
  const def = getBodyPart(assetId);
  const part: BodyPartAttachment = {
    assetId,
    jointId,
    scale: def?.defaultScale ?? 0.28,
    rotation: 0,
  };
  const appearance = ensureAppearance(design);
  return withParts(design, [...appearance.bodyParts, part]);
}

export function updateBodyPart(
  design: CreatureDesign,
  index: number,
  patch: Partial<BodyPartAttachment>,
): CreatureDesign {
  const appearance = ensureAppearance(design);
  if (index < 0 || index >= appearance.bodyParts.length) return design;
  const bodyParts = appearance.bodyParts.map((p, i) =>
    i === index ? { ...p, ...patch } : p,
  );
  return withParts(design, bodyParts);
}

export function removeBodyPart(
  design: CreatureDesign,
  index: number,
): CreatureDesign {
  const appearance = ensureAppearance(design);
  if (index < 0 || index >= appearance.bodyParts.length) return design;
  return withParts(
    design,
    appearance.bodyParts.filter((_, i) => i !== index),
  );
}

/** Drag body: update along (bone) or offset from joint; lateral via offsetX/Y. */
export function moveBodyPart(
  design: CreatureDesign,
  index: number,
  worldX: number,
  worldY: number,
): CreatureDesign {
  const appearance = ensureAppearance(design);
  const part = appearance.bodyParts[index];
  if (!part) return design;

  if (part.boneId !== undefined) {
    const bone = design.bones.find((b) => b.id === part.boneId);
    if (!bone) return design;
    const a = design.joints.find((j) => j.id === bone.startJointId);
    const b = design.joints.find((j) => j.id === bone.endJointId);
    if (!a || !b) return design;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let along = 0.5;
    let ox = 0;
    let oy = 0;
    if (len2 > 1e-8) {
      const len = Math.sqrt(len2);
      const ux = dx / len;
      const uy = dy / len;
      const rx = worldX - a.x;
      const ry = worldY - a.y;
      along = Math.min(1, Math.max(0, (rx * ux + ry * uy) / len));
      const px = a.x + dx * along;
      const py = a.y + dy * along;
      ox = worldX - px;
      oy = worldY - py;
    } else {
      ox = worldX - a.x;
      oy = worldY - a.y;
    }
    return updateBodyPart(design, index, { along, offsetX: ox, offsetY: oy });
  }

  if (part.jointId !== undefined) {
    const joint = design.joints.find((j) => j.id === part.jointId);
    if (!joint) return design;
    return updateBodyPart(design, index, {
      offsetX: worldX - joint.x,
      offsetY: worldY - joint.y,
    });
  }
  return design;
}

/** Corner-handle resize — distance from center maps to scale. */
export function resizeBodyPart(
  design: CreatureDesign,
  index: number,
  worldX: number,
  worldY: number,
): CreatureDesign {
  const appearance = ensureAppearance(design);
  const part = appearance.bodyParts[index];
  if (!part) return design;
  const pose = resolveBodyPartPose(design, part);
  if (!pose) return design;
  const dist = Math.hypot(worldX - pose.x, worldY - pose.y);
  // half = scale * 0.5 → scale = 2 * half; corner is at ~half*√2 from center
  const scale = Math.min(2.5, Math.max(0.12, (dist / Math.SQRT2) * 2));
  return updateBodyPart(design, index, { scale });
}

export function hitTestBodyPart(
  design: CreatureDesign,
  wx: number,
  wy: number,
): number | null {
  const appearance = design.appearance;
  if (!appearance?.bodyParts.length) return null;
  // Top-most last
  for (let i = appearance.bodyParts.length - 1; i >= 0; i--) {
    const fp = bodyPartFootprint(design, appearance.bodyParts[i]);
    if (!fp) continue;
    if (
      Math.abs(wx - fp.cx) <= fp.half &&
      Math.abs(wy - fp.cy) <= fp.half
    ) {
      return i;
    }
  }
  return null;
}

export function hitBodyPartHandle(
  design: CreatureDesign,
  index: number,
  wx: number,
  wy: number,
  hitR = 0.18,
): BodyPartHandle | null {
  const appearance = design.appearance;
  const part = appearance?.bodyParts[index];
  if (!part) return null;
  const fp = bodyPartFootprint(design, part);
  if (!fp) return null;
  const corners: { id: BodyPartHandle; x: number; y: number }[] = [
    { id: 'nw', x: fp.cx - fp.half, y: fp.cy + fp.half },
    { id: 'ne', x: fp.cx + fp.half, y: fp.cy + fp.half },
    { id: 'sw', x: fp.cx - fp.half, y: fp.cy - fp.half },
    { id: 'se', x: fp.cx + fp.half, y: fp.cy - fp.half },
  ];
  for (const c of corners) {
    if (Math.hypot(wx - c.x, wy - c.y) <= hitR) return c.id;
  }
  return null;
}

export function bodyPartHandles(
  design: CreatureDesign,
  index: number,
): { id: BodyPartHandle; x: number; y: number }[] {
  const appearance = design.appearance;
  const part = appearance?.bodyParts[index];
  if (!part) return [];
  const fp = bodyPartFootprint(design, part);
  if (!fp) return [];
  return [
    { id: 'nw', x: fp.cx - fp.half, y: fp.cy + fp.half },
    { id: 'ne', x: fp.cx + fp.half, y: fp.cy + fp.half },
    { id: 'sw', x: fp.cx - fp.half, y: fp.cy - fp.half },
    { id: 'se', x: fp.cx + fp.half, y: fp.cy - fp.half },
  ];
}
