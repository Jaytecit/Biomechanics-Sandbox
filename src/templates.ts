/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreatureBlueprint } from './types';

export const CREATURE_TEMPLATES: CreatureBlueprint[] = [
  {
    name: 'Biped Walker',
    nodes: [
      { id: 0, mass: 2.0, radius: 12, friction: 0.2, color: '#3b82f6' }, // Hip (Main Body)
      { id: 1, mass: 1.0, radius: 8, friction: 0.5, color: '#60a5fa' }, // Knee Left
      { id: 2, mass: 1.5, radius: 10, friction: 0.9, color: '#1d4ed8', isFoot: true }, // Foot Left
      { id: 3, mass: 1.0, radius: 8, friction: 0.5, color: '#a7f3d0' }, // Knee Right
      { id: 4, mass: 1.5, radius: 10, friction: 0.9, color: '#059669', isFoot: true }, // Foot Right
    ],
    muscles: [
      { id: 0, nodeA: 0, nodeB: 1, originalLength: 45, minLength: 25, maxLength: 65, strength: 0.65, phaseOffset: 0 },
      { id: 1, nodeA: 1, nodeB: 2, originalLength: 45, minLength: 25, maxLength: 65, strength: 0.65, phaseOffset: 0 },
      { id: 2, nodeA: 0, nodeB: 3, originalLength: 45, minLength: 25, maxLength: 65, strength: 0.65, phaseOffset: Math.PI },
      { id: 3, nodeA: 3, nodeB: 4, originalLength: 45, minLength: 25, maxLength: 65, strength: 0.65, phaseOffset: Math.PI },
      // Stabilizing muscles
      { id: 4, nodeA: 1, nodeB: 3, originalLength: 50, minLength: 35, maxLength: 65, strength: 0.3, phaseOffset: 0 },
      { id: 5, nodeA: 0, nodeB: 2, originalLength: 85, minLength: 70, maxLength: 100, strength: 0.1, phaseOffset: 0 },
    ],
    relativePositions: [
      { x: 0, y: -90 }, // Hip (node 0)
      { x: -20, y: -50 }, // Knee L (node 1)
      { x: -30, y: -10 }, // Foot L (node 2)
      { x: 20, y: -50 }, // Knee R (node 3)
      { x: 30, y: -10 }, // Foot R (node 4)
    ],
  },
  {
    name: 'Quadruped Runner',
    nodes: [
      { id: 0, mass: 2.2, radius: 12, friction: 0.3, color: '#ec4899' }, // Shoulder / Chest
      { id: 1, mass: 2.2, radius: 12, friction: 0.3, color: '#f472b6' }, // Pelvis / Rear
      { id: 2, mass: 1.0, radius: 8, friction: 0.7, color: '#fbcfe8' }, // Front Knee
      { id: 3, mass: 1.2, radius: 9, friction: 0.9, color: '#db2777', isFoot: true }, // Front Foot
      { id: 4, mass: 1.0, radius: 8, friction: 0.7, color: '#fbcfe8' }, // Rear Knee
      { id: 5, mass: 1.2, radius: 9, friction: 0.9, color: '#be185d', isFoot: true }, // Rear Foot
    ],
    muscles: [
      { id: 0, nodeA: 0, nodeB: 1, originalLength: 70, minLength: 40, maxLength: 95, strength: 0.7, phaseOffset: 0 }, // Spine
      { id: 1, nodeA: 0, nodeB: 2, originalLength: 40, minLength: 25, maxLength: 55, strength: 0.6, phaseOffset: 0 }, // Front Leg Upper
      { id: 2, nodeA: 2, nodeB: 3, originalLength: 40, minLength: 25, maxLength: 55, strength: 0.6, phaseOffset: 0.5 }, // Front Leg Lower
      { id: 3, nodeA: 1, nodeB: 4, originalLength: 40, minLength: 25, maxLength: 55, strength: 0.6, phaseOffset: Math.PI }, // Rear Leg Upper
      { id: 4, nodeA: 4, nodeB: 5, originalLength: 40, minLength: 25, maxLength: 55, strength: 0.6, phaseOffset: Math.PI + 0.5 }, // Rear Leg Lower
      { id: 5, nodeA: 0, nodeB: 3, originalLength: 75, minLength: 55, maxLength: 95, strength: 0.25, phaseOffset: 0 },
      { id: 6, nodeA: 1, nodeB: 5, originalLength: 75, minLength: 55, maxLength: 95, strength: 0.25, phaseOffset: Math.PI },
      { id: 7, nodeA: 2, nodeB: 4, originalLength: 60, minLength: 40, maxLength: 80, strength: 0.2, phaseOffset: 0 },
    ],
    relativePositions: [
      { x: -30, y: -70 },
      { x: 30, y: -70 },
      { x: -38, y: -40 },
      { x: -42, y: -10 },
      { x: 38, y: -40 },
      { x: 42, y: -10 },
    ],
  },
  {
    name: 'Motor Cart',
    nodes: [
      { id: 0, mass: 2.0, radius: 11, friction: 0.2, color: '#64748b' },
      { id: 1, mass: 2.0, radius: 11, friction: 0.2, color: '#475569' },
      {
        id: 2,
        mass: 1.5,
        radius: 12,
        friction: 0.05,
        color: '#f59e0b',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 0.55,
      },
      {
        id: 3,
        mass: 1.5,
        radius: 12,
        friction: 0.05,
        color: '#d97706',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 0.55,
      },
    ],
    muscles: [
      // Rigid chassis frame
      { id: 0, nodeA: 0, nodeB: 1, originalLength: 70, minLength: 70, maxLength: 70, strength: 1.0, phaseOffset: 0 },
      { id: 1, nodeA: 0, nodeB: 2, originalLength: 28, minLength: 28, maxLength: 28, strength: 1.0, phaseOffset: 0 },
      { id: 2, nodeA: 1, nodeB: 3, originalLength: 28, minLength: 28, maxLength: 28, strength: 1.0, phaseOffset: 0 },
      { id: 3, nodeA: 0, nodeB: 3, originalLength: 78, minLength: 78, maxLength: 78, strength: 1.0, phaseOffset: 0 },
      { id: 4, nodeA: 1, nodeB: 2, originalLength: 78, minLength: 78, maxLength: 78, strength: 1.0, phaseOffset: 0 },
    ],
    relativePositions: [
      { x: -28, y: -38 }, // Chassis front
      { x: 28, y: -38 }, // Chassis rear
      { x: -32, y: -12 }, // Front wheel
      { x: 32, y: -12 }, // Rear wheel
    ],
  },
  {
    name: 'Flapper',
    nodes: [
      { id: 0, mass: 2.2, radius: 12, friction: 0.35, color: '#0ea5e9' }, // Body
      { id: 1, mass: 0.9, radius: 8, friction: 0.2, color: '#38bdf8' }, // Wing tip L
      { id: 2, mass: 0.9, radius: 8, friction: 0.2, color: '#38bdf8' }, // Wing tip R
      { id: 3, mass: 1.4, radius: 10, friction: 0.85, color: '#0369a1', isFoot: true }, // Foot
    ],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 55,
        minLength: 28,
        maxLength: 78,
        strength: 0.92,
        phaseOffset: 0,
        aeroType: 'wing',
        aeroArea: 75,
      },
      {
        id: 1,
        nodeA: 0,
        nodeB: 2,
        originalLength: 55,
        minLength: 28,
        maxLength: 78,
        strength: 0.92,
        // In-phase with left wing — bird-like symmetric flap (D143).
        phaseOffset: 0,
        aeroType: 'wing',
        aeroArea: 75,
      },
      {
        id: 2,
        nodeA: 0,
        nodeB: 3,
        originalLength: 48,
        minLength: 30,
        maxLength: 62,
        strength: 0.55,
        phaseOffset: 0,
      },
      {
        id: 3,
        nodeA: 1,
        nodeB: 2,
        originalLength: 70,
        minLength: 70,
        maxLength: 70,
        strength: 1.0,
        phaseOffset: 0,
      },
    ],
    relativePositions: [
      { x: 0, y: -70 },
      { x: -55, y: -95 },
      { x: 55, y: -95 },
      { x: 0, y: -22 },
    ],
  },
  {
    name: 'Para Cart',
    nodes: [
      { id: 0, mass: 1.6, radius: 10, friction: 0.2, color: '#64748b' },
      { id: 1, mass: 1.6, radius: 10, friction: 0.2, color: '#475569' },
      {
        id: 2,
        mass: 1.2,
        radius: 11,
        friction: 0.05,
        color: '#f59e0b',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 2.2,
      },
      {
        id: 3,
        mass: 1.2,
        radius: 11,
        friction: 0.05,
        color: '#d97706',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 2.2,
      },
      { id: 4, mass: 0.45, radius: 6, friction: 0.08, color: '#a78bfa' },
      { id: 5, mass: 0.45, radius: 6, friction: 0.08, color: '#8b5cf6' },
    ],
    muscles: [
      { id: 0, nodeA: 0, nodeB: 1, originalLength: 58, minLength: 58, maxLength: 58, strength: 1.0, phaseOffset: 0 },
      { id: 1, nodeA: 0, nodeB: 2, originalLength: 28, minLength: 28, maxLength: 28, strength: 1.0, phaseOffset: 0 },
      { id: 2, nodeA: 1, nodeB: 3, originalLength: 28, minLength: 28, maxLength: 28, strength: 1.0, phaseOffset: 0 },
      { id: 3, nodeA: 0, nodeB: 3, originalLength: 66, minLength: 66, maxLength: 66, strength: 1.0, phaseOffset: 0 },
      { id: 4, nodeA: 1, nodeB: 2, originalLength: 66, minLength: 66, maxLength: 66, strength: 1.0, phaseOffset: 0 },
      // Near-rigid risers matched to spawn span (chassis→sail ≈ 78px)
      { id: 5, nodeA: 0, nodeB: 4, originalLength: 78, minLength: 74, maxLength: 82, strength: 0.95, phaseOffset: 0 },
      { id: 6, nodeA: 1, nodeB: 5, originalLength: 78, minLength: 74, maxLength: 82, strength: 0.95, phaseOffset: 0 },
      {
        id: 7,
        nodeA: 4,
        nodeB: 5,
        originalLength: 100,
        minLength: 90,
        maxLength: 110,
        strength: 0.75,
        phaseOffset: 0,
        aeroType: 'paraglider',
        aeroArea: 160,
      },
    ],
    relativePositions: [
      { x: -24, y: -34 },
      { x: 24, y: -34 },
      { x: -28, y: -11 },
      { x: 28, y: -11 },
      { x: -50, y: -108 },
      { x: 50, y: -108 },
    ],
  },
  {
    name: 'Jump Cart',
    // Wide high-power chassis that clears the Para Ramp pit when fast enough
    // (reference: user Jump_Cart_elite_gen16 on PARA_RAMP_GLIDE).
    nodes: [
      { id: 0, mass: 2.0, radius: 11, friction: 0.2, color: '#64748b' },
      { id: 1, mass: 2.0, radius: 11, friction: 0.2, color: '#475569' },
      {
        id: 2,
        mass: 1.5,
        radius: 12,
        friction: 0.05,
        color: '#f59e0b',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 20,
      },
      {
        id: 3,
        mass: 1.5,
        radius: 12,
        friction: 0.05,
        color: '#d97706',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 20,
      },
    ],
    muscles: [
      { id: 0, nodeA: 0, nodeB: 2, originalLength: 108, minLength: 108, maxLength: 108, strength: 1.0, phaseOffset: 0 },
      { id: 1, nodeA: 1, nodeB: 3, originalLength: 108, minLength: 108, maxLength: 108, strength: 1.0, phaseOffset: 0 },
      { id: 2, nodeA: 0, nodeB: 3, originalLength: 162, minLength: 162, maxLength: 162, strength: 1.0, phaseOffset: 0 },
      { id: 3, nodeA: 1, nodeB: 2, originalLength: 162, minLength: 162, maxLength: 162, strength: 1.0, phaseOffset: 0 },
      {
        id: 4,
        nodeA: 0,
        nodeB: 1,
        originalLength: 60,
        minLength: 36,
        maxLength: 84,
        strength: 0.6,
        phaseOffset: 0,
      },
      { id: 5, nodeA: 2, nodeB: 3, originalLength: 240, minLength: 240, maxLength: 240, strength: 1.0, phaseOffset: 0 },
    ],
    relativePositions: [
      { x: -30, y: -60 },
      { x: 30, y: -60 },
      { x: -120, y: 0 },
      { x: 120, y: 0 },
    ],
  },
  {
    name: 'Baseline Glider',
    // Phase 3 known-good passive glider: near-rigid cart + moderate tip mass
    // (F09). Fixed morphology for Test 4 incidence / launch sweeps. Motors are
    // mild so scripted flat-ground run-up can prove controllability without the
    // ultra-light Proven Glider tip ratio.
    nodes: [
      { id: 0, mass: 1.8, radius: 10, friction: 0.2, color: '#475569' },
      { id: 1, mass: 1.8, radius: 10, friction: 0.2, color: '#334155' },
      {
        id: 2,
        mass: 1.3,
        radius: 11,
        friction: 0.05,
        color: '#f59e0b',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 2.4,
      },
      {
        id: 3,
        mass: 1.3,
        radius: 11,
        friction: 0.05,
        color: '#d97706',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 2.4,
      },
      { id: 4, mass: 0.45, radius: 6, friction: 0.06, color: '#a78bfa' },
      { id: 5, mass: 0.45, radius: 6, friction: 0.06, color: '#7c3aed' },
    ],
    muscles: [
      { id: 0, nodeA: 0, nodeB: 1, originalLength: 58, minLength: 58, maxLength: 58, strength: 1.0, phaseOffset: 0 },
      { id: 1, nodeA: 0, nodeB: 2, originalLength: 28, minLength: 28, maxLength: 28, strength: 1.0, phaseOffset: 0 },
      { id: 2, nodeA: 1, nodeB: 3, originalLength: 28, minLength: 28, maxLength: 28, strength: 1.0, phaseOffset: 0 },
      { id: 3, nodeA: 0, nodeB: 3, originalLength: 66, minLength: 66, maxLength: 66, strength: 1.0, phaseOffset: 0 },
      { id: 4, nodeA: 1, nodeB: 2, originalLength: 66, minLength: 66, maxLength: 66, strength: 1.0, phaseOffset: 0 },
      { id: 5, nodeA: 0, nodeB: 4, originalLength: 78, minLength: 74, maxLength: 82, strength: 0.98, phaseOffset: 0 },
      { id: 6, nodeA: 1, nodeB: 5, originalLength: 78, minLength: 74, maxLength: 82, strength: 0.98, phaseOffset: 0 },
      { id: 7, nodeA: 0, nodeB: 5, originalLength: 92, minLength: 88, maxLength: 96, strength: 0.95, phaseOffset: 0 },
      { id: 8, nodeA: 1, nodeB: 4, originalLength: 92, minLength: 88, maxLength: 96, strength: 0.95, phaseOffset: 0 },
      {
        id: 9,
        nodeA: 4,
        nodeB: 5,
        originalLength: 100,
        minLength: 92,
        maxLength: 108,
        strength: 0.85,
        phaseOffset: 0,
        aeroType: 'paraglider',
        aeroArea: 160,
      },
    ],
    relativePositions: [
      { x: -24, y: -34 },
      { x: 24, y: -34 },
      { x: -28, y: -11 },
      { x: 28, y: -11 },
      { x: -50, y: -108 },
      { x: 50, y: -108 },
    ],
  },
  {
    name: 'Proven Glider',
    // Jump Cart chassis + light reefable canopy — reefed run-up must clear the pit
    // ballistically before deploy opens the sail. Keep light tips as advanced
    // (F09); Baseline Glider is the Phase 3 known-good reference.
    nodes: [
      { id: 0, mass: 2.0, radius: 11, friction: 0.2, color: '#334155' },
      { id: 1, mass: 2.0, radius: 11, friction: 0.2, color: '#1e293b' },
      {
        id: 2,
        mass: 1.5,
        radius: 12,
        friction: 0.05,
        color: '#f59e0b',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 20,
      },
      {
        id: 3,
        mass: 1.5,
        radius: 12,
        friction: 0.05,
        color: '#d97706',
        isWheel: true,
        isMotorWheel: true,
        motorPower: 20,
      },
      // Light canopy tips (heavy tips bleed lip speed into the pit)
      { id: 4, mass: 0.05, radius: 5, friction: 0.05, color: '#c4b5fd' },
      { id: 5, mass: 0.05, radius: 5, friction: 0.05, color: '#8b5cf6' },
    ],
    muscles: [
      { id: 0, nodeA: 0, nodeB: 2, originalLength: 108, minLength: 108, maxLength: 108, strength: 1.0, phaseOffset: 0 },
      { id: 1, nodeA: 1, nodeB: 3, originalLength: 108, minLength: 108, maxLength: 108, strength: 1.0, phaseOffset: 0 },
      { id: 2, nodeA: 0, nodeB: 3, originalLength: 162, minLength: 162, maxLength: 162, strength: 1.0, phaseOffset: 0 },
      { id: 3, nodeA: 1, nodeB: 2, originalLength: 162, minLength: 162, maxLength: 162, strength: 1.0, phaseOffset: 0 },
      {
        id: 4,
        nodeA: 0,
        nodeB: 1,
        originalLength: 60,
        minLength: 36,
        maxLength: 84,
        strength: 0.6,
        phaseOffset: 0,
      },
      { id: 5, nodeA: 2, nodeB: 3, originalLength: 240, minLength: 240, maxLength: 240, strength: 1.0, phaseOffset: 0 },
      // Compact risers so reefed tips stay close to the cart
      { id: 6, nodeA: 0, nodeB: 4, originalLength: 74, minLength: 74, maxLength: 74, strength: 1.0, phaseOffset: 0 },
      { id: 7, nodeA: 1, nodeB: 5, originalLength: 74, minLength: 74, maxLength: 74, strength: 1.0, phaseOffset: 0 },
      { id: 8, nodeA: 0, nodeB: 5, originalLength: 110, minLength: 110, maxLength: 110, strength: 1.0, phaseOffset: 0 },
      { id: 9, nodeA: 1, nodeB: 4, originalLength: 110, minLength: 110, maxLength: 110, strength: 1.0, phaseOffset: 0 },
      {
        id: 10,
        nodeA: 4,
        nodeB: 5,
        originalLength: 110,
        minLength: 95,
        maxLength: 120,
        strength: 0.8,
        phaseOffset: 0,
        aeroType: 'paraglider',
        aeroArea: 160,
      },
    ],
    relativePositions: [
      { x: -30, y: -60 },
      { x: 30, y: -60 },
      { x: -120, y: 0 },
      { x: 120, y: 0 },
      { x: -55, y: -130 },
      { x: 55, y: -130 },
    ],
  },
];
