/**
 * Headless feel gate: braced triangle settles without pancaking;
 * hopper muscle contract shortens / expand lengthens;
 * Oscillate→Idle must not coast far (idle plant brake).
 * Run: npx tsx scripts/smoke-feel.mts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { avgJointX } from '../src/brain/observations.ts';
import { TRIANGLE_WALKER, SIMPLE_HOPPER, FLOPPY_CHAIN } from '../src/creature/presets.ts';
import { cloneDesign } from '../src/creature/types.ts';
import { importCreatureJson } from '../src/library/jsonIO.ts';
import { FIXED_DT } from '../src/physics/constants.ts';
import { Simulation } from '../src/sim/simulation.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Max |Δx| in 2s after sine→idle on the custom biped fixture (Oscillate @ 2.5 Hz). */
const MAX_IDLE_COAST = 0.5;

function muscleLength(sim: Simulation, index: number): number {
  const m = sim.muscles()[index];
  const a = m.startBone.translation();
  const b = m.endBone.translation();
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function avgJointY(sim: Simulation): number {
  const joints = sim.creature?.joints ?? [];
  if (joints.length === 0) return 0;
  let sum = 0;
  for (const j of joints) sum += j.body.translation().y;
  return sum / joints.length;
}

function minJointY(sim: Simulation): number {
  const joints = sim.creature?.joints ?? [];
  let min = Infinity;
  for (const j of joints) min = Math.min(min, j.body.translation().y);
  return min;
}

async function main() {
  const sim = new Simulation();
  await sim.init();

  // 1) Braced triangle settles onto ground but keeps a torso above feet
  sim.loadDesign(cloneDesign(TRIANGLE_WALKER));
  sim.driveMode = 'idle';
  for (let i = 0; i < 180; i++) sim.step(1 / 60);
  const triMin = minJointY(sim);
  const triAvg = avgJointY(sim);
  console.log(`triangle settle minY=${triMin.toFixed(3)} avgY=${triAvg.toFixed(3)}`);
  if (triAvg < 0.55) {
    throw new Error(`Braced triangle pancaked (avgY=${triAvg.toFixed(3)})`);
  }
  if (triMin < -0.05) {
    throw new Error(`Joints fell through floor (minY=${triMin.toFixed(3)})`);
  }

  // 2) Hopper: contract shortens actuated muscle (quad has DOF; triangle does not)
  sim.loadDesign(cloneDesign(SIMPLE_HOPPER));
  sim.driveMode = 'manual';
  sim.setAllManual(0);
  for (let i = 0; i < 90; i++) sim.step(1 / 60);
  const restLen = muscleLength(sim, 0);
  sim.setManualDrive(0, 1);
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  const contracted = muscleLength(sim, 0);
  console.log(`hopper M0 rest=${restLen.toFixed(3)} contracted=${contracted.toFixed(3)}`);
  if (contracted >= restLen * 0.92) {
    throw new Error(
      `Contract did not shorten muscle enough (${contracted.toFixed(3)} vs ${restLen.toFixed(3)})`,
    );
  }

  // 3) Expand lengthens vs contracted
  sim.setManualDrive(0, -1);
  for (let i = 0; i < 120; i++) sim.step(1 / 60);
  const expanded = muscleLength(sim, 0);
  console.log(`hopper M0 expanded=${expanded.toFixed(3)}`);
  if (expanded <= contracted * 1.05) {
    throw new Error('Expand did not lengthen muscle vs contracted state');
  }

  // 4) Floppy chain collapses flatter than triangle
  sim.loadDesign(cloneDesign(FLOPPY_CHAIN));
  sim.driveMode = 'idle';
  for (let i = 0; i < 180; i++) sim.step(1 / 60);
  const flopAvg = avgJointY(sim);
  console.log(`floppy settle avgY=${flopAvg.toFixed(3)}`);
  if (flopAvg >= triAvg) {
    console.warn('Note: floppy avgY was not below triangle (geometry-dependent)');
  }

  // 5) Oscillate→Idle coast: custom biped must not ice-skate after drives stop
  const raw = readFileSync(join(HERE, 'fixtures', 'custom-biped.json'), 'utf8');
  const custom = importCreatureJson(raw);
  if (!custom.ok) throw new Error(`custom biped fixture: ${custom.error}`);
  sim.loadDesign(cloneDesign(custom.value));
  sim.driveMode = 'sine';
  for (let i = 0; i < Math.round(3 / FIXED_DT); i++) sim.step(FIXED_DT);
  const x0 = avgJointX(sim.creature!);
  sim.driveMode = 'idle';
  for (let i = 0; i < Math.round(2 / FIXED_DT); i++) sim.step(FIXED_DT);
  const coast = Math.abs(avgJointX(sim.creature!) - x0);
  console.log(`idle coast |Δx|=${coast.toFixed(3)} (max ${MAX_IDLE_COAST})`);
  if (coast > MAX_IDLE_COAST) {
    throw new Error(
      `Oscillate→Idle coast too far (|Δx|=${coast.toFixed(3)} > ${MAX_IDLE_COAST})`,
    );
  }

  console.log('smoke-feel OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
