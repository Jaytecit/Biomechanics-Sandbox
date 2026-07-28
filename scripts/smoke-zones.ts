/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smoke: arena zone equipment + goal exclusivity.
 */
import assert from 'node:assert/strict';
import { CREATURE_TEMPLATES } from '../src/templates';
import { EvolutionGoal } from '../src/types';
import {
  blueprintAllowedInZone,
  filterTemplatesForZone,
  goalAllowedInZone,
  goalsForZone,
  inspectBlueprint,
  primaryZoneForBlueprint,
  zonesForBlueprint,
} from '../src/zones';

function byName(name: string) {
  const t = CREATURE_TEMPLATES.find(x => x.name === name);
  assert.ok(t, `missing template ${name}`);
  return t!;
}

const flapper = byName('Flapper');
const walker = byName('Biped Walker');
const cart = byName('Motor Cart');
const glider = byName('Proven Glider');
const jumpCart = byName('Jump Cart');

assert.equal(primaryZoneForBlueprint(flapper), 'flying');
assert.equal(primaryZoneForBlueprint(glider), 'flying');
assert.equal(primaryZoneForBlueprint(cart), 'motor');
assert.equal(primaryZoneForBlueprint(jumpCart), 'motor');
assert.equal(primaryZoneForBlueprint(walker), 'walking');

assert.ok(blueprintAllowedInZone(flapper, 'flying'));
assert.ok(!blueprintAllowedInZone(flapper, 'jumping'));
assert.ok(!blueprintAllowedInZone(flapper, 'walking'));
assert.ok(!blueprintAllowedInZone(flapper, 'motor'));
assert.ok(blueprintAllowedInZone(flapper, 'free'));

assert.ok(blueprintAllowedInZone(walker, 'walking'));
assert.ok(blueprintAllowedInZone(walker, 'jumping'));
assert.ok(!blueprintAllowedInZone(walker, 'flying'));
assert.ok(!blueprintAllowedInZone(cart, 'jumping'));

assert.ok(inspectBlueprint(glider).hasAero);
assert.ok(inspectBlueprint(glider).hasMotorWheel);
assert.deepEqual(zonesForBlueprint(glider).sort(), ['flying', 'free'].sort());

const jumpBodies = filterTemplatesForZone(CREATURE_TEMPLATES, 'jumping');
assert.ok(jumpBodies.every(t => !inspectBlueprint(t).hasAero));
assert.ok(jumpBodies.every(t => !inspectBlueprint(t).hasMotorWheel));
assert.ok(jumpBodies.some(t => t.name === 'Biped Walker'));
assert.ok(!jumpBodies.some(t => t.name === 'Flapper'));

assert.ok(goalAllowedInZone(EvolutionGoal.FLIGHT_TIME, 'flying'));
assert.ok(!goalAllowedInZone(EvolutionGoal.FLIGHT_TIME, 'jumping'));
assert.ok(goalAllowedInZone(EvolutionGoal.HIGH_JUMP, 'jumping'));
assert.ok(goalAllowedInZone(EvolutionGoal.MOTOR_DRIVE, 'motor'));
assert.ok(goalAllowedInZone(EvolutionGoal.LOCOMOTION_RIGHT, 'walking'));
assert.ok(goalAllowedInZone(EvolutionGoal.SHUFFLE_RIGHT, 'walking'));
assert.ok(goalAllowedInZone(EvolutionGoal.SHUFFLE_LEFT, 'walking'));
assert.ok(!goalAllowedInZone(EvolutionGoal.SHUFFLE_RIGHT, 'jumping'));
assert.ok(goalAllowedInZone(EvolutionGoal.CUSTOM, 'free'));
assert.ok(!goalAllowedInZone(EvolutionGoal.CUSTOM, 'walking'));

assert.ok(goalsForZone('flying').every(g => goalAllowedInZone(g, 'flying')));
assert.ok(goalsForZone('free').length > goalsForZone('jumping').length);

console.log('smoke-zones: PASS');
