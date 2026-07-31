/**
 * Range-preview pose solver stability smoke.
 *
 * The Studio "Range" preview and Model Picker RangePreviewVisualizer solve
 * the min↔max actuation pose from the rest pose every frame. This smoke
 * asserts the invariants that killed the old warm-started implementation:
 * no orientation drift (tumbling), exact loop closure, planted anchors,
 * converged hard links, and rigid solids.
 */

import assert from 'node:assert/strict';
import {
  PreviewBody,
  PreviewLink,
  leverEndWeights,
  nodeEndWeights,
  solvePreviewPose,
} from '../src/rangePreviewSolver';
import { captureSolidRestOffsets } from '../src/solidSegments';

type Rest = Map<number, { x: number; y: number; radius: number }>;

function link(
  id: number,
  nodeA: number,
  nodeB: number,
  rest: Rest,
  opts: Partial<PreviewLink> = {}
): PreviewLink {
  const a = rest.get(nodeA)!;
  const b = rest.get(nodeB)!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    id,
    nodeA,
    nodeB,
    endA: nodeEndWeights(nodeA),
    endB: nodeEndWeights(nodeB),
    isBone: true,
    isHard: true,
    originalLength: len,
    minLength: len,
    maxLength: len,
    strength: 1,
    phaseOffset: 0,
    ...opts,
  };
}

function body(rest: Rest, links: PreviewLink[], overrides: Partial<PreviewBody> = {}): PreviewBody {
  return {
    rest,
    masses: new Map([...rest.keys()].map(id => [id, 1])),
    links,
    solids: [],
    solidRest: new Map(),
    groundY: 0,
    ...overrides,
  };
}

function dist(pos: Map<number, { x: number; y: number }>, a: number, b: number): number {
  const pa = pos.get(a)!;
  const pb = pos.get(b)!;
  return Math.hypot(pb.x - pa.x, pb.y - pa.y);
}

function finiteAll(pos: Map<number, { x: number; y: number }>) {
  for (const p of pos.values()) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'pose must stay finite');
  }
}

// --- Case 1: Sprongo-like body — triangle base + long-stroke piston -------
// Studio coordinates: y-down, ground at 0, body above at negative y.
{
  const rest: Rest = new Map([
    [0, { x: 0, y: -1, radius: 1 }],
    [1, { x: 6, y: -1, radius: 1 }],
    [2, { x: 3, y: -6, radius: 1 }],
    [3, { x: 3, y: -14, radius: 1 }],
  ]);
  const links = [
    link(0, 0, 1, rest),
    link(1, 0, 2, rest),
    link(2, 1, 2, rest),
    // Piston with a 2.5× stroke — the video-repro case.
    link(3, 2, 3, rest, { isBone: false, isHard: true, minLength: 8, maxLength: 20, originalLength: 8 }),
  ];
  const b = body(rest, links);

  // Simulate 4 full cycles at 60fps and track worst-case drift.
  let maxDrift = 0;
  for (let frame = 0; frame <= 4 * 60 * 5.5; frame++) {
    const cycleT = (frame / 60) / 5.5;
    const pos = solvePreviewPose(b, cycleT);
    finiteAll(pos);
    for (const [id, p] of pos) {
      const r = rest.get(id)!;
      maxDrift = Math.max(maxDrift, Math.hypot(p.x - r.x, p.y - r.y));
    }
    // Bones must hold length through the whole cycle.
    assert.ok(Math.abs(dist(pos, 0, 1) - 6) < 0.1, 'base bone holds length');
  }
  // The piston stroke is 12px; nothing should stray far beyond it.
  assert.ok(maxDrift < 20, `bounded travel (got ${maxDrift.toFixed(2)})`);

  // Piston reaches its commanded extremes (wave: 0.25 → max, 0.75 → min).
  const atMax = solvePreviewPose(b, 0.25);
  const atMin = solvePreviewPose(b, 0.75);
  assert.ok(Math.abs(dist(atMax, 2, 3) - 20) < 0.5, 'piston reaches max expansion');
  assert.ok(Math.abs(dist(atMin, 2, 3) - 8) < 0.5, 'piston reaches min contraction');

  // No tumbling: the base bone's orientation never leaves a small band.
  for (const cycleT of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9]) {
    const pos = solvePreviewPose(b, cycleT);
    const p0 = pos.get(0)!;
    const p1 = pos.get(1)!;
    const angle = Math.abs(Math.atan2(p1.y - p0.y, p1.x - p0.x));
    assert.ok(angle < (15 * Math.PI) / 180, `no tumble (base angle ${(angle * 180 / Math.PI).toFixed(1)}°)`);
  }

  // Exact loop closure: one full cycle later the pose is identical.
  const a0 = solvePreviewPose(b, 0.37);
  const a1 = solvePreviewPose(b, 1.37);
  for (const id of rest.keys()) {
    assert.ok(
      Math.abs(a0.get(id)!.x - a1.get(id)!.x) < 1e-9 &&
        Math.abs(a0.get(id)!.y - a1.get(id)!.y) < 1e-9,
      'pose is a pure function of cycle phase'
    );
  }

  // Grounded anchors stay planted (mean of rest-grounded nodes holds).
  for (const cycleT of [0.25, 0.75]) {
    const pos = solvePreviewPose(b, cycleT);
    const mx = (pos.get(0)!.x + pos.get(1)!.x) / 2;
    assert.ok(Math.abs(mx - 3) < 0.75, 'grounded anchor centroid holds');
  }

  // Nothing sinks through the ground.
  for (const cycleT of [0, 0.25, 0.5, 0.75]) {
    const pos = solvePreviewPose(b, cycleT);
    for (const [id, p] of pos) {
      assert.ok(p.y + rest.get(id)!.radius <= 1e-6, 'no ground penetration');
    }
  }

  // Focus mode: only the focused actuator animates.
  const focusPos = solvePreviewPose(b, 0.25, 3);
  assert.ok(Math.abs(dist(focusPos, 2, 3) - 20) < 0.5, 'focused piston animates');
}

