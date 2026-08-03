/**
 * E5.2 — Morphology eligibility from Fresh Start design traits only.
 */
import type { CreatureDesign } from '../creature/types';
import type { SecretGoalDefinition } from './definitions';

export interface MorphologyTraits {
  footCount: number;
  wheelCount: number;
  headCount: number;
  hasAero: boolean;
  totalAeroArea: number;
}

export function morphologyTraits(design: CreatureDesign): MorphologyTraits {
  let footCount = 0;
  let wheelCount = 0;
  let headCount = 0;
  for (const j of design.joints) {
    if (j.isFoot) footCount++;
    if (j.isWheel) wheelCount++;
    if (j.isHead) headCount++;
  }
  let totalAeroArea = 0;
  for (const b of design.bones) {
    totalAeroArea += b.aeroArea ?? 0;
  }
  return {
    footCount,
    wheelCount,
    headCount,
    hasAero: totalAeroArea > 0.05,
    totalAeroArea,
  };
}

export function secretEligible(
  design: CreatureDesign,
  def: SecretGoalDefinition,
): boolean {
  const traits = morphologyTraits(design);
  if (def.requiresWheels && traits.wheelCount < 1) return false;
  if (def.requiresAero && !traits.hasAero) return false;
  return true;
}
