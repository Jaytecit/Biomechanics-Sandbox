/**
 * D10 / D16 / D17 — live evolve knobs, telemetry fields, soft morph topology.
 * Run: npx tsx scripts/smoke-train-recipes.mts
 */
import {
  analyzeTrainTelemetry,
  appendTrainTelemetryGen,
  beginTrainTelemetrySession,
  finalizeTrainTelemetry,
} from '../src/brain/trainTelemetry.ts';
import { emptyMetrics } from '../src/brain/taskScore.ts';
import { createRng } from '../src/brain/network.ts';
import {
  applyMorphToDesign,
  mutateMorphGenes,
  zeroMorphGenes,
} from '../src/creature/morphGenes.ts';
import { SIMPLE_HOPPER } from '../src/creature/presets.ts';
import { cloneDesign } from '../src/creature/types.ts';
import { gauntletEnv } from '../src/env/gauntletEnv.ts';
import { FIXED_DT } from '../src/physics/constants.ts';
import { Simulation } from '../src/sim/simulation.ts';
import { isFeatureEnabled } from '../src/port/featureFlags.ts';

async function main() {
  if (!isFeatureEnabled('trainTelemetryLog')) {
    throw new Error('trainTelemetryLog flag should be enabled for D16');
  }
  if (!isFeatureEnabled('morphEvolve')) {
    throw new Error('morphEvolve flag should be enabled for D17');
  }

  const rng = createRng(7);
  const baseMorph = zeroMorphGenes(SIMPLE_HOPPER);
  const mutated = mutateMorphGenes(baseMorph, rng, 0.2);
  const decoded = applyMorphToDesign(SIMPLE_HOPPER, mutated);
  if (decoded.muscles.length !== SIMPLE_HOPPER.muscles.length) {
    throw new Error('morph must preserve muscle topology');
  }
  if (decoded.joints.length !== SIMPLE_HOPPER.joints.length) {
    throw new Error('morph must preserve joint topology');
  }

  const sim = new Simulation();
  await sim.init();
  sim.setEnvironment(gauntletEnv());

  let finished = false;
  let maxAgents = 0;
  let sawGen = false;
  let telemetryGens = 0;
  let sawMean = false;
  let sawStall = false;
  let sawMorph = false;

  let session = beginTrainTelemetrySession({
    task: 'sprint',
    design: SIMPLE_HOPPER,
    runSeed: 42,
    knobs: { populationSize: 8 },
    window: 50,
  });

  sim.onEpisodeComplete = (snap) => {
    if (snap.context !== 'evolve' || snap.generation == null) return;
    telemetryGens += 1;
    if (typeof snap.meanFitness === 'number') sawMean = true;
    if (snap.stall?.atEpisodeEnd) sawStall = true;
    if (snap.morph) sawMorph = true;
    session = appendTrainTelemetryGen(session, {
      generation: snap.generation,
      task: snap.task,
      episodeSeconds: snap.episodeSeconds,
      bestFitness: snap.metrics.fitness,
      meanFitness: snap.meanFitness ?? 0,
      runBestFitness: snap.runBestFitness ?? snap.metrics.fitness,
      populationSize: snap.populationSize ?? 0,
      metrics: snap.metrics,
      stall: snap.stall ?? null,
    });
  };

  sim.startLiveEvolve({
    design: cloneDesign(SIMPLE_HOPPER),
    task: 'sprint',
    populationSize: 8,
    batchSize: 4,
    maxGenerations: 2,
    episodeSeconds: 0.4,
    seed: 42,
    morphEvolve: true,
    messyBodies: true,
    breed: {
      eliteCount: 1,
      tournamentSize: 2,
      mutationSigma: 0.28,
      mutationResetRate: 0.1,
      crossover: true,
      annealMutation: true,
      shortTriesFirst: true,
      stopAfterFall: true,
    },
    priorities: { distance: 0.7, upright: 0.4, dontFall: 0.6 },
    onProgress: (p) => {
      if (p.generation > 0) sawGen = true;
    },
    onFinished: () => {
      finished = true;
    },
  });

  const steps = Math.round((0.4 * 4 + 0.5) / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const snap = sim.step(FIXED_DT);
    maxAgents = Math.max(maxAgents, snap.agents.length);
  }
  for (let i = 0; i < 80 && !finished; i++) sim.step(FIXED_DT);

  if (maxAgents < 4) {
    throw new Error(`expected batch of 4, maxAgents=${maxAgents}`);
  }
  if (!sawGen) throw new Error('expected generation progress');
  if (!finished) throw new Error('recipe evolve did not finish');
  if (telemetryGens < 2) {
    throw new Error(`expected ≥2 gen-champion emits, got ${telemetryGens}`);
  }
  if (!sawMean) throw new Error('expected meanFitness on gen-champion snapshot');
  if (!sawStall) {
    throw new Error('expected stall diagnostics on gen-champion snapshot');
  }
  if (!sawMorph) throw new Error('expected morph genes on gen-champion snapshot');

  // Synthetic failure pattern for analyzer coverage.
  let synth = beginTrainTelemetrySession({
    task: 'run',
    design: SIMPLE_HOPPER,
    runSeed: 1,
    knobs: {},
    window: 50,
  });
  for (let g = 0; g < 12; g++) {
    const metrics = emptyMetrics();
    metrics.fitness = 0.2;
    metrics.distance = 2;
    metrics.footLifts = 0;
    metrics.fell = true;
    synth = appendTrainTelemetryGen(synth, {
      generation: g,
      task: 'run',
      episodeSeconds: 8,
      bestFitness: 0.2,
      meanFitness: 0.1,
      runBestFitness: 0.2,
      populationSize: 8,
      metrics,
    });
  }
  const final = finalizeTrainTelemetry(synth);
  const insights = analyzeTrainTelemetry(final);
  if (!insights.some((i) => i.kind === 'failure')) {
    throw new Error('expected failure insights for falling scoot pattern');
  }
  if (final.morphology.feet < 1) {
    throw new Error('hopper morphology should report feet');
  }

  console.log(
    `train-recipes OK maxAgents=${maxAgents} finished=${finished} sawGen=${sawGen} telemetryGens=${telemetryGens} morph=${sawMorph}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
