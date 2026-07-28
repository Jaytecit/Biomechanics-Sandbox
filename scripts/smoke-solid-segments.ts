/**
 * D136 solid segments — compound rigid plates via shape matching.
 * Run: npx tsx scripts/smoke-solid-segments.ts
 */
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
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
} from '../src/types';
import {
  softLinksInsideSolid,
  validateSolidSegments,
  normalizeSolidSegments,
} from '../src/solidSegments';
import { bodyFingerprint } from '../src/creaturePackages';
import { buildGoalArena } from '../src/arenas';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

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

/** Triangle plate + hinged soft limb (boundary only). */
function plateWithLimb(): CreatureBlueprint {
  return {
    name: 'SolidPlateSmoke',
    nodes: [
      { id: 0, mass: 1, radius: 10, friction: 0.5 },
      { id: 1, mass: 1, radius: 10, friction: 0.5 },
      { id: 2, mass: 1, radius: 10, friction: 0.5 },
      { id: 3, mass: 1, radius: 10, friction: 0.5 },
    ],
    muscles: [
      // Internal hard chords (skipped by length projection; plate owns shape)
      {
        id: 0, nodeA: 0, nodeB: 1, originalLength: 80, minLength: 80, maxLength: 80,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 1, nodeA: 1, nodeB: 2, originalLength: 80, minLength: 80, maxLength: 80,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 2, nodeA: 2, nodeB: 0, originalLength: 80, minLength: 80, maxLength: 80,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      // Soft hinge from plate boundary to free limb tip
      {
        id: 3, nodeA: 0, nodeB: 3, originalLength: 60, minLength: 40, maxLength: 80,
        strength: 0.7, phaseOffset: 0, linkKind: 'muscle',
      },
    ],
    relativePositions: [
      { x: -40, y: -70 },
      { x: 40, y: -70 },
      { x: 0, y: -10 },
      { x: -40, y: -120 },
    ],
    solidSegments: [{ id: 'solid-1', nodeIds: [0, 1, 2] }],
  };
}

function spawnFrom(blueprint: CreatureBlueprint): Creature {
  const io = genomeIOForBlueprint(blueprint);
  const genome = createBaseGenome(io.inputs, io.outputs);
  for (const c of genome.connections) c.weight = 0;
  return spawnCreature(
    {
      id: 'solid_smoke',
      generation: 0,
      blueprint,
      genome,
    },
    200,
    GROUND_Y - 40,
    EvolutionGoal.LOCOMOTION_RIGHT,
    1
  );
}

function plateEdgeLengths(creature: Creature): number[] {
  const pairs = [
    [0, 1],
    [1, 2],
    [2, 0],
  ] as const;
  return pairs.map(([a, b]) => {
    const na = creature.nodes[a];
    const nb = creature.nodes[b];
    return Math.hypot(nb.x - na.x, nb.y - na.y);
  });
}

function plateAngles(creature: Creature): number[] {
  // Angle at each plate vertex (degrees)
  const idxs = [0, 1, 2];
  return idxs.map(i => {
    const prev = creature.nodes[idxs[(i + 2) % 3]];
    const cur = creature.nodes[idxs[i]];
    const next = creature.nodes[idxs[(i + 1) % 3]];
    const ax = prev.x - cur.x;
    const ay = prev.y - cur.y;
    const bx = next.x - cur.x;
    const by = next.y - cur.y;
    const dot = ax * bx + ay * by;
    const cross = ax * by - ay * bx;
    return (Math.atan2(cross, dot) * 180) / Math.PI;
  });
}

function maxNodeSpeed(creature: Creature): number {
  let peak = 0;
  for (const n of creature.nodes) {
    peak = Math.max(peak, Math.hypot(n.x - n.oldX, n.y - n.oldY));
  }
  return peak;
}

console.log(`physics ${SOFT_BODY_PHYSICS_VERSION}`);
assert(SOFT_BODY_PHYSICS_VERSION === '4.21.0', 'expected physics 4.21.0');

// --- Validation: soft chord inside solid is rejected ---
{
  const bad: CreatureBlueprint = {
    ...plateWithLimb(),
    muscles: [
      ...plateWithLimb().muscles,
      {
        id: 99, nodeA: 0, nodeB: 1, originalLength: 80, minLength: 50, maxLength: 110,
        strength: 0.5, phaseOffset: 0, linkKind: 'muscle',
      },
    ],
  };
  const solids = normalizeSolidSegments(bad.solidSegments);
  assert(softLinksInsideSolid(bad.muscles, solids).length === 1, 'detect soft inside solid');
  assert(
    validateSolidSegments(solids, bad.nodes.map(n => n.id), bad.muscles) !== null,
    'validate rejects soft inside solid'
  );
  console.log('PASS validation rejects interior soft muscle');
}

// --- Spawn builds runtime solid ---
{
  const creature = spawnFrom(plateWithLimb());
  assert(!!creature.solidBodies && creature.solidBodies.length === 1, 'runtime solid body present');
  assert(creature.solidBodies![0].nodeIndices.length === 3, 'solid has 3 nodes');
  console.log('PASS spawn builds solidBodies');
}

// --- Shape holds under gravity + soft hinge actuation ---
{
  const creature = spawnFrom(plateWithLimb());
  const cfg = baseConfig();
  const restEdges = plateEdgeLengths(creature);
  const restAngles = plateAngles(creature);

  for (let i = 0; i < 240; i++) {
    updateCreaturePhysics(creature, [], i, cfg, []);
  }

  const edges = plateEdgeLengths(creature);
  for (let i = 0; i < 3; i++) {
    assert(
      Math.abs(edges[i] - restEdges[i]) < 2.5,
      `plate edge ${i} drifted: ${edges[i].toFixed(2)} vs ${restEdges[i].toFixed(2)}`
    );
  }
  const angles = plateAngles(creature);
  for (let i = 0; i < 3; i++) {
    assert(
      Math.abs(angles[i] - restAngles[i]) < 4,
      `plate angle ${i} drifted: ${angles[i].toFixed(1)} vs ${restAngles[i].toFixed(1)}`
    );
  }
  console.log('PASS plate edges/angles hold under gravity');
}

// --- No launch / energy explosion ---
{
  const creature = spawnFrom(plateWithLimb());
  const cfg = baseConfig();
  let peakSpeed = 0;
  let peakClearanceAfterSettle = 0;
  let settled = false;
  for (let i = 0; i < 360; i++) {
    updateCreaturePhysics(creature, [], i, cfg, []);
    peakSpeed = Math.max(peakSpeed, maxNodeSpeed(creature));
    const clearance = GROUND_Y - Math.max(...creature.nodes.map(n => n.y + n.radius));
    if (creature.nodes.some(n => n.isGround)) settled = true;
    // After first ground contact, plates must not sky-launch.
    if (settled && i > 30) {
      peakClearanceAfterSettle = Math.max(peakClearanceAfterSettle, clearance);
    }
  }
  assert(peakSpeed < 80, `node speed exploded: ${peakSpeed.toFixed(1)}`);
  assert(
    peakClearanceAfterSettle < 80,
    `body launched after settle: clearance ${peakClearanceAfterSettle.toFixed(1)}`
  );
  assert(Number.isFinite(creature.fitness), 'fitness finite');
  console.log(
    `PASS no launch (peakSpeed=${peakSpeed.toFixed(1)} postSettleClear=${peakClearanceAfterSettle.toFixed(1)})`
  );
}

// --- Fingerprint includes solids ---
{
  const a = plateWithLimb();
  const b = { ...plateWithLimb(), solidSegments: undefined };
  assert(bodyFingerprint(a) !== bodyFingerprint(b), 'fingerprint differs with/without solid');
  console.log('PASS fingerprint includes solidSegments');
}

// --- Bodies without solids unchanged path ---
{
  const bare: CreatureBlueprint = {
    name: 'BareBone',
    nodes: [
      { id: 0, mass: 1, radius: 10, friction: 0.5 },
      { id: 1, mass: 1, radius: 10, friction: 0.5 },
    ],
    muscles: [
      {
        id: 0, nodeA: 0, nodeB: 1, originalLength: 80, minLength: 80, maxLength: 80,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
    ],
    relativePositions: [
      { x: -40, y: -40 },
      { x: 40, y: -40 },
    ],
  };
  const creature = spawnFrom(bare);
  assert(!creature.solidBodies || creature.solidBodies.length === 0, 'no solids on bare body');
  const cfg = baseConfig();
  for (let i = 0; i < 60; i++) {
    updateCreaturePhysics(creature, [], i, cfg, []);
  }
  const len = Math.hypot(
    creature.nodes[1].x - creature.nodes[0].x,
    creature.nodes[1].y - creature.nodes[0].y
  );
  assert(Math.abs(len - 80) < 3, `bare bone length drifted: ${len}`);
  console.log('PASS bare body (no solids) still stable');
}

// --- Hard-only plate: quieter bounce than soft-hinged plate ---
{
  const hardOnly: CreatureBlueprint = {
    name: 'HardSolidPlate',
    nodes: [
      { id: 0, mass: 1, radius: 10, friction: 0.5 },
      { id: 1, mass: 1, radius: 10, friction: 0.5 },
      { id: 2, mass: 1, radius: 10, friction: 0.5 },
    ],
    muscles: [
      {
        id: 0, nodeA: 0, nodeB: 1, originalLength: 80, minLength: 80, maxLength: 80,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 1, nodeA: 1, nodeB: 2, originalLength: 80, minLength: 80, maxLength: 80,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 2, nodeA: 2, nodeB: 0, originalLength: 80, minLength: 80, maxLength: 80,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
    ],
    relativePositions: [
      { x: -40, y: -34.64 },
      { x: 40, y: -34.64 },
      { x: 0, y: 34.64 },
    ],
    solidSegments: [{ id: 'solid-1', nodeIds: [0, 1, 2] }],
  };
  const creature = spawnFrom(hardOnly);
  const cfg = baseConfig();
  const restEdges = plateEdgeLengths(creature);
  let peakClear = 0;
  let groundedStreak = 0;
  let measuring = false;
  for (let i = 0; i < 300; i++) {
    updateCreaturePhysics(creature, [], i, cfg, []);
    if (creature.nodes.some(n => n.isGround)) groundedStreak += 1;
    else groundedStreak = 0;
    if (groundedStreak >= 20) measuring = true;
    if (measuring) {
      const clearance = GROUND_Y - Math.max(...creature.nodes.map(n => n.y + n.radius));
      peakClear = Math.max(peakClear, clearance);
    }
  }
  assert(measuring, 'hard plate eventually rests on ground');
  assert(peakClear < 5, `hard-only plate bounced too high: ${peakClear.toFixed(1)}`);
  const edges = plateEdgeLengths(creature);
  const edgeErr = Math.max(
    Math.abs(edges[0] - restEdges[0]),
    Math.abs(edges[1] - restEdges[1]),
    Math.abs(edges[2] - restEdges[2])
  );
  assert(edgeErr < 3, `hard plate edges drifted (err=${edgeErr.toFixed(2)}, edges=${edges.map(e => e.toFixed(1)).join(',')})`);
  console.log(`PASS hard-only plate (restClear=${peakClear.toFixed(1)} edgeErr=${edgeErr.toFixed(2)})`);
}

// --- D144: wheeled solid chassis must not bury into the floor ---
{
  const wheeled: CreatureBlueprint = {
    name: 'WheeledSolidChassis',
    nodes: [
      {
        id: 0, mass: 0.5, radius: 20, friction: 0.05,
        isWheel: true, isMotorWheel: true, motorPower: 8,
      },
      { id: 1, mass: 1.5, radius: 10, friction: 0.5 },
      { id: 2, mass: 1.5, radius: 10, friction: 0.5 },
      {
        id: 3, mass: 1.5, radius: 20, friction: 0.05,
        isWheel: true, isMotorWheel: true, motorPower: 8,
      },
    ],
    muscles: [
      {
        id: 0, nodeA: 0, nodeB: 1, originalLength: 70, minLength: 70, maxLength: 70,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 1, nodeA: 1, nodeB: 2, originalLength: 120, minLength: 120, maxLength: 120,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 2, nodeA: 2, nodeB: 3, originalLength: 70, minLength: 70, maxLength: 70,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
      {
        id: 3, nodeA: 0, nodeB: 3, originalLength: 260, minLength: 260, maxLength: 260,
        strength: 1, phaseOffset: 0, linkKind: 'bone',
      },
    ],
    relativePositions: [
      { x: -130, y: -30 },
      { x: -40, y: -90 },
      { x: 40, y: -90 },
      { x: 130, y: -30 },
    ],
    solidSegments: [{ id: 'solid-1', nodeIds: [0, 1, 2, 3] }],
  };
  const creature = spawnFrom(wheeled);
  assert(creature.solidBodies?.length === 1, 'wheeled chassis has one solid');
  const cfg = baseConfig();
  let worstPen = 0;
  for (let i = 0; i < 180; i++) {
    updateCreaturePhysics(creature, [], i, cfg, []);
    for (const n of creature.nodes) {
      worstPen = Math.max(worstPen, n.y + n.radius - GROUND_Y);
    }
  }
  assert(
    worstPen < 3,
    `wheeled solid chassis buried into floor (worstPen=${worstPen.toFixed(2)})`
  );
  const wheelGrounded = creature.nodes.some(n => n.isWheel && n.isGround);
  assert(wheelGrounded, 'at least one wheel should rest on the floor');
  console.log(`PASS wheeled solid chassis stays on floor (worstPen=${worstPen.toFixed(2)})`);

  // Structured courses still must lift solid wheels out of flat-floor burial on
  // the approach pad (D144) without yanking climbers back to GROUND_Y on the ramp.
  const obstacles = buildGoalArena(EvolutionGoal.MOTOR_RAMP, DEFAULT_ARENA_MODIFIERS);
  const rampCfg: SimulationConfig = {
    ...baseConfig(),
    goal: EvolutionGoal.MOTOR_RAMP,
  };
  const io = genomeIOForBlueprint(wheeled);
  const rampGenome = createBaseGenome(io.inputs, io.outputs);
  for (const c of rampGenome.connections) c.weight = 0;
  const rampSpawn = spawnCreature(
    {
      id: 'solid_smoke_ramp',
      generation: 0,
      blueprint: wheeled,
      genome: rampGenome,
    },
    200,
    GROUND_Y - 40,
    EvolutionGoal.MOTOR_RAMP,
    1
  );
  let rampWorstPen = 0;
  for (let i = 0; i < 180; i++) {
    updateCreaturePhysics(rampSpawn, obstacles, i, rampCfg, []);
    for (const n of rampSpawn.nodes) {
      rampWorstPen = Math.max(rampWorstPen, n.y + n.radius - GROUND_Y);
    }
  }
  assert(
    rampWorstPen < 4,
    `wheeled solid on Motor Ramp approach buried into floor (worstPen=${rampWorstPen.toFixed(2)})`
  );
  console.log(
    `PASS wheeled solid on Motor Ramp approach (worstPen=${rampWorstPen.toFixed(2)})`
  );
}

console.log('smoke-solid-segments: ALL PASS');
