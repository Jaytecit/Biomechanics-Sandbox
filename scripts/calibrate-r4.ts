/**
 * D108 / R4 behavioural calibration.
 *
 * This gate has two deliberately separate layers:
 *  1. an executable score ledger proving inert/shortcut/reference ordering for
 *     every reward family repaired in R1-R3; and
 *  2. small fixed-morph searches whose champions are evaluated on held-out
 *     physics conditions. Every seed is reported, including failures.
 *
 * Run:
 *   npx tsx scripts/calibrate-r4.ts
 *   npx tsx scripts/calibrate-r4.ts --write
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createBaseGenome, cloneGenome, mutateWeights } from '../src/neat';
import {
  calculateFitness,
  generateObstacles,
  GROUND_Y,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import { CREATURE_TEMPLATES } from '../src/templates';
import {
  Creature,
  CreatureBlueprint,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  Genome,
  SimulationConfig,
  genomeIOForBlueprint,
} from '../src/types';
import { SOFT_BODY_PHYSICS_VERSION } from '../src/physicsConstants';

const SCRIPT_VERSION = 1;
const TRAINING_SEEDS = [101, 202, 303];
const HELD_OUT_VARIANTS = [
  { id: 'low-g', gravity: 0.38, groundFriction: 0.76 },
  { id: 'high-g', gravity: 0.42, groundFriction: 0.84 },
] as const;
const POPULATION = 10;
const GENERATIONS = 8;

type CalibrationRow = {
  family: 'R1' | 'R2' | 'R3';
  goal: EvolutionGoal;
  inert: number;
  shortcut: number;
  reference: number;
  criterion: string;
};

type LearnedTrack = {
  family: 'R1' | 'R2' | 'R3';
  goal: EvolutionGoal;
  blueprint: string;
  episodeFrames: number;
  seeds: Array<{
    seed: number;
    generation0Best: number;
    trainingBest: number;
    heldOut: Array<{
      variant: string;
      inert: number;
      champion: number;
      behaviouralPass: boolean;
      completion: boolean;
    }>;
    passed: boolean;
  }>;
};

function template(name: string): CreatureBlueprint {
  const found = CREATURE_TEMPLATES.find(candidate => candidate.name === name);
  if (!found) throw new Error(`Missing template: ${name}`);
  return found;
}

function spawnForLedger(goal: EvolutionGoal, id: string): Creature {
  const blueprint = template('Biped Walker');
  const io = genomeIOForBlueprint(blueprint);
  return spawnCreature(
    {
      id,
      generation: 0,
      blueprint,
      genome: createBaseGenome(io.inputs, io.outputs),
    },
    100,
    380,
    goal,
    1
  );
}

function score(
  goal: EvolutionGoal,
  fields: Partial<Creature>,
  mutateWorld?: (creature: Creature) => void
): number {
  const creature = spawnForLedger(goal, `r4-${goal}`);
  Object.assign(creature, fields);
  mutateWorld?.(creature);
  return calculateFitness(
    creature,
    goal,
    creature.privateWorld,
    DEFAULT_CUSTOM_GOAL,
    []
  );
}

/**
 * Values are produced by the production fitness function. "Shortcut" means
 * the strongest shaping-only or legacy-ledger adversary relevant to the goal;
 * "reference" means the intended physical ledger produced by the deterministic
 * contact smokes named in the manifest.
 */
