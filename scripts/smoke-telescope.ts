/**
 * D150: telescope retired — redirect to soft-muscle-rate + piston smokes.
 * Kept so older docs / muscle-memory commands still succeed.
 * Run: npx tsx scripts/smoke-telescope.ts
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = process.execPath;
const tsxCli = path.resolve(here, '../node_modules/tsx/dist/cli.mjs');

function run(script: string) {
  const result = spawnSync(runner, [tsxCli, path.join(here, script)], {
    stdio: 'inherit',
    cwd: path.resolve(here, '..'),
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('smoke-telescope: D150 collapsed telescope→piston; running successor smokes…');
run('smoke-soft-muscle-rate.ts');
run('smoke-piston.ts');
console.log('smoke-telescope: successor checks passed');
