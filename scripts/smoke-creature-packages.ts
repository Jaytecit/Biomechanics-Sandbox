import assert from 'node:assert/strict';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  CREATURE_REPOSITORY_KEY,
  LEGACY_CREATURE_KEY,
  SKELETON_VISIBLE_MIGRATION_KEY,
  bodyFingerprint,
  controllerCompatibility,
  deletePackage,
  duplicatePackage,
  exportCreaturePackage,
  importCreaturePackage,
  loadCreaturePackages,
  nextCreatureVersionName,
  normalizeCreaturePackages,
  parseCreatureVersionName,
  saveNewPackage,
  savePackageRevision,
} from '../src/creaturePackages';
import { createBaseGenome } from '../src/neat';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';
import { genomeIOForBlueprint } from '../src/types';

const memory = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => { memory.set(key, value); },
  removeItem: (key: string) => memory.delete(key),
  clear: () => memory.clear(),
} });

const blueprint = structuredClone(CREATURE_TEMPLATES[0]);
blueprint.name = 'Duplicate Name';
memory.set(LEGACY_CREATURE_KEY, JSON.stringify([blueprint]));
const migrated = loadCreaturePackages();
assert.equal(migrated.length, 1);
assert.ok(memory.has(LEGACY_CREATURE_KEY), 'legacy records are preserved');
assert.equal(loadCreaturePackages().length, 1, 'migration is idempotent');

const saved = saveNewPackage(blueprint, { displayName: 'Duplicate Name' });
assert.ok(saved.ok);
const duplicate = duplicatePackage(saved.value!.id, 'Duplicate Name');
assert.ok(duplicate.ok);
assert.deepEqual(
  loadCreaturePackages().map(item => item.displayName),
  ['Duplicate Name', 'Duplicate Name V2', 'Duplicate Name V3']
);
const revision = savePackageRevision(saved.value!.id, { notes: 'revision smoke' });
assert.equal(revision.value?.revision, 2);
const imported = importCreaturePackage(exportCreaturePackage(saved.value!));
assert.ok(imported.ok);
assert.equal(imported.value?.displayName, 'Duplicate Name V4');

const existingPackages = loadCreaturePackages();
const repeated = structuredClone(existingPackages[1]);
repeated.id = 'accidental-repeat';
repeated.displayName = 'Modified Duplicate Name';
repeated.blueprint.name = repeated.displayName;
const repeatedAgain = structuredClone(repeated);
repeatedAgain.id = 'accidental-repeat-again';
const changedBody = structuredClone(repeated);
changedBody.id = 'distinct-body-same-name';
changedBody.blueprint.nodes[0].mass += 0.25;
const repaired = normalizeCreaturePackages([
  ...existingPackages,
  repeated,
  repeatedAgain,
  changedBody,
]);
assert.equal(
  repaired.filter(item => item.id.startsWith('accidental-repeat')).length,
  1,
  'exact duplicate package records collapse to one survivor'
);
assert.equal(
  new Set(repaired.map(item => item.displayName)).size,
  repaired.length,
  'remaining distinct packages have unique display names'
);
assert.ok(
  repaired.every(item => !/^modified\b/i.test(item.displayName)),
  'legacy Modified prefixes are removed'
);
const screenshotLikeDuplicates = [
  ...Array.from({ length: 12 }, (_, index) => {
    const item = structuredClone(existingPackages[0]);
    item.id = `glider-repeat-${index}`;
    item.displayName = 'Modified Glider Cart';
    item.blueprint.name = item.displayName;
    return item;
  }),
  ...Array.from({ length: 11 }, (_, index) => {
    const item = structuredClone(existingPackages[0]);
    item.id = `flapper-repeat-${index}`;
    item.displayName = 'Modified Flapper';
    item.blueprint.name = item.displayName;
    return item;
  }),
];
const screenshotLikeRepaired = normalizeCreaturePackages(
  screenshotLikeDuplicates
);
assert.deepEqual(
  screenshotLikeRepaired.map(item => item.displayName).sort(),
  ['Flapper V2', 'Glider Cart V2'],
  'screenshot-like repeated menu records collapse and receive Vn names'
);
assert.deepEqual(parseCreatureVersionName('Modified Modified Flapper'), {
  base: 'Flapper',
  version: 3,
});
assert.equal(
  nextCreatureVersionName(
    'Modified Modified Flapper',
    ['Flapper', 'Flapper V2', 'Flapper V3']
  ),
  'Flapper V4'
);

