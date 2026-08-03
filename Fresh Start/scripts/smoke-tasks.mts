/**
 * Smoke gates for selected task features (J1 / E6.* / P4 caps).
 * Run: npm run smoke:tasks
 */
import {
  createRng,
  randomWeights,
} from '../src/brain/network.ts';
import { evaluateTaskEpisode } from '../src/brain/tasks.ts';
import {
  MOTOR_CART,
  SIMPLE_GLIDER,
  SIMPLE_HOPPER,
  TRIANGLE_WALKER,
} from '../src/creature/presets.ts';
import { cloneDesign } from '../src/creature/types.ts';
import { FIXED_DT } from '../src/physics/constants.ts';
import { spawnClimbCourse, destroyCourse } from '../src/physics/course.ts';
import { shapeForDesign, Simulation } from '../src/sim/simulation.ts';
import { featureFlags } from '../src/port/featureFlags.ts';
import {
  CREATURE_PACKAGE_SCHEMA,
  saveNewPackage,
  loadCreaturePackages,
  deletePackage,
} from '../src/library/creaturePackages.ts';
import {
  ENVIRONMENT_PACKAGE_SCHEMA,
  saveNewEnvironmentPackage,
  loadEnvironmentPackages,
  deleteEnvironmentPackage,
  listEnvironmentsForUi,
} from '../src/library/environmentPackages.ts';
import {
  exportEnvironmentJson,
  importEnvironmentJson,
} from '../src/library/jsonIO.ts';
import { BUNDLED_MODELS } from '../src/library/bundledModels.ts';
import {
  defaultGoalForZone,
  GOAL_CATALOG,
  goalsForZone,
} from '../src/goals/catalog.ts';
import { ZONES, ZONE_ORDER } from '../src/zones/zones.ts';
import { emptyMetrics } from '../src/brain/taskScore.ts';
import { evaluateSecretGoals } from '../src/secrets/eval.ts';
import { SECRET_GOALS } from '../src/secrets/definitions.ts';
import { secretEligible } from '../src/secrets/eligibility.ts';
import {
  clearSecretDiscoveries,
  isSecretDiscovered,
  loadSecretDiscoveries,
  recordDiscovery,
} from '../src/secrets/progress.ts';
import { flatGroundEnv, ENV_THEMES } from '../src/env/types.ts';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function ensureLocalStorage(): void {
  const g = globalThis as typeof globalThis & { localStorage?: Storage };
  if (typeof g.localStorage !== 'undefined') return;
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function assertClimbCourse(): Promise<void> {
  assert(featureFlags.climbCourse, 'climbCourse flag should be on');
  const sim = new Simulation();
  await sim.init();
  if (!sim.world) throw new Error('no world');
  const course = spawnClimbCourse(sim.world);
  assert(course.bodies.length >= 3, 'expected climb steps');
  destroyCourse(sim.world, course);
  console.log('climb course OK');
}

async function assertJumpTaskScores(): Promise<void> {
  const sim = new Simulation();
  await sim.init();
  const shape = shapeForDesign(SIMPLE_HOPPER);
  const w = randomWeights(shape, createRng(7));
  const result = evaluateTaskEpisode(
    sim,
    cloneDesign(SIMPLE_HOPPER),
    shape,
    w,
    'jump',
    3,
  );
  assert(Number.isFinite(result.fitness), 'jump fitness finite');
  assert(result.peakHeight >= 0, 'peakHeight tracked');
  console.log(`jump task OK fitness=${result.fitness.toFixed(3)} peak=${result.peakHeight.toFixed(3)}`);
}

async function assertMotorTorqueMoves(): Promise<void> {
  assert(featureFlags.motorWheels, 'motorWheels flag should be on');
  const sim = new Simulation();
  await sim.init();
  sim.setTask('motor');
  sim.loadDesign(cloneDesign(MOTOR_CART));
  sim.driveMode = 'manual';
  sim.setAllManual(1);
  const startX =
    sim.creature!.joints.reduce((s, j) => s + j.body.translation().x, 0) /
    sim.creature!.joints.length;
  for (let i = 0; i < 180; i++) sim.step(FIXED_DT);
  const endX =
    sim.creature!.joints.reduce((s, j) => s + j.body.translation().x, 0) /
    sim.creature!.joints.length;
  console.log(`motor cart Δx=${(endX - startX).toFixed(3)}`);
  assert(endX > startX + 0.15, `motor cart should move +X (Δx=${endX - startX})`);
  console.log('motor torque OK');
}

async function assertAeroSlowsFall(): Promise<void> {
  assert(featureFlags.aeroLikeForces, 'aeroLikeForces flag should be on');
  async function fallY(withAero: boolean): Promise<number> {
    const design = cloneDesign(SIMPLE_GLIDER);
    if (!withAero) {
      for (const b of design.bones) b.aeroArea = 0;
    }
    // Drop from higher by shifting joints up
    for (const j of design.joints) j.y += 4;
    const sim = new Simulation();
    await sim.init();
    sim.setTask('flight');
    sim.loadDesign(design);
    sim.driveMode = 'idle';
    for (let i = 0; i < 90; i++) sim.step(FIXED_DT);
    const joints = sim.creature!.joints;
    return joints.reduce((s, j) => s + j.body.translation().y, 0) / joints.length;
  }
  const yAero = await fallY(true);
  const yBare = await fallY(false);
  console.log(`aero avgY=${yAero.toFixed(3)} bare avgY=${yBare.toFixed(3)}`);
  assert(yAero > yBare + 0.05, 'aero body should fall slower (higher avgY)');
  console.log('aero-like OK');
}

function countPngs(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) n += countPngs(full);
    else if (name.toLowerCase().endsWith('.png')) n += 1;
  }
  return n;
}

