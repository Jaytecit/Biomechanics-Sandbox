/**
 * Ramp-lip stability regression.
 *
 * Drives the reference wheeled bodies over the canonical motor ramp and records
 * the two symptoms of collision/constraint energy injection: link deformation
 * and unbounded single-frame node travel.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  generateObstacles,
  GROUND_Y,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  countFlexibleMuscles,
  countMotorWheels,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  genomeIOForBlueprint,
  SimulationConfig,
} from '../src/types';

const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 1200,
  simulationSpeed: 1,
  mutationRate: 0,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.MOTOR_RAMP,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS, difficulty: 1 },
  customGoal: DEFAULT_CUSTOM_GOAL,
  paraStageBestHistory: [],
};

for (const templateName of ['Motor Cart', 'Para Cart', 'Jump Cart', 'Proven Glider'] as const) {
  const blueprint = CREATURE_TEMPLATES.find(template => template.name === templateName);
  assert.ok(blueprint, `${templateName} template exists`);
  const goal =
    templateName === 'Jump Cart' || templateName === 'Proven Glider'
      ? EvolutionGoal.PARA_RAMP_GLIDE
      : EvolutionGoal.MOTOR_RAMP;
  const runConfig = { ...config, goal };
  const obstacles = generateObstacles(goal, runConfig.arena);
  const ramp = obstacles.find(obstacle => obstacle.type === 'ramp');
  assert.ok(ramp, `${templateName} ramp exists`);
  const io = genomeIOForBlueprint(blueprint);
  const creature = spawnCreature(
    {
      id: `ramp-stress-${templateName}`,
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    100,
    GROUND_Y - 50,
    goal,
    1
  );
  const actuators = [
    ...Array(countFlexibleMuscles(blueprint.muscles)).fill(0),
    ...Array(countMotorWheels(blueprint.nodes)).fill(1),
  ];

  let maxStretchRatio = 1;
  let maxNodeTravel = 0;
  let maxStretchFrame = -1;
  let maxTravelFrame = -1;
  let lipFrame = -1;
  const started = performance.now();
  for (let frame = 0; frame < runConfig.generationDuration; frame += 1) {
    updateCreaturePhysics(creature, obstacles, frame, runConfig, [], actuators);
    if (
      lipFrame < 0 &&
      creature.nodes.some(node => node.x >= ramp.x + ramp.width - node.radius)
    ) {
      lipFrame = frame;
    }
    for (const node of creature.nodes) {
      const travel = Math.hypot(node.x - node.oldX, node.y - node.oldY);
      if (travel > maxNodeTravel) {
        maxNodeTravel = travel;
        maxTravelFrame = frame;
      }
    }
    for (const muscle of creature.muscles) {
      const nodeA = creature.nodes[muscle.nodeA];
      const nodeB = creature.nodes[muscle.nodeB];
      const length = Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);
      const ratio = length / Math.max(1, muscle.maxLength);
      if (ratio > maxStretchRatio) {
        maxStretchRatio = ratio;
        maxStretchFrame = frame;
      }
    }
    if (lipFrame >= 0 && frame > lipFrame + 90) break;
  }
  const elapsedMs = performance.now() - started;

  console.log(
    `${templateName}: lipFrame=${lipFrame} maxStretch=${maxStretchRatio.toFixed(3)}@${maxStretchFrame} ` +
      `maxTravel=${maxNodeTravel.toFixed(2)}@${maxTravelFrame} elapsed=${elapsedMs.toFixed(1)}ms`
  );

  if (templateName !== 'Para Cart') {
    assert.ok(lipFrame >= 0, `${templateName} reaches the ramp lip`);
  }
  assert.ok(
    maxStretchRatio < 1.25,
    `${templateName} links remain within 25% of their authored maximum at the ramp lip`
  );
  assert.ok(
    maxNodeTravel < 180,
    `${templateName} has no catapult-scale single-frame displacement`
  );
}

console.log('stress-ramp-corner: PASS (bounded lip deformation and node travel)');
