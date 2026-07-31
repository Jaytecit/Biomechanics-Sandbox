/**
 * D138: Right-angle hinge stops + authored foot plants.
 * - Hinge-stop nodes clamp hard-bone pairs to ≤ 90°.
 * - Soft muscles do not define the limit.
 * - Velocity is preserved (no launch from the stop).
 * - Authored feet gate Run / Shuffle plant credit.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  enforcePairMaxAngle,
  HINGE_STOP_MAX_ANGLE,
} from '../src/hingeStops';
import {
  calculateFitness,
  spawnCreature,
  updateCreaturePhysics,
  updateWalkGait,
} from '../src/physics';
import {
  SOFT_BODY_PHYSICS_VERSION,
  WALK_STEP_MIN_INTERVAL,
  WALK_SWING_MIN_FRAMES,
} from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  PhysicsNode,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0');
assert.ok(Math.abs(HINGE_STOP_MAX_ANGLE - Math.PI / 2) < 1e-9);

function angleAt(
  hinge: Pick<PhysicsNode, 'x' | 'y'>,
  a: Pick<PhysicsNode, 'x' | 'y'>,
  b: Pick<PhysicsNode, 'x' | 'y'>
): number {
  const uax = a.x - hinge.x;
  const uay = a.y - hinge.y;
  const ubx = b.x - hinge.x;
  const uby = b.y - hinge.y;
  const dot = uax * ubx + uay * uby;
  const cross = uax * uby - uay * ubx;
  return Math.atan2(Math.abs(cross), dot);
}

// --- Unit: obtuse V collapses to 90°; acute V untouched ---
{
  const hinge: PhysicsNode = {
    id: 0, x: 0, y: 0, oldX: 0, oldY: 0, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false, isHingeStop: true,
  };
  const endA: PhysicsNode = {
    id: 1, x: 40, y: 0, oldX: 40, oldY: 0, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  const endB: PhysicsNode = {
    id: 2, x: -20, y: 20, oldX: -20, oldY: 20, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  const before = angleAt(hinge, endA, endB);
  assert.ok(before > Math.PI / 2, `setup must be obtuse, got ${before}`);
  const vxA = endA.x - endA.oldX;
  const vyA = endA.y - endA.oldY;
  const vxB = endB.x - endB.oldX;
  const vyB = endB.y - endB.oldY;
  const energyBefore = 0.5 * (vxA * vxA + vyA * vyA + vxB * vxB + vyB * vyB);
  assert.equal(enforcePairMaxAngle(hinge, endA, endB), true);
  // Gradual per-call correction — converge like the physics relaxation loop.
  for (let i = 0; i < 24; i += 1) enforcePairMaxAngle(hinge, endA, endB);
  const after = angleAt(hinge, endA, endB);
  assert.ok(
    after <= Math.PI / 2 + 1e-4,
    `hinge stop must clamp to ≤90°, got ${(after * 180) / Math.PI}°`
  );
  const nextVax = endA.x - endA.oldX;
  const nextVay = endA.y - endA.oldY;
  const nextVbx = endB.x - endB.oldX;
  const nextVby = endB.y - endB.oldY;
  const energyAfter =
    0.5 * (nextVax * nextVax + nextVay * nextVay + nextVbx * nextVbx + nextVby * nextVby);
  assert.ok(
    energyAfter <= energyBefore + 1e-6,
    `hinge projection must not inject kinetic energy (${energyBefore} -> ${energyAfter})`
  );
}

{
  // Opening into the stop must be inelastic (no Verlet bounce / energy pump).
  const hinge: PhysicsNode = {
    id: 0, x: 0, y: 0, oldX: 0, oldY: 0, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false, isHingeStop: true,
  };
  const endA: PhysicsNode = {
    id: 1, x: 40, y: 0, oldX: 40, oldY: 3, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  const endB: PhysicsNode = {
    id: 2, x: -20, y: 34.64, oldX: -24, oldY: 32, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  assert.ok(angleAt(hinge, endA, endB) > Math.PI / 2);
  const keBefore =
    0.5 *
    ((endA.x - endA.oldX) ** 2 +
      (endA.y - endA.oldY) ** 2 +
      (endB.x - endB.oldX) ** 2 +
      (endB.y - endB.oldY) ** 2);
  enforcePairMaxAngle(hinge, endA, endB);
  // Integrate a few steps with repeated projection — KE must not runaway.
  let peakKe = 0;
  for (let i = 0; i < 30; i += 1) {
    for (const n of [endA, endB]) {
      const vx = n.x - n.oldX;
      const vy = n.y - n.oldY;
      n.oldX = n.x;
      n.oldY = n.y;
      n.x += vx;
      n.y += vy;
    }
    enforcePairMaxAngle(hinge, endA, endB);
    const ke =
      0.5 *
      ((endA.x - endA.oldX) ** 2 +
        (endA.y - endA.oldY) ** 2 +
        (endB.x - endB.oldX) ** 2 +
        (endB.y - endB.oldY) ** 2);
    peakKe = Math.max(peakKe, ke);
  }
  assert.ok(
    peakKe <= keBefore * 1.5 + 1,
    `inelastic hinge stop must not pump KE (start ${keBefore} peak ${peakKe})`
  );
}

{
  const hinge: PhysicsNode = {
    id: 0, x: 0, y: 0, oldX: 0, oldY: 0, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false, isHingeStop: true,
  };
  const endA: PhysicsNode = {
    id: 1, x: 30, y: 0, oldX: 30, oldY: 0, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  const endB: PhysicsNode = {
    id: 2, x: 0, y: 30, oldX: 0, oldY: 30, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  const before = angleAt(hinge, endA, endB);
  assert.ok(Math.abs(before - Math.PI / 2) < 1e-6);
  assert.equal(enforcePairMaxAngle(hinge, endA, endB), false);
  assert.equal(endA.x, 30);
  assert.equal(endB.y, 30);
}

{
  // Parallel (0°) is allowed.
  const hinge: PhysicsNode = {
    id: 0, x: 0, y: 0, oldX: 0, oldY: 0, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false, isHingeStop: true,
  };
  const endA: PhysicsNode = {
    id: 1, x: 40, y: 0, oldX: 40, oldY: 0, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  const endB: PhysicsNode = {
    id: 2, x: 40, y: 1, oldX: 40, oldY: 1, vx: 0, vy: 0,
    mass: 1, radius: 8, friction: 0.5, isGround: false,
  };
  assert.equal(enforcePairMaxAngle(hinge, endA, endB), false);
}

// --- Integration: physics does not launch a hinged L ---
{
  const blueprint: CreatureBlueprint = {
    name: 'Hinge L',
    nodes: [
      { id: 0, mass: 1.5, radius: 10, friction: 0.5, isHingeStop: true },
      { id: 1, mass: 1.5, radius: 10, friction: 0.5 },
      { id: 2, mass: 1.5, radius: 10, friction: 0.5 },
    ],
    muscles: [
      {
        id: 0, nodeA: 0, nodeB: 1, originalLength: 50, minLength: 50, maxLength: 50,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 1, nodeA: 0, nodeB: 2, originalLength: 50, minLength: 50, maxLength: 50,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
    ],
    // Start obtuse (~135°) so the stop must project on spawn settle.
    relativePositions: [
      { x: 0, y: -40 },
      { x: 50, y: -40 },
      { x: -35, y: -5 },
    ],
  };
  const io = genomeIOForBlueprint(blueprint);
  const config: SimulationConfig = {
    populationSize: 1,
    generationDuration: 12,
    simulationSpeed: 1,
    mutationRate: 0.1,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
  const creature = spawnCreature(
    {
      id: 'hinge-l',
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    200,
    380,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
  const idle = new Array(io.outputs).fill(0);
  let peakVy = 0;
  for (let f = 0; f < 180; f += 1) {
    updateCreaturePhysics(creature, [], f, config, [], idle);
    for (const n of creature.nodes) {
      peakVy = Math.max(peakVy, Math.abs(n.y - n.oldY));
    }
  }
  const [h, a, b] = creature.nodes;
  const finalAngle = angleAt(h, a, b);
  assert.ok(
    finalAngle <= Math.PI / 2 + 0.08,
    `settled hinge must stay ≤90°, got ${(finalAngle * 180) / Math.PI}°`
  );
  // No Verlet launch: nodes should not leave the floor region with huge speeds.
  assert.ok(peakVy < 40, `hinge stop must not invent launch speed, peak |vy|=${peakVy}`);
  assert.ok(
    creature.nodes.every(n => n.y > 200),
    'hinged L must remain near the ground (no air launch)'
  );
}

// --- Soft muscle fighting the stop must not explode KE ---
{
  const blueprint: CreatureBlueprint = {
    name: 'Knee Drive',
    nodes: [
      { id: 0, mass: 3, radius: 10, friction: 0.6 },
      { id: 1, mass: 1.5, radius: 8, friction: 0.5, isHingeStop: true },
      { id: 2, mass: 1.2, radius: 9, friction: 0.8, isFoot: true },
    ],
    muscles: [
      {
        id: 0, nodeA: 0, nodeB: 1, originalLength: 35, minLength: 35, maxLength: 35,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 1, nodeA: 1, nodeB: 2, originalLength: 35, minLength: 35, maxLength: 35,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 2, nodeA: 0, nodeB: 2, originalLength: 60, minLength: 55, maxLength: 70,
        strength: 1, phaseOffset: 0, linkKind: 'muscle',
      },
    ],
    relativePositions: [
      { x: 0, y: -70 },
      { x: 10, y: -40 },
      { x: 5, y: -10 },
    ],
  };
  const io = genomeIOForBlueprint(blueprint);
  const config: SimulationConfig = {
    populationSize: 1,
    generationDuration: 20,
    simulationSpeed: 1,
    mutationRate: 0.1,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
  const creature = spawnCreature(
    {
      id: 'knee-drive',
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    200,
    380,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
  const outputs = new Array(io.outputs).fill(1);
  let peakKe = 0;
  let peakSpeed = 0;
  for (let f = 0; f < 400; f += 1) {
    for (const m of creature.muscles) {
      if (m.linkKind === 'muscle') m.targetLength = m.maxLength;
    }
    updateCreaturePhysics(creature, [], f, config, [], outputs);
    let ke = 0;
    for (const n of creature.nodes) {
      const vx = n.x - n.oldX;
      const vy = n.y - n.oldY;
      ke += 0.5 * n.mass * (vx * vx + vy * vy);
      peakSpeed = Math.max(peakSpeed, Math.hypot(vx, vy));
    }
    peakKe = Math.max(peakKe, ke);
  }
  assert.ok(
    peakKe < 100,
    `soft muscle vs hinge stop must not explode KE (peak ${peakKe.toFixed(1)})`
  );
  assert.ok(
    peakSpeed < 9,
    `soft muscle vs hinge stop must not invent launch speed (peak ${peakSpeed.toFixed(2)})`
  );
  assert.ok(
    creature.nodes.every(n => n.y > 350),
    'hinge stop must not launch the creature into the air'
  );
  const [hip, knee, foot] = creature.nodes;
  const finalAng = angleAt(knee, hip, foot);
  assert.ok(
    finalAng <= Math.PI / 2 + 0.15,
    `driven knee must stay near ≤90°, got ${(finalAng * 180) / Math.PI}°`
  );
}

// --- Authored feet gate plant credit ---
{
  const blueprint: CreatureBlueprint = {
    name: 'Two Feet + Knee',
    nodes: [
      { id: 0, mass: 2, radius: 12, friction: 0.6 }, // hip / body
      { id: 1, mass: 1.2, radius: 9, friction: 0.7, isFoot: true },
      { id: 2, mass: 1.2, radius: 9, friction: 0.7, isFoot: true },
      { id: 3, mass: 1, radius: 8, friction: 0.4 }, // knee contact spoiler
    ],
    muscles: [
      {
        id: 0, nodeA: 0, nodeB: 1, originalLength: 40, minLength: 30, maxLength: 50,
        strength: 0.8, phaseOffset: 0, linkKind: 'muscle',
      },
      {
        id: 1, nodeA: 0, nodeB: 2, originalLength: 40, minLength: 30, maxLength: 50,
        strength: 0.8, phaseOffset: 0.5, linkKind: 'muscle',
      },
      {
        id: 2, nodeA: 0, nodeB: 3, originalLength: 25, minLength: 20, maxLength: 35,
        strength: 0.5, phaseOffset: 0.25, linkKind: 'muscle',
      },
    ],
    relativePositions: [
      { x: 0, y: -50 },
      { x: -25, y: -10 },
      { x: 25, y: -10 },
      { x: 0, y: -18 },
    ],
  };
  const io = genomeIOForBlueprint(blueprint);
  const creature = spawnCreature(
    {
      id: 'feet',
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    100,
    380,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );

  // Seed frontiers with a real foot, then plant the unmarked knee — must not credit.
  creature.nodes.forEach(n => {
    n.isGround = false;
  });
  creature.walkPrevGrounded = creature.nodes.map(() => false);
  creature.walkNodeAirFrames = creature.nodes.map(() => WALK_SWING_MIN_FRAMES + 2);
  creature.episodeFrames = 10;
  creature.currentX = 100;
  creature.startX = 100;
  creature.nodes[1].isGround = true;
  creature.nodes[1].x = 120;
  updateWalkGait(creature, 1);
  assert.ok(
    (creature.walkGaitNodeIds ?? []).includes(1),
    'marked foot must enter gait'
  );

  creature.episodeFrames =
    (creature.walkLastStepFrame ?? 10) + WALK_STEP_MIN_INTERVAL + 2;
  creature.walkNodeAirFrames = creature.nodes.map(() => WALK_SWING_MIN_FRAMES + 2);
  creature.walkPrevGrounded = creature.nodes.map((_, i) => i === 1);
  creature.nodes[1].isGround = false;
  creature.nodes[3].isGround = true;
  creature.nodes[3].x = 160;
  creature.currentX = 140;
  const stepsBefore = creature.walkStepCountRight ?? 0;
  updateWalkGait(creature, 1);
  assert.equal(
    creature.walkStepCountRight ?? 0,
    stepsBefore,
    'unmarked knee contact must not mint a Run step when feet are authored'
  );
  assert.ok(
    !(creature.walkGaitNodeIds ?? []).includes(3),
    'unmarked knee must stay out of the gait set'
  );

  // Alternate between the two feet → unlocks Run score path.
  creature.walkPlantFrontierX = 120;
  creature.walkBodyFrontierX = 100;
  creature.walkLastStepNodeId = 1;
  creature.walkLastStepFrame = creature.episodeFrames;
  creature.episodeFrames += WALK_STEP_MIN_INTERVAL + 2;
  creature.walkNodeAirFrames = creature.nodes.map(() => WALK_SWING_MIN_FRAMES + 2);
  creature.walkPrevGrounded = creature.nodes.map(() => false);
  creature.nodes.forEach(n => {
    n.isGround = false;
  });
  creature.nodes[2].isGround = true;
  creature.nodes[2].x = 150;
  creature.currentX = 135;
  updateWalkGait(creature, 1);
  assert.ok(
    (creature.walkAlternateStepCountRight ?? 0) >= 1,
    'foot-to-foot transfer must count as alternate'
  );
  assert.ok(
    calculateFitness(creature, EvolutionGoal.LOCOMOTION_RIGHT) > 0,
    'alternating authored feet must be able to score on Run Right'
  );
}

console.log('ok smoke-hinge-stops (D138 feet + 90° hinge)');
