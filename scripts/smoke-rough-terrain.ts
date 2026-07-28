/**
 * G1 Rough Terrain Traverse deterministic feasibility and anti-farming proof.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import {
  calculateFitness,
  generateObstacles,
  GROUND_Y,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

function template(name: string): CreatureBlueprint {
  const blueprint = CREATURE_TEMPLATES.find(candidate => candidate.name === name);
  if (!blueprint) throw new Error(`Missing template: ${name}`);
  return blueprint;
}

function groundedSpawnY(blueprint: CreatureBlueprint): number {
  const lowestRelative = Math.max(
    ...blueprint.nodes.map(
      (node, index) => (blueprint.relativePositions[index]?.y ?? 0) + node.radius
    )
  );
  return GROUND_Y - lowestRelative;
}

function config(
  difficulty = 1,
  gravity = 0.4,
  groundFriction = 0.8,
  terrainSeed = 42
): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 1400,
    simulationSpeed: 1,
    mutationRate: 0.3,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
    gravity,
    groundFriction,
    arena: {
      ...DEFAULT_ARENA_MODIFIERS,
      difficulty,
      terrainSeed,
      terrainEnabled: false,
      terrainObstaclesEnabled: false,
      windEnabled: false,
      rampEnabled: false,
      pitEnabled: false,
    },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function spawn(id: string, difficulty = 1) {
  const blueprint = template('Motor Cart');
  const io = genomeIOForBlueprint(blueprint);
  return spawnCreature(
    {
      id,
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    100,
    groundedSpawnY(blueprint),
    EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
    difficulty
  );
}

function runReference(
  id: string,
  difficulty = 1,
  gravity = 0.4,
  groundFriction = 0.8,
  terrainSeed = 42
) {
  const cfg = config(difficulty, gravity, groundFriction, terrainSeed);
  const creature = spawn(id, difficulty);
  const obstacles = generateObstacles(
    EvolutionGoal.ROUGH_TERRAIN_TRAVERSE,
    cfg.arena
  );
  for (let frame = 0; frame < cfg.generationDuration; frame += 1) {
    updateCreaturePhysics(
      creature,
      obstacles,
      frame,
      cfg,
      creature.privateWorld,
      [1, 1]
    );
    if (creature.crossedFinish) break;
  }
  return { creature, obstacles };
}

const inert = spawn('g1-inert');
const inertScore = calculateFitness(inert, EvolutionGoal.ROUGH_TERRAIN_TRAVERSE);
assert.equal(inertScore, 0);

const endpointBypass = spawn('g1-endpoint');
endpointBypass.currentX += 10_000;
const endpointScore = calculateFitness(
  endpointBypass,
  EvolutionGoal.ROUGH_TERRAIN_TRAVERSE
);
assert.equal(endpointScore, 0, 'endpoint position without supported provenance scores zero');

const shapingOnly = spawn('g1-shaping');
shapingOnly.roughSupportedDistance = 10_000;
const shapingScore = calculateFitness(
  shapingOnly,
  EvolutionGoal.ROUGH_TERRAIN_TRAVERSE
);
assert.equal(shapingScore, 150, 'supported shaping is bounded');

const checkpointOnly = spawn('g1-checkpoints');
checkpointOnly.roughSupportedDistance = 10_000;
checkpointOnly.checkpointReached = 2;
const checkpointScore = calculateFitness(
  checkpointOnly,
  EvolutionGoal.ROUGH_TERRAIN_TRAVERSE
);
assert.equal(checkpointScore, 750, 'all sections without supported finish stay below completion');

const reference = runReference('g1-reference');
assert.equal(reference.creature.checkpointReached, 2);
assert.equal(reference.creature.crossedFinish, true);
assert.ok(
  reference.creature.fitness > 1250 && reference.creature.fitness <= 1350,
  `reference completion should include bounded finish-time credit, got ${reference.creature.fitness}`
);

for (const variant of [
  {
    id: 'low-friction-short',
    difficulty: 0.95,
    gravity: 0.38,
    friction: 0.72,
    terrainSeed: 42,
  },
  {
    id: 'high-friction-long',
    difficulty: 1.05,
    gravity: 0.42,
    friction: 0.88,
    terrainSeed: 42,
  },
]) {
  const heldOut = runReference(
    `g1-${variant.id}`,
    variant.difficulty,
    variant.gravity,
    variant.friction,
    variant.terrainSeed
  );
  assert.equal(
    heldOut.creature.crossedFinish,
    true,
    `${variant.id}: physical reference must complete all ordered supported sections`
  );
}

console.log(
  `smoke-rough-terrain: PASS (inert=${inertScore.toFixed(2)}, endpoint=${endpointScore.toFixed(2)}, shaping=${shapingScore.toFixed(2)}, checkpoints=${checkpointScore.toFixed(2)}, reference=${reference.creature.fitness.toFixed(2)})`
);
