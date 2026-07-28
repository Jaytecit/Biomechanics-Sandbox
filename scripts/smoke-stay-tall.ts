/**
 * D098 R1 real-physics smoke: sustained supported posture beats a wide camper.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, spawnCreature, updateCreaturePhysics } from '../src/physics';
import {
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';

const node = (id: number) => ({
  id,
  mass: 1,
  radius: 8,
  friction: 0.9,
  isWheel: false,
  isMotorWheel: false,
});
const rigid = (
  id: number,
  nodeA: number,
  nodeB: number,
  length: number
) => ({
  id,
  nodeA,
  nodeB,
  originalLength: length,
  minLength: length,
  maxLength: length,
  strength: 1,
  phaseOffset: 0,
  aeroType: 'none' as const,
});

const tallBlueprint: CreatureBlueprint = {
  name: 'Tall reference tripod',
  nodes: [node(0), node(1), node(2)],
  relativePositions: [
    { x: -24, y: 0 },
    { x: 24, y: 0 },
    { x: 0, y: -82 },
  ],
  muscles: [
    rigid(0, 0, 1, 48),
    rigid(1, 0, 2, Math.hypot(24, 82)),
    rigid(2, 1, 2, Math.hypot(24, 82)),
  ],
};
const wideBlueprint: CreatureBlueprint = {
  name: 'Wide camping bar',
  nodes: [node(0), node(1), node(2)],
  relativePositions: [
    { x: -60, y: 0 },
    { x: 0, y: 0 },
    { x: 60, y: 0 },
  ],
  muscles: [
    rigid(0, 0, 1, 60),
    rigid(1, 1, 2, 60),
  ],
};
const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 12,
  simulationSpeed: 1,
  mutationRate: 0.1,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.STAY_UPRIGHT,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: DEFAULT_CUSTOM_GOAL,
};

function run(blueprint: CreatureBlueprint, id: string) {
  const io = genomeIOForBlueprint(blueprint);
  const creature = spawnCreature({
    id,
    generation: 0,
    blueprint,
    genome: createBaseGenome(io.inputs, io.outputs),
  }, 100, 380, EvolutionGoal.STAY_UPRIGHT, 1);
  const idle = new Array(io.outputs).fill(0);
  for (let frame = 0; frame < 600; frame += 1) {
    updateCreaturePhysics(creature, [], frame, config, [], idle);
  }
  return creature;
}

const tall = run(tallBlueprint, 'stay-tall-reference');
const wide = run(wideBlueprint, 'stay-tall-wide-camper');
const tallScore = calculateFitness(tall, EvolutionGoal.STAY_UPRIGHT);
const wideScore = calculateFitness(wide, EvolutionGoal.STAY_UPRIGHT);

assert.ok((tall.stayTallSupportedFrames ?? 0) > 400, 'reference must establish sustained support');
assert.ok((wide.stayTallSupportedFrames ?? 0) > 400, 'camper must establish sustained support');
assert.ok(
  tallScore > wideScore * 1.8,
  `tall supported posture (${tallScore.toFixed(2)}) must dominate wide camping (${wideScore.toFixed(2)})`
);

console.log(
  `smoke-stay-tall: PASS tall=${tallScore.toFixed(2)} wide-camper=${wideScore.toFixed(2)} supported=${tall.stayTallSupportedFrames}/${wide.stayTallSupportedFrames}`
);
