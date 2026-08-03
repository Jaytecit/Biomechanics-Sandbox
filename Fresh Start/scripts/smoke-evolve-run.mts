/**
 * Headless Phase 2 gate: fixed MLP + weight GA improves run fitness on Simple Hopper.
 * Also checks continuous anti-scoot: thrash ≈ 0, lift-then-scoot density, custom biped.
 * Run: npm run smoke:evolve
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createFootLiftState,
  instantUprightQuality,
  requiredFootLifts,
  runLiftQuality,
  runUprightQuality,
  scoreRunPerformance,
  updateFallState,
  updateFootLiftState,
} from '../src/brain/fitness.ts';
import { evolveRun } from '../src/brain/evolve.ts';
import {
  DISTANCE_PER_LIFT,
  MIN_FOOT_LIFTS,
  OBS_COUNT,
  UPRIGHT_QUALITY_FLOOR,
} from '../src/brain/constants.ts';
import {
  countBrainActuatorChannels,
  expandChannelDrives,
} from '../src/brain/driveGroups.ts';
import {
  createRng,
  evaluateNetwork,
  makeShape,
  randomWeights,
} from '../src/brain/network.ts';
import { avgJointX } from '../src/brain/observations.ts';
import { evaluateRunEpisode } from '../src/brain/tasks.ts';
import { SIMPLE_HOPPER } from '../src/creature/presets.ts';
import { cloneDesign, type CreatureDesign } from '../src/creature/types.ts';
import { importCreatureJson } from '../src/library/jsonIO.ts';
import { FIXED_DT } from '../src/physics/constants.ts';
import { Simulation } from '../src/sim/simulation.ts';

const SEEDS = [11, 22, 33];
const POP = 20;
const GENS = 20;
/** Absolute floor for a "learned" gait on this preset / episode length. */
const MIN_FINAL_BEST = 0.4;
/** Must beat gen-0 best by at least this margin. */
const MIN_IMPROVEMENT = 0.25;
/** Flip-thrash / scoot must stay near zero under the lift gate. */
const MAX_THRASH_FITNESS = 0.05;

const HERE = dirname(fileURLToPath(import.meta.url));

function assertDriveGroups(): void {
  const muscles = [
    { id: 1, driveGroup: 1 },
    { id: 2, driveGroup: 1 },
    { id: 3 },
  ];
  if (countBrainActuatorChannels(muscles) !== 2) {
    throw new Error('expected 2 channels for grouped pair + singleton');
  }
  const expanded = expandChannelDrives(muscles, [0.5, -0.25]);
  if (expanded[0] !== 0.5 || expanded[1] !== 0.5 || expanded[2] !== -0.25) {
    throw new Error(`expandChannelDrives mismatch: ${expanded.join(',')}`);
  }
  console.log('drive groups OK');
}

function assertNetworkDeterministic(): void {
  const shape = makeShape(4);
  if (shape.inputCount !== OBS_COUNT) {
    throw new Error(`expected OBS_COUNT=${OBS_COUNT}, got ${shape.inputCount}`);
  }
  const rng = createRng(99);
  const w = randomWeights(shape, rng);
  const x = new Float32Array(OBS_COUNT);
  x.set([0.1, -0.2, 0.3, 0, 0.5, 0.25, 0.1, 0.2, 0, 0]);
  const a = evaluateNetwork(shape, w, x);
  const b = evaluateNetwork(shape, w, x);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error('Network forward is not deterministic');
  }
  if (shape.weightCount !== w.length) {
    throw new Error(`shape.weightCount ${shape.weightCount} != weights ${w.length}`);
  }
  for (const v of a) {
    if (v < -1 || v > 1) throw new Error(`output out of [-1,1]: ${v}`);
  }
  console.log(
    `network OK shape in=${shape.inputCount} hid=${shape.hiddenCount} out=${shape.outputCount} weights=${shape.weightCount}`,
  );
}

