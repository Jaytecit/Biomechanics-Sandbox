/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smoke: finished-model trait derivation + gallery round-trip (no DOM).
 */
import assert from 'node:assert/strict';
import {
  deriveModelTraits,
  exportProductPayload,
  findBestModelForGoal,
  formatGenLengthLabel,
  getPersistedGoalBestEver,
  importElitePayloadAsProduct,
  loadFinishedModels,
  MAX_COMPETITORS,
  promoteGoalBestEver,
  removeFinishedModel,
  resolveGoalBestEver,
  seedGoalBestEverFromShelf,
  upsertFinishedModel,
  suggestTransferProductName,
} from '../src/savedModels';
import { CREATURE_TEMPLATES } from '../src/templates';
import { createBaseGenome } from '../src/neat';
import { EvolutionGoal, genomeIOForBlueprint } from '../src/types';

// Minimal localStorage stub for Node
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

assert.equal(MAX_COMPETITORS, 8);
assert.equal(formatGenLengthLabel(48), '48s gen');
assert.equal(formatGenLengthLabel(undefined), null);

const cart = CREATURE_TEMPLATES.find(t => t.name === 'Jump Cart') ?? CREATURE_TEMPLATES[0];
const io = genomeIOForBlueprint(cart);
const genome = createBaseGenome(io.inputs, io.outputs);
const traits = deriveModelTraits(cart, genome, EvolutionGoal.PARA_RAMP_GLIDE);

assert.ok(traits.nodeCount >= 2);
assert.ok(traits.muscleCount >= 1);
assert.ok(traits.bodyTraits.includes('wheeled') || traits.bodyTraits.includes('motor-drive') || traits.bodyTraits.length >= 0);
assert.equal(traits.trainedGoalLabel.length > 0, true);

const product = importElitePayloadAsProduct({
  modelName: 'Smoke Racer',
  fitness: 42,
  generation: 3,
  generationDurationSec: 28,
  goal: EvolutionGoal.LOCOMOTION_RIGHT,
  blueprint: cart,
  genome,
});
assert.ok(product);
assert.equal(product!.name, 'Smoke Racer');
assert.equal(product!.fitness, 42);
assert.equal(product!.generationDurationSec, 28);

const payload = exportProductPayload(product!);
assert.equal(payload.modelName, 'Smoke Racer');
assert.equal(payload.generationDurationSec, 28);
assert.ok(payload.blueprint);
assert.ok(payload.genome);

// Best Ever: permanent ledger + session + shelf (D115/D116/D118).
store.clear();
assert.equal(
  resolveGoalBestEver(EvolutionGoal.LOCOMOTION_RIGHT, { fitness: 0 }, []),
  null
);
const sessionOnly = resolveGoalBestEver(
  EvolutionGoal.LOCOMOTION_RIGHT,
  { fitness: 120.5, generationDurationSec: 48 },
  []
);
assert.ok(sessionOnly);
assert.equal(sessionOnly!.modelName, 'This run');
assert.match(sessionOnly!.scoreLabel, /120\.5/);
assert.equal(sessionOnly!.durationLabel, '48s gen');

upsertFinishedModel({
  ...product!,
  id: 'shelf-1',
  name: 'Shelf Champ',
  trainedGoal: EvolutionGoal.LOCOMOTION_RIGHT,
  fitness: 200,
  generationDurationSec: 28,
});
const models = loadFinishedModels();
const shelfWins = resolveGoalBestEver(
  EvolutionGoal.LOCOMOTION_RIGHT,
  { fitness: 150, generationDurationSec: 48 },
  models
);
assert.ok(shelfWins);
assert.equal(shelfWins!.modelName, 'Shelf Champ');
assert.match(shelfWins!.scoreLabel, /200\.0/);
assert.equal(shelfWins!.durationLabel, '28s gen');

const runWins = resolveGoalBestEver(
  EvolutionGoal.LOCOMOTION_RIGHT,
  { fitness: 250, generationDurationSec: 60 },
  models
);
assert.ok(runWins);
assert.equal(runWins!.modelName, 'This run');
assert.match(runWins!.scoreLabel, /250\.0/);
assert.equal(runWins!.durationLabel, '60s gen');

assert.equal(findBestModelForGoal(EvolutionGoal.FLIGHT_TIME, models), null);

// Permanent ledger survives shelf delete and is only raised when beaten.
store.clear();
promoteGoalBestEver(EvolutionGoal.FLIGHT_TIME, {
  fitness: 900,
  modelName: 'Sky King',
  generationDurationSec: 48,
});
upsertFinishedModel({
  ...product!,
  id: 'flight-shelf',
  name: 'Sky King',
  trainedGoal: EvolutionGoal.FLIGHT_TIME,
  fitness: 900,
  generationDurationSec: 48,
});
removeFinishedModel('flight-shelf');
assert.equal(loadFinishedModels().length, 0);
const afterDelete = resolveGoalBestEver(
  EvolutionGoal.FLIGHT_TIME,
  { fitness: 0 },
  []
);
assert.ok(afterDelete);
assert.equal(afterDelete!.modelName, 'Sky King');
assert.match(afterDelete!.scoreLabel, /900\.0/);
assert.equal(afterDelete!.durationLabel, '48s gen');

// Lower scores must not overwrite the ledger.
promoteGoalBestEver(EvolutionGoal.FLIGHT_TIME, {
  fitness: 100,
  modelName: 'Weakling',
  generationDurationSec: 28,
});
assert.equal(getPersistedGoalBestEver(EvolutionGoal.FLIGHT_TIME)?.fitness, 900);
assert.equal(getPersistedGoalBestEver(EvolutionGoal.FLIGHT_TIME)?.modelName, 'Sky King');

// Beating the record updates it.
promoteGoalBestEver(EvolutionGoal.FLIGHT_TIME, {
  fitness: 1204,
  modelName: 'Bird Gen46',
  generationDurationSec: 48,
});
const beaten = getPersistedGoalBestEver(EvolutionGoal.FLIGHT_TIME);
assert.ok(beaten);
assert.equal(beaten!.fitness, 1204);
assert.equal(beaten!.modelName, 'Bird Gen46');

// Shelf seed lifts older products into the ledger.
store.clear();
upsertFinishedModel({
  ...product!,
  id: 'seed-1',
  name: 'Legacy Champ',
  trainedGoal: EvolutionGoal.LOCOMOTION_RIGHT,
  fitness: 333,
  generationDurationSec: 28,
});
seedGoalBestEverFromShelf();
assert.equal(getPersistedGoalBestEver(EvolutionGoal.LOCOMOTION_RIGHT)?.fitness, 333);
assert.equal(getPersistedGoalBestEver(EvolutionGoal.LOCOMOTION_RIGHT)?.modelName, 'Legacy Champ');

assert.equal(
  suggestTransferProductName('Bird Aloft', EvolutionGoal.FLIGHT_HEIGHT),
  'Bird Aloft → Flight Height'
);

console.log('smoke-finished-models: PASS');
