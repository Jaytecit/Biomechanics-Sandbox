/**
 * D17 — Soft morphology genes (fixed topology).
 * Mutates mass, limb length, aero, and wheels without changing muscle/drive layout.
 */
import type { AeroType, CreatureDesign } from './types';
import { cloneDesign } from './types';

/** Max |Δ| on joint x/y for length morph / messy jitter (m). */
export const MORPH_MAX_JOINT_DELTA = 0.35;
/** Mass scale clamp relative to authored (or 1). */
export const MORPH_MASS_SCALE_MIN = 0.55;
export const MORPH_MASS_SCALE_MAX = 1.85;
/** Aero area clamp when morphing. */
export const MORPH_AERO_AREA_MAX = 8;
/** Messy-bodies jitter magnitudes (P0). */
export const MESSY_JOINT_DELTA = 0.12;
export const MESSY_MASS_JITTER = 0.18;

const AERO_TYPES: AeroType[] = ['wing', 'glider', 'parachute'];

export interface MorphGenes {
  jointMassScale: number[];
  jointDx: number[];
  jointDy: number[];
  boneMassScale: number[];
  /** Absolute aero area (≥0). 0 clears aero. */
  boneAeroArea: number[];
  /** 0…2 index into AERO_TYPES when area > 0. */
  boneAeroType: number[];
  /** 0 or 1 — only applied on joints that are already feet or wheels-capable. */
  wheelOn: number[];
  motorStrength: number[];
}

export function zeroMorphGenes(design: CreatureDesign): MorphGenes {
  const nj = design.joints.length;
  const nb = design.bones.length;
  return {
    jointMassScale: Array(nj).fill(1),
    jointDx: Array(nj).fill(0),
    jointDy: Array(nj).fill(0),
    boneMassScale: Array(nb).fill(1),
    boneAeroArea: design.bones.map((b) => Math.max(0, b.aeroArea ?? 0)),
    boneAeroType: design.bones.map((b) => {
      const t = b.aeroType ?? 'glider';
      const i = AERO_TYPES.indexOf(t);
      return i >= 0 ? i : 1;
    }),
    wheelOn: design.joints.map((j) => (j.isWheel ? 1 : 0)),
    motorStrength: design.joints.map((j) => j.motorStrength ?? 1),
  };
}