function calibrationRows(): CalibrationRow[] {
  const rows: CalibrationRow[] = [];
  const add = (
    family: CalibrationRow['family'],
    goal: EvolutionGoal,
    shortcutFields: Partial<Creature>,
    referenceFields: Partial<Creature>,
    criterion: string,
    shortcutWorld?: (creature: Creature) => void,
    referenceWorld?: (creature: Creature) => void
  ) => {
    const inert = score(goal, {});
    const shortcut = score(goal, shortcutFields, shortcutWorld);
    const reference = score(goal, referenceFields, referenceWorld);
    assert.ok(
      reference > shortcut && reference > inert,
      `${goal}: reference ${reference} must beat inert ${inert} and shortcut ${shortcut}`
    );
    rows.push({ family, goal, inert, shortcut, reference, criterion });
  };

  add('R1', EvolutionGoal.JUMP_HANG_TIME,
    { flightFrames: 50_000, flightPeakClearance: 500 },
    { jumpHangBestBoutScore: 140 },
    'one supported-takeoff bout beats inflated episode totals');
  add('R1', EvolutionGoal.STAY_UPRIGHT,
    { uprightFrames: 50_000 },
    { stayTallIntegral: 180, stayTallFallFrames: 20 },
    'supported posture history beats final-pose/legacy survival');
  add('R1', EvolutionGoal.OBSTACLE_CLIMB,
    { currentX: 5_000, highestY: -500 },
    {
      obstacleClimbMountCount: 3,
      obstacleClimbSupportedHeight: 260,
      obstacleClimbSupportedX: 1_100,
    },
    'ordered authored mounts beat free height and bypass travel');
  add('R1', EvolutionGoal.CARRY_BALL,
    {},
    { carryBallTransportDistance: 140, carryBallTransportPeakLift: 45 },
    'collision-proven lifted transport beats proximity/uncontacted motion',
    creature => {
      const ball = creature.privateWorld?.find(object => object.type === 'ball');
      if (ball) Object.assign(ball, { x: ball.startX + 5_000, y: ball.startY - 500 });
    });
  add('R1', EvolutionGoal.DODGEBALL,
    { hazardProgressCount: 1, hazardUprightProgress: 50 },
    { hazardProgressCount: 3, hazardUprightProgress: 50, crossedFinish: true },
    'ordered hazards plus supported finish beat camping/endpoint shaping');
  add('R1', EvolutionGoal.BALANCE_BEAM,
    { beamSupportedFrames: 100, beamSupportedPosture: 100 },
    {
      beamSupportedDistance: 600,
      beamSupportedFrames: 100,
      beamSupportedPosture: 100,
      beamCompleted: true,
    },
    'continuous authored-beam traversal beats end camping');
  add('R1', EvolutionGoal.MOTOR_SLALOM,
    { technicalSupportedDistance: 10_000 },
    { checkpointReached: 1, technicalSupportedDistance: 1_000, crossedFinish: true },
    'ordered supported checkpoints and finish beat shaping-only travel');

  for (const [goal, bestField] of [
    [EvolutionGoal.LONG_JUMP, 'jumpRightBestBoutScore'],
    [EvolutionGoal.JUMP_LEFT, 'jumpLeftBestBoutScore'],
    [EvolutionGoal.FLIGHT_RIGHT, 'flightRightBestBoutScore'],
    [EvolutionGoal.FLIGHT_LEFT, 'flightLeftBestBoutScore'],
    [EvolutionGoal.JUMP_ACROBATICS, 'jumpAcrobaticsBestBoutScore'],
    [EvolutionGoal.FLIGHT_ACROBATICS, 'flightAcrobaticsBestBoutScore'],
  ] as const) {
    add('R2', goal,
      {
        flightFrames: 50_000,
        flightDistance: 50_000,
        flightDistanceLeft: 50_000,
        airborneRotation: 500,
      },
      { [bestField]: 240 } as Partial<Creature>,
      'one completed best bout beats inflated episode-wide totals');
  }
  add('R2', EvolutionGoal.FLIGHT_LAND,
    {
      flightLandScore: 0,
      landClimbScore: 100,
      landDescentScore: 100,
      landOvershootPenalty: 120,
    },
    { flightLandBestBoutScore: 420 },
    'one complete climb-descent-stick bout beats partial-attempt shaping');

  add('R3', EvolutionGoal.AERIAL_CROSSING,
    { flightDistance: 50_000, flightFrames: 50_000 },
    { aerialCrossingLanded: true },
    'far-side support completion beats capped unlanded flight shaping');
  add('R3', EvolutionGoal.MOTOR_BRIDGE,
    { currentX: 50_000 },
    {
      bridgeSupportedDistance: 700,
      bridgeSupportedFrames: 100,
      bridgeCompleted: true,
    },
    'continuous authored-bridge support beats endpoint bypass');
  add('R3', EvolutionGoal.KICK_GOAL,
    {},
    { ballCreatureContacted: true, goalScored: true },
    'contact-caused goal beats uncontacted ball travel',
    creature => {
      const ball = creature.privateWorld?.find(object => object.type === 'ball');
      if (ball) ball.x = ball.startX + 5_000;
    },
    creature => {
      const ball = creature.privateWorld?.find(object => object.type === 'ball');
      if (ball) ball.x = ball.startX + 500;
    });
  add('R3', EvolutionGoal.HIT_TARGET,
    { ballCreatureContacted: true },
    { ballCreatureContacted: true, targetHits: 1 },
    'a contact-caused target hit beats contact or loft without a hit',
    creature => {
      const ball = creature.privateWorld?.find(object => object.type === 'ball');
      if (ball) ball.y = ball.startY - 5_000;
    });
  return rows;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function withRandom<T>(seed: number, fn: () => T): T {
  const previous = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = previous;
  }
}

function groundedSpawnY(blueprint: CreatureBlueprint): number {
  const lowest = Math.max(
    ...blueprint.relativePositions.map(
      (position, index) => position.y + blueprint.nodes[index].radius
    )
  );
  return GROUND_Y - lowest;
}

