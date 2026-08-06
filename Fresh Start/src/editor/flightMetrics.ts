/**
 * Edit-time flight/glide readiness heuristics (product UI).
 * Not parent capability physics — uses Fresh Start mass defaults + aero coeffs.
 */
import type { CreatureDesign } from '../creature/types';
import {
  DEFAULT_BONE_MASS,
  DEFAULT_JOINT_MASS,
  GLIDER_LIFT_COEFF,
  GRAVITY_Y,
  PARA_DRAG_COEFF,
  WING_FLAP_LIFT_COEFF,
} from '../physics/constants';

/** UI clamp for bone aeroArea slider (authoring only). */
export const AERO_AREA_SLIDER_MAX = 8;

/**
 * Reference normal speed for wing/glider preview (m/s).
 * ~realistic flap tip speed under sine; not continuous cruise at 5 m/s.
 */
export const FLIGHT_REF_SPEED = 3.5;

export interface FlightMetrics {
  totalMass: number;
  totalAeroArea: number;
  wingArea: number;
  gliderArea: number;
  chuteArea: number;
  /** area / mass — higher means more aero per kilo. */
  areaPerMass: number;
  /** |g| * mass — weight magnitude for comparison. */
  weight: number;
  /**
   * Rough glider+wing lift scale at FLIGHT_REF_SPEED vs weight.
   * > 1 suggests lift can exceed weight at that speed (orientation ideal).
   */
  liftOverWeight: number;
  /** Parachute drag scale at ref descent speed vs weight. */
  chuteDragOverWeight: number;
}

export function designTotalMass(design: CreatureDesign): number {
  let m = 0;
  for (const j of design.joints) m += j.mass ?? DEFAULT_JOINT_MASS;
  for (const b of design.bones) m += b.mass ?? DEFAULT_BONE_MASS;
  return m;
}

export function computeFlightMetrics(design: CreatureDesign): FlightMetrics {
  const totalMass = designTotalMass(design);
  let wingArea = 0;
  let gliderArea = 0;
  let chuteArea = 0;
  for (const b of design.bones) {
    const area = b.aeroArea ?? 0;
    if (area <= 0) continue;
    if (b.aeroType === 'wing') wingArea += area;
    else if (b.aeroType === 'parachute') chuteArea += area;
    else gliderArea += area; // glider or legacy
  }
  const totalAeroArea = wingArea + gliderArea + chuteArea;
  const weight = totalMass * Math.abs(GRAVITY_Y);
  const q = FLIGHT_REF_SPEED * FLIGHT_REF_SPEED;
  // Glider: peak AoA lift. Wing: downstroke-only mean ≈ half-cycle at ref speed.
  const liftScale =
    GLIDER_LIFT_COEFF * gliderArea * q +
    WING_FLAP_LIFT_COEFF * wingArea * q * 0.5;
  const chuteDrag = PARA_DRAG_COEFF * chuteArea * q;
  return {
    totalMass,
    totalAeroArea,
    wingArea,
    gliderArea,
    chuteArea,
    areaPerMass: totalMass > 1e-6 ? totalAeroArea / totalMass : 0,
    weight,
    liftOverWeight: weight > 1e-6 ? liftScale / weight : 0,
    chuteDragOverWeight: weight > 1e-6 ? chuteDrag / weight : 0,
  };
}
