/**
 * Compare Stay Aloft vs Flight Height reward landscapes and score the
 * exported Bird elite under both goals with real physics.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateFitness,
  spawnCreature,
  updateCreaturePhysics,
} from '../src/physics';
import {
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  CreatureBlueprint,
  Genome,
} from '../src/types';

const modelPath =
  process.argv[2] ??
  path.join(
    process.env.USERPROFILE ?? '',
    'Downloads',
    'Bird_elite_gen46.json'
  );

const model = JSON.parse(fs.readFileSync(modelPath, 'utf8')) as {
  modelName: string;
  generation: number;
  fitness: number;
  goal: string;
  blueprint: CreatureBlueprint;
  genome: Genome;
};

function makeConfig(goal: EvolutionGoal): SimulationConfig {
  return {
    populationSize: 1,
    generationDuration: 48,
    simulationSpeed: 1,
    mutationRate: 0.1,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: { ...DEFAULT_ARENA_MODIFIERS },
    customGoal: DEFAULT_CUSTOM_GOAL,
  };
}

/** Mirror of private scoring formulas for landscape probes. */
function stayAloftScore(
  frames: number,
  peak: number,
  integral: number,
  flapFrames: number,
  flapWork: number
): number {
  if (frames < 3 || peak < 6) return 0;
  const meanClear = frames > 0 ? integral / frames : 0;
  const sustain =
    frames * 2.6 + Math.pow(Math.max(0, frames - 36), 1.18) * 0.32;
  const cruise = Math.min(meanClear, 150) * 1.15;
  const leapiness =
    peak > 40 ? Math.max(0, peak / Math.max(16, meanClear) - 1.75) : 0;
  const leapPenalty = leapiness * peak * 0.42;
  const flapBonus =
    Math.min(140, Math.max(0, flapFrames)) * 0.5 +
    Math.min(200, Math.max(0, flapWork)) * 0.08;
  return Math.max(0, sustain + cruise + flapBonus - leapPenalty);
}

function flightHeightScore(
  frames: number,
  peak: number,
  integral: number,
  takeoffClear: number,
  poweredClimb: number,
  flapFrames: number,
  flapWork: number
): number {
  if (frames < 8 || peak < 8) return 0;
  const mean = integral / frames;
  const sustainGate = Math.min(1, Math.max(0, frames - 18) / 72);
  const flapGate = Math.min(1, Math.max(0, flapFrames) / 28);
  const glideEvidence = Math.min(1, Math.max(0, frames - 90) / 90);
  const aeroEvidence = Math.max(flapGate, glideEvidence);
  if (aeroEvidence < 0.08) return 0;

  const leapiness =
    peak > 35 ? Math.max(0, peak / Math.max(12, mean) - 1.65) : 0;
  const cruise = Math.min(mean, 220) * 2.6 * sustainGate * aeroEvidence;
  const sustainedPeak = Math.min(peak, mean * 1.45 + 12);
  const peakScore =
    sustainedPeak * 1.35 * sustainGate * (0.25 + 0.75 * aeroEvidence);
  const climbScore =
    Math.min(160, Math.max(0, poweredClimb)) *
    2.1 *
    (0.3 + 0.7 * flapGate);
  const rawClimb = Math.max(0, peak - Math.max(0, takeoffClear));
  const climbShaping =
    Math.min(120, rawClimb) * 0.35 * sustainGate * flapGate;
  const flapBonus =
    Math.min(80, Math.max(0, flapFrames)) * 0.25 +
    Math.min(120, Math.max(0, flapWork)) * 0.05;
  const leapPenalty = leapiness * peak * 0.55;
  return Math.max(
    0,
    cruise + peakScore + climbScore + climbShaping + flapBonus - leapPenalty
  );
}

type Profile = {
  name: string;
  frames: number;
  mean: number;
  peak: number;
  takeoff: number;
  poweredClimb: number;
  flapFrames: number;
  flapWork: number;
};

