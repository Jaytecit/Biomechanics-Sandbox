/**
 * One-shot generator: elite JSON exports → templates.ts + defaultModels.ts
 * Run: node scripts/generate-default-models.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const downloads = path.join(process.env.USERPROFILE || '', 'Downloads');

const mapping = [
  ['Sprongo.json', 'Sprongo'],
  ['Glide Cart.json', 'Glide Cart'],
  ['Chute Cart.json', 'Chute Cart'],
  ['RoboBird.json', 'RoboBird'],
  ['Tool Eggs.json', 'Tool Eggs'],
  ['Motor Cart.json', 'Motor Cart'],
];

// Accept elite_gen exports and normalize to clean filenames.
const eliteAliases = [
  ['Motor_Cart_elite_gen1.json', 'Motor Cart.json'],
];
for (const [from, to] of eliteAliases) {
  const src = path.join(downloads, from);
  const dest = path.join(downloads, to);
  if (fs.existsSync(src)) {
    const j = JSON.parse(fs.readFileSync(src, 'utf8'));
    const name = path.basename(to, '.json');
    j.modelName = name;
    if (j.blueprint) j.blueprint.name = name;
    fs.writeFileSync(dest, JSON.stringify(j, null, 2));
    fs.unlinkSync(src);
    console.log('renamed', from, '->', to);
  }
}

const models = [];
for (const [file, name] of mapping) {
  const src = path.join(downloads, file);
  if (!fs.existsSync(src)) throw new Error(`Missing ${src}`);
  const j = JSON.parse(fs.readFileSync(src, 'utf8'));
  j.modelName = name;
  j.blueprint.name = name;
  fs.writeFileSync(src, JSON.stringify(j, null, 2));
  models.push({
    name,
    generation: j.generation,
    fitness: j.fitness,
    goal: j.goal,
    timestamp: j.timestamp,
    blueprint: j.blueprint,
    genome: j.genome,
  });
}

const templatesTs = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CreatureBlueprint } from './types';

/** Built-in anatomy templates permanently shipped with the app. */
export const CREATURE_TEMPLATES: CreatureBlueprint[] = ${JSON.stringify(
  models.map(m => m.blueprint),
  null,
  2
)};
`;

function goalExpr(goal) {
  return `EvolutionGoal.${goal}`;
}

const seedsLiteral = models
  .map(m => {
    const id = `builtin_${m.name.toLowerCase().replace(/\s+/g, '_')}`;
    return `  {
    id: ${JSON.stringify(id)},
    name: ${JSON.stringify(m.name)},
    generation: ${m.generation},
    fitness: ${m.fitness},
    trainedGoal: ${goalExpr(m.goal)},
    createdAt: ${JSON.stringify(m.timestamp || '2026-07-29T00:00:00.000Z')},
    blueprint: ${JSON.stringify(m.blueprint, null, 4).replace(/^/gm, '    ').trim()},
    genome: ${JSON.stringify(m.genome, null, 4).replace(/^/gm, '    ').trim()},
  }`;
  })
  .join(',\n');

const defaultModelsTs = `/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Permanent default finished models shipped with the codebase.
 * Display names are clean (no elite / gen suffixes).
 */

import { CreatureBlueprint, EvolutionGoal, Genome } from './types';

export type DefaultModelSeed = {
  id: string;
  name: string;
  generation: number;
  fitness: number;
  trainedGoal: EvolutionGoal;
  createdAt: string;
  blueprint: CreatureBlueprint;
  genome: Genome;
};

export const DEFAULT_MODEL_SEEDS: DefaultModelSeed[] = [
${seedsLiteral}
];

export const DEFAULT_FINISHED_MODEL_IDS = new Set(
  DEFAULT_MODEL_SEEDS.map(s => s.id)
);
`;

fs.writeFileSync(path.join(root, 'src', 'templates.ts'), templatesTs);
fs.writeFileSync(path.join(root, 'src', 'defaultModels.ts'), defaultModelsTs);
console.log(
  'OK',
  models.map(m => m.name).join(', '),
  'templates',
  templatesTs.length,
  'defaults',
  defaultModelsTs.length
);
