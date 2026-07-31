/**
 * D141 — Simulation physics invariants across all link / node combinations.
 * Rest-hold actuators must not inject runaway kinetic energy or launch bodies.
 *
 * Run: npx tsx scripts/smoke-physics-invariants.ts
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  spawnCreature,
  updateCreaturePhysics,
  GROUND_Y,
} from '../src/physics';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  Creature,
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
  isBrainDrivenMuscle,
  defaultPistonRatesForStroke,
  restingLengthFromMaxExpansion,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0');

const FRAMES = 360;
const SETTLE = 90;

function baseConfig(goal = EvolutionGoal.LOCOMOTION_RIGHT): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 600,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function kineticEnergy(creature: Creature): number {
  let ke = 0;
  for (const n of creature.nodes) {
    const vx = n.x - n.oldX;
    const vy = n.y - n.oldY;
    ke += n.mass * (vx * vx + vy * vy);
  }
  return ke;
}

function maxNodeSpeed(creature: Creature): number {
  let max = 0;
  for (const n of creature.nodes) {
    max = Math.max(max, Math.hypot(n.x - n.oldX, n.y - n.oldY));
  }
  return max;
}

/** Max px any node bottom lifts above the floor (launch / float detector). */
function maxAirGap(creature: Creature): number {
  let gap = 0;
  for (const n of creature.nodes) {
    const bottom = n.y + n.radius;
    if (bottom < GROUND_Y - 0.5) {
      gap = Math.max(gap, GROUND_Y - bottom);
    }
  }
  return gap;
}

/** Brain outputs that hold each actuator at blueprint rest length. */
function restHoldOverride(creature: Creature): number[] {
  const outputs: number[] = [];
  for (const muscle of creature.muscles) {
    if (!isBrainDrivenMuscle(muscle, creature.muscles)) continue;
    const span = muscle.maxLength - muscle.minLength;
    const norm =
      span > 1e-6 ? (muscle.originalLength - muscle.minLength) / span : 0.5;
    outputs.push(Math.max(-1, Math.min(1, norm * 2 - 1)));
  }
  for (const node of creature.nodes) {
    if (node.isMotorWheel) outputs.push(0);
  }
  return outputs;
}

function spawnBlueprint(
  blueprint: CreatureBlueprint,
  goal = EvolutionGoal.LOCOMOTION_RIGHT
): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: `inv_${blueprint.name.replace(/\s+/g, '_')}`,
      generation: 0,
      blueprint,
      genome,
    },
    220,
    GROUND_Y - 55,
    goal,
    1
  );
}

type InvariantLimits = {
  /** Max unintended lift off the floor (px). */
  maxAirGap: number;
  maxSpeed: number;
  maxEnergyRatio: number;
  maxComDrift: number;
};

function runRestHold(
  label: string,
  blueprint: CreatureBlueprint,
  limits: InvariantLimits,
  goal = EvolutionGoal.LOCOMOTION_RIGHT
): void {
  const cfg = baseConfig(goal);
  const creature = spawnBlueprint(blueprint, goal);
  const override = restHoldOverride(creature);
  const startComX = creature.currentX;

  let peakAirGap = 0;
  let peakSpeed = 0;
  let keAtSettle = 0;
  let kePeak = 0;

  for (let f = 0; f < FRAMES; f += 1) {
    updateCreaturePhysics(creature, [], f, cfg, [], override);
    if (f < SETTLE) continue;
    peakAirGap = Math.max(peakAirGap, maxAirGap(creature));
    peakSpeed = Math.max(peakSpeed, maxNodeSpeed(creature));
    const ke = kineticEnergy(creature);
    kePeak = Math.max(kePeak, ke);
    if (f === SETTLE) keAtSettle = ke;
  }

  const comDrift = Math.abs(creature.currentX - startComX);
  const energyRatio = keAtSettle > 1e-3 ? kePeak / keAtSettle : kePeak;

  assert.ok(
    peakAirGap <= limits.maxAirGap,
    `${label}: air gap ${peakAirGap.toFixed(1)} > ${limits.maxAirGap}`
  );
  assert.ok(
    peakSpeed <= limits.maxSpeed,
    `${label}: speed ${peakSpeed.toFixed(1)} > ${limits.maxSpeed}`
  );
  assert.ok(
    energyRatio <= limits.maxEnergyRatio,
    `${label}: energy ratio ${energyRatio.toFixed(2)} > ${limits.maxEnergyRatio}`
  );
  assert.ok(
    comDrift <= limits.maxComDrift,
    `${label}: COM drift ${comDrift.toFixed(1)} > ${limits.maxComDrift}`
  );
}

