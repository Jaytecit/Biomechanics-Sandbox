/**
 * Max Speed: impulse spikes without travel must not dominate supported peak.
 */
import assert from 'node:assert/strict';
import { createBaseGenome } from '../src/neat';
import { calculateFitness, spawnCreature } from '../src/physics';
import { GROUND_Y } from '../src/physicsConstants';
import {
  CreatureBlueprint,
  EvolutionGoal,
  genomeIOForBlueprint,
} from '../src/types';

const blueprint: CreatureBlueprint = {
  name: 'Speed probe',
  nodes: [
    { id: 0, mass: 1, radius: 8, friction: 0.9 },
    { id: 1, mass: 1, radius: 8, friction: 0.9 },
  ],
  relativePositions: [{ x: -10, y: 0 }, { x: 10, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);

function makeCreature(id: string) {
  return spawnCreature(
    { id, generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
    100,
    GROUND_Y - 8,
    EvolutionGoal.SPEED,
    1
  );
}

const spike = makeCreature('speed-spike');
spike.peakSpeed = 12;
spike.peakSupportedSpeed = 0;
spike.currentX = spike.startX + 5;
const spikeScore = calculateFitness(spike, EvolutionGoal.SPEED);
assert.ok(spikeScore < 50, 'isolated spike without travel must stay gated');

const runner = makeCreature('speed-runner');
runner.peakSupportedSpeed = 4.5;
runner.currentX = runner.startX + 120;
const runScore = calculateFitness(runner, EvolutionGoal.SPEED);
assert.ok(runScore > spikeScore + 100, 'supported travel must beat spike farming');

console.log(`smoke-speed: PASS spike=${spikeScore.toFixed(2)} runner=${runScore.toFixed(2)}`);