const profiles: Profile[] = [
  {
    name: 'short hop (10f, peak 80, no flap)',
    frames: 10,
    mean: 35,
    peak: 80,
    takeoff: 8,
    poweredClimb: 0,
    flapFrames: 0,
    flapWork: 0,
  },
  {
    name: 'short hop + flaps (12f)',
    frames: 12,
    mean: 40,
    peak: 90,
    takeoff: 8,
    poweredClimb: 15,
    flapFrames: 8,
    flapWork: 10,
  },
  {
    name: 'early flight (25f low)',
    frames: 25,
    mean: 28,
    peak: 40,
    takeoff: 10,
    poweredClimb: 8,
    flapFrames: 18,
    flapWork: 20,
  },
  {
    name: 'Stay-Aloft style cruise (200f @ 35px)',
    frames: 200,
    mean: 35,
    peak: 48,
    takeoff: 12,
    poweredClimb: 5,
    flapFrames: 120,
    flapWork: 90,
  },
  {
    name: 'Stay-Aloft style long (400f @ 40px)',
    frames: 400,
    mean: 40,
    peak: 55,
    takeoff: 12,
    poweredClimb: 8,
    flapFrames: 220,
    flapWork: 150,
  },
  {
    name: 'true climber (250f @ 110 mean)',
    frames: 250,
    mean: 110,
    peak: 125,
    takeoff: 12,
    poweredClimb: 80,
    flapFrames: 140,
    flapWork: 100,
  },
  {
    name: 'ballistic leap farm (40f peak 120)',
    frames: 40,
    mean: 50,
    peak: 120,
    takeoff: 8,
    poweredClimb: 0,
    flapFrames: 2,
    flapWork: 1,
  },
  {
    name: 'climb attempt, short sustain (40f peak 100)',
    frames: 40,
    mean: 55,
    peak: 100,
    takeoff: 10,
    poweredClimb: 40,
    flapFrames: 30,
    flapWork: 40,
  },
];

console.log('=== Reward landscape: Stay Aloft vs Flight Height ===');
console.log(
  'profile'.padEnd(42),
  'aloft'.padStart(10),
  'height'.padStart(10),
  'ratio H/A'.padStart(10),
  'sustainG'.padStart(10),
  'aeroEv'.padStart(8)
);

const landscapeRows: Array<Record<string, string | number>> = [];
for (const p of profiles) {
  const integral = p.mean * p.frames;
  const aloft = stayAloftScore(
    p.frames,
    p.peak,
    integral,
    p.flapFrames,
    p.flapWork
  );
  const height = flightHeightScore(
    p.frames,
    p.peak,
    integral,
    p.takeoff,
    p.poweredClimb,
    p.flapFrames,
    p.flapWork
  );
  const sustainGate = Math.min(1, Math.max(0, p.frames - 18) / 72);
  const flapGate = Math.min(1, Math.max(0, p.flapFrames) / 28);
  const glideEvidence = Math.min(1, Math.max(0, p.frames - 90) / 90);
  const aeroEvidence = Math.max(flapGate, glideEvidence);
  console.log(
    p.name.padEnd(42),
    aloft.toFixed(1).padStart(10),
    height.toFixed(1).padStart(10),
    (aloft > 0 ? height / aloft : 0).toFixed(3).padStart(10),
    sustainGate.toFixed(2).padStart(10),
    aeroEvidence.toFixed(2).padStart(8)
  );
  landscapeRows.push({
    name: p.name,
    stayAloft: Number(aloft.toFixed(1)),
    flightHeight: Number(height.toFixed(1)),
    sustainGate: Number(sustainGate.toFixed(3)),
    aeroEvidence: Number(aeroEvidence.toFixed(3)),
  });
}

// Duration ramp at fixed modest altitude (Stay Aloft optimum region)
console.log('\n=== Duration ramp @ mean=35, peak=45, flap=0.6*frames ===');
const durationRamp: Array<Record<string, number>> = [];
for (const frames of [5, 8, 12, 18, 24, 36, 54, 72, 90, 120, 180, 240, 360]) {
  const flap = Math.floor(frames * 0.6);
  const aloft = stayAloftScore(frames, 45, 35 * frames, flap, flap * 0.8);
  const height = flightHeightScore(
    frames,
    45,
    35 * frames,
    10,
    Math.min(20, frames * 0.05),
    flap,
    flap * 0.8
  );
  console.log(
    `f=${String(frames).padStart(3)}  aloft=${aloft.toFixed(1).padStart(8)}  height=${height.toFixed(1).padStart(8)}  sustainGate=${Math.min(1, Math.max(0, frames - 18) / 72).toFixed(2)}`
  );
  durationRamp.push({
    frames,
    stayAloft: Number(aloft.toFixed(1)),
    flightHeight: Number(height.toFixed(1)),
  });
}

// Altitude ramp at fixed long bout (what Flight Height wants)
console.log('\n=== Altitude ramp @ frames=200, flap=120, poweredClimb=mean*0.4 ===');
const altitudeRamp: Array<Record<string, number>> = [];
for (const mean of [15, 25, 35, 50, 70, 90, 110, 140, 180]) {
  const peak = mean * 1.15;
  const aloft = stayAloftScore(200, peak, mean * 200, 120, 90);
  const height = flightHeightScore(
    200,
    peak,
    mean * 200,
    12,
    Math.min(160, mean * 0.4),
    120,
    90
  );
  console.log(
    `mean=${String(mean).padStart(3)}  aloft=${aloft.toFixed(1).padStart(8)}  height=${height.toFixed(1).padStart(8)}  ΔH per +10alt≈`
  );
  altitudeRamp.push({
    meanClearance: mean,
    stayAloft: Number(aloft.toFixed(1)),
    flightHeight: Number(height.toFixed(1)),
  });
}

