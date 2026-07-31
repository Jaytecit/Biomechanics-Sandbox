/**
 * Push Box: proximity without displacement must not dominate.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, spawnCreature } from '../src/physics';
import { BOX_PUSH_NEAR_PX, GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  EvolutionGoal,
  genomeIOForBlueprint,
} from '../src/types';
import { buildGoalWorldObjects } from '../src/arenas';

const blueprint: CreatureBlueprint = {
  name: 'Push probe',
  nodes: [{ id: 0, mass: 0.0015, radius: 2, friction: 0.9 }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const objects = buildGoalWorldObjects(EvolutionGoal.PUSH_BOX, blueprint, 1);
const crate = objects.find(o => o.id === 'crate')!;
/** Stay inside the world-scale proximity gate (legacy smoke used 20px / near=60). */
const NEAR = Math.max(1, BOX_PUSH_NEAR_PX * 0.5);

const camper = spawnCreature(
  { id: 'push-camper', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  crate.x - NEAR,
  GROUND_Y - 2,
  EvolutionGoal.PUSH_BOX,
  1
);
const campScore = calculateFitness(camper, EvolutionGoal.PUSH_BOX, objects, undefined, []);

const pusher = spawnCreature(
  { id: 'push-pusher', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  crate.x - NEAR,
  GROUND_Y - 2,
  EvolutionGoal.PUSH_BOX,
  1
);
crate.x = crate.startX + 120;
pusher.currentX = crate.x - NEAR;
for (const n of pusher.nodes) n.x = pusher.currentX;
const pushScore = calculateFitness(pusher, EvolutionGoal.PUSH_BOX, objects, undefined, []);
assert.ok(pushScore > campScore + 5, 'displaced crate must beat idle proximity');

console.log(`smoke-push-box: PASS camp=${campScore.toFixed(2)} push=${pushScore.toFixed(2)}`);
