/**
 * Headless smoke: spawn Motor Cart + Biped under MOTOR_LOOP, step physics, report travel.
 * Also verifies endless terrain extension and selectable terrain for a flat goal.
 */
import { EvolutionGoal, DEFAULT_ARENA_MODIFIERS, DEFAULT_CUSTOM_GOAL, SimulationConfig, genomeIOForBlueprint } from '../src/types';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  spawnCreature,
  generateObstacles,
  updateCreaturePhysics,
  stepPrivateWorld,
  updateWorldState,
  extendEndlessTerrain,
  hasTerrain,
} from '../src/physics';
import { createBaseGenome } from '../src/neat';
import { GAP_WIDTH, buildGoalArena } from '../src/arenas';
import { terrainMaxX, terrainMinX } from '../src/terrain';

const config: SimulationConfig = {
  populationSize: 2,
  generationDuration: 28,
  simulationSpeed: 1,
  mutationRate: 0.25,
  addNodeRate: 0.05,
  addConnectionRate: 0.1,
  goal: EvolutionGoal.MOTOR_LOOP,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS, terrainEnabled: true, terrainSeed: 12345, difficulty: 1.25 },
  customGoal: { ...DEFAULT_CUSTOM_GOAL, rules: [] },
};

const obstacles = generateObstacles(config.goal, config.arena);
const terrainCount = obstacles.filter(o => o.type === 'terrain').length;
const rockCount = obstacles.filter(o => o.label === 'rock' || o.label === 'boulder').length;
const finishX = obstacles.find(o => o.type === 'finish')?.x;
console.log(
  `default (no rocks): terrain segments=${terrainCount} rocks/boulders=${rockCount} finishX=${finishX} maxX=${terrainMaxX(obstacles)}`
);

const withRocks = generateObstacles(config.goal, {
  ...config.arena,
  terrainObstaclesEnabled: true,
  difficulty: 1.25,
});
const rocksMid = withRocks.filter(o => o.label === 'rock' || o.label === 'boulder').length;
const withRocksHard = generateObstacles(config.goal, {
  ...config.arena,
  terrainObstaclesEnabled: true,
  difficulty: 2.2,
});
const rocksHard = withRocksHard.filter(o => o.label === 'rock' || o.label === 'boulder').length;
const avgSize = (list: typeof withRocks) => {
  const rocks = list.filter(o => o.label === 'rock' || o.label === 'boulder');
  if (!rocks.length) return 0;
  return rocks.reduce((s, o) => s + o.width * o.height, 0) / rocks.length;
};
console.log(
  `obstacles on: rocks@1.25=${rocksMid} avgArea=${avgSize(withRocks).toFixed(0)} rocks@2.2=${rocksHard} avgArea=${avgSize(withRocksHard).toFixed(0)}`
);

// Endless extension (obstacle-free default)
const before = terrainMaxX(obstacles);
const beforeMin = terrainMinX(obstacles);
extendEndlessTerrain(
  obstacles,
  { leftX: 100, rightX: before + 200 },
  config.arena.terrainSeed!,
  config.arena.difficulty,
  false
);
console.log(
  `after extend: minX=${terrainMinX(obstacles)} (was ${beforeMin}) maxX=${terrainMaxX(obstacles)} (was ${before}) hasTerrain=${hasTerrain(obstacles)}`
);

// Terrain selectable for Run Right
const flatWithTerrain = generateObstacles(EvolutionGoal.LOCOMOTION_RIGHT, {
  ...DEFAULT_ARENA_MODIFIERS,
  terrainEnabled: true,
  terrainSeed: 99,
  difficulty: 1,
});
console.log(`locomotion+terrain segments=${flatWithTerrain.filter(o => o.type === 'terrain').length} rocks=${flatWithTerrain.filter(o => o.label === 'rock' || o.label === 'boulder').length}`);

