/**
 * Sprint Finish: supported finish gating and checkpoint ordering.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  generateObstacles,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Sprint probe',
  nodes: [{ id: 0, mass: 1, radius: 8, friction: 0.9 }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);
const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.SPRINT_FINISH,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS, terrainEnabled: false },
  customGoal: DEFAULT_CUSTOM_GOAL,
};
const obstacles = generateObstacles(EvolutionGoal.SPRINT_FINISH, config.arena);
const finish = obstacles.find(o => o.type === 'finish');
assert.ok(finish);

function makeCreature(id: string) {
  return spawnCreature(
    { id, generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
    100,
    GROUND_Y - 8,
    EvolutionGoal.SPRINT_FINISH,
    1
  );
}

function place(creature: ReturnType<typeof makeCreature>, x: number, y = GROUND_Y - 8) {
  const node = creature.nodes[0];
  node.x = x;
  node.y = y;
  node.oldX = x;
  node.oldY = y;
  node.isGround = false;
}

const bypass = makeCreature('sprint-bypass');
place(bypass, finish!.x + 40, GROUND_Y - 80);
for (let f = 0; f < 6; f += 1) {
  updateCreaturePhysics(bypass, obstacles, f, config, [], new Array(io.outputs).fill(0));
}
assert.equal(bypass.crossedFinish, false, 'unsupported airborne bypass must not finish');

const intended = makeCreature('sprint-intended');
let frame = 0;
for (const cp of obstacles.filter(o => o.checkpointIndex !== undefined).sort((a, b) => (a.checkpointIndex ?? 0) - (b.checkpointIndex ?? 0))) {
  place(intended, cp.x + 5);
  updateCreaturePhysics(intended, obstacles, frame++, config, [], new Array(io.outputs).fill(0));
}
place(intended, finish!.x + 5);
updateCreaturePhysics(intended, obstacles, frame++, config, [], new Array(io.outputs).fill(0));
assert.equal(intended.crossedFinish, true);
assert.ok(
  calculateFitness(intended, EvolutionGoal.SPRINT_FINISH, [], undefined, obstacles) >
    calculateFitness(bypass, EvolutionGoal.SPRINT_FINISH, [], undefined, obstacles)
);

console.log('smoke-sprint-finish: PASS supported finish gating');
