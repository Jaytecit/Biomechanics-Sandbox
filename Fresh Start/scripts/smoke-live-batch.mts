/**
 * Headless check that live batch evolve spawns a cohort, steps, and scores.
 * Run: npx tsx scripts/smoke-live-batch.mts
 */
import { SIMPLE_HOPPER } from '../src/creature/presets.ts';
import { cloneDesign } from '../src/creature/types.ts';
import { FIXED_DT } from '../src/physics/constants.ts';
import { Simulation } from '../src/sim/simulation.ts';

async function main() {
  const sim = new Simulation();
  await sim.init();

  let finished = false;
  let maxAgents = 0;
  let sawFollow = false;

  sim.startLiveEvolve({
    design: cloneDesign(SIMPLE_HOPPER),
    populationSize: 4,
    batchSize: 4,
    maxGenerations: 2,
    episodeSeconds: 0.5,
    seed: 3,
    onFinished: () => {
      finished = true;
    },
  });

  // 2 gens × 0.5s + margin
  const steps = Math.round((0.5 * 2 + 0.25) / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const snap = sim.step(FIXED_DT);
    maxAgents = Math.max(maxAgents, snap.agents.length);
    if (snap.cameraFollow) sawFollow = true;
    if (snap.agents.length >= 2) {
      const focused = snap.agents.filter((a) => a.focused);
      const ghosts = snap.agents.filter((a) => !a.focused);
      if (focused.length !== 1) {
        throw new Error(`expected 1 focused agent, got ${focused.length}`);
      }
      if (ghosts.some((g) => g.opacity >= 1)) {
        throw new Error('ghost opacity should be < 1');
      }
    }
  }

  // Drain a bit more if finish callback pending mid-step
  for (let i = 0; i < 30 && !finished; i++) sim.step(FIXED_DT);

  if (maxAgents < 4) throw new Error(`expected cohort of 4, maxAgents=${maxAgents}`);
  if (!sawFollow) throw new Error('expected cameraFollow during live evolve');
  if (!finished) throw new Error('live evolve did not finish');
  if (sim.isEvolving) throw new Error('still evolving after finish');

  console.log(`live-batch OK maxAgents=${maxAgents} finished=${finished}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
