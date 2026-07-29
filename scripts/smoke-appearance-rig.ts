import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createBiologicalPreset, deformRigPoint, sanitizeAppearanceRig } from '../src/appearanceRig';
import { resolveBodyPartPose } from '../src/appearanceRig';
import { createGooglyEyePairPrimitive } from '../src/googlyEyes';
import { getGooglyEyeState, parseGooglyEyePairMetrics, stepGooglyEye } from '../src/googlyEyes';
import { bodyFingerprint, createCreaturePackage } from '../src/creaturePackages';
import { CREATURE_TEMPLATES } from '../src/templates';
import { createBaseGenome } from '../src/neat';
import { spawnCreature } from '../src/physics';
import { genomeIOForBlueprint } from '../src/types';

const blueprint = structuredClone(CREATURE_TEMPLATES[0]);
const before = bodyFingerprint(blueprint);
const appearance = createBiologicalPreset(blueprint);
const foxAppearance = createBiologicalPreset(blueprint, '#f97316', '#7c2d12', 'fox');
const oceanAppearance = createBiologicalPreset(blueprint, '#38bdf8', '#164e63', 'ocean');
const plumAppearance = createBiologicalPreset(blueprint, '#c084fc', '#581c87', 'plum');
assert.ok(foxAppearance.primitives.some(part => part.kind === 'ear'), 'fox preset has visible ears');
assert.ok(foxAppearance.primitives.some(part => part.kind === 'tail'), 'fox preset has a visible tail');
assert.ok(foxAppearance.primitives.some(part => part.kind === 'ellipse'), 'preset covers joints with filled skin');
assert.ok(
  foxAppearance.primitives.filter(part => part.kind === 'tail').every(part => part.fill !== 'transparent'),
  'decorative tails are filled body parts rather than coloured lines'
);
assert.equal(
  foxAppearance.primitives.filter(part => part.kind === 'stroke').length,
  0,
  'biological presets do not rely on outline-only strokes'
);
assert.ok(oceanAppearance.primitives.some(part => part.kind === 'fin'), 'ocean preset has fins');
assert.ok(plumAppearance.primitives.some(part => part.kind === 'patch'), 'plum preset has a colour patch');
assert.notDeepEqual(
  foxAppearance.primitives.map(part => part.id),
  oceanAppearance.primitives.map(part => part.id),
  'appearance presets expose distinct body parts'
);
const pkg = createCreaturePackage(blueprint, { appearance });
assert.equal(pkg.bodyFingerprint, before, 'appearance excluded from physical fingerprint');
assert.deepEqual(pkg.appearance, appearance, 'filled parts and sheet rig survive package persistence');
assert.equal(appearance.hideSkeleton, false, 'collision skeleton is visible by default');
pkg.appearance!.primitives[0].fill = '#ff00ff';
assert.equal(bodyFingerprint(pkg.blueprint), before, 'appearance edits cannot invalidate controller');
assert.ok(sanitizeAppearanceRig({ version: 1, hideSkeleton: true, primitives: [{ ...appearance.primitives[0], opacity: 99 }] }).primitives[0].opacity === 1);
assert.deepEqual(sanitizeAppearanceRig({ garbage: true }).primitives, [], 'malformed rig recovers safely');

const io = genomeIOForBlueprint(blueprint);
const creature = spawnCreature({ id: 'appearance-smoke', generation: 0, blueprint, genome: createBaseGenome(io.inputs, io.outputs) }, 100, 300);
const point = { x: 0.5, y: 8, weights: [{ muscle: 0, weight: 1 }] };
const first = deformRigPoint(point, creature);
const second = deformRigPoint(point, creature);
assert.deepEqual(first, second, 'rig deformation is stable');
const blendedSheetPoint = {
  x: 0.5,
  y: 0,
  weights: [
    { muscle: 0, weight: 0.6, x: 0.4, y: -8 },
    { muscle: 1, weight: 0.4, x: 0.65, y: 6 },
  ],
};
const blended = deformRigPoint(blendedSheetPoint, creature);
assert.ok(Number.isFinite(blended.x) && Number.isFinite(blended.y), 'multi-link sheet point deforms finitely');
assert.deepEqual(creature.blueprint, blueprint, 'renderer rig does not mutate mechanics');

