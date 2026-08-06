import { nextDriveGroupId, normalizeDriveGroup } from '../brain/driveGroups';
import type { BoneDef, CreatureDesign, JointDef, MuscleDef } from '../creature/types';
import { isAeroType } from './aeroValidation';

/** Move a joint; bones/muscles resize from joint endpoints (no stored lengths). */
export function moveJoint(
  design: CreatureDesign,
  jointId: number,
  x: number,
  y: number,
): CreatureDesign {
  return {
    ...design,
    name: 'Custom',
    joints: design.joints.map((j) => (j.id === jointId ? { ...j, x, y } : j)),
  };
}

export function updateJoint(
  design: CreatureDesign,
  jointId: number,
  patch: Partial<Omit<JointDef, 'id'>>,
): CreatureDesign {
  return {
    ...design,
    name: 'Custom',
    joints: design.joints.map((j) => {
      if (j.id !== jointId) return j;
      const next = { ...j, ...patch };
      if (patch.isFoot === false) delete next.isFoot;
      if (patch.isHead === false) delete next.isHead;
      if (patch.isWheel === false) {
        delete next.isWheel;
        delete next.motorStrength;
      }
      return next;
    }),
  };
}

export function updateBone(
  design: CreatureDesign,
  boneId: number,
  patch: Partial<Omit<BoneDef, 'id' | 'startJointId' | 'endJointId'>>,
): CreatureDesign {
  return {
    ...design,
    name: 'Custom',
    bones: design.bones.map((b) => {
      if (b.id !== boneId) return b;
      const next = { ...b, ...patch };
      if (patch.aeroArea !== undefined && patch.aeroArea <= 0) {
        delete next.aeroArea;
        delete next.aeroType;
      } else if (
        patch.aeroArea !== undefined &&
        patch.aeroArea > 0 &&
        next.aeroType === undefined
      ) {
        next.aeroType = 'glider';
      }
      if ('aeroType' in patch) {
        if (patch.aeroType === undefined || !isAeroType(patch.aeroType)) {
          delete next.aeroType;
        } else {
          next.aeroType = patch.aeroType;
        }
      }
      return next;
    }),
  };
}

export function updateMuscle(
  design: CreatureDesign,
  muscleId: number,
  patch: Partial<Omit<MuscleDef, 'id' | 'startBoneId' | 'endBoneId'>>,
): CreatureDesign {
  return {
    ...design,
    name: 'Custom',
    muscles: design.muscles.map((m) => {
      if (m.id !== muscleId) return m;
      const next = { ...m, ...patch };
      if ('driveGroup' in patch) {
        const g = normalizeDriveGroup(patch.driveGroup);
        if (g === undefined) delete next.driveGroup;
        else next.driveGroup = g;
      }
      return next;
    }),
  };
}

/** Assign selected muscles to a shared drive group (new id if none given). */
export function assignDriveGroup(
  design: CreatureDesign,
  muscleIds: number[],
  groupId?: number,
): CreatureDesign {
  if (muscleIds.length === 0) return design;
  const id = groupId ?? nextDriveGroupId(design.muscles);
  const set = new Set(muscleIds);
  return {
    ...design,
    name: 'Custom',
    muscles: design.muscles.map((m) =>
      set.has(m.id) ? { ...m, driveGroup: id } : m,
    ),
  };
}

export function clearDriveGroup(
  design: CreatureDesign,
  muscleIds: number[],
): CreatureDesign {
  const set = new Set(muscleIds);
  return {
    ...design,
    name: 'Custom',
    muscles: design.muscles.map((m) => {
      if (!set.has(m.id) || m.driveGroup === undefined) return m;
      const next = { ...m };
      delete next.driveGroup;
      return next;
    }),
  };
}

/** Remove a joint and any bones/muscles that depended on it. */
export function deleteJoint(design: CreatureDesign, jointId: number): CreatureDesign {
  const removedBoneIds = new Set(
    design.bones
      .filter((b) => b.startJointId === jointId || b.endJointId === jointId)
      .map((b) => b.id),
  );
  const appearance = design.appearance
    ? {
        ...design.appearance,
        googlyEyes: design.appearance.googlyEyes.filter((e) => e.jointId !== jointId),
        bodyParts: design.appearance.bodyParts.filter(
          (p) =>
            p.jointId !== jointId &&
            (p.boneId === undefined || !removedBoneIds.has(p.boneId)),
        ),
      }
    : undefined;
  return {
    ...design,
    name: 'Custom',
    joints: design.joints.filter((j) => j.id !== jointId),
    bones: design.bones.filter((b) => !removedBoneIds.has(b.id)),
    muscles: design.muscles.filter(
      (m) => !removedBoneIds.has(m.startBoneId) && !removedBoneIds.has(m.endBoneId),
    ),
    appearance,
  };
}

/** Remove a bone and muscles attached to it. */
export function deleteBone(design: CreatureDesign, boneId: number): CreatureDesign {
  const appearance = design.appearance
    ? {
        ...design.appearance,
        bodyParts: design.appearance.bodyParts.filter((p) => p.boneId !== boneId),
      }
    : undefined;
  return {
    ...design,
    name: 'Custom',
    bones: design.bones.filter((b) => b.id !== boneId),
    muscles: design.muscles.filter(
      (m) => m.startBoneId !== boneId && m.endBoneId !== boneId,
    ),
    appearance,
  };
}

export function deleteMuscle(design: CreatureDesign, muscleId: number): CreatureDesign {
  return {
    ...design,
    name: 'Custom',
    muscles: design.muscles.filter((m) => m.id !== muscleId),
  };
}
