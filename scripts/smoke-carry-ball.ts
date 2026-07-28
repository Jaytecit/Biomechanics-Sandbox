/**
 * D098 R1 deterministic physics smoke: only continuous, directly resolved
 * creature-ball contact can earn lifted rightward transport.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  spawnCreature,
  stepPrivateWorld,
  updateCreaturePhysics,
} from '../src/physics';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Carry Ball contact probe',
  nodes: [{
    id: 0,
    mass: 3,
    radius: 10,
    friction: 0.9,
    isWheel: false,
    isMotorWheel: false,
  }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const idleActions = new Array(io.outputs).fill(0);
const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
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

function makeCreature(id: string) {
  return spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, 300, EvolutionGoal.CARRY_BALL, 1);
}

function score(creature: ReturnType<typeof makeCreature>) {
  return calculateFitness(
    creature,
    EvolutionGoal.CARRY_BALL,
    creature.privateWorld
  );
}

const proximityCamper = makeCreature('carry-proximity-camper');
const proximityBall = proximityCamper.privateWorld![0];
proximityCamper.nodes[0].x = proximityBall.x - proximityBall.radius - 50;
proximityCamper.nodes[0].y = proximityBall.y;
Object.assign(proximityBall, {
  x: proximityBall.startX + 160,
  y: proximityBall.startY - 80,
});
assert.equal(score(proximityCamper), 0, 'proximity and a displaced ball must score zero');

const uncontactedMotion = makeCreature('carry-uncontacted-motion');
const freeBall = uncontactedMotion.privateWorld![0];
for (let frame = 0; frame < 40; frame += 1) {
  freeBall.oldX = freeBall.x - 3;
  stepPrivateWorld(uncontactedMotion.privateWorld!, [], config, frame);
  updateCreaturePhysics(
    uncontactedMotion,
    [],
    frame,
    config,
    uncontactedMotion.privateWorld!,
    idleActions
  );
}
assert.equal(
  score(uncontactedMotion),
  0,
  'ball motion without a creature collision chain must score zero'
);

const stationaryContact = makeCreature('carry-stationary-contact');
const stationaryBall = stationaryContact.privateWorld![0];
for (let frame = 0; frame < 30; frame += 1) {
  const node = stationaryContact.nodes[0];
  node.x = stationaryBall.x - stationaryBall.radius - node.radius + 1;
  node.y = stationaryBall.y;
  node.oldX = node.x;
  node.oldY = node.y;
  updateCreaturePhysics(
    stationaryContact,
    [],
    frame,
    config,
    stationaryContact.privateWorld!,
    idleActions
  );
}
assert.equal(score(stationaryContact), 0, 'stationary direct contact must not farm score');

const intendedCarry = makeCreature('carry-intended');
const carriedBall = intendedCarry.privateWorld![0];
for (let frame = 0; frame < 50; frame += 1) {
  const node = intendedCarry.nodes[0];
  // A lower-left overlap makes the real circle collision push the ball up and
  // right. Repeating it maintains a collision-proven transport chain.
  node.x = carriedBall.x - 12;
  node.y = carriedBall.y + 12;
  node.oldX = node.x - 1;
  node.oldY = node.y + 1;
  updateCreaturePhysics(
    intendedCarry,
    [],
    frame,
    config,
    intendedCarry.privateWorld!,
    idleActions
  );
}
const intendedScore = score(intendedCarry);
assert.ok(
  (intendedCarry.carryBallBestContactChainFrames ?? 0) >= 2,
  'intended carry must establish a multi-frame direct-contact chain'
);
assert.ok(
  (intendedCarry.carryBallTransportDistance ?? 0) > 10,
  'intended carry must accumulate collision-proven rightward transport'
);
assert.ok(
  (intendedCarry.carryBallTransportPeakLift ?? 0) > 4,
  'lift must be recorded during directly contacted transport'
);
assert.ok(intendedScore > 20, 'intended lifted carry must beat all shortcuts');

console.log(
  `smoke-carry-ball: PASS proximity=0 uncontacted=0 stationary=0 intended=${intendedScore.toFixed(2)} transport=${intendedCarry.carryBallTransportDistance?.toFixed(2)} lift=${intendedCarry.carryBallTransportPeakLift?.toFixed(2)} chain=${intendedCarry.carryBallBestContactChainFrames}`
);
