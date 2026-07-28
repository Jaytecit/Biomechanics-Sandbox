/**
 * One-off probe: can this elite bird fly?
 * Run: npx tsx scripts/probe-bird-elite.ts
 */
import { readFileSync } from 'fs';
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { createBaseGenome } from '../src/neat';
import {
  EvolutionGoal,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  genomeMatchesBlueprint,
  CreatureBlueprint,
  Genome,
  Creature,
  isBrainDrivenMuscle,
} from '../src/types';

const PATH = process.argv[2] || 'C:/Users/jayte/Downloads/Modified_Modified_Modified_Bird_elite_gen40.json';

const raw = JSON.parse(readFileSync(PATH, 'utf8')) as {
  modelName?: string;
  blueprint: CreatureBlueprint;
  genome: Genome;
  fitness: number;
  goal: string;
  generation?: number;
};

const bp = raw.blueprint;
const io = genomeIOForBlueprint(bp);
const match = genomeMatchesBlueprint(raw.genome, bp);

console.log('===', raw.modelName ?? bp.name, '===');
console.log('saved fitness', raw.fitness.toFixed(1), 'goal', raw.goal, 'gen', raw.generation);
console.log('I/O expected', io, 'genomeMatch', match);
console.log(
  'nodes',
  bp.nodes.length,
  'totalMass',
  bp.nodes.reduce((s, n) => s + n.mass, 0).toFixed(1)
);

const wings = bp.muscles.filter(m => m.aeroType === 'wing');
const flex = bp.muscles.filter(m => isBrainDrivenMuscle(m));
console.log('wings', wings.length, wings.map(w => ({
  id: w.id,
  area: w.aeroArea,
  span: `${w.minLength}-${w.maxLength}`,
  strength: w.strength,
  nodes: `${w.nodeA}-${w.nodeB}`,
})));
console.log(
  'actuators',
  flex.length,
  flex.map(m => ({
    id: m.id,
    aero: m.aeroType ?? 'none',
    span: m.maxLength - m.minLength,
    strength: m.strength,
  }))
);
console.log('relPos', bp.relativePositions);

function cfg(goal: EvolutionGoal): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 900,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS, windEnabled: false },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function spawnGroundY(blueprint: CreatureBlueprint) {
  let best = -Infinity;
  let y = GROUND_Y - 50;
  for (let i = 0; i < blueprint.nodes.length; i++) {
    const c = blueprint.relativePositions[i].y + blueprint.nodes[i].radius;
    if (c > best) {
      best = c;
      y = GROUND_Y - c;
    }
  }
  return y;
}

function comY(c: Creature) {
  return c.nodes.reduce((s, n) => s + n.y, 0) / c.nodes.length;
}

function runGround(label: string, genome: Genome, override?: number[]) {
  const c = spawnCreature(
    { id: label, generation: 0, blueprint: bp, genome },
    120,
    spawnGroundY(bp),
    EvolutionGoal.FLIGHT_HEIGHT,
    1
  );
  const config = cfg(EvolutionGoal.FLIGHT_HEIGHT);
  for (let t = 0; t < 600; t++) {
    updateCreaturePhysics(c, [], t, config, [], override);
  }
  console.log(
    `GROUND ${label}: fit=${c.fitness.toFixed(1)} air=${c.flightFrames ?? 0} peakClr=${(c.flightPeakClearance ?? 0).toFixed(1)} streak=${c.flightLongestStreak ?? 0} flap=${c.wingFlapFrames ?? 0} dx=${(c.currentX - c.startX).toFixed(1)}`
  );
  return c;
}