console.log(`\n=== Elite model physics rollouts (${model.modelName}) ===`);
console.log(
  `exported goal=${model.goal} fitness=${model.fitness.toFixed(2)} gen=${model.generation}`
);

function runEpisodeSafe(goal: EvolutionGoal, label: string) {
  const config = makeConfig(goal);
  const creature = spawnCreature(
    {
      id: label,
      generation: model.generation,
      blueprint: model.blueprint,
      genome: model.genome,
    },
    160,
    380,
    goal,
    1
  );
  const totalFrames = Math.round(config.generationDuration * 60);
  // No actuator override → physics builds sensors and runs the genome.
  for (let f = 0; f < totalFrames; f += 1) {
    updateCreaturePhysics(creature, [], f, config, []);
  }
  const fitness = calculateFitness(creature, goal);
  const heightActive = creature.flightHeightBoutFrames ?? 0;
  const aloftActive = creature.flightTimeBoutFrames ?? 0;
  return {
    fitness,
    longestStreak: creature.flightLongestStreak ?? 0,
    flightFrames: creature.flightFrames ?? 0,
    peakClear: creature.flightPeakClearance ?? 0,
    heightBest: creature.flightHeightBestBoutScore ?? 0,
    heightActive,
    heightPeak: creature.flightHeightBoutPeak ?? 0,
    heightMean:
      heightActive > 0
        ? (creature.flightHeightBoutIntegral ?? 0) / heightActive
        : 0,
    heightClimb: creature.flightHeightBoutPoweredClimb ?? 0,
    aloftBest: creature.flightTimeBestBoutScore ?? 0,
    aloftActive,
    aloftPeak: creature.flightTimeBoutPeak ?? 0,
    aloftMean:
      aloftActive > 0
        ? (creature.flightTimeBoutIntegral ?? 0) / aloftActive
        : 0,
    flapFrames: creature.wingFlapFrames ?? 0,
    flapWork: creature.wingFlapWork ?? 0,
  };
}

const aloftRun = runEpisodeSafe(EvolutionGoal.FLIGHT_TIME, 'elite-aloft');
const heightRun = runEpisodeSafe(EvolutionGoal.FLIGHT_HEIGHT, 'elite-height');

console.log('\nStay Aloft rollout:');
console.log(JSON.stringify(aloftRun, null, 2));
console.log('\nFlight Height rollout:');
console.log(JSON.stringify(heightRun, null, 2));

// Reconstruct completed-bout score if the episode ended on the ground
const completedHeightScore = Math.max(
  heightRun.heightBest,
  heightRun.fitness
);
const completedAloftScore = Math.max(aloftRun.aloftBest, aloftRun.fitness);

console.log('\n=== Structural differences (gates) ===');
console.log(
  JSON.stringify(
    {
      stayAloft: {
        minFrames: 3,
        minPeak: 6,
        primarySignal: 'frames * 2.6 (dense from first hops)',
        heightWeight: 'meanClear * 1.15 (weak)',
        zeroConditions: 'frames<3 or peak<6',
        leapPenaltyCoef: 0.42,
        flapBonusPerFrame: 0.5,
      },
      flightHeight: {
        minFrames: 8,
        minPeak: 8,
        primarySignal: 'mean * 2.6 * sustainGate * aeroEvidence',
        sustainGate: '(frames-18)/72 → 0 until frame 19, full at 90',
        aeroGate: 'max(flap/28, (frames-90)/90); score=0 if <0.08',
        poweredClimb: 'only while flapping AND COM rising',
        leapPenaltyCoef: 0.55,
        flapBonusPerFrame: 0.25,
        zeroConditions:
          'frames<8 OR peak<8 OR aeroEvidence<0.08 OR (gates zero out height terms)',
      },
      eliteCompletedScores: {
        stayAloft: completedAloftScore,
        flightHeight: completedHeightScore,
      },
      modelExportedFitness: model.fitness,
      modelTaggedGoal: model.goal,
      note:
        model.fitness > 1400 && model.goal === 'FLIGHT_HEIGHT'
          ? 'Exported fitness exceeds practical Flight Height ceiling — likely Stay Aloft-scale score tagged after a goal switch'
          : 'Exported fitness is consistent with tagged goal scale',
    },
    null,
    2
  )
);

fs.writeFileSync(
  path.join(
    process.cwd(),
    'scripts',
    'FLIGHT_HEIGHT_VS_ALOFT_DIAGNOSIS.json'
  ),
  JSON.stringify(
    {
      model: {
        path: modelPath,
        name: model.modelName,
        taggedGoal: model.goal,
        exportedFitness: model.fitness,
        generation: model.generation,
      },
      landscapeRows,
      durationRamp,
      altitudeRamp,
      eliteRollouts: { stayAloft: aloftRun, flightHeight: heightRun },
    },
    null,
    2
  )
);
console.log('\nWrote scripts/FLIGHT_HEIGHT_VS_ALOFT_DIAGNOSIS.json');
