/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smoke: shelf continue-training goal listing (category / zone permitting).
 */
import assert from 'node:assert/strict';
import {
  groupTrainableGoalsByCategory,
  listTrainableGoalsForBlueprint,
  resolveTrainingZone,
} from '../src/eligibility';
import { CREATURE_TEMPLATES } from '../src/templates';
import { EvolutionGoal } from '../src/types';

const bird =
  CREATURE_TEMPLATES.find(t => t.name === 'Bird' || t.name.toLowerCase().includes('bird')) ??
  CREATURE_TEMPLATES.find(t => t.muscles.some(m => m.aeroType === 'wing'));
assert.ok(bird, 'winged template required');

const flyingOpts = listTrainableGoalsForBlueprint(bird!, 'flying');
assert.ok(flyingOpts.length > 0);
assert.ok(flyingOpts.some(o => o.goal === EvolutionGoal.FLIGHT_TIME));
assert.ok(flyingOpts.some(o => o.goal === EvolutionGoal.FLIGHT_HEIGHT));
assert.ok(
  !flyingOpts.some(o => o.goal === EvolutionGoal.JUMP_HANG_TIME),
  'winged body must not list jump goals'
);

const heightDest = resolveTrainingZone(bird!, EvolutionGoal.FLIGHT_HEIGHT, 'walking');
assert.ok(heightDest === 'flying' || heightDest === 'free');

const groups = groupTrainableGoalsByCategory(flyingOpts);
assert.ok(groups.some(g => g.category === 'flight' && g.goals.length >= 2));

// Exact name first: the loose `includes('Cart')` fallback must not grab an
// aero-equipped cart (e.g. Glide Cart), which legitimately lists flight goals.
const cart =
  CREATURE_TEMPLATES.find(t => t.name === 'Motor Cart') ??
  CREATURE_TEMPLATES.find(
    t =>
      t.nodes.some(n => n.isMotorWheel) &&
      !t.muscles.some(m => m.aeroType && m.aeroType !== 'none')
  );
assert.ok(cart, 'motor template required');
const motorOpts = listTrainableGoalsForBlueprint(cart!, 'motor');
assert.ok(motorOpts.some(o => o.goal === EvolutionGoal.MOTOR_DRIVE));
assert.ok(!motorOpts.some(o => o.goal === EvolutionGoal.FLIGHT_HEIGHT));

console.log('smoke-continue-training: PASS');
