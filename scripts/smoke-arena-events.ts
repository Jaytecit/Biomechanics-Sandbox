/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert/strict';
import { CHAMPIONSHIP_EVENTS, buildEventArena, eventById } from '../Arena Championship/src/events';
import { EvolutionGoal } from '../src/types';

assert.ok(CHAMPIONSHIP_EVENTS.length >= 6);
const gp = eventById('grand_prix');
assert.ok(gp);
assert.equal(gp!.goal, EvolutionGoal.SPRINT_FINISH);
const arena = buildEventArena(gp!);
assert.ok(arena.difficulty >= 1);
assert.ok(eventById('para_grand_prix')?.goal === EvolutionGoal.PARA_RAMP_GLIDE);
console.log('smoke-arena-events: PASS');
