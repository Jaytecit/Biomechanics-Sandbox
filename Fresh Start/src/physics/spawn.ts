import type { CreatureDesign } from '../creature/types';
import type { RuntimeMuscle } from '../control/muscleDrive';
import {
  ANGULAR_DAMPING,
  BONE_HALF_WIDTH,
  DEFAULT_BONE_MASS,
  DEFAULT_JOINT_MASS,
  JOINT_RADIUS,
  LINEAR_DAMPING,
  MUSCLE_MAX_FORCE,
} from './constants';
import { defaultColliderDesc, RAPIER } from './world';

export interface RuntimeJoint {
  id: number;
  body: RAPIER.RigidBody;
  radius: number;
  isFoot?: boolean;
  isHead?: boolean;
  isWheel?: boolean;
  motorStrength?: number;
}

export interface RuntimeBone {
  id: number;
  body: RAPIER.RigidBody;
  startJointId: number;
  endJointId: number;
  halfLength: number;
  halfWidth: number;
  aeroArea?: number;
}

export interface SpawnedCreature {
  joints: RuntimeJoint[];
  bones: RuntimeBone[];
  muscles: RuntimeMuscle[];
  impulseJoints: RAPIER.ImpulseJoint[];
  /**
   * Max design-space Y among marked heads (0 = upright scoring inactive).
   * Used as the intended vertical target for head height.
   */
  designedHeadY: number;
}

function jointMap(design: CreatureDesign): Map<number, { x: number; y: number; mass: number }> {
  const map = new Map<number, { x: number; y: number; mass: number }>();
  for (const j of design.joints) {
    map.set(j.id, { x: j.x, y: j.y, mass: j.mass ?? DEFAULT_JOINT_MASS });
  }
  return map;
}

export function spawnCreature(
  world: RAPIER.World,
  design: CreatureDesign,
): SpawnedCreature {
  const jdefs = jointMap(design);
  const joints: RuntimeJoint[] = [];
  const jointBodies = new Map<number, RAPIER.RigidBody>();

  let designedHeadY = 0;
  for (const j of design.joints) {
    const mass = j.mass ?? DEFAULT_JOINT_MASS;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(j.x, j.y)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING),
    );
    world.createCollider(
      defaultColliderDesc(RAPIER.ColliderDesc.ball(JOINT_RADIUS).setMass(mass)),
      body,
    );
    jointBodies.set(j.id, body);
    if (j.isHead) designedHeadY = Math.max(designedHeadY, j.y);
    joints.push({
      id: j.id,
      body,
      radius: JOINT_RADIUS,
      isFoot: j.isFoot,
      isHead: j.isHead,
      isWheel: j.isWheel,
      motorStrength: j.motorStrength,
    });
  }

  const bones: RuntimeBone[] = [];
  const boneBodies = new Map<number, RAPIER.RigidBody>();
  const impulseJoints: RAPIER.ImpulseJoint[] = [];

  for (const b of design.bones) {
    const start = jdefs.get(b.startJointId);
    const end = jdefs.get(b.endJointId);
    const startBody = jointBodies.get(b.startJointId);
    const endBody = jointBodies.get(b.endJointId);
    if (!start || !end || !startBody || !endBody) {
      throw new Error(`Bone ${b.id} references missing joints`);
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 0.01;
    const halfLength = length / 2;
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const angle = Math.atan2(dy, dx);
    const mass = b.mass ?? DEFAULT_BONE_MASS;

    // Capsule along local Y in Rapier; rotate so local Y aligns with bone axis.
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(cx, cy)
        .setRotation(angle - Math.PI / 2)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING),
    );
    world.createCollider(
      defaultColliderDesc(
        RAPIER.ColliderDesc.capsule(
          Math.max(0.01, halfLength - BONE_HALF_WIDTH),
          BONE_HALF_WIDTH,
        ).setMass(mass),
      ),
      body,
    );

    // Hinge at each end: local anchors on bone are ±halfLength along local Y.
    const boneAnchorStart = { x: 0, y: -halfLength };
    const boneAnchorEnd = { x: 0, y: halfLength };
    const jointAnchor = { x: 0, y: 0 };

    const hj1 = world.createImpulseJoint(
      RAPIER.JointData.revolute(jointAnchor, boneAnchorStart),
      startBody,
      body,
      true,
    );
    const hj2 = world.createImpulseJoint(
      RAPIER.JointData.revolute(jointAnchor, boneAnchorEnd),
      endBody,
      body,
      true,
    );
    impulseJoints.push(hj1, hj2);

    boneBodies.set(b.id, body);
    bones.push({
      id: b.id,
      body,
      startJointId: b.startJointId,
      endJointId: b.endJointId,
      halfLength,
      halfWidth: BONE_HALF_WIDTH,
      aeroArea: b.aeroArea,
    });
  }

  // Disable joint–bone and bone–bone self-collision within the creature via collision groups.
  // Group membership: joints=1, bones=2, ground=default. Filter so creature parts don't collide.
  for (const j of joints) {
    for (let i = 0; i < j.body.numColliders(); i++) {
      const c = j.body.collider(i);
      // membership = joint bit 0; filter = ground bit 2 only (no self-collide)
      c.setCollisionGroups(encodeGroups(0b0001, 0b0100));
      c.setSolverGroups(encodeGroups(0b0001, 0b0100));
    }
  }
  for (const b of bones) {
    for (let i = 0; i < b.body.numColliders(); i++) {
      const c = b.body.collider(i);
      c.setCollisionGroups(encodeGroups(0b0010, 0b0100));
      c.setSolverGroups(encodeGroups(0b0010, 0b0100));
    }
  }
  // Ground was created without groups (default 0xFFFF_FFFF) — interacts with all.

  const muscles: RuntimeMuscle[] = [];
  for (const m of design.muscles) {
    const startBone = boneBodies.get(m.startBoneId);
    const endBone = boneBodies.get(m.endBoneId);
    if (!startBone || !endBone) {
      throw new Error(`Muscle ${m.id} references missing bones`);
    }
    const a = startBone.translation();
    const b = endBone.translation();
    const restLength = Math.hypot(b.x - a.x, b.y - a.y) || 0.01;
    muscles.push({
      id: m.id,
      startBone,
      endBone,
      restLength,
      strength: m.strength ?? MUSCLE_MAX_FORCE,
      canExpand: m.canExpand !== false,
    });
  }

  return { joints, bones, muscles, impulseJoints, designedHeadY };
}

/** Rapier packs membership in low 16 bits, filter in high 16 bits. */
function encodeGroups(membership: number, filter: number): number {
  return (membership & 0xffff) | ((filter & 0xffff) << 16);
}

export function destroyCreature(world: RAPIER.World, creature: SpawnedCreature): void {
  for (const j of creature.impulseJoints) {
    world.removeImpulseJoint(j, true);
  }
  for (const b of creature.bones) {
    world.removeRigidBody(b.body);
  }
  for (const j of creature.joints) {
    world.removeRigidBody(j.body);
  }
  creature.impulseJoints.length = 0;
  creature.bones.length = 0;
  creature.joints.length = 0;
  creature.muscles.length = 0;
}
