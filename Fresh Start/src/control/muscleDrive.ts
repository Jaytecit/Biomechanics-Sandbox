import type RAPIER from '@dimforge/rapier2d-compat';
import {
  MUSCLE_DAMPER,
  MUSCLE_MAX_FORCE,
  MUSCLE_SPRING,
} from '../physics/constants';

export interface RuntimeMuscle {
  id: number;
  startBone: RAPIER.RigidBody;
  endBone: RAPIER.RigidBody;
  restLength: number;
  strength: number;
  canExpand: boolean;
}

export interface MuscleVisualState {
  id: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Signed drive used this step (−1..1). */
  drive: number;
  action: 'contract' | 'expand' | 'idle';
}

/** Optional scales for disco puppet modes; omit for evolve/edit defaults. */
export interface MuscleForceOptions {
  springMult?: number;
  damperMult?: number;
  maxForceMult?: number;
  /**
   * When > 0, effective rest length = rest * (1 - drive * restLengthDrive).
   * Positive drive (contract) shortens the string.
   */
  restLengthDrive?: number;
}

function boneCenter(body: RAPIER.RigidBody): { x: number; y: number } {
  const t = body.translation();
  return { x: t.x, y: t.y };
}

/**
 * Always-on spring toward rest length + active contract/expand forces.
 * Control ∈ [-1, 1]: negative = expand, positive = contract (Evolution convention).
 */
export function applyMuscleForces(
  muscles: RuntimeMuscle[],
  drives: number[],
  outVisual?: MuscleVisualState[],
  options?: MuscleForceOptions,
): void {
  if (outVisual) outVisual.length = 0;

  const springK = MUSCLE_SPRING * (options?.springMult ?? 1);
  const damperK = MUSCLE_DAMPER * (options?.damperMult ?? 1);
  const forceMult = options?.maxForceMult ?? 1;
  const restDrive = options?.restLengthDrive ?? 0;

  for (let i = 0; i < muscles.length; i++) {
    const m = muscles[i];
    const drive = Math.max(-1, Math.min(1, drives[i] ?? 0));
    const a = boneCenter(m.startBone);
    const b = boneCenter(m.endBone);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1e-6;
    const nx = dx / dist;
    const ny = dy / dist;

    const velA = m.startBone.linvel();
    const velB = m.endBone.linvel();
    const relVel = (velB.x - velA.x) * nx + (velB.y - velA.y) * ny;

    let targetRest = m.restLength;
    if (restDrive > 0) {
      const stretch = drive > 0 || m.canExpand ? drive * restDrive : 0;
      targetRest = m.restLength * Math.max(0.15, 1 - stretch);
    }

    // Positive when stretched → pull together; negative when compressed → push apart.
    const springF = springK * (dist - targetRest) + damperK * relVel;

    const maxF = (m.strength > 0 ? m.strength : MUSCLE_MAX_FORCE) * forceMult;
    let active = 0;
    let action: MuscleVisualState['action'] = 'idle';
    if (drive > 0.02) {
      active = drive * maxF;
      action = 'contract';
    } else if (drive < -0.02 && m.canExpand) {
      active = drive * maxF;
      action = 'expand';
    }

    // netPull > 0: pull A toward B and B toward A.
    const netPull = springF + active;
    m.startBone.wakeUp();
    m.endBone.wakeUp();
    m.startBone.addForce({ x: netPull * nx, y: netPull * ny }, true);
    m.endBone.addForce({ x: -netPull * nx, y: -netPull * ny }, true);

    if (outVisual) {
      outVisual.push({
        id: m.id,
        ax: a.x,
        ay: a.y,
        bx: b.x,
        by: b.y,
        drive,
        action,
      });
    }
  }
}
