/**
 * Verify Piston Jump Cart stroke + write importable JSON.
 * Run: npx tsx scripts/export-piston-jump-cart.ts
 */
import { writeFileSync } from 'fs';
import { CREATURE_TEMPLATES } from '../src/templates';
import { createBaseGenome } from '../src/neat';
import {
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  genomeIOForBlueprint,
  SimulationConfig,
} from '../src/types';
import { GROUND_Y, spawnCreature, updateCreaturePhysics } from '../src/physics';

const bp = CREATURE_TEMPLATES.find(t => t.name === 'Piston Jump Cart');
if (!bp) throw new Error('Piston Jump Cart template missing');

const io = genomeIOForBlueprint(bp);
const genome = createBaseGenome(io.inputs, io.outputs);

const creature = spawnCreature(
  { id: 't', genome, blueprint: bp, generation: 0 },
  200,
  GROUND_Y - 80,
  EvolutionGoal.LONG_JUMP
);

const piston = creature.muscles.find(m => m.linkKind === 'piston');
if (!piston) throw new Error('no piston');

const mount = () => creature.nodes.find(n => n.id === 4)!;
const foot = () => creature.nodes.find(n => n.id === 5)!;
const dist = () => Math.hypot(foot().x - mount().x, foot().y - mount().y);

const cfg: SimulationConfig = {
  populationSize: 1,
  generationDuration: 600,
  simulationSpeed: 1,
  mutationRate: 0,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.LONG_JUMP,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: DEFAULT_CUSTOM_GOAL,
};

console.log('spawn', {
  target: piston.targetLength,
  geom: +dist().toFixed(2),
  min: piston.minLength,
  max: piston.maxLength,
  extendRate: piston.extendRate,
  retractRate: piston.retractRate,
  solid: bp.solidSegments,
});

for (let i = 0; i < 50; i++) {
  updateCreaturePhysics(creature, [], i, cfg, [], [-1, 0, 0]);
}
const retracted = dist();
console.log('retract', { target: piston.targetLength, geom: +retracted.toFixed(2) });

let peakHeight = 0;
let maxGeom = 0;
for (let i = 0; i < 80; i++) {
  updateCreaturePhysics(creature, [], 50 + i, cfg, [], [1, 0.9, 0.9]);
  const g = dist();
  maxGeom = Math.max(maxGeom, g);
  const wheelY = Math.min(
    creature.nodes.find(n => n.id === 0)!.y,
    creature.nodes.find(n => n.id === 1)!.y
  );
  peakHeight = Math.max(peakHeight, GROUND_Y - wheelY);
}
const extended = dist();
console.log('extend', {
  target: piston.targetLength,
  geom: +extended.toFixed(2),
  maxGeom: +maxGeom.toFixed(2),
  peakWheelClearance: +peakHeight.toFixed(2),
});

// Target length must move; geometry may be ground-limited while launching.
if (piston.targetLength < piston.maxLength - 0.5) {
  throw new Error(`Piston target did not reach max (${piston.targetLength}).`);
}
if (maxGeom - retracted < 2 && peakHeight < 3) {
  throw new Error(
    `Piston ineffective (Δgeom ${(maxGeom - retracted).toFixed(2)}, peakClear ${peakHeight.toFixed(2)}).`
  );
}
console.log(
  `stroke OK (Δgeom ${(maxGeom - retracted).toFixed(2)}, peakClear ${peakHeight.toFixed(2)})`
);

const outPath = 'C:/Users/jayte/Downloads/Piston_Jump_Cart.json';
writeFileSync(
  outPath,
  JSON.stringify(
    {
      modelName: 'Piston Jump Cart',
      notes:
        'Drive then fire: solid chassis (wheels+body+mount), free foot tip outside the plate, slow retract / fast extend. Train on Long Jump.',
      timestamp: new Date().toISOString(),
      generation: 0,
      fitness: 0,
      goal: 'LONG_JUMP',
      blueprint: bp,
      genome,
    },
    null,
    2
  )
);
console.log('Wrote', outPath);
