/**
 * D151: soft-muscle bone-slot moment arms.
 * Run: npx tsx scripts/smoke-moment-arm.ts
 */
import { spawnCreature, updateCreaturePhysics, resolveMuscleAnchors, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import {
  Creature,
  CreatureBlueprint,
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  normalizeCreatureBlueprint,
  muscleHasLever,
  findParallelHardLink,
  isBrainDrivenMuscle,
  LEVER_SLOT_T,
} from '../src/types';
import { bodyFingerprint } from '../src/creaturePackages';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  SOFT_BODY_PHYSICS_VERSION === '4.26.0',
  `expected physics 4.26.0, got ${SOFT_BODY_PHYSICS_VERSION}`
);
assert(LEVER_SLOT_T.nearA === 0.25 && LEVER_SLOT_T.mid === 0.5 && LEVER_SLOT_T.nearB === 0.75, 'slot t');

function baseConfig(): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 600,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.LOCOMOTION_RIGHT,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

/** Torso (0) + thigh bone hip(1)–knee(2); soft muscle torso→thigh mid. */
function leverBlueprint(): CreatureBlueprint {
  return {
    name: 'MomentArmSmoke',
    nodes: [
      { id: 0, mass: 1, radius: 8, friction: 0.5 },
      { id: 1, mass: 1, radius: 8, friction: 0.5 },
      { id: 2, mass: 1, radius: 8, friction: 0.5 },
    ],
    muscles: [
      {
        id: 0,
        nodeA: 1,
        nodeB: 2,
        originalLength: 80,
        minLength: 80,
        maxLength: 80,
        strength: 1,
        phaseOffset: 0,
        linkKind: 'bone',
      },
      {
        id: 1,
        nodeA: 0,
        nodeB: 1,
        originalLength: 60,
        minLength: 30,
        maxLength: 90,
        strength: 0.9,
        phaseOffset: 0,
        linkKind: 'muscle',
        leverBoneB: 0,
        leverSlotB: 'mid',
      },
    ],
    relativePositions: [
      { x: 0, y: -100 },
      { x: 40, y: -40 },
      { x: 40, y: 40 },
    ],
  };
}

function nodeEndBlueprint(): CreatureBlueprint {
  const bp = leverBlueprint();
  const soft = { ...bp.muscles[1] };
  delete soft.leverBoneB;
  delete soft.leverSlotB;
  soft.nodeB = 2; // attach at knee
  return { ...bp, muscles: [bp.muscles[0], soft] };
}

function spawnFrom(blueprint: CreatureBlueprint): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: 'moment_arm_smoke',
      generation: 0,
      blueprint,
      genome,
    },
    200,
    GROUND_Y - 80,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
}

/** −1…1 override: soft actuators first, then motors. */
function contractOverride(creature: Creature): number[] {
  const outputs: number[] = [];
  for (const muscle of creature.muscles) {
    if (!isBrainDrivenMuscle(muscle, creature.muscles)) continue;
    outputs.push(-1); // minLength
  }
  for (const node of creature.nodes) {
    if (node.isMotorWheel) outputs.push(0);
  }
  return outputs;
}

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

// Normalize keeps levers; strips on bones.
{
  const n = normalizeCreatureBlueprint(leverBlueprint());
  assert(n.muscles[0].leverBoneB === undefined, 'bone strips levers');
  assert(n.muscles[1].leverBoneB === 0 && n.muscles[1].leverSlotB === 'mid', 'soft keeps mid');
  assert(muscleHasLever(n.muscles[1]), 'muscleHasLever');
  assert(
    findParallelHardLink(n.muscles[1], n.muscles) === undefined,
    'levered soft does not pair with hard'
  );
}

// Invalid host stripped
{
  const bad = normalizeCreatureBlueprint({
    ...leverBlueprint(),
    muscles: [
      leverBlueprint().muscles[0],
      {
        ...leverBlueprint().muscles[1],
        leverBoneB: 99,
        leverSlotB: 'mid',
      },
    ],
  });
  assert(bad.muscles[1].leverBoneB === undefined, 'invalid host stripped');
}

// Fingerprint changes when lever present
{
  const a = bodyFingerprint(normalizeCreatureBlueprint(leverBlueprint()));
  const b = bodyFingerprint(normalizeCreatureBlueprint(nodeEndBlueprint()));
  assert(a !== b, 'fingerprint includes levers');
}

// Mid attach moves both hip and knee under held contract
{
  const bp = normalizeCreatureBlueprint(leverBlueprint());
  const creature = spawnFrom(bp);
  const soft = creature.muscles.find(m => m.linkKind === 'muscle')!;
  assert(soft.leverBoneB === 0 && soft.leverSlotB === 'mid', 'spawn keeps lever');

  const anchors0 = resolveMuscleAnchors(soft, creature.muscles, creature.nodes);
  assert(Math.abs(anchors0.endB.weights[0].w - 0.5) < 1e-9, 'mid weight A');
  assert(Math.abs(anchors0.endB.weights[1].w - 0.5) < 1e-9, 'mid weight B');

  const hip0 = { x: creature.nodes[1].x, y: creature.nodes[1].y };
  const knee0 = { x: creature.nodes[2].x, y: creature.nodes[2].y };
  const override = contractOverride(creature);
  const cfg = baseConfig();
  for (let i = 0; i < 40; i++) {
    updateCreaturePhysics(creature, [], i / 60, cfg, [], override);
  }

  const hipMoved =
    Math.hypot(creature.nodes[1].x - hip0.x, creature.nodes[1].y - hip0.y) > 0.05;
  const kneeMoved =
    Math.hypot(creature.nodes[2].x - knee0.x, creature.nodes[2].y - knee0.y) > 0.05;
  assert(hipMoved, 'mid lever should move hip');
  assert(kneeMoved, 'mid lever should move knee');
  console.log('ok mid lever moves hip+knee');
}

// Rest-hold: no runaway KE with levered muscle at rest length
{
  const bp = normalizeCreatureBlueprint(leverBlueprint());
  const creature = spawnFrom(bp);
  const override = restHoldOverride(creature);
  const cfg = baseConfig();
  let maxKe = 0;
  for (let i = 0; i < 360; i++) {
    updateCreaturePhysics(creature, [], i / 60, cfg, [], override);
    let ke = 0;
    for (const n of creature.nodes) {
      const vx = n.x - n.oldX;
      const vy = n.y - n.oldY;
      ke += 0.5 * n.mass * (vx * vx + vy * vy);
    }
    maxKe = Math.max(maxKe, ke);
  }
  assert(maxKe < 50, `rest-hold KE runaway: ${maxKe}`);
  console.log('ok rest-hold');
}

// Node-end attach: constraint weights only the knee (hip moves only via bone)
{
  const bp = normalizeCreatureBlueprint(nodeEndBlueprint());
  const creature = spawnFrom(bp);
  const soft = creature.muscles.find(m => m.linkKind === 'muscle')!;
  assert(!muscleHasLever(soft), 'node-end has no lever');
  const anchors = resolveMuscleAnchors(soft, creature.muscles, creature.nodes);
  assert(anchors.endB.weights.length === 1, 'node-end single weight');
  assert(anchors.endB.weights[0].nodeIndex === 2, 'node-end weights knee');
  assert(anchors.endB.weights[0].w === 1, 'node-end full weight on knee');
  console.log('ok node-end weights knee only');
}

console.log('smoke-moment-arm: ok');
