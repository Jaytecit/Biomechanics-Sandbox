/**
 * Deterministic flight physics harness (no NEAT).
 * Implements Audit.md Tests 1–3, 5–6, 8 (+ Phase 1 F01 / stability sweeps).
 * Run: npx tsx scripts/flight-physics-harness.ts
 */
import { applyWingForces, applyParagliderForces, applyDiagnosticClassicalPlateForces, sampleParagliderClCdTable } from '../src/aero';
import { snapshotAeroVelocities } from '../src/physics';
import { GROUND_Y, WORLD_GRAVITY, PHYSICS_DT } from '../src/physicsConstants';
import { PhysicsNode, Creature } from '../src/types';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

type Vec = { x: number; y: number };

function node(
  id: number,
  x: number,
  y: number,
  mass = 1,
  vx = 0,
  vy = 0
): PhysicsNode {
  return {
    id,
    x,
    y,
    oldX: x - vx,
    oldY: y - vy,
    vx: 0,
    vy: 0,
    mass,
    radius: 8,
    friction: 0.2,
    isGround: false,
  };
}

function verletStep(nodes: PhysicsNode[], gravity = WORLD_GRAVITY) {
  for (const n of nodes) {
    const tempX = n.x;
    const tempY = n.y;
    const vx = (n.x - n.oldX) * 0.99;
    const vy = (n.y - n.oldY) * 0.99;
    n.x = n.x + vx;
    n.y = n.y + vy + gravity;
    n.oldX = tempX;
    n.oldY = tempY;
  }
}

function relaxMuscles(creature: Creature, iterations: number) {
  for (let step = 0; step < iterations; step++) {
    for (const muscle of creature.muscles) {
      const nodeA = creature.nodes[muscle.nodeA];
      const nodeB = creature.nodes[muscle.nodeB];
      if (!nodeA || !nodeB) continue;
      const dx = nodeB.x - nodeA.x;
      const dy = nodeB.y - nodeA.y;
      const currentLength = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const target = muscle.targetLength;
      const diff = target - currentLength;
      const percent = (diff / currentLength) * muscle.strength * 0.5;
      const offsetX = dx * percent;
      const offsetY = dy * percent;
      const totalMass = nodeA.mass + nodeB.mass;
      const factorA = nodeB.mass / totalMass;
      const factorB = nodeA.mass / totalMass;
      nodeA.x -= offsetX * factorA;
      nodeA.y -= offsetY * factorA;
      nodeB.x += offsetX * factorB;
      nodeB.y += offsetY * factorB;
    }
  }
}

function softGround(nodes: PhysicsNode[]) {
  for (const n of nodes) {
    if (n.y > GROUND_Y - n.radius) {
      n.y = GROUND_Y - n.radius;
      n.oldY = n.y;
    }
  }
}