const googly = createGooglyEyePairPrimitive(0, 10);
assert.equal(googly.kind, 'googlyEye');
assert.equal(googly.points[0]?.x, 0, 'pair is centred on the anchor node');
assert.ok((googly.points[2]?.x ?? 0) > 0, 'pair exposes horizontal eye spacing');
const metrics = parseGooglyEyePairMetrics(googly, 10);
assert.ok(metrics.halfSpacing > metrics.domeRadius * 0.8, 'eyes sit side by side');
assert.ok(sanitizeAppearanceRig({ version: 1, hideSkeleton: false, primitives: [googly] }).primitives[0].kind === 'googlyEye');
const leftState = getGooglyEyeState('smoke', googly.id, 'L');
stepGooglyEye(leftState, 2.5, -1.2, metrics.domeRadius, metrics.pupilRadius);
assert.ok(Math.hypot(leftState.px, leftState.py) > 0.01, 'googly pupil should slosh under anchor motion');

function countBodyPartPngs(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) count += countBodyPartPngs(fullPath);
    else if (entry.toLowerCase().endsWith('.png')) count += 1;
  }
  return count;
}
assert.ok(
  countBodyPartPngs(join('src', 'assets', 'bodyParts')) >= 190,
  'body part library should include monster, modular, and animal PNGs'
);
const sample = sanitizeAppearanceRig({
  version: 1,
  hideSkeleton: false,
  primitives: [{
    id: 'smoke-body-part',
    kind: 'bodyPart',
    assetId: 'monster:leg_blueA',
    anchorNode: 0,
    layer: 'front',
    z: 105,
    fill: '#ffffff',
    stroke: '#64748b',
    opacity: 1,
    points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }],
  }],
}).primitives[0];
assert.equal(sample?.kind, 'bodyPart');
assert.ok(sample?.assetId);

const horizontalBone = {
  nodes: [{ x: 0, y: 0, radius: 10 }, { x: 100, y: 0, radius: 10 }],
  muscles: [{ nodeA: 0, nodeB: 1 }],
};
const alignedLeg = {
  id: 'smoke-leg',
  kind: 'bodyPart' as const,
  assetId: 'monster:leg_blueA',
  anchorMuscle: 0,
  boneAlign: true,
  boneStretch: true,
  boneRestLength: 100,
  layer: 'front' as const,
  z: 105,
  fill: '#ffffff',
  stroke: '#64748b',
  opacity: 1,
  points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }],
};
assert.equal(alignedLeg.boneAlign, true, 'link-anchored parts follow the bone by default');
assert.equal(alignedLeg.boneStretch, true, 'limbs default to stretch-between-nodes');
const alignedPose = resolveBodyPartPose(alignedLeg, horizontalBone, 64);
assert.ok(alignedPose, 'bone-aligned pose resolves');
assert.ok(Math.abs(alignedPose!.x) < 1, 'stretch anchor sits at proximal node');
assert.ok(Math.abs(alignedPose!.y) < 1, 'stretch anchor sits on the link line');
assert.ok(Math.abs(alignedPose!.rotation + Math.PI / 2) < 0.01, 'leg art aligns with horizontal bone');

const shortBone = {
  nodes: [{ x: 0, y: 0, radius: 10 }, { x: 50, y: 0, radius: 10 }],
  muscles: [{ nodeA: 0, nodeB: 1 }],
};
const shortPose = resolveBodyPartPose(alignedLeg, shortBone, 64);
assert.ok(shortPose && shortPose.scaleX < alignedPose!.scaleX, 'stretch scale shrinks with shorter bone');

const parallelOnly = {
  ...alignedLeg,
  id: 'smoke-arm',
  assetId: 'monster:arm_blueA',
  boneStretch: undefined,
  boneRestLength: undefined,
  points: [{ x: 0.5, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }],
};
const parallelPose = resolveBodyPartPose(parallelOnly, horizontalBone, 64);
assert.ok(parallelPose && Math.abs(parallelPose.x - 50) < 1, 'parallel mode anchors at link midpoint');
assert.ok(
  parallelPose && Math.abs(parallelPose.rotation + Math.PI / 2) < 0.01,
  'parallel mode rotates with the link'
);

console.log('smoke-appearance-rig: PASS (solid parts, googly eyes, body part library, bone lock, persistence invariance)');
