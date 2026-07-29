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

const bird = byName('RoboBird');
const walker = byName('Sprongo');
const eggs = byName('Tool Eggs');
const glide = byName('Glide Cart');
const chute = byName('Chute Cart');
const motor = byName('Motor Cart');

assert.equal(primaryZoneForBlueprint(bird), 'flying');
assert.equal(primaryZoneForBlueprint(glide), 'flying');
assert.equal(primaryZoneForBlueprint(chute), 'flying');
assert.equal(primaryZoneForBlueprint(motor), 'motor');
assert.equal(primaryZoneForBlueprint(walker), 'walking');
assert.equal(primaryZoneForBlueprint(eggs), 'walking');

assert.ok(blueprintAllowedInZone(bird, 'flying'));
assert.ok(!blueprintAllowedInZone(bird, 'jumping'));
assert.ok(!blueprintAllowedInZone(bird, 'walking'));
assert.ok(!blueprintAllowedInZone(bird, 'motor'));
assert.ok(blueprintAllowedInZone(bird, 'free'));

assert.ok(blueprintAllowedInZone(walker, 'walking'));
assert.ok(blueprintAllowedInZone(walker, 'jumping'));
assert.ok(!blueprintAllowedInZone(walker, 'flying'));
assert.ok(!blueprintAllowedInZone(glide, 'jumping'));
assert.ok(!blueprintAllowedInZone(glide, 'motor'));
assert.ok(blueprintAllowedInZone(motor, 'motor'));
assert.ok(!blueprintAllowedInZone(motor, 'flying'));

assert.ok(inspectBlueprint(glide).hasAero);
assert.ok(inspectBlueprint(glide).hasMotorWheel);
assert.ok(inspectBlueprint(motor).hasMotorWheel);
assert.ok(!inspectBlueprint(motor).hasAero);
assert.deepEqual(zonesForBlueprint(glide).sort(), ['flying', 'free'].sort());
assert.deepEqual(zonesForBlueprint(motor).sort(), ['free', 'motor'].sort());

const jumpBodies = filterTemplatesForZone(CREATURE_TEMPLATES, 'jumping');
assert.ok(jumpBodies.every(t => !inspectBlueprint(t).hasAero));
assert.ok(jumpBodies.every(t => !inspectBlueprint(t).hasMotorWheel));
assert.ok(jumpBodies.some(t => t.name === 'Sprongo'));
assert.ok(jumpBodies.some(t => t.name === 'Tool Eggs'));
assert.ok(!jumpBodies.some(t => t.name === 'RoboBird'));

const motorBodies = filterTemplatesForZone(CREATURE_TEMPLATES, 'motor');
assert.ok(motorBodies.some(t => t.name === 'Motor Cart'));
assert.ok(!motorBodies.some(t => t.name === 'Glide Cart'));
assert.ok(!motorBodies.some(t => t.name === 'Chute Cart'));

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
