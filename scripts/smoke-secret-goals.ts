/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Smoke tests for secret goal catalog, evaluators, and title secrecy.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EvolutionGoal } from '../src/types';
import type { Creature } from '../src/types';
import { GOAL_CATEGORY_LABELS, GoalCategory } from '../src/goalCatalog';
import {
  SECRET_GOALS,
  SECRET_GOAL_COUNT,
  allSecretTitles,
  secretGoalById,
} from '../src/secretGoals';
import { evaluateSecretGoals, evaluateSingleSecret } from '../src/secretGoalEval';
import { CREATURE_TEMPLATES } from '../src/templates';
import { creatureMeetsEligibility, eligibilityForSecret } from '../src/secretGoalEligibility';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function sprongoCreature(overrides: Partial<Creature> = {}): Creature {
  const blueprint = CREATURE_TEMPLATES.find(t => t.name === 'Sprongo')!;
  const genome = {
    nodes: [
      { id: 0, type: 'input' as const, x: 0, y: 0 },
      { id: 1, type: 'hidden' as const, x: 0, y: 0 },
      { id: 2, type: 'hidden' as const, x: 0, y: 0 },
      { id: 3, type: 'output' as const, x: 0, y: 0 },
    ],
    connections: [
      { from: 0, to: 1, weight: 0.5 },
      { from: 1, to: 2, weight: 0.5 },
      { from: 2, to: 3, weight: 0.5 },
    ],
  };
  return {
    id: 'test',
    generation: 8,
    blueprint,
    genome,
    nodes: blueprint.nodes.map((n, i) => ({
      id: n.id,
      x: 100 + i,
      y: 400,
      oldX: 100 + i,
      oldY: 400,
      vx: 0,
      vy: 0,
      mass: n.mass,
      radius: n.radius,
      friction: n.friction,
      isGround: false,
    })),
    muscles: [],
    startX: 100,
    startY: 400,
    highestY: 400,
    currentX: 100,
    currentY: 400,
    fitness: 0,
    isAlive: true,
    episodeFrames: 400,
    ...overrides,
  } as Creature;
}

function motorCartCreature(
  overrides: Partial<Creature> = {},
  templateName: 'Motor Cart' | 'Chute Cart' | 'Glide Cart' = 'Motor Cart'
): Creature {
  const blueprint = CREATURE_TEMPLATES.find(t => t.name === templateName)!;
  const genome = {
    nodes: [
      { id: 0, type: 'input' as const, x: 0, y: 0 },
      { id: 1, type: 'hidden' as const, x: 0, y: 0 },
      { id: 2, type: 'output' as const, x: 0, y: 0 },
    ],
    connections: [{ from: 0, to: 1, weight: 0.5 }, { from: 1, to: 2, weight: 0.5 }],
  };
  return {
    ...sprongoCreature({ blueprint, genome, generation: 8 }),
    ...overrides,
  } as Creature;
}

function baseCreature(overrides: Partial<Creature> = {}): Creature {
  return {
    id: 'test',
    generation: 1,
    blueprint: { name: 'Test', nodes: [], muscles: [], solidSegments: [] },
    genome: { nodes: [], connections: [] },
    nodes: [{ id: 0, x: 100, y: 400, oldX: 100, oldY: 400, vx: 0, vy: 0, mass: 1, radius: 8, friction: 0.8, isGround: false }],
    muscles: [],
    startX: 100,
    startY: 400,
    highestY: 400,
    currentX: 100,
    currentY: 400,
    fitness: 0,
    isAlive: true,
    episodeFrames: 400,
    ...overrides,
  } as Creature;
}

function countByCategory(): Record<GoalCategory, number> {
  const counts = Object.fromEntries(
    Object.keys(GOAL_CATEGORY_LABELS).map(k => [k, 0])
  ) as Record<GoalCategory, number>;
  for (const g of SECRET_GOALS) {
    counts[g.category] = (counts[g.category] ?? 0) + 1;
  }
  return counts;
}

