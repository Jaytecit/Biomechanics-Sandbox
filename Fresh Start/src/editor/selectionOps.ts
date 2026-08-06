/**
 * C1.11 — Multi-select subgraph transforms for the creature editor.
 * Selection unit is joints; bones/muscles are included when both endpoints
 * are selected; body parts when attached to a selected joint/bone.
 */
import { cloneAppearance, emptyAppearance, type AppearanceRig } from '../appearance/types';
import {
  cloneDesign,
  nextId,
  type BoneDef,
  type CreatureDesign,
  type JointDef,
  type MuscleDef,
} from '../creature/types';
import { EDITOR_GRID } from './grid';
import { deleteJoint } from './editOps';

export const SELECTION_MIN_JOINT_Y = 0.15;
export const DUPLICATE_OFFSET = EDITOR_GRID;

export interface SelectionFootprint {
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  /** Radians; always 0 for AABB footprint (rotation applied to joints). */
  rot: number;
}

export type SelectionHandleId = 'nw' | 'ne' | 'sw' | 'se' | 'rotate';

export function jointsInRect(
  design: CreatureDesign,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number[] {
  const minX = Math.min(x0, x1);
  const maxX = Math.max(x0, x1);
  const minY = Math.min(y0, y1);
  const maxY = Math.max(y0, y1);
  return design.joints
    .filter((j) => j.x >= minX && j.x <= maxX && j.y >= minY && j.y <= maxY)
    .map((j) => j.id);
}

export function selectionCentroid(
  design: CreatureDesign,
  jointIds: number[],
): { x: number; y: number } | null {
  const set = new Set(jointIds);
  const joints = design.joints.filter((j) => set.has(j.id));
  if (joints.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const j of joints) {
    sx += j.x;
    sy += j.y;
  }
  return { x: sx / joints.length, y: sy / joints.length };
}

export function selectionFootprint(
  design: CreatureDesign,
  jointIds: number[],
): SelectionFootprint | null {
  const set = new Set(jointIds);
  const joints = design.joints.filter((j) => set.has(j.id));
  if (joints.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const j of joints) {
    minX = Math.min(minX, j.x);
    maxX = Math.max(maxX, j.x);
    minY = Math.min(minY, j.y);
    maxY = Math.max(maxY, j.y);
  }
  const pad = 0.35;
  const hw = Math.max(0.25, (maxX - minX) / 2 + pad);
  const hh = Math.max(0.25, (maxY - minY) / 2 + pad);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    hw,
    hh,
    rot: 0,
  };
}

export function containedBones(design: CreatureDesign, jointIds: number[]): BoneDef[] {
  const set = new Set(jointIds);
  return design.bones.filter(
    (b) => set.has(b.startJointId) && set.has(b.endJointId),
  );
}

export function containedMuscles(
  design: CreatureDesign,
  jointIds: number[],
): MuscleDef[] {
  const boneIds = new Set(containedBones(design, jointIds).map((b) => b.id));
  return design.muscles.filter(
    (m) => boneIds.has(m.startBoneId) && boneIds.has(m.endBoneId),
  );
}

export function attachedBodyPartIndices(
  design: CreatureDesign,
  jointIds: number[],
): number[] {
  const joints = new Set(jointIds);
  const bones = new Set(containedBones(design, jointIds).map((b) => b.id));
  const parts = design.appearance?.bodyParts ?? [];
  const out: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.boneId !== undefined) {
      if (bones.has(p.boneId)) out.push(i);
    } else if (p.jointId !== undefined && joints.has(p.jointId)) {
      out.push(i);
    }
  }
  return out;
}

export function selectionSummary(
  design: CreatureDesign,
  jointIds: number[],
): { joints: number; bones: number; muscles: number; bodyParts: number } {
  return {
    joints: jointIds.length,
    bones: containedBones(design, jointIds).length,
    muscles: containedMuscles(design, jointIds).length,
    bodyParts: attachedBodyPartIndices(design, jointIds).length,
  };
}

function clampJointY(y: number): number {
  return Math.max(SELECTION_MIN_JOINT_Y, y);
}

export function pointInFootprint(
  wx: number,
  wy: number,
  fp: SelectionFootprint,
  pad = 0,
): boolean {
  return (
    Math.abs(wx - fp.cx) <= fp.hw + pad && Math.abs(wy - fp.cy) <= fp.hh + pad
  );
}

export function handleWorldPos(
  fp: SelectionFootprint,
  id: SelectionHandleId,
): { x: number; y: number } {
  switch (id) {
    case 'nw':
      return { x: fp.cx - fp.hw, y: fp.cy + fp.hh };
    case 'ne':
      return { x: fp.cx + fp.hw, y: fp.cy + fp.hh };
    case 'sw':
      return { x: fp.cx - fp.hw, y: fp.cy - fp.hh };
    case 'se':
      return { x: fp.cx + fp.hw, y: fp.cy - fp.hh };
    case 'rotate':
      return {
        x: fp.cx,
        y: fp.cy + fp.hh + Math.max(0.35, fp.hh * 0.25),
      };
  }
}

