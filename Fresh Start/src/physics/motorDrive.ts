/**
 * Motor wheel torque (E6.5) — Rapier addTorque on tagged joints.
 */
import { MOTOR_TORQUE_SCALE } from './constants';
import type { SpawnedCreature } from './spawn';

/** Apply torque to wheel joints. drive ∈ [-1,1] from brain/manual channel 0 (or per-wheel). */
export function applyMotorTorques(
  creature: SpawnedCreature,
  drives: number[],
): void {
  const wheels = creature.joints.filter((j) => j.isWheel);
  if (wheels.length === 0) return;
  for (let i = 0; i < wheels.length; i++) {
    const drive = drives[i % drives.length] ?? 0;
    const strength = wheels[i].motorStrength ?? MOTOR_TORQUE_SCALE;
    const torque = -drive * strength; // negative = roll to +X with typical orientation
    wheels[i].body.wakeUp();
    wheels[i].body.addTorque(torque, true);
  }
}
