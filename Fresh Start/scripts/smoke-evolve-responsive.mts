/**
 * Verifies evolve yields macrotasks so Stop / interleaved work can run.
 * Run: npx tsx scripts/smoke-evolve-responsive.mts
 */
import { evolveRun, yieldToBrowser } from '../src/brain/evolve.ts';
import { SIMPLE_HOPPER } from '../src/creature/presets.ts';
import { cloneDesign } from '../src/creature/types.ts';

async function assertYieldAllowsInterleaving(): Promise<void> {
  let otherWork = 0;
  const bump = setInterval(() => {
    otherWork++;
  }, 5);

  const t0 = performance.now();
  while (performance.now() - t0 < 40) {
    await yieldToBrowser();
  }
  clearInterval(bump);

  if (otherWork < 2) {
    throw new Error(
      `yieldToBrowser did not allow interleaved timers (otherWork=${otherWork}); UI would freeze`,
    );
  }
  console.log(`yield OK — interleaved timer ticks=${otherWork}`);
}

async function assertStopWorksMidRun(): Promise<void> {
  let stop = false;
  let progressTicks = 0;
  const timer = setTimeout(() => {
    stop = true;
  }, 120);

  const result = await evolveRun({
    design: cloneDesign(SIMPLE_HOPPER),
    populationSize: 12,
    maxGenerations: 8,
    seed: 5,
    shouldContinue: () => !stop,
    onProgress: () => {
      progressTicks++;
    },
  });
  clearTimeout(timer);

  if (progressTicks < 2) {
    throw new Error(`expected progress updates, got ${progressTicks}`);
  }
  if (result.history.length >= 8 && result.generation >= 8) {
    throw new Error('Stop did not halt evolution early — UI Stop would feel broken');
  }
  console.log(
    `stop OK — progressTicks=${progressTicks} gensRecorded=${result.history.length} best=${result.best.fitness.toFixed(3)}`,
  );
}

async function main() {
  await assertYieldAllowsInterleaving();
  await assertStopWorksMidRun();
  console.log('smoke-evolve-responsive OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