export function cloneMorphGenes(m: MorphGenes): MorphGenes {
  return {
    jointMassScale: m.jointMassScale.slice(),
    jointDx: m.jointDx.slice(),
    jointDy: m.jointDy.slice(),
    boneMassScale: m.boneMassScale.slice(),
    boneAeroArea: m.boneAeroArea.slice(),
    boneAeroType: m.boneAeroType.slice(),
    wheelOn: m.wheelOn.slice(),
    motorStrength: m.motorStrength.slice(),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clampMorphGenes(m: MorphGenes): MorphGenes {
  const next = cloneMorphGenes(m);
  for (let i = 0; i < next.jointMassScale.length; i++) {
    next.jointMassScale[i] = clamp(
      next.jointMassScale[i]!,
      MORPH_MASS_SCALE_MIN,
      MORPH_MASS_SCALE_MAX,
    );
    next.jointDx[i] = clamp(
      next.jointDx[i]!,
      -MORPH_MAX_JOINT_DELTA,
      MORPH_MAX_JOINT_DELTA,
    );
    next.jointDy[i] = clamp(
      next.jointDy[i]!,
      -MORPH_MAX_JOINT_DELTA,
      MORPH_MAX_JOINT_DELTA,
    );
    next.wheelOn[i] = next.wheelOn[i]! >= 0.5 ? 1 : 0;
    next.motorStrength[i] = clamp(next.motorStrength[i]!, 0.2, 3);
  }
  for (let i = 0; i < next.boneMassScale.length; i++) {
    next.boneMassScale[i] = clamp(
      next.boneMassScale[i]!,
      MORPH_MASS_SCALE_MIN,
      MORPH_MASS_SCALE_MAX,
    );
    next.boneAeroArea[i] = clamp(next.boneAeroArea[i]!, 0, MORPH_AERO_AREA_MAX);
    next.boneAeroType[i] = Math.max(
      0,
      Math.min(AERO_TYPES.length - 1, Math.round(next.boneAeroType[i]!)),
    );
  }
  return next;
}

/** Small Gaussian-ish morph mutation (seeded rng). */
export function mutateMorphGenes(
  base: MorphGenes,
  rng: () => number,
  sigma = 0.12,
): MorphGenes {
  const m = cloneMorphGenes(base);
  const g = () => {
    // Box-Muller-ish via two uniforms (deterministic with seeded rng).
    const u = Math.max(1e-9, rng());
    const v = Math.max(1e-9, rng());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  for (let i = 0; i < m.jointMassScale.length; i++) {
    if (rng() < 0.35) m.jointMassScale[i]! += g() * sigma;
    if (rng() < 0.35) m.jointDx[i]! += g() * sigma * 0.5;
    if (rng() < 0.35) m.jointDy[i]! += g() * sigma * 0.5;
    if (rng() < 0.08) m.wheelOn[i] = m.wheelOn[i]! >= 0.5 ? 0 : 1;
    if (rng() < 0.2) m.motorStrength[i]! += g() * sigma;
  }
  for (let i = 0; i < m.boneMassScale.length; i++) {
    if (rng() < 0.35) m.boneMassScale[i]! += g() * sigma;
    if (rng() < 0.2) m.boneAeroArea[i]! += g() * sigma * 1.5;
    if (rng() < 0.06) {
      m.boneAeroType[i] = Math.floor(rng() * AERO_TYPES.length);
    }
  }
  return clampMorphGenes(m);
}

/** Uniform blend of two morph genomes. */
export function crossoverMorphGenes(
  a: MorphGenes,
  b: MorphGenes,
  rng: () => number,
): MorphGenes {
  const m = cloneMorphGenes(a);
  for (let i = 0; i < m.jointMassScale.length; i++) {
    if (rng() < 0.5) m.jointMassScale[i] = b.jointMassScale[i] ?? m.jointMassScale[i]!;
    if (rng() < 0.5) m.jointDx[i] = b.jointDx[i] ?? m.jointDx[i]!;
    if (rng() < 0.5) m.jointDy[i] = b.jointDy[i] ?? m.jointDy[i]!;
    if (rng() < 0.5) m.wheelOn[i] = b.wheelOn[i] ?? m.wheelOn[i]!;
    if (rng() < 0.5) m.motorStrength[i] = b.motorStrength[i] ?? m.motorStrength[i]!;
  }
  for (let i = 0; i < m.boneMassScale.length; i++) {
    if (rng() < 0.5) m.boneMassScale[i] = b.boneMassScale[i] ?? m.boneMassScale[i]!;
    if (rng() < 0.5) m.boneAeroArea[i] = b.boneAeroArea[i] ?? m.boneAeroArea[i]!;
    if (rng() < 0.5) m.boneAeroType[i] = b.boneAeroType[i] ?? m.boneAeroType[i]!;
  }
  return clampMorphGenes(m);
}

/**
 * Apply morph genes onto a cloned design. Topology (ids / connectivity /
 * muscles / drive groups) is unchanged.
 */
export function applyMorphToDesign(
  base: CreatureDesign,
  morph: MorphGenes | null | undefined,
): CreatureDesign {
  const design = cloneDesign(base);
  if (!morph) return design;
  const m = clampMorphGenes(morph);
  for (let i = 0; i < design.joints.length; i++) {
    const j = design.joints[i]!;
    const baseMass = j.mass ?? 1;
    j.mass = baseMass * (m.jointMassScale[i] ?? 1);
    j.x += m.jointDx[i] ?? 0;
    j.y = Math.max(0.15, j.y + (m.jointDy[i] ?? 0));
    const wantWheel = (m.wheelOn[i] ?? 0) >= 0.5;
    if (wantWheel && (j.isFoot || j.isWheel)) {
      j.isWheel = true;
      j.motorStrength = m.motorStrength[i] ?? 1;
    } else if (!wantWheel && j.isWheel && !j.isFoot) {
      // Keep authored wheels; only clear morph-added wheels on non-feet.
      delete j.isWheel;
      delete j.motorStrength;
    } else if (j.isWheel) {
      j.motorStrength = m.motorStrength[i] ?? j.motorStrength ?? 1;
    }
  }
  for (let i = 0; i < design.bones.length; i++) {
    const b = design.bones[i]!;
    const baseMass = b.mass ?? 1;
    b.mass = baseMass * (m.boneMassScale[i] ?? 1);
    const area = m.boneAeroArea[i] ?? 0;
    if (area > 1e-6) {
      b.aeroArea = area;
      b.aeroType = AERO_TYPES[m.boneAeroType[i] ?? 1] ?? 'glider';
    } else {
      delete b.aeroArea;
      delete b.aeroType;
    }
  }
  return design;
}

/** P0 — one-shot messy jitter (not stored on genome). */
export function applyMessyBodyJitter(
  base: CreatureDesign,
  rng: () => number,
): CreatureDesign {
  const m = zeroMorphGenes(base);
  for (let i = 0; i < m.jointMassScale.length; i++) {
    m.jointMassScale[i] = 1 + (rng() * 2 - 1) * MESSY_MASS_JITTER;
    m.jointDx[i] = (rng() * 2 - 1) * MESSY_JOINT_DELTA;
    m.jointDy[i] = (rng() * 2 - 1) * MESSY_JOINT_DELTA;
  }
  for (let i = 0; i < m.boneMassScale.length; i++) {
    m.boneMassScale[i] = 1 + (rng() * 2 - 1) * MESSY_MASS_JITTER;
  }
  return applyMorphToDesign(base, m);
}

export function morphFingerprint(morph: MorphGenes | null | undefined): string {
  if (!morph) return 'nomorph';
  const m = clampMorphGenes(morph);
  const parts = [
    m.jointMassScale.map((v) => v.toFixed(2)).join(','),
    m.jointDx.map((v) => v.toFixed(2)).join(','),
    m.jointDy.map((v) => v.toFixed(2)).join(','),
    m.boneMassScale.map((v) => v.toFixed(2)).join(','),
    m.boneAeroArea.map((v) => v.toFixed(2)).join(','),
    m.wheelOn.join(''),
  ];
  let h = 2166136261;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

export function summarizeMorphGenes(morph: MorphGenes | null | undefined): {
  meanMassScale: number;
  meanLegDelta: number;
  aeroBones: number;
  wheels: number;
  fingerprint: string;
} {
  if (!morph) {
    return {
      meanMassScale: 1,
      meanLegDelta: 0,
      aeroBones: 0,
      wheels: 0,
      fingerprint: 'nomorph',
    };
  }
  const m = clampMorphGenes(morph);
  const mass =
    m.jointMassScale.reduce((a, b) => a + b, 0) /
    Math.max(1, m.jointMassScale.length);
  let leg = 0;
  for (let i = 0; i < m.jointDx.length; i++) {
    leg += Math.hypot(m.jointDx[i]!, m.jointDy[i]!);
  }
  leg /= Math.max(1, m.jointDx.length);
  return {
    meanMassScale: Math.round(mass * 100) / 100,
    meanLegDelta: Math.round(leg * 1000) / 1000,
    aeroBones: m.boneAeroArea.filter((a) => a > 1e-6).length,
    wheels: m.wheelOn.filter((w) => w >= 0.5).length,
    fingerprint: morphFingerprint(m),
  };
}