type TrackSpec = {
  family: LearnedTrack['family'];
  goal: EvolutionGoal;
  blueprint: string;
  episodeFrames: number;
  airborneSpawn?: boolean;
};

const TRACKS: TrackSpec[] = [
  {
    family: 'R1',
    goal: EvolutionGoal.JUMP_HANG_TIME,
    blueprint: 'Flapper',
    episodeFrames: 360,
  },
  {
    family: 'R2',
    goal: EvolutionGoal.FLIGHT_RIGHT,
    blueprint: 'Flapper',
    episodeFrames: 240,
    airborneSpawn: true,
  },
  {
    family: 'R3',
    goal: EvolutionGoal.MOTOR_BRIDGE,
    blueprint: 'Motor Cart',
    episodeFrames: 900,
  },
];

function configFor(
  spec: TrackSpec,
  gravity = 0.4,
  groundFriction = 0.8
): SimulationConfig {
  return {
    populationSize: POPULATION,
    generationDuration: spec.episodeFrames,
    simulationSpeed: 1,
    mutationRate: 0.35,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal: spec.goal,
    gravity,
    groundFriction,
    arena: {
      ...DEFAULT_ARENA_MODIFIERS,
      windEnabled: false,
      terrainEnabled: false,
      terrainObstaclesEnabled: false,
      rampEnabled: false,
      pitEnabled: false,
    },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

function spawnEpisode(
  spec: TrackSpec,
  blueprint: CreatureBlueprint,
  genome: Genome,
  id: string,
  difficulty = 1
): Creature {
  const spawnY = spec.airborneSpawn
    ? groundedSpawnY(blueprint) - 150
    : groundedSpawnY(blueprint);
  const creature = spawnCreature(
    { id, generation: 0, blueprint, genome },
    100,
    spawnY,
    spec.goal,
    difficulty
  );
  if (spec.airborneSpawn) {
    for (const node of creature.nodes) {
      node.oldX = node.x;
      node.oldY = node.y;
    }
  }
  return creature;
}

function runEpisode(
  spec: TrackSpec,
  blueprint: CreatureBlueprint,
  genome: Genome,
  config: SimulationConfig,
  id: string,
  difficulty = 1,
  inert = false
): Creature {
  const creature = spawnEpisode(spec, blueprint, genome, id, difficulty);
  const obstacles = generateObstacles(spec.goal, {
    ...config.arena,
    difficulty,
  });
  const outputs = new Array(genomeIOForBlueprint(blueprint).outputs).fill(0);
  for (let frame = 0; frame < spec.episodeFrames; frame += 1) {
    updateCreaturePhysics(
      creature,
      obstacles,
      frame,
      config,
      creature.privateWorld,
      inert ? outputs : undefined
    );
  }
  return creature;
}

function completionFor(spec: TrackSpec, creature: Creature): boolean {
  if (spec.goal === EvolutionGoal.JUMP_HANG_TIME) {
    return (creature.jumpHangBestBoutScore ?? 0) > 0;
  }
  if (spec.goal === EvolutionGoal.FLIGHT_RIGHT) {
    return (creature.flightRightBestBoutScore ?? 0) > 0;
  }
  return creature.bridgeCompleted === true;
}

function trainTrack(spec: TrackSpec): LearnedTrack {
  const blueprint = template(spec.blueprint);
  const io = genomeIOForBlueprint(blueprint);
  const seeds = TRAINING_SEEDS.map(seed =>
    withRandom(seed * 8191 + 17, () => {
      let genomes = Array.from(
        { length: POPULATION },
        () => createBaseGenome(io.inputs, io.outputs)
      );
      let generation0Best = -Infinity;
      let trainingBest = -Infinity;
      let champion = cloneGenome(genomes[0]);
      const config = configFor(spec);

      for (let generation = 0; generation < GENERATIONS; generation += 1) {
        const evaluated = genomes.map((genome, index) =>
          runEpisode(
            spec,
            blueprint,
            genome,
            config,
            `${spec.family}-${seed}-${generation}-${index}`
          )
        );
        evaluated.sort((left, right) => right.fitness - left.fitness);
        if (generation === 0) generation0Best = evaluated[0].fitness;
        if (evaluated[0].fitness >= trainingBest) {
          trainingBest = evaluated[0].fitness;
          champion = cloneGenome(evaluated[0].genome);
        }
        const parents = evaluated.slice(0, 3);
        genomes = [cloneGenome(parents[0].genome)];
        while (genomes.length < POPULATION) {
          const parent = parents[Math.floor(Math.random() * parents.length)];
          genomes.push(mutateWeights(cloneGenome(parent.genome), 0.35));
        }
      }

      const heldOut = HELD_OUT_VARIANTS.map((variant, index) => {
        const heldConfig = configFor(spec, variant.gravity, variant.groundFriction);
        const difficulty = index === 0 ? 0.9 : 1.1;
        const inertCreature = runEpisode(
          spec,
          blueprint,
          createBaseGenome(io.inputs, io.outputs),
          heldConfig,
          `${spec.family}-${seed}-${variant.id}-inert`,
          difficulty,
          true
        );
        const championCreature = runEpisode(
          spec,
          blueprint,
          champion,
          heldConfig,
          `${spec.family}-${seed}-${variant.id}-champion`,
          difficulty
        );
        const margin = spec.goal === EvolutionGoal.MOTOR_BRIDGE ? 300 : 5;
        const completion = completionFor(spec, championCreature);
        return {
          variant: variant.id,
          inert: inertCreature.fitness,
          champion: championCreature.fitness,
          behaviouralPass:
            completion && championCreature.fitness >= inertCreature.fitness + margin,
          completion,
        };
      });
      return {
        seed,
        generation0Best,
        trainingBest,
        heldOut,
        passed: heldOut.every(result => result.behaviouralPass),
      };
    })
  );
  return {
    family: spec.family,
    goal: spec.goal,
    blueprint: spec.blueprint,
    episodeFrames: spec.episodeFrames,
    seeds,
  };
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function main(): void {
  const rows = calibrationRows().map(row => ({
    ...row,
    inert: round(row.inert),
    shortcut: round(row.shortcut),
    reference: round(row.reference),
  }));
  const learnedTracks = TRACKS.map(trainTrack);
  const report = {
    schemaVersion: 1,
    scriptVersion: SCRIPT_VERSION,
    physicsVersion: SOFT_BODY_PHYSICS_VERSION,
    generatedAt: new Date().toISOString(),
    contract: {
      evaluationSeparatedFromTraining: true,
      observationNormalizationUpdatedDuringEvaluation: false,
      failedSeedsRetained: true,
      motorBridgeSemantics:
        'retired after R4: static 2D traversal duplicates flat-ground driving',
      population: POPULATION,
      generations: GENERATIONS,
      trainingSeeds: TRAINING_SEEDS,
      heldOutVariants: HELD_OUT_VARIANTS,
    },
    deterministicEvidence: [
      'scripts/smoke-hang-time.ts',
      'scripts/smoke-stay-tall.ts',
      'scripts/smoke-obstacle-climb.ts',
      'scripts/smoke-carry-ball.ts',
      'scripts/smoke-hazard-dash.ts',
      'scripts/smoke-balance-beam.ts',
      'scripts/smoke-motor-technical.ts',
      'scripts/smoke-attempt-isolation.ts',
      'scripts/smoke-support-causality.ts',
    ],
    calibrationRows: rows,
    learnedTracks,
    verdict: {
      rewardOrderingPassed: true,
      activeGoalCount: Object.values(EvolutionGoal).length - 1,
      retiredGoals: [EvolutionGoal.MOTOR_BRIDGE],
      learnedTrackPassedSeeds: learnedTracks.map(track => ({
        family: track.family,
        goal: track.goal,
        passed: track.seeds.filter(seed => seed.passed).length,
        total: track.seeds.length,
      })),
      note:
        'Learned-policy results are behavioural evidence, not a reward-truth override; failures remain explicit.',
    },
  };

  for (const row of rows) {
    console.log(
      `${row.family} ${row.goal}: inert=${row.inert.toFixed(2)} shortcut=${row.shortcut.toFixed(2)} reference=${row.reference.toFixed(2)} PASS`
    );
  }
  for (const track of learnedTracks) {
    for (const seed of track.seeds) {
      const holdout = seed.heldOut
        .map(result =>
          `${result.variant} ${round(result.inert)}->${round(result.champion)} ${result.behaviouralPass ? 'PASS' : 'FAIL'}`
        )
        .join(' | ');
      console.log(
        `${track.family} learned ${track.goal} seed=${seed.seed} train=${round(seed.generation0Best)}->${round(seed.trainingBest)} | ${holdout}`
      );
    }
  }

  if (process.argv.includes('--write')) {
    writeFileSync(
      new URL('../R4_CALIBRATION_RESULTS.json', import.meta.url),
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    console.log('Wrote R4_CALIBRATION_RESULTS.json');
  }
  const learnedSeeds = learnedTracks.flatMap(track => track.seeds);
  const learnedPasses = learnedSeeds.filter(seed => seed.passed).length;
  console.log(
    `calibrate-r4: PASS ${rows.length} reward-ordering comparisons; learned outcomes retained ${learnedPasses}/${learnedSeeds.length} pass`
  );
}

main();