/** Density gate: a few lifts must not unlock full credit for long scoots. */
function assertLiftDensityFormula(): void {
  const scootDist = 8;
  const fewLifts = 3;
  const needed = requiredFootLifts(scootDist);
  const quality = runLiftQuality(scootDist, fewLifts);
  const fitness = scootDist * quality;
  if (needed <= fewLifts) {
    throw new Error(
      `density gate saturated: needed=${needed} with only ${fewLifts} lifts at Δx=${scootDist}`,
    );
  }
  if (quality >= 1) {
    throw new Error(`lift-then-scoot still gets full quality (${quality})`);
  }
  if (fitness >= scootDist * 0.95) {
    throw new Error(
      `lift-then-scoot fitness too high (${fitness.toFixed(3)} vs ungated ${scootDist})`,
    );
  }
  if (runLiftQuality(scootDist, 0) !== 0) {
    throw new Error('zero lifts must yield zero quality');
  }
  if (runLiftQuality(2, MIN_FOOT_LIFTS) < 1) {
    throw new Error('short hop with MIN_FOOT_LIFTS should get full quality');
  }
  console.log(
    `density OK: Δx=${scootDist} lifts=${fewLifts} needed=${needed.toFixed(2)} ` +
      `quality=${quality.toFixed(3)} fitness=${fitness.toFixed(3)}`,
  );
}

async function runThrashEpisode(design: CreatureDesign): Promise<{
  distance: number;
  footLifts: number;
  fitness: number;
  uprightQuality: number;
}> {
  const sim = new Simulation();
  await sim.init();
  sim.loadDesign(cloneDesign(design));
  sim.driveMode = 'manual';
  const creature = sim.creature!;
  const startX = avgJointX(creature);
  let fallTime = 0;
  let fell = false;
  let footLifts = 0;
  let uprightSum = 0;
  let uprightSteps = 0;
  const planted = createFootLiftState(creature.joints.length);
  const steps = Math.round(10 / FIXED_DT);

  for (let i = 0; i < steps; i++) {
    sim.setAllManual(i % 4 < 2 ? 1 : -1);
    sim.step(FIXED_DT);
    footLifts += updateFootLiftState(creature, planted);
    uprightSum += instantUprightQuality(creature);
    uprightSteps++;
    const fall = updateFallState(creature, fallTime, FIXED_DT);
    fallTime = fall.fallTime;
    if (fall.fell) {
      fell = true;
      break;
    }
  }

  const uprightMean = uprightSteps > 0 ? uprightSum / uprightSteps : 1;
  return scoreRunPerformance(creature, startX, fell, footLifts, uprightMean);
}

/** Marked-head upright gate: low head height must cut fitness; unmarked = no-op. */
function assertUprightGate(): void {
  const full = runUprightQuality(1);
  const flat = runUprightQuality(0);
  const half = runUprightQuality(0.5);
  if (full !== 1) throw new Error(`upright full expected 1, got ${full}`);
  if (Math.abs(flat - UPRIGHT_QUALITY_FLOOR) > 1e-9) {
    throw new Error(`upright flat expected floor ${UPRIGHT_QUALITY_FLOOR}, got ${flat}`);
  }
  if (!(half > flat && half < full)) {
    throw new Error(`upright half not between floor and 1: ${half}`);
  }
  console.log(
    `upright OK: floor=${UPRIGHT_QUALITY_FLOOR} half=${half.toFixed(3)} full=${full}`,
  );
}

/** High-frequency ±1 thrash should not earn gated run fitness. */
async function assertThrashScootBlocked(): Promise<void> {
  const result = await runThrashEpisode(SIMPLE_HOPPER);
  console.log(
    `thrash scoot: dist=${result.distance.toFixed(3)} lifts=${result.footLifts} fitness=${result.fitness.toFixed(3)}`,
  );
  if (result.fitness > MAX_THRASH_FITNESS) {
    throw new Error(
      `Flip-thrash still scores (${result.fitness.toFixed(3)}); lift gate failed`,
    );
  }
  console.log('anti-scoot OK');
}

/**
 * Oscillate briefly (possible early lifts) then thrash — fitness must stay low
 * vs ungated distance (quality must not saturate after a few pops).
 */