function com(nodes: PhysicsNode[]): Vec {
  const s = nodes.reduce((a, n) => ({ x: a.x + n.x, y: a.y + n.y }), { x: 0, y: 0 });
  return { x: s.x / nodes.length, y: s.y / nodes.length };
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function assertFiniteNodes(nodes: PhysicsNode[], label: string) {
  for (const n of nodes) {
    assert(Number.isFinite(n.x) && Number.isFinite(n.y), `${label}: NaN position`);
    assert(Math.abs(n.x) < 1e7 && Math.abs(n.y) < 1e7, `${label}: explosion`);
    if (typeof n.aeroVx === 'number') {
      assert(Number.isFinite(n.aeroVx) && Number.isFinite(n.aeroVy!), `${label}: NaN aeroV`);
    }
  }
}

/** Test 1 — Ballistic body: gravity + Verlet without aero. */
function testBallistic() {
  assert(PHYSICS_DT === 1, 'PHYSICS_DT must remain ≡ 1 (aero impulses are per-frame)');
  const n = node(0, 100, 100, 1, 3, -2); // +Y down; -vy is upward launch
  const path: Vec[] = [];
  for (let i = 0; i < 40; i++) {
    verletStep([n], WORLD_GRAVITY);
    path.push({ x: n.x, y: n.y });
  }
  // Must fall (Y increases) after apex and stay finite
  assert(path.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'NaN in ballistic path');
  assert(path[39].y > path[0].y, 'Ballistic body did not descend overall');
  // Repeatability: identical seed → identical end
  const n2 = node(0, 100, 100, 1, 3, -2);
  for (let i = 0; i < 40; i++) verletStep([n2], WORLD_GRAVITY);
  assert(Math.abs(n2.x - path[39].x) < 1e-9 && Math.abs(n2.y - path[39].y) < 1e-9, 'Ballistic not deterministic');
  console.log(
    `PASS Test1 ballistic end=(${path[39].x.toFixed(2)},${path[39].y.toFixed(2)}) g=${WORLD_GRAVITY} dt=${PHYSICS_DT}`
  );
}

/** Test 2 — Drag-only: force must oppose travel, larger area → more slowing. */
function testDragOnly() {
  function plate(area: number, vx: number) {
    const a = node(0, 0, 200, 1, vx, 0);
    const b = node(1, 60, 200, 1, vx, 0);
    const creature = {
      nodes: [a, b],
      muscles: [
        {
          id: 0,
          nodeA: 0,
          nodeB: 1,
          originalLength: 60,
          minLength: 60,
          maxLength: 60,
          targetLength: 60,
          strength: 1,
          phaseOffset: 0,
          aeroType: 'wing' as const,
          aeroArea: area,
          // Hold: no flap → skin drag branch
          _prevTarget: 60,
        },
      ],
    } as unknown as Creature;
    const xBefore = (a.x + b.x) / 2;
    applyWingForces(creature);
    const xAfter = (a.x + b.x) / 2;
    return xAfter - xBefore; // negative if opposing +vx travel
  }
  const small = plate(20, 4);
  const large = plate(120, 4);
  assert(small <= 0.001, `Small-area drag accelerated travel (dx=${small})`);
  assert(large < small - 0.001, `Larger area did not drag more (small=${small} large=${large})`);
  console.log(`PASS Test2 drag-only smallDx=${small.toFixed(4)} largeDx=${large.toFixed(4)}`);
}

/** Test 3 — Fixed plate drop: classical diagnostic plate (hold OK) broadside vs edge-on. */
function testFixedPlateDrop() {
  function sink(orientation: 'broadside' | 'edge') {
    const horizontal = orientation === 'broadside';
    const a = horizontal ? node(0, 100, 80, 0.8) : node(0, 100, 50, 0.8);
    const b = horizontal ? node(1, 160, 80, 0.8) : node(1, 100, 110, 0.8);
    a.oldY = a.y - 2.5;
    b.oldY = b.y - 2.5;
    const creature = {
      nodes: [a, b],
      muscles: [
        {
          id: 0,
          nodeA: 0,
          nodeB: 1,
          originalLength: 60,
          minLength: 60,
          maxLength: 60,
          targetLength: 60,
          strength: 0.9,
          phaseOffset: 0,
          aeroType: 'wing' as const,
          aeroArea: 90,
          _prevTarget: 60, // hold — production wings would be drag-only; diagnostic plate still acts
        },
      ],
    } as unknown as Creature;
    const y0 = com(creature.nodes).y;
    for (let i = 0; i < 12; i++) {
      applyDiagnosticClassicalPlateForces(creature);
      verletStep(creature.nodes, WORLD_GRAVITY);
    }
    return com(creature.nodes).y - y0;
  }
  const broad = sink('broadside');
  const edge = sink('edge');
  assert(Number.isFinite(broad) && Number.isFinite(edge), 'Non-finite plate sink');
  assert(
    broad < edge - 0.5,
    `Classical plate: broadside should resist sink more than edge-on (broad=${broad} edge=${edge})`
  );
  console.log(
    `PASS Test3 classical-plate-drop broadsideSink=${broad.toFixed(2)} edgeSink=${edge.toFixed(2)}`
  );
}

/** Test 5 — AoA / pitch sweep: smoke gate + monotonic useful band + Cl/Cd table. */
function testAoASweep() {
  function pitchedLift(tipDeltaY: number): number {
    const trail = node(0, 0, 100, 0.7, 2.6, 0);
    const lead = node(1, 90, 100 - tipDeltaY, 0.7, 2.6, 0);
    const creature = {
      nodes: [trail, lead],
      muscles: [
        {
          id: 0,
          nodeA: 0,
          nodeB: 1,
          originalLength: 95,
          minLength: 88,
          maxLength: 104,
          targetLength: 95,
          strength: 0.55,
          phaseOffset: 0,
          aeroType: 'paraglider' as const,
          aeroArea: 140,
        },
      ],
    } as unknown as Creature;
    const y0 = com(creature.nodes).y;
    applyParagliderForces(creature);
    return y0 - com(creature.nodes).y;
  }

  // Smoke-geometry gate (±12 tip): tip-up must beat tip-down.
  const liftUp = pitchedLift(12);
  const liftDown = pitchedLift(-12);
  assert(
    liftUp > liftDown + 0.01,
    `Pitch tip-up should lift more than tip-down (up=${liftUp} down=${liftDown})`
  );

  const tips: number[] = [];
  for (let tip = -24; tip <= 24; tip += 4) tips.push(tip);
  const liftRows = tips.map(tip => ({ tip, lift: pitchedLift(tip) }));

  // Useful training band: tipΔY ∈ [-12, +12] monotonic non-decreasing (nose-up ↑ lift).
  const useful = liftRows.filter(r => r.tip >= -12 && r.tip <= 12);
  for (let i = 1; i < useful.length; i++) {
    const prev = useful[i - 1];
    const cur = useful[i];
    assert(
      cur.lift >= prev.lift - 0.005,
      `F04 non-monotonic useful band: tip ${prev.tip}→${cur.tip} lift ${prev.lift}→${cur.lift}`
    );
  }
  // Soft stall past the band: tip=16 must retain ≥55% of tip=12 (old cliff was ~11%).
  const at12 = liftRows.find(r => r.tip === 12)!.lift;
  const at16 = liftRows.find(r => r.tip === 16)!.lift;
  assert(
    at16 >= at12 * 0.55,
    `F04 stall cliff: tip16 lift ${at16} < 55% of tip12 ${at12}`
  );
  // Soft stall must still shed lift past the band (not a rocket after tip12).
  assert(
    at16 <= at12 * 1.05,
    `Soft stall too weak: tip16 ${at16} exceeds tip12 ${at12} by >5%`
  );

  const clTable = sampleParagliderClCdTable(tips);
  const tablePath = resolve(process.cwd(), 'FLIGHT_CL_CD_TABLE.md');
  const md = [
    '# FLIGHT_CL_CD_TABLE.md',
    '',
    '**Status:** completed flight-test evidence (D082, 2026-07-25).',
    '',
    'Paraglider Cl/Cd vs leading-tip pitch (D075 / Phase 2).',
    '',
    'Fixed freestream vx=2.6, chord=90px, openness=1. tipΔY>0 = nose up.',
    '',
    '| tipΔY | aoa (rad) | α (rad) | normalHit | stall | Cl | Cd |',
    '|---:|---:|---:|---:|---:|---:|---:|',
    ...clTable.map(
      r =>
        `| ${r.tipDeltaY} | ${r.aoa.toFixed(3)} | ${r.alpha.toFixed(3)} | ${r.normalHit.toFixed(3)} | ${r.stallFactor.toFixed(3)} | ${r.Cl.toFixed(4)} | ${r.Cd.toFixed(4)} |`
    ),
    '',
    'Lift impulse sweep (same geometry, `applyParagliderForces`):',
    '',
    '| tipΔY | lift impulse |',
    '|---:|---:|',
    ...liftRows.map(r => `| ${r.tip} | ${r.lift.toFixed(4)} |`),
    '',
    'Useful band pass: tipΔY ∈ [−12, +12] monotonic non-decreasing; tip16 ∈ [0.55, 1.05]·tip12 (soft stall, no cliff).',
    '',
  ].join('\n');
  writeFileSync(tablePath, md, 'utf8');

  console.log(
    `PASS Test5 pitch gate up12=${liftUp.toFixed(4)} down12=${liftDown.toFixed(4)}; useful band monotonic; tip16/tip12=${(at16 / at12).toFixed(2)}`
  );
  console.log(`  wrote ${tablePath}`);
  for (const r of liftRows) {
    console.log(`  tipΔY=${String(r.tip).padStart(3)} lift=${r.lift.toFixed(4)}`);
  }
}

/** Test 6 — Symmetry: mirrored wings in identical airflow. */
function testSymmetry() {
  const body = node(0, 0, 200, 2.2);
  const tipL = node(1, -55, 175, 0.9, 0, 2.5);
  const tipR = node(2, 55, 175, 0.9, 0, 2.5);
  const muscles = [
    {
      id: 0,
      nodeA: 0,
      nodeB: 1,
      originalLength: 55,
      minLength: 28,
      maxLength: 78,
      strength: 0.92,
      phaseOffset: 0,
      targetLength: 40,
      _prevTarget: 70,
      aeroType: 'wing' as const,
      aeroArea: 75,
    },
    {
      id: 1,
      nodeA: 0,
      nodeB: 2,
      originalLength: 55,
      minLength: 28,
      maxLength: 78,
      strength: 0.92,
      phaseOffset: 0,
      targetLength: 40,
      _prevTarget: 70,
      aeroType: 'wing' as const,
      aeroArea: 75,
    },
  ];
  const creature = { nodes: [body, tipL, tipR], muscles } as unknown as Creature;
  const yL0 = tipL.y;
  const yR0 = tipR.y;
  applyWingForces(creature);
  const dL = yL0 - tipL.y;
  const dR = yR0 - tipR.y;
  // Sequential applyWingForces mutates shared body mid-loop, so perfect equality
  // is not expected; large asymmetry still flags a normal/sign bug.
  assert(Math.abs(dL - dR) < 0.05, `Asymmetric wing impulses L=${dL} R=${dR}`);
  console.log(
    `PASS Test6 symmetry dL=${dL.toFixed(4)} dR=${dR.toFixed(4)} |Δ|=${Math.abs(dL - dR).toFixed(6)} (sequential body coupling)`
  );
}

/**
 * Phase 1 / F01 — Constraint projection must not invent freestream for aero.
 * A resting plate with a tip shove (constraint-like Δ without updating old*)
 * produces fake (x−oldX) airspeed; pre-constraint samples keep aero at rest.
 */
function testPreConstraintAeroVelocity() {
  function plateAfterTipShove(usePreConstraintSample: boolean) {
    const a = node(0, 0, 200, 2.2);
    const b = node(1, 60, 200, 0.9);
    // Constraint-like tip yank: move tip without updating oldX/oldY.
    b.y += 8;
    const fakeTipSpeed = Math.hypot(b.x - b.oldX, b.y - b.oldY);
    if (usePreConstraintSample) {
      // Honest freestream was zero before the shove (what snapshotAeroVelocities records).
      a.aeroVx = 0;
      a.aeroVy = 0;
      b.aeroVx = 0;
      b.aeroVy = 0;
    }
    const creature = {
      nodes: [a, b],
      muscles: [
        {
          id: 0,
          nodeA: 0,
          nodeB: 1,
          originalLength: 60,
          minLength: 30,
          maxLength: 80,
          targetLength: 40,
          strength: 0.9,
          phaseOffset: 0,
          aeroType: 'wing' as const,
          aeroArea: 120,
          _prevTarget: 70, // flap gate open
        },
      ],
    } as unknown as Creature;
    const c0 = com(creature.nodes);
    applyWingForces(creature);
    const c1 = com(creature.nodes);
    const impulse = Math.hypot(c1.x - c0.x, c1.y - c0.y);
    return { impulse, fakeTipSpeed };
  }

  const contaminated = plateAfterTipShove(false);
  assert(
    contaminated.fakeTipSpeed > 1,
    `Expected tip shove to invent large (x-oldX); got ${contaminated.fakeTipSpeed}`
  );
  assert(
    contaminated.impulse > 0.05,
    `Post-constraint airspeed should drive wing impulse (got ${contaminated.impulse})`
  );

  const honest = plateAfterTipShove(true);
  assert(
    honest.impulse < 1e-6,
    `Pre-constraint aero should skip invented airspeed (impulse=${honest.impulse})`
  );
  assert(
    contaminated.impulse > honest.impulse + 0.05,
    `F01 regression: contaminated impulse (${contaminated.impulse}) should exceed honest (${honest.impulse})`
  );
  console.log(
    `PASS F01 pre-constraint aero: contamImpulse=${contaminated.impulse.toFixed(4)} honestImpulse=${honest.impulse.toFixed(6)} fakeTip|v|=${contaminated.fakeTipSpeed.toFixed(2)}`
  );
}

function makeFlappingPlate(): Creature {
  const a = node(0, 0, 100, 1, 2, 0);
  const b = node(1, 60, 100, 1, 2, 0);
  return {
    nodes: [a, b],
    muscles: [
      {
        id: 0,
        nodeA: 0,
        nodeB: 1,
        originalLength: 60,
        minLength: 30,
        maxLength: 80,
        targetLength: 50,
        strength: 0.9,
        phaseOffset: 0,
        aeroType: 'wing' as const,
        aeroArea: 75,
        _prevTarget: 60,
      },
    ],
  } as unknown as Creature;
}

/** One physics-like tick: verlet → aero snapshot → relax → wing → soft ground. */
function physicsLikeTick(creature: Creature, frame: number, relaxIters: number) {
  const m = creature.muscles[0] as { _prevTarget?: number; targetLength: number };
  m._prevTarget = m.targetLength;
  m.targetLength = 50 + 20 * Math.sin(frame * 0.2);
  verletStep(creature.nodes, WORLD_GRAVITY);
  snapshotAeroVelocities(creature.nodes);
  relaxMuscles(creature, relaxIters);
  applyWingForces(creature);
  softGround(creature.nodes);
  assertFiniteNodes(creature.nodes, `frame ${frame} iters=${relaxIters}`);
}

/** Test 8 — Numerical stability: long flap+verlet, plus speed/iter sweeps. */
function testStability() {
  const creature = makeFlappingPlate();
  for (let i = 0; i < 2000; i++) {
    physicsLikeTick(creature, i, 8);
  }
  assertFiniteNodes(creature.nodes, 'Test8 base');
  console.log('PASS Test8 stability 2000-frame flap+verlet+relax (pre-constraint aero)');

  // simulationSpeed only batches ticks; each tick keeps dt≡1. Sweep step counts
  // that correspond to 0.5× / 1× / 2× of a 2000-frame wall window.
  for (const { label, steps } of [
    { label: 'speed0.5', steps: 1000 },
    { label: 'speed1', steps: 2000 },
    { label: 'speed2', steps: 4000 },
  ]) {
    const c = makeFlappingPlate();
    for (let i = 0; i < steps; i++) physicsLikeTick(c, i, 8);
    assertFiniteNodes(c.nodes, label);
    console.log(`PASS Test8 ${label} ${steps} ticks finite (dt≡${PHYSICS_DT})`);
  }

  // Relaxation iteration sweep — more projection must not blow up aero via airspeed.
  for (const iters of [4, 8, 16]) {
    const c = makeFlappingPlate();
    for (let i = 0; i < 1500; i++) physicsLikeTick(c, i, iters);
    assertFiniteNodes(c.nodes, `relax${iters}`);
    console.log(`PASS Test8 relaxIters=${iters} 1500-frame finite`);
  }
}

function main() {
  testBallistic();
  testDragOnly();
  testFixedPlateDrop();
  testAoASweep();
  testSymmetry();
  testPreConstraintAeroVelocity();
  testStability();
  console.log('All flight-physics-harness checks passed.');
  console.log('Aero airspeed uses pre-constraint samples (aeroVx/aeroVy); PHYSICS_DT ≡ 1.');
  console.log('See FLIGHT_TEST_PLAN.md — Test 4 prove-paraglide (D076); Test 7 prove-flapper (D077).');
}

main();