function strutBlueprint(
  name: string,
  hard: 'bone' | 'piston' | null,
  soft: boolean,
  extras?: Partial<CreatureBlueprint>
): CreatureBlueprint {
  const muscles: CreatureBlueprint['muscles'] = [];
  let id = 0;
  if (hard) {
    const minLength = hard === 'bone' ? 80 : 50;
    const maxLength = hard === 'bone' ? 80 : 110;
    const pistonSeed =
      hard === 'piston' ? defaultPistonRatesForStroke(minLength, maxLength) : null;
    muscles.push({
      id: id++,
      nodeA: 0,
      nodeB: 1,
      originalLength:
        hard === 'bone' ? 80 : restingLengthFromMaxExpansion(maxLength),
      minLength,
      maxLength,
      strength: 1,
      phaseOffset: 0,
      linkKind: hard,
      ...(pistonSeed
        ? { extendRate: pistonSeed.extendRate, retractRate: pistonSeed.retractRate }
        : {}),
    });
  }
  if (soft) {
    muscles.push({
      id: id++,
      nodeA: 0,
      nodeB: 1,
      originalLength: 80,
      minLength: 50,
      maxLength: 110,
      strength: 0.65,
      phaseOffset: 0,
      linkKind: 'muscle',
    });
  }
  return {
    name,
    nodes: [
      { id: 0, mass: 1.2, radius: 10, friction: 0.5 },
      { id: 1, mass: 1.2, radius: 10, friction: 0.5 },
      { id: 2, mass: 1, radius: 9, friction: 0.85, isFoot: true },
    ],
    muscles: [
      ...muscles,
      {
        id: id++,
        nodeA: 0,
        nodeB: 2,
        originalLength: 55,
        minLength: 40,
        maxLength: 70,
        strength: 0.55,
        phaseOffset: 0,
        linkKind: 'muscle',
      },
    ],
    relativePositions: [
      { x: -20, y: -80 },
      { x: 20, y: -80 },
      { x: 0, y: -20 },
    ],
    ...extras,
  };
}

const passiveLimits: InvariantLimits = {
  maxAirGap: 5,
  maxSpeed: 8,
  maxEnergyRatio: 2,
  maxComDrift: 15,
};

const walkerLimits: InvariantLimits = {
  maxAirGap: 120,
  maxSpeed: 120,
  // D142 restores soft-link force coupling; rest-hold energy ratio sits a bit
  // above the D141 universal-preserve floor (~40) without launching.
  maxEnergyRatio: 55,
  maxComDrift: 150,
};

const groundedLimits: InvariantLimits = {
  maxAirGap: 25,
  maxSpeed: 70,
  maxEnergyRatio: 6,
  maxComDrift: 40,
};

// --- Built-in templates ---
for (const template of CREATURE_TEMPLATES) {
  const name = template.name;
  const isFlying =
    name.includes('Flapper') ||
    name.includes('Glider') ||
    name.includes('Para') ||
    name.includes('Wing');
  const limits = isFlying
    ? { ...walkerLimits, maxAirGap: 180, maxSpeed: 160, maxComDrift: 200 }
    : walkerLimits;
  const goal = isFlying ? EvolutionGoal.FLIGHT_TIME : EvolutionGoal.LOCOMOTION_RIGHT;
  runRestHold(`template:${name}`, template, limits, goal);
}