const oldAppearancePackages = loadCreaturePackages();
oldAppearancePackages[0].appearance = {
  version: 1,
  hideSkeleton: true,
  primitives: [],
};
memory.set(CREATURE_REPOSITORY_KEY, JSON.stringify(oldAppearancePackages));
memory.delete(SKELETON_VISIBLE_MIGRATION_KEY);
const visibilityMigrated = loadCreaturePackages();
assert.equal(
  visibilityMigrated[0].appearance?.hideSkeleton,
  false,
  'existing default-hidden appearances migrate to a visible collision skeleton once'
);
assert.equal(memory.get(SKELETON_VISIBLE_MIGRATION_KEY), 'done');
assert.equal(
  JSON.parse(memory.get(CREATURE_REPOSITORY_KEY)!)[0].appearance.hideSkeleton,
  false,
  'visibility migration is persisted'
);

const io = genomeIOForBlueprint(blueprint);
const snapshot = {
  id: 'controller', createdAt: new Date(0).toISOString(), label: 'smoke',
  genome: createBaseGenome(io.inputs, io.outputs), bodyFingerprint: bodyFingerprint(blueprint),
  physicsVersion: SOFT_BODY_PHYSICS_VERSION, inputs: io.inputs, outputs: io.outputs,
  source: 'import' as const,
};
assert.equal(controllerCompatibility(snapshot, blueprint).compatible, true);
assert.equal(controllerCompatibility({ ...snapshot, physicsVersion: '2.0.0' }, blueprint).compatible, false);
assert.ok(memory.get(CREATURE_REPOSITORY_KEY));

// Permanent delete must also clear legacy v1 so migration cannot resurrect the body.
const doomedBp = structuredClone(CREATURE_TEMPLATES[0]);
doomedBp.name = 'Doomed Legacy Body';
doomedBp.nodes[0].mass += 1.5; // distinct fingerprint from earlier fixtures
const doomedSave = saveNewPackage(doomedBp, { displayName: 'Doomed Legacy Body' });
assert.ok(doomedSave.ok);
const doomedId = doomedSave.value!.id;
const doomedFp = bodyFingerprint(doomedSave.value!.blueprint);
memory.set(
  LEGACY_CREATURE_KEY,
  JSON.stringify([
    ...JSON.parse(memory.get(LEGACY_CREATURE_KEY) ?? '[]'),
    doomedSave.value!.blueprint,
  ])
);
const deleted = deletePackage(doomedId);
assert.ok(deleted.ok);
assert.equal(
  loadCreaturePackages().some(item => item.id === doomedId || item.displayName === 'Doomed Legacy Body'),
  false,
  'deleted package stays gone after reload'
);
assert.equal(
  loadCreaturePackages().some(item => item.bodyFingerprint === doomedFp),
  false,
  'legacy migration does not resurrect a deleted body fingerprint'
);
const legacyAfterDelete = JSON.parse(memory.get(LEGACY_CREATURE_KEY) ?? '[]') as Array<{ name?: string }>;
assert.equal(
  legacyAfterDelete.some(item => item.name === 'Doomed Legacy Body'),
  false,
  'legacy v1 entry is purged on delete'
);

console.log('smoke-creature-packages: PASS (deduplication, Vn naming, revisions, round-trip, stale controllers, permanent delete)');
