/**
 * C1 / D145 — Object-relative sensor contract smoke.
 *
 * Observation only: range-limited relX/relY/proximity to the private goal
 * object. Out of range / missing target → zeros. Does not rewrite rewards or
 * add forces.
 *
 * Run: npx tsx scripts/smoke-object-sensor.ts
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  spawnCreature,
  stepPrivateWorld,
  updateCreaturePhysics,
} from '../src/physics';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  CONTACT_SENSOR_COUNT,
  OBJECT_SENSOR_COUNT,
  OBJECT_SENSOR_RANGE_PX,
  SimulationConfig,
  genomeIOForBlueprint,
  objectRelativeSensorValues,
  selectObjectSensorTarget,
} from '../src/types';

assert.equal(SOFT_BODY_PHYSICS_VERSION, '4.26.0', 'object sensor retained under physics 4.26.0');

const near = objectRelativeSensorValues(0, 0, [{ type: 'ball', x: 120, y: 0 }], 480);
assert.ok(near[0] > 0 && near[0] < 1, 'in-range relX is positive fraction');
assert.equal(near[1], 0, 'aligned target has zero relY');
assert.ok(near[2] > 0 && near[2] < 1, 'in-range proximity is in (0,1)');

const far = objectRelativeSensorValues(0, 0, [{ type: 'ball', x: 900, y: 0 }], 480);
assert.deepEqual(far, [0, 0, 0], 'beyond range must be all zeros');

const missing = objectRelativeSensorValues(10, 10, [], 480);
assert.deepEqual(missing, [0, 0, 0], 'no private object must be all zeros');

const atEdge = objectRelativeSensorValues(0, 0, [{ type: 'ball', x: OBJECT_SENSOR_RANGE_PX, y: 0 }]);
assert.deepEqual(atEdge, [1, 0, 0], 'exactly at range: unit relX, zero proximity');

const pins = [
  { type: 'box' as const, x: 500, y: 400 },
  { type: 'box' as const, x: 200, y: 400 },
];
const nearestPin = selectObjectSensorTarget(pins, 100, 400);
assert.equal(nearestPin?.x, 200, 'nearest pin/box is selected when no ball');

const withBall = selectObjectSensorTarget(
  [...pins, { type: 'ball' as const, x: 800, y: 400 }],
  100,
  400
);
assert.equal(withBall?.type, 'ball', 'unique ball wins over nearer boxes');

const blueprint: CreatureBlueprint = {
  name: 'Object sensor probe',
  nodes: [
    {
      id: 0,
      mass: 2,
      radius: 12,
      friction: 0.9,
      isWheel: false,
      isMotorWheel: false,
    },
  ],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
assert.equal(
  io.inputs,
  2 + 3 * blueprint.nodes.length + OBJECT_SENSOR_COUNT + CONTACT_SENSOR_COUNT,
  'genome I/O always includes the object pack'
);

const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 8,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.CARRY_BALL,
  gravity: 0,
  groundFriction: 0,
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

const creature = spawnCreature(
  {
    id: 'object-sensor-live',
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  },
  100,
  300,
  EvolutionGoal.CARRY_BALL,
  1
);

const ball = creature.privateWorld!.find(o => o.type === 'ball');
assert.ok(ball, 'Carry Ball spawns a private ball');

const beforeX = ball!.x;
const beforeY = ball!.y;
const idle = new Array(io.outputs).fill(0);

for (let frame = 0; frame < 6; frame += 1) {
  stepPrivateWorld(creature.privateWorld!, [], config, frame);
  updateCreaturePhysics(creature, [], frame, config, creature.privateWorld!, idle);
}

assert.equal(ball!.x, beforeX, 'sensor path must not displace the ball');
assert.equal(ball!.y, beforeY, 'sensor path must not lift the ball');

const sensed = objectRelativeSensorValues(
  creature.currentX,
  creature.currentY,
  creature.privateWorld!
);
const dist = Math.hypot(ball!.x - creature.currentX, ball!.y - creature.currentY);
if (dist <= OBJECT_SENSOR_RANGE_PX) {
  assert.ok(sensed.some(v => v !== 0), 'in-range live private ball yields a non-zero pack');
} else {
  assert.deepEqual(sensed, [0, 0, 0], 'spawn far from ball stays zero until approach');
}

console.log('smoke-object-sensor: PASS');