// --- Case 2: lever muscle riding a host bone ------------------------------
{
  const rest: Rest = new Map([
    [0, { x: 0, y: -1, radius: 1 }],
    [1, { x: 8, y: -1, radius: 1 }],
    [2, { x: 4, y: -7, radius: 1 }],
  ]);
  const hostBone = link(0, 0, 1, rest);
  const leverLen = Math.hypot(4 - 4, -7 - -1);
  const links = [
    hostBone,
    link(1, 0, 2, rest),
    // Soft muscle from node 2 to the host bone's midpoint.
    link(2, 2, 0, rest, {
      isBone: false,
      isHard: false,
      endB: leverEndWeights({ nodeA: 0, nodeB: 1 }, 0.5),
      originalLength: leverLen,
      minLength: leverLen * 0.7,
      maxLength: leverLen * 1.3,
      strength: 1,
    }),
  ];
  const b = body(rest, links);
  for (let frame = 0; frame <= 2 * 60 * 5.5; frame += 7) {
    const pos = solvePreviewPose(b, (frame / 60) / 5.5);
    finiteAll(pos);
    assert.ok(Math.abs(dist(pos, 0, 1) - 8) < 0.15, 'lever host bone holds length');
  }
}

// --- Case 3: solid plate stays rigid under piston actuation ---------------
{
  const rest: Rest = new Map([
    [0, { x: 0, y: -1, radius: 1 }],
    [1, { x: 4, y: -1, radius: 1 }],
    [2, { x: 2, y: -4, radius: 1 }],
    [3, { x: 2, y: -12, radius: 1 }],
  ]);
  const solids = [{ id: 'solid-1', nodeIds: [0, 1, 2] }];
  const positions = new Map([...rest.entries()].map(([id, r]) => [id, { x: r.x, y: r.y }]));
  const masses = new Map([...rest.keys()].map(id => [id, 1]));
  const links = [
    link(0, 2, 3, rest, { isBone: false, isHard: true, minLength: 6, maxLength: 14, originalLength: 8 }),
  ];
  const b = body(rest, links, {
    solids,
    solidRest: captureSolidRestOffsets(solids, positions, masses),
  });
  const d01 = 4;
  const d02 = Math.hypot(2, 3);
  for (const cycleT of [0, 0.25, 0.5, 0.75]) {
    const pos = solvePreviewPose(b, cycleT);
    finiteAll(pos);
    assert.ok(Math.abs(dist(pos, 0, 1) - d01) < 0.05, 'solid plate edge 0-1 rigid');
    assert.ok(Math.abs(dist(pos, 0, 2) - d02) < 0.05, 'solid plate edge 0-2 rigid');
  }
}

console.log('smoke-range-preview-stability: OK');