// --- Passive grounded baseline (must stay inert) ---
runRestHold(
  'passive:bone-bar',
  {
    name: 'BoneBar',
    nodes: [
      { id: 0, mass: 1, radius: 10, friction: 0.9 },
      { id: 1, mass: 1, radius: 10, friction: 0.9 },
    ],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 80,
        minLength: 80,
        maxLength: 80,
        strength: 1,
        phaseOffset: 0,
        linkKind: 'bone',
      },
    ],
    relativePositions: [
      { x: -40, y: 0 },
      { x: 40, y: 0 },
    ],
  },
  passiveLimits
);

// --- Synthetic link matrix ---
runRestHold('link:bone-only', strutBlueprint('BoneLeg', 'bone', false), groundedLimits);
runRestHold('link:soft-only', strutBlueprint('SoftLeg', null, true), walkerLimits);
runRestHold(
  'link:piston-only',
  strutBlueprint('PistonLeg', 'piston', false),
  walkerLimits
);
runRestHold(
  'link:bone+soft',
  strutBlueprint('BoneSoftLeg', 'bone', true),
  walkerLimits
);
runRestHold(
  'link:piston+soft',
  strutBlueprint('PistonSoftLeg', 'piston', true),
  walkerLimits
);

// Solid plate + boundary soft limb
runRestHold(
  'link:solid-plate',
  {
    name: 'SolidPlateLeg',
    nodes: [
      { id: 0, mass: 1, radius: 10, friction: 0.5 },
      { id: 1, mass: 1, radius: 10, friction: 0.5 },
      { id: 2, mass: 1, radius: 10, friction: 0.5 },
      { id: 3, mass: 1, radius: 9, friction: 0.85, isFoot: true },
    ],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 70,
        minLength: 70,
        maxLength: 70,
        strength: 1,
        phaseOffset: 0,
        linkKind: 'bone',
      },
      {
        id: 1,
        nodeA: 1,
        nodeB: 2,
        originalLength: 70,
        minLength: 70,
        maxLength: 70,
        strength: 1,
        phaseOffset: 0,
        linkKind: 'bone',
      },
      {
        id: 2,
        nodeA: 2,
        nodeB: 0,
        originalLength: 70,
        minLength: 70,
        maxLength: 70,
        strength: 1,
        phaseOffset: 0,
        linkKind: 'bone',
      },
      {
        id: 3,
        nodeA: 0,
        nodeB: 3,
        originalLength: 55,
        minLength: 40,
        maxLength: 70,
        strength: 0.65,
        phaseOffset: 0,
        linkKind: 'muscle',
      },
    ],
    relativePositions: [
      { x: -30, y: -75 },
      { x: 30, y: -75 },
      { x: 0, y: -15 },
      { x: -30, y: -120 },
    ],
    solidSegments: [{ id: 's1', nodeIds: [0, 1, 2] }],
  },
  walkerLimits
);

// Hinge stop knee
runRestHold(
  'link:hinge-stop',
  {
    name: 'HingeKnee',
    nodes: [
      { id: 0, mass: 1.5, radius: 11, friction: 0.4 },
      { id: 1, mass: 1, radius: 9, friction: 0.5, isHingeStop: true },
      { id: 2, mass: 1.2, radius: 10, friction: 0.9, isFoot: true },
    ],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 45,
        minLength: 45,
        maxLength: 45,
        strength: 1,
        phaseOffset: 0,
        linkKind: 'bone',
      },
      {
        id: 1,
        nodeA: 1,
        nodeB: 2,
        originalLength: 45,
        minLength: 45,
        maxLength: 45,
        strength: 1,
        phaseOffset: 0,
        linkKind: 'bone',
      },
    ],
    relativePositions: [
      { x: 0, y: -80 },
      { x: 0, y: -40 },
      { x: 0, y: -5 },
    ],
  },
  walkerLimits
);

console.log(
  `smoke-physics-invariants: PASS (${CREATURE_TEMPLATES.length} templates + 9 synthetic bodies, ${FRAMES}f rest-hold)`
);
