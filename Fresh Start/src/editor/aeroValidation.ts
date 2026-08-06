/**
 * G10 aero authoring helpers — wing pair checks, type normalization.
 */
import type { AeroType, BoneDef, CreatureDesign } from '../creature/types';

export const AERO_TYPES: readonly AeroType[] = ['wing', 'glider', 'parachute'];

export function isAeroType(value: unknown): value is AeroType {
  return value === 'wing' || value === 'glider' || value === 'parachute';
}

export function activeAeroBones(design: CreatureDesign): BoneDef[] {
  return design.bones.filter((b) => (b.aeroArea ?? 0) > 0);
}

export function countWings(design: CreatureDesign): number {
  return activeAeroBones(design).filter((b) => b.aeroType === 'wing').length;
}

/** Wings should be authored in pairs (even count). */
export function wingPairOk(design: CreatureDesign): boolean {
  const n = countWings(design);
  return n === 0 || n % 2 === 0;
}

export function aeroTypeLabel(type: AeroType | undefined): string {
  if (type === 'wing') return 'Wing';
  if (type === 'glider') return 'Glider';
  if (type === 'parachute') return 'Parachute';
  return 'Legacy';
}
