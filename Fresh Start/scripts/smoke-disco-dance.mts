/**
 * H6/H7 gate: dance obs pack, imitation warm-start, offline analysis, dance fitness.
 * Run: npm run smoke:disco-dance
 */
import { OBS_COUNT } from '../src/brain/constants.ts';
import {
  DANCE_AUDIO_COUNT,
  DANCE_LOOKAHEAD_COUNT,
  DANCE_OBS_COUNT,
  DANCE_OBS_PACK_VERSION,
  packAudioBands,
  packDanceLookahead,
} from '../src/brain/danceObs.ts';
import {
  collapseMuscleDrivesToChannels,
  countBrainActuatorChannels,
  expandChannelDrives,
} from '../src/brain/driveGroups.ts';
import {
  emptyDanceFitnessAccum,
  finalizeDanceFitness,
  meanAbsDrives,
  tickDanceFitness,
} from '../src/brain/danceFitness.ts';
import {
  fitImitation,
  imitationLoss,
} from '../src/brain/imitate.ts';
import {
  evaluateNetwork,
  makeShape,
} from '../src/brain/network.ts';
import { DiscoRecordBuffer } from '../src/audio/discoRecord.ts';
import { MultiTrackDanceDataset } from '../src/audio/discoDataset.ts';
import {
  analyzePcm,
  bandsAtTime,
  lookaheadAtTime,
} from '../src/audio/trackAnalysis.ts';
import { isFeatureEnabled } from '../src/port/featureFlags.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertObsPack(): void {
  assert(OBS_COUNT === 12, 'locomotion OBS_COUNT must stay 12');
  assert(DANCE_AUDIO_COUNT === 6, 'audio band count');
  assert(DANCE_LOOKAHEAD_COUNT === 6, 'lookahead count');
  assert(
    DANCE_OBS_COUNT === OBS_COUNT + DANCE_AUDIO_COUNT + DANCE_LOOKAHEAD_COUNT,
    'dance obs size',
  );
  assert(DANCE_OBS_PACK_VERSION >= 2, 'obs pack version');
  const loco = makeShape(4);
  assert(loco.inputCount === OBS_COUNT, 'default makeShape uses OBS_COUNT');
  const dance = makeShape(4, DANCE_OBS_COUNT);
  assert(dance.inputCount === DANCE_OBS_COUNT, 'dance shape inputCount');
  const bands = {
    bass: 0.1,
    lowMid: 0.2,
    highMid: 0.3,
    treble: 0.4,
    onset: 0.5,
    energy: 0.6,
  };
  const packed = packAudioBands(bands);
  assert(packed.length === DANCE_AUDIO_COUNT, 'audio pack length');
  assert(Math.abs(packed[5]! - 0.6) < 1e-5, 'energy packed');
  const look = packDanceLookahead([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  assert(look.length === DANCE_LOOKAHEAD_COUNT, 'lookahead pack length');
  console.log('dance obs pack OK');
}

function assertCollapse(): void {
  const muscles = [
    { id: 1, driveGroup: 1 },
    { id: 2, driveGroup: 1 },
    { id: 3 },
  ];
  assert(countBrainActuatorChannels(muscles) === 2, 'channel count');
  const collapsed = collapseMuscleDrivesToChannels(muscles, [0.5, 0.9, -0.25]);
  assert(collapsed[0] === 0.5, 'first group member wins');
  assert(collapsed[1] === -0.25, 'singleton channel');
  const expanded = expandChannelDrives(muscles, collapsed);
  assert(expanded[0] === 0.5 && expanded[1] === 0.5, 'expand mirrors collapse');
  console.log('drive collapse OK');
}

async function assertImitationWarmStart(): Promise<void> {
  const outCount = 3;
  const shape = makeShape(outCount, DANCE_OBS_COUNT);
  const n = 240;
  const inputs: Float32Array[] = [];
  const targets: Float32Array[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / 30;
    const x = new Float32Array(DANCE_OBS_COUNT);
    x[0] = Math.sin(t);
    x[1] = Math.cos(t * 1.3);
    x[OBS_COUNT + 0] = 0.5 + 0.5 * Math.sin(t * 2);
    x[OBS_COUNT + 4] = Math.max(0, Math.sin(t * 4));
    x[OBS_COUNT + 5] = 0.4;
    x[OBS_COUNT + 6] = 0.3;
    const y = new Float32Array(outCount);
    y[0] = Math.tanh(x[0]! + x[OBS_COUNT]!);
    y[1] = Math.tanh(x[1]! - x[OBS_COUNT + 4]!);
    y[2] = Math.tanh(0.3 * x[OBS_COUNT + 5]!);
    inputs.push(x);
    targets.push(y);
  }

  const buf = new DiscoRecordBuffer(n + 10);
  for (let i = 0; i < n; i++) buf.pushSample(inputs[i]!, targets[i]!);
  assert(buf.sampleCount === n, 'record buffer size');

  const cold = await fitImitation({
    shape,
    dataset: { inputs, targets },
    seed: 42,
    epochs: 40,
    lr: 0.1,
    batchSize: 32,
    yieldEvery: 0,
  });
  const warm = await fitImitation({
    shape,
    dataset: { inputs, targets },
    seed: 99,
    epochs: 20,
    lr: 0.05,
    batchSize: 32,
    yieldEvery: 0,
    initialWeights: cold.weights,
  });
  assert(warm.finalLoss <= cold.finalLoss + 0.02, 'warm-start should not regress badly');
  assert(warm.finalLoss < 0.08, `warm loss too high: ${warm.finalLoss}`);

  const out = new Float32Array(outCount);
  evaluateNetwork(shape, warm.weights, inputs[0]!, out);
  console.log(
    `imitation warm-start OK (cold ${cold.finalLoss.toFixed(4)}, warm ${warm.finalLoss.toFixed(4)})`,
  );
}

function assertOfflineAnalysis(): void {
  const sr = 22050;
  const seconds = 2;
  const samples = new Float32Array(sr * seconds);
  const bpm = 120;
  const period = (60 / bpm) * sr;
  for (let i = 0; i < samples.length; i++) {
    const kick = i % Math.floor(period) < 200 ? 0.9 : 0;
    samples[i] = kick * Math.sin((2 * Math.PI * 60 * i) / sr);
  }
  const analysis = analyzePcm(samples, sr);
  assert(analysis.frameCount > 10, 'frame count');
  assert(analysis.beatPeriodSec > 0.25 && analysis.beatPeriodSec < 1.2, 'beat period');
  const b = bandsAtTime(analysis, 0.5);
  assert(b.energy >= 0 && b.energy <= 1, 'energy range');
  const look = lookaheadAtTime(analysis, 0.5);
  assert(look.length === DANCE_LOOKAHEAD_COUNT, 'lookahead length');
  console.log(
    `offline analysis OK (frames ${analysis.frameCount}, beat ${analysis.beatPeriodSec.toFixed(3)}s)`,
  );
}

function assertMultiTrackDataset(): void {
  const ds = new MultiTrackDanceDataset();
  const obs = new Float32Array(DANCE_OBS_COUNT);
  const tgt = new Float32Array(2);
  for (let i = 0; i < 30; i++) {
    obs[0] = i;
    tgt[0] = i * 0.01;
    ds.appendSamples('a', 'trackA', 'fp', obs, tgt);
  }
  for (let i = 0; i < 20; i++) {
    obs[0] = i;
    ds.appendSamples('b', 'trackB', 'fp', obs, tgt);
  }
  assert(ds.sampleCount() === 50, 'merged sample count');
  const { train, holdout } = ds.splitHoldout(5);
  assert(train.inputs.length + holdout.inputs.length === 50, 'split covers all');
  assert(train.inputs.length > 0, 'train non-empty');
  console.log('multi-track dataset OK');
}

function assertDanceFitness(): void {
  assert(meanAbsDrives([0.5, -0.5]) === 0.5, 'mean abs drives');
  const accum = emptyDanceFitnessAccum();
  // Minimal fake creature — tickDanceFitness needs real creature for upright;
  // unit-test finalize path with manual accum instead.
  accum.steps = 10;
  accum.uprightSum = 8;
  accum.energySum = 5;
  accum.beatCorrSum = 2;
  accum.beatCorrCount = 10;
  accum.imitationSum = 8;
  accum.imitationCount = 10;
  const fit = finalizeDanceFitness(accum);
  assert(fit > 0, 'positive fitness');
  accum.fell = true;
  const fitFell = finalizeDanceFitness(accum);
  assert(fitFell < fit, 'fall penalty');
  void tickDanceFitness;
  console.log(`dance fitness OK (${fit.toFixed(3)} → fell ${fitFell.toFixed(3)})`);
}

function assertFlags(): void {
  assert(isFeatureEnabled('discoDanceLearn'), 'H6 flag on');
  assert(isFeatureEnabled('discoDanceCurriculum'), 'H7 flag on');
  console.log('feature flags OK');
}

async function main(): Promise<void> {
  assertFlags();
  assertObsPack();
  assertCollapse();
  await assertImitationWarmStart();
  assertOfflineAnalysis();
  assertMultiTrackDataset();
  assertDanceFitness();
  // Keep imitationLoss import used for clarity in future asserts
  assert(typeof imitationLoss === 'function', 'imitationLoss export');
  console.log('smoke-disco-dance: PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
