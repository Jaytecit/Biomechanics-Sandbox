import assert from 'node:assert/strict';
import { makePad, makePit, makeRamp } from '../src/arenas';
import { GROUND_Y } from '../src/physicsConstants';
import {
  createEnvironmentPackage,
  environmentFingerprint,
  exportEnvironment,
  importEnvironment,
  validateEnvironment,
} from '../src/environments';

const environment = createEnvironmentPackage('Round trip', [
  makeRamp(400, 180, 24, 'RAMP'),
  makePit(580, 240),
  makePad(820, GROUND_Y - 20, 180, 20, 'LAND'),
], 1234);
assert.deepEqual(validateEnvironment(environment), []);
const fingerprint = environmentFingerprint(environment);
const parsed = JSON.parse(exportEnvironment(environment));
assert.equal(environmentFingerprint(parsed), fingerprint);
const imported = importEnvironment(JSON.stringify(environment));
assert.ok(imported.ok);
assert.equal(imported.value?.fingerprint, fingerprint);

const inside = createEnvironmentPackage('Invalid', [{ type: 'box', x: 50, y: 300, width: 150, height: 200 }]);
inside.spawn = { x: 100, y: 400 };
assert.match(validateEnvironment(inside).join(' '), /inside a solid/);
const duplicateCheckpoint = createEnvironmentPackage('Invalid checkpoints', [
  { type: 'checkpoint', x: 400, y: 300, width: 4, height: 180, checkpointIndex: 0 },
  { type: 'checkpoint', x: 600, y: 300, width: 4, height: 180, checkpointIndex: 0 },
]);
assert.match(validateEnvironment(duplicateCheckpoint).join(' '), /duplicates/);
console.log('smoke-environment-roundtrip: PASS (exact fingerprint, import/export, validator failures)');
