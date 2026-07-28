import assert from 'node:assert/strict';
import {
  collideNodeAABB,
  collideNodePit,
  collideNodePitLips,
  collideNodeRamp,
  collideNodeStair,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { canonicalizeObstacles } from '../src/canonicalGeometry';
import { createBaseGenome } from '../src/neat';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  EvolutionGoal,
  PhysicsNode,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

function node(x: number, y: number, oldX = x, oldY = y, radius = 10): PhysicsNode {
  return { id: 0, x, y, oldX, oldY, vx: 0, vy: 0, mass: 1, radius, friction: 0.5, isGround: false };
}
function finite(n: PhysicsNode) {
  assert.ok([n.x, n.y, n.oldX, n.oldY].every(Number.isFinite), 'contact state must remain finite');
}

const box = { type: 'box' as const, x: 100, y: 400, width: 80, height: 40 };
for (const [label, n] of [
  ['left', node(95, 420)],
  ['right', node(185, 420)],
  ['top', node(140, 395)],
  ['bottom', node(140, 445)],
  ['inside', node(140, 420)],
] as const) {
  assert.equal(collideNodeAABB(n, 100, 400, 180, 440, 0.8, true), true, `${label} solid contact`);
  finite(n);
  assert.ok(n.x <= 90 || n.x >= 190 || n.y <= 390 || n.y >= 450, `${label} resolved outside`);
}

const fast = node(220, 420, 40, 420);
assert.equal(collideNodeAABB(fast, 130, 380, 136, 460, 0.8, false), true, 'fast thin-pad/riser sweep');
assert.ok(fast.x <= 120 || fast.x >= 146, 'fast node did not tunnel');

const ramp = { type: 'ramp' as const, x: 100, y: 360, width: 160, height: 120 };
for (const n of [
  node(180, 430, 180, 300),
  node(270, 380, 300, 380),
  node(180, 450),
]) {
  assert.equal(collideNodeRamp(n, ramp, 0.8, true), true, 'ramp surface/end/interior contact');
  finite(n);
}

const rampSide = node(270, 400, 310, 400);
assert.equal(collideNodeRamp(rampSide, ramp, 0.8, true), true, 'ramp end-cap contact from right');
assert.ok(rampSide.x >= ramp.x + ramp.width + rampSide.radius - 0.01, 'ramp side blocks horizontal entry');
assert.ok(rampSide.y > ramp.y + 25, 'ramp side contact does not project the node onto the slope');
assert.ok(Math.abs(rampSide.y - 400) < 1, 'ramp side contact does not create vertical launch');

const rampSideFall = node(268, 440, 268, 400);
assert.equal(collideNodeRamp(rampSideFall, ramp, 0.8, true), true, 'falling ramp end-cap contact');
assert.ok(rampSideFall.y > 420, 'falling beside ramp keeps downward progress');
assert.ok(rampSideFall.y <= 440, 'falling beside ramp remains finite and bounded');

const stair = { type: 'stair' as const, x: 140, y: 420, width: 70, height: 60 };
const stairTop = node(170, 430, 170, 390);
assert.equal(collideNodeStair(stairTop, stair, 0.8, true), true, 'stair tread');
assert.equal(stairTop.y, 410);
const stairRiser = node(146, 445, 100, 445);
assert.equal(collideNodeStair(stairRiser, stair, 0.8, false), true, 'stair riser');
assert.ok(stairRiser.x <= 130);

const pit = { type: 'pit' as const, x: 200, y: GROUND_Y, width: 120, height: 80 };
for (const n of [node(204, GROUND_Y + 20, 180, GROUND_Y + 20), node(316, GROUND_Y + 20, 340, GROUND_Y + 20)]) {
  assert.equal(collideNodePitLips(n, [pit]), true, 'pit lip');
  finite(n);
}
const pitFloor = node(260, GROUND_Y + pit.height + 24, 260, GROUND_Y + 10);
assert.equal(collideNodePit(pitFloor, [pit], 0.8, true), true, 'pit bottom');
assert.equal(pitFloor.y, GROUND_Y + pit.height - pitFloor.radius, 'pit bottom supports node');
assert.equal(pitFloor.isGround, true, 'pit bottom is grounded support');
finite(pitFloor);

const shapes = canonicalizeObstacles([box, ramp, stair, pit]);
assert.deepEqual(shapes.map(s => s.kind), ['aabb', 'polygon', 'segment', 'segment', 'pit']);

const rigidBlueprint: CreatureBlueprint = {
  name: 'Rigid capsule smoke',
  nodes: [
    { id: 0, mass: 1, radius: 10, friction: 0.5 },
    { id: 1, mass: 1, radius: 10, friction: 0.5 },
  ],
  muscles: [{
    id: 0, nodeA: 0, nodeB: 1, originalLength: 80, minLength: 80, maxLength: 80,
    strength: 1, phaseOffset: 0,
  }],
  relativePositions: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
};
const io = genomeIOForBlueprint(rigidBlueprint);
const creature = spawnCreature({
  id: 'rigid-smoke', generation: 0, blueprint: rigidBlueprint,
  genome: createBaseGenome(io.inputs, io.outputs),
}, 100, 380);
creature.nodes[0].x = creature.nodes[0].oldX = 100;
creature.nodes[1].x = creature.nodes[1].oldX = 180;
creature.nodes[0].y = creature.nodes[0].oldY = 420;
creature.nodes[1].y = creature.nodes[1].oldY = 420;
const config: SimulationConfig = {
  populationSize: 1, generationDuration: 1, simulationSpeed: 1, mutationRate: 0,
  addNodeRate: 0, addConnectionRate: 0, goal: EvolutionGoal.LOCOMOTION_RIGHT,
  gravity: 0, groundFriction: 0.8, arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: { name: 'none', rules: [] },
};
updateCreaturePhysics(creature, [{ type: 'box', x: 135, y: 390, width: 10, height: 60 }], 0, config);
assert.ok(
  creature.nodes.some((n, index) => Math.abs(n.x - (index === 0 ? 100 : 180)) > 0.5 || Math.abs(n.y - 420) > 0.5),
  'rigid bone capsule displaced endpoints'
);
for (const n of creature.nodes) finite(n);

// A linked body falling just beyond a ramp lip must slide as a unit and settle
// in the finite pit; no endpoint may remain pinned and stretch the creature.
creature.nodes[0].x = creature.nodes[0].oldX = ramp.x + ramp.width + 8;
creature.nodes[1].x = creature.nodes[1].oldX = ramp.x + ramp.width + 88;
for (const n of creature.nodes) {
  n.y = 410;
  n.oldY = 390;
  n.isGround = false;
}
creature.isAlive = true;
creature.fellInPit = false;
const rampPit = { type: 'pit' as const, x: ramp.x + ramp.width, y: GROUND_Y, width: 160, height: 80 };
for (let frame = 0; frame < 24; frame += 1) {
  updateCreaturePhysics(creature, [ramp, rampPit], frame, { ...config, gravity: 0.4 });
  const linkLength = Math.hypot(
    creature.nodes[1].x - creature.nodes[0].x,
    creature.nodes[1].y - creature.nodes[0].y
  );
  assert.ok(linkLength < 88, `ramp-side fall keeps rigid link coherent (frame ${frame})`);
  for (const n of creature.nodes) finite(n);
}
assert.equal(creature.fellInPit, true, 'linked body records pit failure');
assert.ok(
  creature.nodes.every(n => n.y <= rampPit.y + rampPit.height - n.radius + 0.01),
  'linked body cannot pass through pit bottom'
);

console.log('smoke-collisions: PASS (solid interior, swept thin contacts, stable ramp sides, stair, bounded pits, rigid capsules)');