// Gap / hurdle scale check
const gaps = buildGoalArena(EvolutionGoal.MOTOR_GAP, { ...DEFAULT_ARENA_MODIFIERS, difficulty: 1.5 });
const pit = gaps.find(o => o.type === 'pit');
const hurdles = buildGoalArena(EvolutionGoal.MOTOR_HURDLES, {
  ...DEFAULT_ARENA_MODIFIERS,
  difficulty: 1.5,
});
const hurdle = hurdles.find(o => o.hurdleIndex === 0);
console.log(
  `gap base=${GAP_WIDTH} pitW@1.5=${pit?.width} hurdleH=${hurdle?.height} hurdleW=${hurdle?.width}`
);

const templates = [
  CREATURE_TEMPLATES.find(t => t.name === 'Glide Cart')!,
  CREATURE_TEMPLATES.find(t => t.name === 'Sprongo')!,
];

for (const template of templates) {
  const { inputs, outputs } = genomeIOForBlueprint(template);
  const genome = createBaseGenome(inputs, outputs);
  for (const c of genome.connections) {
    if (genome.nodes.find(n => n.id === c.toNode)?.type === 'output') {
      c.weight = 2.5;
    }
  }
  const creature = spawnCreature(
    { id: `smoke_${template.name}`, generation: 1, blueprint: template, genome },
    100,
    430,
    EvolutionGoal.MOTOR_LOOP,
    config.arena.difficulty
  );
  const hoop0 = creature.privateWorld?.find(o => o.type === 'hoop');
  console.log(
    `\n${template.name}: hoopR=${hoop0?.radius?.toFixed(1)} outer≈${((hoop0?.radius ?? 0) + (hoop0?.tubeThickness ?? 0)).toFixed(1)} nodes=${creature.nodes.length}`
  );

  for (let t = 0; t < 600; t++) {
    const hoopX = hoop0?.x ?? creature.currentX;
    const packLeftX = Math.min(creature.currentX, hoopX);
    const packRightX = Math.max(creature.currentX, hoopX);
    extendEndlessTerrain(
      obstacles,
      { leftX: packLeftX, rightX: packRightX },
      config.arena.terrainSeed!,
      config.arena.difficulty,
      false
    );
    updateWorldState([], obstacles, t, config);
    const privateObjs = creature.privateWorld ?? [];
    stepPrivateWorld(privateObjs, obstacles, config, t);
    updateCreaturePhysics(creature, obstacles, t, config, privateObjs);
  }

  const hoop = creature.privateWorld?.find(o => o.type === 'hoop');
  const travel = hoop ? hoop.x - hoop.startX : 0;
  console.log(
    `  after 600 steps: hoopTravel=${travel.toFixed(1)} fitness=${creature.fitness.toFixed(1)} outsideFrames=${creature.hoopOutsideFrames ?? 0} finish=${!!creature.crossedFinish}`
  );
}

// Tunneling smoke: drive cart into a thick hurdle
{
  const hObs = generateObstacles(EvolutionGoal.MOTOR_HURDLES, {
    ...DEFAULT_ARENA_MODIFIERS,
    difficulty: 1,
  });
  const template = CREATURE_TEMPLATES.find(t => t.name === 'Glide Cart')!;
  const { inputs, outputs } = genomeIOForBlueprint(template);
  const genome = createBaseGenome(inputs, outputs);
  for (const c of genome.connections) {
    if (genome.nodes.find(n => n.id === c.toNode)?.type === 'output') c.weight = 3.5;
  }
  const cart = spawnCreature(
    { id: 'tunnel_test', generation: 1, blueprint: template, genome },
    100,
    430,
    EvolutionGoal.MOTOR_HURDLES,
    1
  );
  const firstHurdle = hObs.find(o => o.hurdleIndex === 0)!;
  for (let t = 0; t < 900; t++) {
    updateWorldState([], hObs, t, { ...config, goal: EvolutionGoal.MOTOR_HURDLES });
    updateCreaturePhysics(cart, hObs, t, { ...config, goal: EvolutionGoal.MOTOR_HURDLES }, []);
  }
  const past = cart.currentX > firstHurdle.x + firstHurdle.width + 20;
  const cleared = (cart.hurdlesCleared ?? 0) > 0;
  console.log(
    `\ntunnel check: cartX=${cart.currentX.toFixed(0)} hurdleX=${firstHurdle.x} w=${firstHurdle.width} h=${firstHurdle.height} past=${past} cleared=${cleared}`
  );
}