function runDrop(label: string, genome: Genome | null) {
  const g = genome ?? createBaseGenome(io.inputs, io.outputs);
  if (!genome) for (const x of g.connections) x.weight = 0;
  const lowest = Math.max(
    ...bp.relativePositions.map((p, i) => p.y + bp.nodes[i].radius)
  );
  const c = spawnCreature(
    { id: label, generation: 0, blueprint: bp, genome: g },
    140,
    GROUND_Y - 160 - lowest,
    EvolutionGoal.FLIGHT_TIME,
    1
  );
  for (const n of c.nodes) {
    n.oldX = n.x;
    n.oldY = n.y;
  }
  const y0 = comY(c);
  const config = cfg(EvolutionGoal.FLIGHT_TIME);
  const hold = Array(io.outputs).fill(0);
  for (let t = 0; t < 180; t++) {
    updateCreaturePhysics(c, [], t, config, [], genome ? undefined : hold);
  }
  const dy = comY(c) - y0;
  console.log(
    `DROP ${label}: dy=${dy.toFixed(1)} air=${c.flightFrames ?? 0} streak=${c.flightLongestStreak ?? 0} flap=${c.wingFlapFrames ?? 0} peak=${(c.flightPeakClearance ?? 0).toFixed(1)}`
  );
  return dy;
}

// Morphology gate checklist
const wing = wings[0];
const wingSpan = wing ? wing.maxLength - wing.minLength : 0;
const areaOk = wings.some(w => (w.aeroArea ?? 0) >= 40);
const strokeOk = wingSpan >= 20 && (wing?.strength ?? 0) >= 0.4;
const dualOk = wings.length >= 2;
console.log('\n--- physicality checklist ---');
console.log('has wing surface:', wings.length > 0, areaOk ? '(area ok)' : '(area weak)');
console.log('stroke authority on wing:', strokeOk, wing ? `ΔL=${wingSpan} str=${wing.strength}` : '');
console.log('mirrored wings:', dualOk ? 'yes' : `NO — only ${wings.length} wing segment(s)`);
console.log('brain drives wing?:', flex.some(m => m.aeroType === 'wing'));
console.log(
  'non-wing actuator:',
  flex.filter(m => m.aeroType !== 'wing').map(m => `m${m.id} ΔL=${m.maxLength - m.minLength}`)
);

const holdG = createBaseGenome(io.inputs, io.outputs);
for (const x of holdG.connections) x.weight = 0;
runGround('elite', raw.genome);
runGround('hold', holdG, Array(io.outputs).fill(0));
const dyE = runDrop('elite', raw.genome);
const dyH = runDrop('hold', null);
console.log(`drop gap (hold-elite)=${(dyH - dyE).toFixed(1)}px`);

// Scripted sine on wing actuator only (index of wing in flex list)
const wingFlexIdx = flex.findIndex(m => m.aeroType === 'wing');
console.log('\n--- scripted wing sine (amp=0.55 ω=0.4) ---');
{
  const g = createBaseGenome(io.inputs, io.outputs);
  for (const x of g.connections) x.weight = 0;
  const lowest = Math.max(
    ...bp.relativePositions.map((p, i) => p.y + bp.nodes[i].radius)
  );
  const c = spawnCreature(
    { id: 'script', generation: 0, blueprint: bp, genome: g },
    140,
    GROUND_Y - 160 - lowest,
    EvolutionGoal.FLIGHT_TIME,
    1
  );
  for (const n of c.nodes) {
    n.oldX = n.x;
    n.oldY = n.y;
  }
  const y0 = comY(c);
  const config = cfg(EvolutionGoal.FLIGHT_TIME);
  for (let t = 0; t < 180; t++) {
    const outs = Array(io.outputs).fill(0);
    if (wingFlexIdx >= 0) outs[wingFlexIdx] = 0.55 * Math.sin(t * 0.4);
    // also wiggle torso flex if present
    const torsoIdx = flex.findIndex(m => m.aeroType !== 'wing');
    if (torsoIdx >= 0) outs[torsoIdx] = 0.3 * Math.sin(t * 0.4 + 1);
    updateCreaturePhysics(c, [], t, config, [], outs);
  }
  console.log(
    `DROP script: dy=${(comY(c) - y0).toFixed(1)} flap=${c.wingFlapFrames ?? 0} streak=${c.flightLongestStreak ?? 0}`
  );
}
