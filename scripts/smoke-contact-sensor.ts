/**
 * C2 / D147 — Contact / touch sensor contract smoke.
 *
 * Observation only: per-node contact class + fixed summary pack
 * (floor / structure / object + link structure / object). Never creates
 * forces or rewrites rewards.
 *
 * Run: npx tsx scripts/smoke-contact-sensor.ts
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  GROUND_Y,
  spawnCreature,
  stepPrivateWorld,
  updateCreaturePhysics,
} from '../src/physics';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import {
  CONTACT_FLOOR,
  CONTACT_OBJECT,
  CONTACT_SENSOR_COUNT,
  CONTACT_STRUCTURE,
  ContactClass,
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  OBJECT_SENSOR_COUNT,
  Obstacle,
  SimulationConfig,
  contactSensorValues,
  encodeContactClass,
  genomeIOForBlueprint,
  markNodeContact,
  nodeContactSensorValue,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0', 'C2 ships under physics 4.26.0');

assert.equal(encodeContactClass(CONTACT_FLOOR), 1 / 3);
assert.equal(encodeContactClass(CONTACT_STRUCTURE), 2 / 3);
assert.equal(encodeContactClass(CONTACT_OBJECT), 1);

const bare: { isGround: boolean; contactClass?: number } = {
  isGround: true,
  contactClass: CONTACT_STRUCTURE,
};
assert.equal(
  nodeContactSensorValue(bare as any, false),
  encodeContactClass(CONTACT_STRUCTURE),
  'Touch encodes structure class'
);
assert.equal(
  nodeContactSensorValue(bare as any, true),
  encodeContactClass(CONTACT_FLOOR),
  'ablation strips class to floor-or-none'
);

const blueprint: CreatureBlueprint = {
  name: 'Contact sensor probe',
  nodes: [
    {
      id: 0,
      mass: 0.0015,
      radius: 2,
      friction: 0.9,
      isWheel: false,
      isMotorWheel: false,
    },
    {
      id: 1,
      mass: 0.0015,
      radius: 2,
      friction: 0.9,
      isWheel: false,
      isMotorWheel: false,
    },
  ],
  relativePositions: [
    { x: -4, y: 0 },
    { x: 4, y: 0 },
  ],
  muscles: [
    {
      id: 0,
      nodeA: 0,
      nodeB: 1,
      originalLength: 8,
      minLength: 8,
      maxLength: 8,
      strength: 1,
      phaseOffset: 0,
      linkKind: 'bone',
    },
  ],
};

const io = genomeIOForBlueprint(blueprint);
assert.equal(
  io.inputs,
  2 + 3 * blueprint.nodes.length + OBJECT_SENSOR_COUNT + CONTACT_SENSOR_COUNT,
  'genome I/O always includes object + contact packs'
);

const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 20,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.CARRY_BALL,
  gravity: 0.4,
  groundFriction: 0.85,
  arena: {
    ...DEFAULT_ARENA_MODIFIERS,
    windEnabled: false,
    terrainEnabled: false,
    terrainObstaclesEnabled: false,
    rampEnabled: false,
    pitEnabled: false,
  },
  customGoal: DEFAULT_CUSTOM_GOAL,
};

const lowest = Math.max(
  ...blueprint.nodes.map((n, i) => (blueprint.relativePositions[i]?.y ?? 0) + n.radius)
);
const spawnY = GROUND_Y - lowest;

const creature = spawnCreature(
  {
    id: 'contact-sensor-live',
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  },
  120,
  spawnY,
  EvolutionGoal.CARRY_BALL,
  1
);

const idle = new Array(io.outputs).fill(0);
for (let frame = 0; frame < 8; frame += 1) {
  stepPrivateWorld(creature.privateWorld!, [], config, frame);
  updateCreaturePhysics(creature, [], frame, config, creature.privateWorld!, idle);
}

assert.ok(
  creature.nodes.some(n => n.isGround && n.contactClass === CONTACT_FLOOR),
  'flat plant tags floor class'
);
const floorPack = contactSensorValues(creature);
assert.equal(floorPack[0], 1, 'summary reports node floor contact');
assert.equal(floorPack[1], 0, 'no structure on flat floor');
assert.deepEqual(
  contactSensorValues(creature, true),
  [0, 0, 0, 0, 0],
  'ablated summary pack is zeros'
);

// Structure wall overlapping the creature so contact resolves without motors
const wall: Obstacle = {
  type: 'box',
  x: 118,
  y: GROUND_Y - 40,
  width: 20,
  height: 40,
};
const wallCreature = spawnCreature(
  {
    id: 'contact-wall',
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  },
  120,
  spawnY,
  EvolutionGoal.MOTOR_DRIVE,
  1
);
for (let frame = 0; frame < 12; frame += 1) {
  updateCreaturePhysics(wallCreature, [wall], frame, config, [], idle);
}
assert.ok(
  wallCreature.nodes.some(n => (n.contactClass ?? 0) >= CONTACT_STRUCTURE) ||
    wallCreature.linkContactStructure,
  'wall collision tags structure on node and/or hard link'
);
const structPack = contactSensorValues(wallCreature);
assert.ok(
  structPack[1] === 1 || structPack[3] === 1,
  'summary reports structure via node or link channel'
);

// Object contact on a private ball (force path must not move an idle ball when
// the creature is held clear — here we only assert class tagging on overlap).
const carry = spawnCreature(
  {
    id: 'contact-ball',
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  },
  100,
  spawnY,
  EvolutionGoal.CARRY_BALL,
  1
);
const ball = carry.privateWorld!.find(o => o.type === 'ball');
assert.ok(ball, 'Carry Ball spawns a private ball');
ball!.x = carry.nodes[0].x;
ball!.y = carry.nodes[0].y;
ball!.oldX = ball!.x;
ball!.oldY = ball!.y;
stepPrivateWorld(carry.privateWorld!, [], config, 0);
updateCreaturePhysics(carry, [], 0, config, carry.privateWorld!, idle);
assert.ok(
  carry.nodes.some(n => n.contactClass === CONTACT_OBJECT),
  'ball overlap tags object class'
);
assert.equal(contactSensorValues(carry)[2], 1, 'summary reports object contact');

// Marking helpers are observation-only (no physics side effects)
const ghostX = 50;
const ghostY = 50;
const ghost = {
  id: 99,
  x: ghostX,
  y: ghostY,
  oldX: ghostX,
  oldY: ghostY,
  vx: 0,
  vy: 0,
  mass: 1,
  radius: 2,
  friction: 0.5,
  isGround: true,
  contactClass: CONTACT_FLOOR as ContactClass,
};
markNodeContact(ghost, CONTACT_OBJECT);
assert.equal(ghost.contactClass, CONTACT_OBJECT, 'object outranks floor');
assert.equal(ghost.x, ghostX, 'markNodeContact must not displace nodes');
assert.equal(ghost.y, ghostY, 'markNodeContact must not lift nodes');

console.log('smoke-contact-sensor: PASS');
