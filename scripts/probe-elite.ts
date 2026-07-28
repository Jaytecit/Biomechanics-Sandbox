/**
 * Replay an exported elite JSON and report glide / sail technique metrics.
 * Usage: npx tsx scripts/probe-elite.ts "C:\path\to\elite.json"
 */
import { readFileSync } from 'fs';
import { spawnCreature, updateCreaturePhysics, GROUND_Y } from '../src/physics';
import { sailOpenness } from '../src/aero';
import {
  CreatureBlueprint,
  EvolutionGoal,
  Genome,
  SimulationConfig,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  genomeIOForBlueprint,
  genomeMatchesBlueprint,
} from '../src/types';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npx tsx scripts/probe-elite.ts <elite.json>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path, 'utf8')) as {
  modelName?: string;
  fitness?: number;
  goal?: string;
  blueprint: CreatureBlueprint;
  genome: Genome;
};

const blueprint = raw.blueprint;
const genome = raw.genome;
const io = genomeIOForBlueprint(blueprint);
const match = genomeMatchesBlueprint(genome, blueprint);
console.log(`Model: ${raw.modelName ?? '(unnamed)'}`);
console.log(`Saved fitness: ${raw.fitness?.toFixed(1)}  goal=${raw.goal}`);
console.log(`I/O expected ${io.inputs}/${io.outputs}  genomeMatch=${match}`);
console.log(
  `Nodes=${blueprint.nodes.length}  motors=${blueprint.nodes.filter(n => n.isMotorWheel).map(n => n.motorPower).join(',')}`
);
const sail = blueprint.muscles.find(m => m.aeroType === 'paraglider');
console.log(
  `Sail area=${sail?.aeroArea}  span=${sail?.minLength}–${sail?.maxLength}  rest=${sail?.originalLength}`
);

let best = -Infinity;
let spawnY = GROUND_Y - 50;
for (let i = 0; i < blueprint.nodes.length; i++) {
  const contact = blueprint.relativePositions[i].y + blueprint.nodes[i].radius;
  if (contact > best) {
    best = contact;
    spawnY = GROUND_Y - contact;
  }
}

const creature = spawnCreature(
  { id: 'probe', generation: 0, blueprint, genome },
  120,
  spawnY,
  EvolutionGoal.GLIDE_RANGE,
  1
);

const config: SimulationConfig = {
  populationSize: 1,
  generationDuration: 900,
  simulationSpeed: 1,
  mutationRate: 0,
  addNodeRate: 0,
  addConnectionRate: 0,
  goal: EvolutionGoal.GLIDE_RANGE,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: DEFAULT_CUSTOM_GOAL,
};

let firstOpen = -1;
let firstAir = -1;
let maxOpen = 0;
let samples: string[] = [];

for (let t = 0; t < config.generationDuration; t++) {
  updateCreaturePhysics(creature, [], t, config, []);
  const open = sailOpenness(creature);
  maxOpen = Math.max(maxOpen, open);
  if (firstOpen < 0 && open >= 0.72) firstOpen = t;
  if (firstAir < 0 && (creature.flightFrames ?? 0) > 0) firstAir = t;

  if (t % 100 === 0 || (firstOpen >= 0 && t === firstOpen) || (firstAir >= 0 && t === firstAir)) {
    samples.push(
      `t=${t} x=${creature.currentX.toFixed(0)} spd=${(creature.currentSpeed ?? 0).toFixed(1)} open=${open.toFixed(2)} air=${creature.flightFrames ?? 0} fit=${creature.fitness.toFixed(0)}`
    );
  }
}

console.log('\n--- samples ---');
for (const s of samples) console.log(s);

const meanClear =
  (creature.flightFrames ?? 0) > 0
    ? (creature.flightHeightIntegral ?? 0) / (creature.flightFrames ?? 1)
    : 0;

console.log('\n--- finale ---');
console.log(`fitness=${creature.fitness.toFixed(1)}`);
console.log(`peakSpeed=${(creature.peakSpeed ?? 0).toFixed(2)}`);
console.log(`flightFrames=${creature.flightFrames ?? 0}`);
console.log(`flightDistance=${(creature.flightDistance ?? 0).toFixed(1)}`);
console.log(`flightPeakClearance=${(creature.flightPeakClearance ?? 0).toFixed(1)}`);
console.log(`meanClear=${meanClear.toFixed(1)}`);
console.log(`sailReefedSpeedPeak=${(creature.sailReefedSpeedPeak ?? 0).toFixed(2)}`);
console.log(`sailDeploySpeed=${(creature.sailDeploySpeed ?? 0).toFixed(2)}`);
console.log(`sailOpenGlideDist=${(creature.sailOpenGlideDist ?? 0).toFixed(1)}`);
console.log(`sailEarlyOpenFrames=${creature.sailEarlyOpenFrames ?? 0}`);
console.log(`maxOpen=${maxOpen.toFixed(2)}  firstOpen@${firstOpen}  firstAir@${firstAir}`);
console.log(`flightLongestStreak=${creature.flightLongestStreak ?? 0}`);
console.log(`glideCorridorFrames=${creature.glideCorridorFrames ?? 0}`);
console.log(`glideCorridorDist=${(creature.glideCorridorDist ?? 0).toFixed(1)}`);
console.log(`endX=${creature.currentX.toFixed(0)}  deltaX=${(creature.currentX - creature.startX).toFixed(0)}`);
