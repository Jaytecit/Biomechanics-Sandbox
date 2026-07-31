/**
 * Motor Ice vs Drive: ice distance must differentiate scoring.
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
  name: 'Ice cart',
  nodes: [{
    id: 0,
    mass: 1.5,
    radius: 12,
    friction: 0.05,
    isWheel: true,
    isMotorWheel: true,
  }],
  relativePositions: [{ x: 0, y: 0 }],
  muscles: [],
};
const io = genomeIOForBlueprint(blueprint);

const drive = spawnCreature(
  { id: 'drive', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  100,
  GROUND_Y - 12,
  EvolutionGoal.MOTOR_DRIVE,
  1
);
drive.currentX = drive.startX + 200;
const driveScore = calculateFitness(drive, EvolutionGoal.MOTOR_DRIVE);

const ice = spawnCreature(
  { id: 'ice', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) },
  100,
  GROUND_Y - 12,
  EvolutionGoal.MOTOR_ICE,
  1
);
ice.currentX = ice.startX + 200;
ice.iceSupportedDistance = 200;
const iceScore = calculateFitness(ice, EvolutionGoal.MOTOR_ICE);

assert.ok(iceScore > driveScore + 50, `ice-supported distance must boost Motor Ice over Drive (${iceScore} vs ${driveScore})`);

console.log(`smoke-motor-drive-ice: PASS drive=${driveScore.toFixed(2)} ice=${iceScore.toFixed(2)}`);
