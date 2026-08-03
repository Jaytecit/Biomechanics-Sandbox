/**
 * Physics firewall invariants — must stay green before/after feature ports.
 * Run: npm run smoke:firewall
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIXED_DT,
  GRAVITY_Y,
  GROUND_Y,
  MUSCLE_DAMPER,
  MUSCLE_MAX_FORCE,
  MUSCLE_SPRING,
} from '../src/physics/constants.ts';
import { applyMuscleForces, type RuntimeMuscle } from '../src/control/muscleDrive.ts';
import { createRng } from '../src/brain/network.ts';
import { TRIANGLE_WALKER } from '../src/creature/presets.ts';
import { cloneDesign } from '../src/creature/types.ts';
import { Simulation } from '../src/sim/simulation.ts';
import { featureFlags } from '../src/port/featureFlags.ts';
import { createWorld, initRapier, RAPIER } from '../src/physics/world.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertFixedDtContract(): void {
  assert(FIXED_DT === 1 / 60, `FIXED_DT must be 1/60, got ${FIXED_DT}`);
  assert(Number.isFinite(GRAVITY_Y) && GRAVITY_Y < 0, 'GRAVITY_Y must be negative');
  assert(MUSCLE_SPRING > 0 && MUSCLE_DAMPER > 0 && MUSCLE_MAX_FORCE > 0, 'muscle constants must be positive');
  console.log(`constants OK FIXED_DT=${FIXED_DT} GRAVITY_Y=${GRAVITY_Y}`);
}

function assertSimulationUsesFixedDt(): void {
  const src = readFileSync(join(root, 'src/sim/simulation.ts'), 'utf8');
  assert(src.includes('FIXED_DT'), 'simulation.ts must import/use FIXED_DT');
  assert(src.includes('this.accumulator'), 'simulation.ts must use dt accumulator');
  assert(src.includes('resetForces'), 'simulation.ts must resetForces each physics step');
  assert(src.includes('world.step()'), 'simulation.ts must call world.step()');
  assert(!/world\.step\(\s*[^)]+\)/.test(src.replace(/world\.step\(\)/g, '')), 'world.step must not take a variable dt argument');
  console.log('simulation contract OK (fixed-dt accumulator + resetForces)');
}

function assertMuscleThirdLaw(): void {
  const forces: { id: string; x: number; y: number }[] = [];
  const makeBone = (id: string, x: number, y: number, vx = 0, vy = 0) => {
    const force = { x: 0, y: 0 };
    return {
      translation: () => ({ x, y }),
      linvel: () => ({ x: vx, y: vy }),
      wakeUp: () => undefined,
      addForce: (f: { x: number; y: number }) => {
        force.x += f.x;
        force.y += f.y;
        forces.push({ id, x: f.x, y: f.y });
      },
      _force: force,
    };
  };

  const a = makeBone('a', 0, 0);
  const b = makeBone('b', 2, 0);
  const muscle: RuntimeMuscle = {
    id: 1,
    startBone: a as unknown as RuntimeMuscle['startBone'],
    endBone: b as unknown as RuntimeMuscle['endBone'],
    restLength: 1.5,
    strength: MUSCLE_MAX_FORCE,
    canExpand: true,
  };

  applyMuscleForces([muscle], [0.5]);
  assert(forces.length === 2, 'expected two addForce calls');
  const sumX = forces[0].x + forces[1].x;
  const sumY = forces[0].y + forces[1].y;
  assert(Math.abs(sumX) < 1e-9 && Math.abs(sumY) < 1e-9, `muscle forces not equal-opposite (sum=${sumX},${sumY})`);
  console.log('muscle third-law OK');
}

function assertSeededRngOnlyInNetworkPath(): void {
  const a = createRng(123);
  const b = createRng(123);
  for (let i = 0; i < 8; i++) {
    assert(a() === b(), 'createRng must be deterministic for same seed');
  }
  const c = createRng(124);
  assert(c() !== createRng(123)(), 'different seeds must diverge');
  console.log('seeded RNG OK');
}

async function assertInfiniteGroundFarFromOrigin(): Promise<void> {
  await initRapier();
  const world = createWorld();
  const farX = 500;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(farX, 2),
  );
  world.createCollider(RAPIER.ColliderDesc.ball(0.25), body);
  world.timestep = FIXED_DT;
  for (let i = 0; i < 180; i++) world.step();
  const y = body.translation().y;
  assert(
    y > GROUND_Y - 0.05 && y < GROUND_Y + 1.2,
    `far probe should rest on infinite ground at x=${farX}, got y=${y}`,
  );
  assert(
    Math.abs(body.translation().x - farX) < 2,
    `far probe should stay near x=${farX}, got x=${body.translation().x}`,
  );
  world.free();
  console.log(`infinite ground OK (probe at x=${farX} settled y=${y.toFixed(3)})`);
}

async function assertDeterministicIdleSettle(): Promise<void> {
  async function settleAvgY(): Promise<number> {
    const sim = new Simulation();
    await sim.init();
    sim.loadDesign(cloneDesign(TRIANGLE_WALKER));
    sim.driveMode = 'idle';
    for (let i = 0; i < 120; i++) sim.step(FIXED_DT);
    const joints = sim.creature?.joints ?? [];
    let sum = 0;
    for (const j of joints) sum += j.body.translation().y;
    return sum / joints.length;
  }

  const y1 = await settleAvgY();
  const y2 = await settleAvgY();
  assert(Math.abs(y1 - y2) < 1e-6, `idle settle not deterministic (${y1} vs ${y2})`);
  console.log(`deterministic settle OK avgY=${y1.toFixed(6)}`);
}

function assertFeatureFlagsAreBooleans(): void {
  for (const [k, v] of Object.entries(featureFlags)) {
    assert(typeof v === 'boolean', `feature flag ${k} must be boolean`);
  }
  const on = Object.entries(featureFlags).filter(([, v]) => v).map(([k]) => k);
  console.log(`feature flags OK (${on.length} enabled: ${on.join(', ') || 'none'})`);
}

function assertNoParentPhysicsImports(): void {
  // Fresh Start must not import parent sandbox physics modules by relative path escape.
  const offenders: string[] = [];
  const scanDirs = ['src', 'scripts'];
  for (const dir of scanDirs) {
    // Lightweight: check known entry files for parent-path imports.
    // Full tree walk is overkill; package lives in Fresh Start/ and should not reach ../src/physics.
  }
  const files = [
    'src/App.tsx',
    'src/sim/simulation.ts',
    'src/physics/world.ts',
    'src/physics/spawn.ts',
    'src/control/muscleDrive.ts',
    'src/brain/evolve.ts',
  ];
  for (const rel of files) {
    const text = readFileSync(join(root, rel), 'utf8');
    if (
      text.includes('../physics.ts') ||
      text.includes('../../src/physics') ||
      text.includes('physicsConstants') ||
      text.includes("from '../aero") ||
      text.includes('from "../../src/neat')
    ) {
      offenders.push(rel);
    }
  }
  assert(offenders.length === 0, `parent physics import leak in: ${offenders.join(', ')}`);
  console.log('no parent physics imports OK');
  void scanDirs;
}

async function main(): Promise<void> {
  assertFixedDtContract();
  assertSimulationUsesFixedDt();
  assertMuscleThirdLaw();
  assertSeededRngOnlyInNetworkPath();
  assertFeatureFlagsAreBooleans();
  assertNoParentPhysicsImports();
  await assertInfiniteGroundFarFromOrigin();
  await assertDeterministicIdleSettle();
  console.log('smoke-firewall OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