async function assertLiftThenScootBlocked(): Promise<void> {
  const sim = new Simulation();
  await sim.init();
  sim.loadDesign(cloneDesign(SIMPLE_HOPPER));
  sim.driveMode = 'sine';
  const creature = sim.creature!;
  const startX = avgJointX(creature);
  let fallTime = 0;
  let fell = false;
  let footLifts = 0;
  let uprightSum = 0;
  let uprightSteps = 0;
  const planted = createFootLiftState(creature.joints.length);
  const steps = Math.round(10 / FIXED_DT);
  const sineSteps = Math.round(2 / FIXED_DT);

  for (let i = 0; i < steps; i++) {
    if (i === sineSteps) sim.driveMode = 'manual';
    if (i >= sineSteps) sim.setAllManual(i % 4 < 2 ? 1 : -1);
    sim.step(FIXED_DT);
    footLifts += updateFootLiftState(creature, planted);
    uprightSum += instantUprightQuality(creature);
    uprightSteps++;
    const fall = updateFallState(creature, fallTime, FIXED_DT);
    fallTime = fall.fallTime;
    if (fall.fell) {
      fell = true;
      break;
    }
  }

  const uprightMean = uprightSteps > 0 ? uprightSum / uprightSteps : 1;
  const result = scoreRunPerformance(creature, startX, fell, footLifts, uprightMean);
  const ungated = Math.max(0, result.distance);
  const quality = runLiftQuality(result.distance, result.footLifts);
  const needed = requiredFootLifts(result.distance);
  console.log(
    `lift-then-scoot: dist=${result.distance.toFixed(3)} lifts=${result.footLifts} ` +
      `needed=${needed.toFixed(2)} quality=${quality.toFixed(3)} fitness=${result.fitness.toFixed(3)}`,
  );

  // When distance outruns lift density, quality must not saturate.
  if (ungated > DISTANCE_PER_LIFT * 2 && result.footLifts < needed && quality >= 0.99) {
    throw new Error(
      `lift-then-scoot saturated quality at dist=${ungated.toFixed(3)} lifts=${result.footLifts}`,
    );
  }
  console.log('lift-then-scoot OK');
}

async function assertCustomBipedScootBlocked(): Promise<void> {
  const raw = readFileSync(join(HERE, 'fixtures', 'custom-biped.json'), 'utf8');
  const parsed = importCreatureJson(raw);
  if (!parsed.ok) throw new Error(`custom biped fixture: ${parsed.error}`);
  const result = await runThrashEpisode(parsed.value);
  console.log(
    `custom thrash: dist=${result.distance.toFixed(3)} lifts=${result.footLifts} fitness=${result.fitness.toFixed(3)}`,
  );
  if (result.fitness > MAX_THRASH_FITNESS) {
    throw new Error(
      `Custom biped thrash still scores (${result.fitness.toFixed(3)}); anti-scoot failed`,
    );
  }
  console.log('custom biped anti-scoot OK');
}

async function runSeed(
  seed: number,
): Promise<{ ok: boolean; gen0: number; final: number; lifts: number }> {
  const result = await evolveRun({
    design: cloneDesign(SIMPLE_HOPPER),
    populationSize: POP,
    maxGenerations: GENS,
    seed,
  });
  const gen0 = result.history[0]?.best ?? 0;
  const final = result.best.fitness;

  const sim = new Simulation();
  await sim.init();
  const episode = evaluateRunEpisode(
    sim,
    cloneDesign(SIMPLE_HOPPER),
    result.shape,
    result.best.weights,
  );

  const densityOk =
    episode.distance <= DISTANCE_PER_LIFT ||
    episode.footLifts >= (episode.distance / DISTANCE_PER_LIFT) * 0.5;

  const ok =
    final >= MIN_FINAL_BEST &&
    final >= gen0 + MIN_IMPROVEMENT &&
    (final < 0.2 || episode.footLifts >= 1) &&
    (final < 0.2 || densityOk);

  console.log(
    `seed ${seed}: gen0_best=${gen0.toFixed(3)} final_best=${final.toFixed(3)} ` +
      `elite_lifts=${episode.footLifts} elite_dist=${episode.distance.toFixed(3)} ` +
      `density=${densityOk ? 'OK' : 'FAIL'} ${ok ? 'PASS' : 'FAIL'}`,
  );
  return { ok, gen0, final, lifts: episode.footLifts };
}

async function main() {
  assertDriveGroups();
  assertNetworkDeterministic();
  assertLiftDensityFormula();
  assertUprightGate();
  await assertThrashScootBlocked();
  await assertLiftThenScootBlocked();
  await assertCustomBipedScootBlocked();

  let passes = 0;
  for (const seed of SEEDS) {
    const { ok } = await runSeed(seed);
    if (ok) passes++;
  }

  console.log(`seeds passed: ${passes}/${SEEDS.length}`);
  if (passes < 2) {
    throw new Error(
      `Expected ≥2/3 seeds to improve (final≥${MIN_FINAL_BEST} and ≥gen0+${MIN_IMPROVEMENT}, with lift density)`,
    );
  }
  console.log('smoke-evolve OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