function assertCatalogAndZones(): void {
  const assets = join(
    fileURLToPath(new URL('.', import.meta.url)),
    '../src/assets/bodyParts',
  );
  const pngCount = countPngs(assets);
  assert(pngCount > 50, `expected body-part PNGs, got ${pngCount}`);
  assert(ZONE_ORDER.length === 5, 'five zones');
  assert(ZONES.walking.defaultTask === 'run', 'walking → run');
  assert(ZONES.jumping.defaultTask === 'jump', 'jumping → jump');
  assert(BUNDLED_MODELS.length >= 3, 'bundled models present');
  assert(GOAL_CATALOG.length >= 5, 'goal catalog has task families');
  assert(goalsForZone('walking').some((g) => g.id === 'run'), 'walking lists run');
  assert(goalsForZone('free').length === GOAL_CATALOG.length, 'free lists all goals');
  assert(defaultGoalForZone('motor').task === 'motor', 'motor zone default');
  console.log(
    `catalog OK pngs=${pngCount} zones=${ZONE_ORDER.length} goals=${GOAL_CATALOG.length} bundled=${BUNDLED_MODELS.length}`,
  );
}

function assertPackages(): void {
  ensureLocalStorage();
  const saved = saveNewPackage(cloneDesign(TRIANGLE_WALKER), {
    displayName: 'Smoke Pack',
    source: 'user',
  });
  assert(saved.ok, 'save package');
  assert(saved.ok && saved.value.schemaVersion === CREATURE_PACKAGE_SCHEMA, 'schema');
  const all = loadCreaturePackages();
  assert(all.some((p) => p.displayName === 'Smoke Pack'), 'package listed');
  if (saved.ok) deletePackage(saved.value.id);
  console.log('creature packages OK');
}

function assertSecretGoals(): void {
  ensureLocalStorage();
  clearSecretDiscoveries();
  assert(featureFlags.secretGoals, 'secretGoals flag should be on');
  assert(SECRET_GOALS.length === 10, 'ten starter secrets');

  const hopper = cloneDesign(SIMPLE_HOPPER);
  const motorDef = SECRET_GOALS.find((g) => g.id === 'motor_wheelie');
  assert(!!motorDef, 'motor_wheelie defined');
  assert(!secretEligible(hopper, motorDef!), 'hopper ineligible for wheeled secret');
  assert(
    secretEligible(cloneDesign(MOTOR_CART), motorDef!),
    'motor cart eligible for wheeled secret',
  );

  const zeroHero = evaluateSecretGoals({
    task: 'run',
    metrics: { ...emptyMetrics(), distance: 0.1, fell: false },
    design: hopper,
    episodeSeconds: 10,
  });
  assert(zeroHero.includes('run_zero_hero'), `expected run_zero_hero, got ${zeroHero}`);

  const recorded = recordDiscovery({
    secretGoalId: 'run_zero_hero',
    discoveredAt: new Date().toISOString(),
    modelName: 'Smoke',
    activeTask: 'run',
    context: 'evolve',
  });
  assert(recorded, 'first discovery records');
  assert(isSecretDiscovered('run_zero_hero'), 'ledger has discovery');
  assert(
    !recordDiscovery({
      secretGoalId: 'run_zero_hero',
      discoveredAt: new Date().toISOString(),
      modelName: 'Smoke',
      activeTask: 'run',
      context: 'evolve',
    }),
    'duplicate discovery idempotent',
  );

  const again = evaluateSecretGoals({
    task: 'run',
    metrics: { ...emptyMetrics(), distance: 0.1, fell: false },
    design: hopper,
    episodeSeconds: 10,
  });
  assert(!again.includes('run_zero_hero'), 'already discovered not re-emitted');
  assert(Object.keys(loadSecretDiscoveries()).length >= 1, 'ledger non-empty');
  clearSecretDiscoveries();
  console.log('secret goals OK');
}

function assertEnvironmentPackages(): void {
  ensureLocalStorage();
  assert(featureFlags.environmentsRepo, 'environmentsRepo flag should be on');
  assert(ENV_THEMES.length === 4, 'four themes');

  const env = flatGroundEnv('Smoke Flat');
  env.theme = 'mint';
  const saved = saveNewEnvironmentPackage(env, {
    displayName: 'Smoke Env',
    source: 'user',
  });
  assert(saved.ok, 'save env package');
  assert(
    saved.ok && saved.value.schemaVersion === ENVIRONMENT_PACKAGE_SCHEMA,
    'env schema',
  );
  const listed = loadEnvironmentPackages();
  assert(listed.some((p) => p.displayName === 'Smoke Env'), 'env package listed');
  assert(
    listEnvironmentsForUi().some((p) => p.id === 'builtin_flat_ground'),
    'builtin flat ground in UI list',
  );

  const json = exportEnvironmentJson(env);
  const round = importEnvironmentJson(json);
  assert(round.ok, 'env import ok');
  assert(round.ok && round.value.theme === 'mint', 'theme round-trip');
  assert(round.ok && round.value.obstacles.length === 0, 'empty obstacles');

  if (saved.ok) deleteEnvironmentPackage(saved.value.id);
  console.log('environment packages OK');
}

async function main(): Promise<void> {
  assertCatalogAndZones();
  assertPackages();
  assertSecretGoals();
  assertEnvironmentPackages();
  await assertClimbCourse();
  await assertJumpTaskScores();
  await assertMotorTorqueMoves();
  await assertAeroSlowsFall();
  console.log('smoke-tasks OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