function secrecyLeakCheck(): void {
  const titles = allSecretTitles();
  const publicFiles = [
    path.join(ROOT, 'src/goalCatalog.ts'),
    path.join(ROOT, 'src/challenges.ts'),
    path.join(ROOT, 'README.md'),
  ];
  for (const file of publicFiles) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const title of titles) {
      assert(!text.includes(title), `Secret title "${title}" leaked in ${path.basename(file)}`);
    }
  }
}

function main(): void {
  console.log('smoke-secret-goals…');

  assert(SECRET_GOAL_COUNT === 100, `Expected 100 secrets, got ${SECRET_GOAL_COUNT}`);
  assert(SECRET_GOALS.length === 100, `Catalog length ${SECRET_GOALS.length}`);

  const byCat = countByCategory();
  for (const [cat, label] of Object.entries(GOAL_CATEGORY_LABELS)) {
    assert(
      byCat[cat as GoalCategory] === 10,
      `Category ${label} has ${byCat[cat as GoalCategory]} secrets (expected 10)`
    );
  }

  secrecyLeakCheck();

  const moonwalk = secretGoalById('loco_moonwalk')!;
  const cMoon = sprongoCreature({ currentX: -30, startX: 100 });
  const arena = {
    windEnabled: false,
    iceEnabled: false,
    pitEnabled: false,
  } as import('../src/types').ArenaModifiers;
  const evalInput = {
    creature: cMoon,
    activeGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    arena,
    modelName: 'Sprongo',
    context: 'sandbox' as const,
    generation: 8,
  };
  assert(
    creatureMeetsEligibility(cMoon, eligibilityForSecret(moonwalk), 'sandbox'),
    'Sprongo should meet moonwalk morphology gate'
  );
  assert(
    evaluateSingleSecret(moonwalk, evalInput),
    'moonwalk should trigger on eligible Sprongo with left travel'
  );
  assert(
    !evaluateSingleSecret(moonwalk, { ...evalInput, activeGoal: EvolutionGoal.LOCOMOTION_LEFT }),
    'moonwalk blocked on Run Left goal'
  );
  assert(
    !evaluateSingleSecret(moonwalk, {
      ...evalInput,
      creature: sprongoCreature({ currentX: -30, startX: 100, generation: 2 }),
    }),
    'moonwalk blocked before min generation'
  );
  assert(
    !evaluateSingleSecret(moonwalk, {
      ...evalInput,
      creature: baseCreature({ currentX: -30, startX: 100, generation: 8 }),
    }),
    'generic test body should fail morphology gate'
  );

  const gapShort = secretGoalById('motor_gap_short')!;
  assert(
    evaluateSingleSecret(gapShort, {
      creature: motorCartCreature({ fellInPit: true }, 'Chute Cart'),
      activeGoal: EvolutionGoal.MOTOR_GAP,
      arena: { pitEnabled: true } as import('../src/types').ArenaModifiers,
      modelName: 'Chute Cart',
      context: 'sandbox',
      generation: 8,
    }),
    'gap short on motor gap + pit with Motor Cart'
  );

  const ids = evaluateSecretGoals({
    creature: sprongoCreature({
      currentX: -30,
      startX: 100,
      walkStrideDistanceRight: 90,
      walkAlternateStepCountRight: 0,
    }),
    activeGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    arena,
    modelName: 'Sprongo',
    context: 'sandbox',
    generation: 8,
  });
  assert(ids.includes('loco_moonwalk') || ids.includes('loco_sleepwalker'), 'expected locomotion secret');

  assert((baseCreature().episodeFrames ?? 0) >= 60, 'fixture sanity');
  const tooShort = evaluateSecretGoals({
    creature: baseCreature({ episodeFrames: 10, currentX: -250 }),
    activeGoal: EvolutionGoal.LOCOMOTION_RIGHT,
    arena: {} as import('../src/types').ArenaModifiers,
    modelName: 'Test',
    context: 'sandbox',
  });
  assert(tooShort.length === 0, 'short episodes should not discover');

  console.log('smoke-secret-goals OK');
}

main();
