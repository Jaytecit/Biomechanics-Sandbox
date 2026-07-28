import assert from 'node:assert/strict';
import { createBiologicalPreset, deformRigPoint, sanitizeAppearanceRig } from '../src/appearance';
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
console.log('smoke-appearance-rig: PASS (solid parts, joint skin, blended sheets, persistence invariance)');