export function selectionHandles(): SelectionHandleId[] {
  return ['nw', 'ne', 'sw', 'se', 'rotate'];
}

export function hitSelectionHandle(
  wx: number,
  wy: number,
  fp: SelectionFootprint,
  radius = 0.28,
): SelectionHandleId | null {
  let best: SelectionHandleId | null = null;
  let bestD = radius;
  for (const id of selectionHandles()) {
    const p = handleWorldPos(fp, id);
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export function moveSelection(
  design: CreatureDesign,
  jointIds: number[],
  dx: number,
  dy: number,
): CreatureDesign {
  if (jointIds.length === 0 || (dx === 0 && dy === 0)) return design;
  const set = new Set(jointIds);
  return {
    ...design,
    name: 'Custom',
    joints: design.joints.map((j) =>
      set.has(j.id) ? { ...j, x: j.x + dx, y: clampJointY(j.y + dy) } : j,
    ),
  };
}

/**
 * Uniform scale about centroid. `factor` is absolute scale relative to drag-start
 * geometry when caller passes the ratio of current handle distance to origin.
 */
export function scaleSelection(
  design: CreatureDesign,
  jointIds: number[],
  factor: number,
  originCentroid?: { x: number; y: number },
): CreatureDesign {
  if (jointIds.length === 0) return design;
  const f = Number.isFinite(factor) ? Math.min(8, Math.max(0.05, factor)) : 1;
  if (Math.abs(f - 1) < 1e-9) return design;
  const c = originCentroid ?? selectionCentroid(design, jointIds);
  if (!c) return design;
  const set = new Set(jointIds);
  const partIdx = new Set(attachedBodyPartIndices(design, jointIds));
  const joints = design.joints.map((j) => {
    if (!set.has(j.id)) return j;
    return {
      ...j,
      x: c.x + (j.x - c.x) * f,
      y: clampJointY(c.y + (j.y - c.y) * f),
    };
  });
  let appearance = design.appearance;
  if (appearance && partIdx.size > 0) {
    appearance = {
      ...appearance,
      bodyParts: appearance.bodyParts.map((p, i) => {
        if (!partIdx.has(i)) return p;
        return {
          ...p,
          offsetX: (p.offsetX ?? 0) * f,
          offsetY: (p.offsetY ?? 0) * f,
          scale: Math.min(2.5, Math.max(0.12, (p.scale ?? 0.28) * f)),
        };
      }),
    };
  }
  return { ...design, name: 'Custom', joints, appearance };
}

/** Rotate selected joints about centroid by `deltaRadians`. */
export function rotateSelection(
  design: CreatureDesign,
  jointIds: number[],
  deltaRadians: number,
  originCentroid?: { x: number; y: number },
): CreatureDesign {
  if (jointIds.length === 0 || Math.abs(deltaRadians) < 1e-12) return design;
  const c = originCentroid ?? selectionCentroid(design, jointIds);
  if (!c) return design;
  const set = new Set(jointIds);
  const cos = Math.cos(deltaRadians);
  const sin = Math.sin(deltaRadians);
  const partIdx = new Set(attachedBodyPartIndices(design, jointIds));
  const joints = design.joints.map((j) => {
    if (!set.has(j.id)) return j;
    const lx = j.x - c.x;
    const ly = j.y - c.y;
    return {
      ...j,
      x: c.x + lx * cos - ly * sin,
      y: clampJointY(c.y + lx * sin + ly * cos),
    };
  });
  let appearance = design.appearance;
  if (appearance && partIdx.size > 0) {
    appearance = {
      ...appearance,
      bodyParts: appearance.bodyParts.map((p, i) => {
        if (!partIdx.has(i)) return p;
        const ox = p.offsetX ?? 0;
        const oy = p.offsetY ?? 0;
        return {
          ...p,
          offsetX: ox * cos - oy * sin,
          offsetY: ox * sin + oy * cos,
          rotation: (p.rotation ?? 0) + deltaRadians,
        };
      }),
    };
  }
  return { ...design, name: 'Custom', joints, appearance };
}

function allocateIds(
  existing: { id: number }[],
  count: number,
): number[] {
  let next = nextId(existing);
  const ids: number[] = [];
  for (let i = 0; i < count; i++) ids.push(next++);
  return ids;
}

function appendRemappedAppearance(
  appearance: AppearanceRig | undefined,
  jointMap: Map<number, number>,
  boneMap: Map<number, number>,
  jointIds: number[],
  flipX: boolean,
): AppearanceRig | undefined {
  if (!appearance) return undefined;
  const jointSet = new Set(jointIds);
  const boneSet = new Set(boneMap.keys());
  const next = cloneAppearance(appearance) ?? emptyAppearance();
  const eyes = (appearance.googlyEyes ?? [])
    .filter((e) => jointSet.has(e.jointId))
    .map((e) => {
      const mapped = jointMap.get(e.jointId);
      if (mapped === undefined) return null;
      return {
        ...e,
        jointId: mapped,
        offsetX:
          flipX && e.offsetX !== undefined ? -e.offsetX : e.offsetX,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e != null);
  const parts = (appearance.bodyParts ?? [])
    .filter((p) => {
      if (p.boneId !== undefined) return boneSet.has(p.boneId);
      return p.jointId !== undefined && jointSet.has(p.jointId);
    })
    .map((p) => {
      const copy = { ...p };
      if (copy.boneId !== undefined) {
        const nb = boneMap.get(copy.boneId);
        if (nb === undefined) return null;
        copy.boneId = nb;
      }
      if (copy.jointId !== undefined) {
        const nj = jointMap.get(copy.jointId);
        if (nj === undefined) return null;
        copy.jointId = nj;
      }
      if (flipX) {
        copy.mirror = !copy.mirror;
        if (copy.offsetX !== undefined) copy.offsetX = -copy.offsetX;
        if (copy.rotation !== undefined) copy.rotation = -copy.rotation;
      }
      return copy;
    })
    .filter((p): p is NonNullable<typeof p> => p != null);
  return {
    ...next,
    googlyEyes: [...(appearance.googlyEyes ?? []), ...eyes],
    bodyParts: [...(appearance.bodyParts ?? []), ...parts],
  };
}

function cloneSubgraph(
  design: CreatureDesign,
  jointIds: number[],
  mapJoint: (j: JointDef) => JointDef,
  flipAppearanceX: boolean,
): { design: CreatureDesign; newJointIds: number[] } {
  if (jointIds.length === 0) return { design, newJointIds: [] };
  const src = cloneDesign(design);
  const set = new Set(jointIds);
  const srcJoints = src.joints.filter((j) => set.has(j.id));
  if (srcJoints.length === 0) return { design, newJointIds: [] };

  const bones = containedBones(src, jointIds);
  const muscles = containedMuscles(src, jointIds);

  const newJointIds = allocateIds(src.joints, srcJoints.length);
  const jointMap = new Map<number, number>();
  srcJoints.forEach((j, i) => jointMap.set(j.id, newJointIds[i]));

  const newJoints: JointDef[] = srcJoints.map((j, i) => {
    const mapped = mapJoint(j);
    return { ...mapped, id: newJointIds[i] };
  });

  const newBoneIds = allocateIds([...src.bones], bones.length);
  const boneMap = new Map<number, number>();
  bones.forEach((b, i) => boneMap.set(b.id, newBoneIds[i]));
  const newBones: BoneDef[] = bones.map((b, i) => ({
    ...b,
    id: newBoneIds[i],
    startJointId: jointMap.get(b.startJointId)!,
    endJointId: jointMap.get(b.endJointId)!,
  }));

  const newMuscleIds = allocateIds([...src.muscles], muscles.length);
  const newMuscles: MuscleDef[] = muscles.map((m, i) => ({
    ...m,
    id: newMuscleIds[i],
    startBoneId: boneMap.get(m.startBoneId)!,
    endBoneId: boneMap.get(m.endBoneId)!,
  }));

  return {
    design: {
      ...src,
      name: 'Custom',
      joints: [...src.joints, ...newJoints],
      bones: [...src.bones, ...newBones],
      muscles: [...src.muscles, ...newMuscles],
      appearance: appendRemappedAppearance(
        src.appearance,
        jointMap,
        boneMap,
        jointIds,
        flipAppearanceX,
      ),
    },
    newJointIds,
  };
}

export function duplicateSelection(
  design: CreatureDesign,
  jointIds: number[],
  offsetX = DUPLICATE_OFFSET,
  offsetY = DUPLICATE_OFFSET,
): { design: CreatureDesign; newJointIds: number[] } {
  return cloneSubgraph(
    design,
    jointIds,
    (j) => ({
      ...j,
      x: j.x + offsetX,
      y: clampJointY(j.y + offsetY),
    }),
    false,
  );
}

/** Mirror-duplicate across selection centroid X (builds symmetric limbs). */
export function mirrorDuplicateSelection(
  design: CreatureDesign,
  jointIds: number[],
): { design: CreatureDesign; newJointIds: number[] } {
  const c = selectionCentroid(design, jointIds);
  if (!c) return { design, newJointIds: [] };
  return cloneSubgraph(
    design,
    jointIds,
    (j) => ({
      ...j,
      x: 2 * c.x - j.x,
      y: clampJointY(j.y),
    }),
    true,
  );
}

/** Cascade-delete selected joints (and dependent bones/muscles/parts). */
export function deleteSelection(
  design: CreatureDesign,
  jointIds: number[],
): CreatureDesign {
  let next = design;
  for (const id of jointIds) {
    next = deleteJoint(next, id);
  }
  return next.name === design.name && next !== design
    ? { ...next, name: 'Custom' }
    : next;
}
