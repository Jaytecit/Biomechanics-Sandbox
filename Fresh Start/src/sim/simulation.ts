import {
  BRAIN_DT,
  EPISODE_SECONDS,
  GHOST_OPACITY,
  LIVE_BATCH_SIZE,
  LIVE_MAX_GENERATIONS,
  LIVE_POPULATION_SIZE,
  OBS_COUNT,
} from '../brain/constants';
import {
  countBrainActuatorChannels,
  expandChannelDrives,
} from '../brain/driveGroups';
import { breedNextGeneration, meanFitness, mutate } from '../brain/ga';
import {
  cloneWeights,
  createRng,
  evaluateNetwork,
  makeShape,
  randomWeights,
} from '../brain/network';
import {
  createFootLiftState,
  instantUprightQuality,
  updateFootLiftState,
  type FootLiftState,
} from '../brain/fitness';
import {
  emptyMetrics,
  scoreTaskPerformance,
  updateFallState,
  updateJumpFlightTrackers,
  type TaskEpisodeMetrics,
} from '../brain/taskScore';
import { avgJointX, buildObservations } from '../brain/observations';
import type {
  EvolutionProgress,
  Genome,
  NetworkShape,
  TaskId,
} from '../brain/types';
import type { CreatureDesign } from '../creature/types';
import { cloneDesign } from '../creature/types';
import {
  applyMuscleForces,
  type MuscleVisualState,
  type RuntimeMuscle,
} from '../control/muscleDrive';
import { sineMuscleOutputs } from '../control/sineDriver';
import { applyAeroForces } from '../physics/aeroForces';
import {
  destroyCourse,
  spawnClimbCourse,
  type CourseHandle,
} from '../physics/course';
import { FIXED_DT } from '../physics/constants';
import { applyPlantSlideBrake } from '../physics/plantSlideBrake';
import { applyMotorTorques } from '../physics/motorDrive';
import {
  destroyCreature,
  spawnCreature,
  type SpawnedCreature,
} from '../physics/spawn';
import { createWorld, initRapier, RAPIER } from '../physics/world';
import { isFeatureEnabled } from '../port/featureFlags';

export type DriveMode = 'manual' | 'sine' | 'idle' | 'brain' | 'disco';

export interface AgentSnapshot {
  joints: {
    id: number;
    x: number;
    y: number;
    radius: number;
    vx: number;
    vy: number;
  }[];
  bones: {
    id: number;
    x: number;
    y: number;
    angle: number;
    halfLength: number;
    halfWidth: number;
    vx: number;
    vy: number;
    omega: number;
  }[];
  muscles: MuscleVisualState[];
  opacity: number;
  focused: boolean;
}

/** A7 — focused MLP probe for live network visualization. */
export interface LiveBrainProbe {
  shape: NetworkShape;
  weights: Float32Array;
  inputs: Float32Array;
  outputs: Float32Array;
  hidden: Float32Array;
  /** Population index when evolving; -1 for solo / Play best. */
  genomeIndex: number;
  focusIndex: number;
}

export interface SimulationSnapshot {
  joints: AgentSnapshot['joints'];
  bones: AgentSnapshot['bones'];
  muscles: MuscleVisualState[];
  time: number;
  agents: AgentSnapshot[];
  focusX: number;
  focusY: number;
  cameraFollow: boolean;
  evolve: EvolutionProgress | null;
  /** Cosmetic rig from current design (render-only). */
  appearance?: import('../appearance/types').AppearanceRig;
  task: TaskId;
  /** Leftover fixed-dt accumulator — used for A5 visual pose smoothing. */
  extrapolateDt: number;
  /** Focused creature brain (live evolve or brain drive). */
  brain?: LiveBrainProbe | null;
}

interface CohortMember {
  creature: SpawnedCreature;
  genomeIndex: number;
  weights: Float32Array;
  brainDrives: number[];
  brainAccumulator: number;
  /** Last obs / hidden / outs for A7 live viz (filled on brain tick). */
  lastObs: Float32Array;
  lastHidden: Float32Array;
  startX: number;
  fallTime: number;
  fell: boolean;
  footLifts: number;
  planted: FootLiftState;
  muscleVisual: MuscleVisualState[];
  peakHeight: number;
  airTime: number;
  uprightSum: number;
  uprightSteps: number;
}

/** E5 — champion / replay metrics snapshot for secret evaluation. */
export interface EpisodeCompleteSnapshot {
  task: TaskId;
  metrics: TaskEpisodeMetrics;
  design: CreatureDesign;
  episodeSeconds: number;
  generation?: number;
  context: 'evolve' | 'replay';
}

interface SoloEpisodeWatch {
  design: CreatureDesign;
  task: TaskId;
  startX: number;
  fallTime: number;
  fell: boolean;
  footLifts: number;
  planted: FootLiftState;
  peakHeight: number;
  airTime: number;
  uprightSum: number;
  uprightSteps: number;
  episodeT: number;
  episodeDuration: number;
}

interface LiveEvolveState {
  design: CreatureDesign;
  task: TaskId;
  shape: NetworkShape;
  population: Genome[];
  popSize: number;
  batchSize: number;
  maxGenerations: number;
  generation: number;
  batchIndex: number;
  batchCount: number;
  episodeT: number;
  episodeDuration: number;
  focusIndex: number;
  rng: () => number;
  bestOverall: Genome;
  /** Metrics for current-generation champion (reset each gen). */
  genBestMetrics: TaskEpisodeMetrics | null;
  genBestFitness: number;
  /**
   * HUD mean: average of genomes scored so far this generation.
   * Kept across breed (population fitness is zeroed for the next gen).
   */
  displayMeanFitness: number;
  stopRequested: boolean;
  status: string;
  onProgress?: (p: EvolutionProgress) => void;
  onFinished?: (best: Genome, shape: NetworkShape) => void;
}

export interface LiveEvolveOptions {
  design: CreatureDesign;
  task?: TaskId;
  populationSize?: number;
  batchSize?: number;
  maxGenerations?: number;
  episodeSeconds?: number;
  seed?: number;
  /** D5 — seed population from a compatible elite genome. */
  seedGenome?: { shape: NetworkShape; weights: Float32Array };
  onProgress?: (p: EvolutionProgress) => void;
  onFinished?: (best: Genome, shape: NetworkShape) => void;
}

/** MLP shape for a design after drive-group channel collapse. */
export function shapeForDesign(design: CreatureDesign): NetworkShape {
  const channels = countBrainActuatorChannels(design.muscles);
  return makeShape(Math.max(channels, 1));
}

function agentFromCreature(
  creature: SpawnedCreature,
  muscles: MuscleVisualState[],
  opacity: number,
  focused: boolean,
): AgentSnapshot {
  return {
    joints: creature.joints.map((j) => {
      const t = j.body.translation();
      const v = j.body.linvel();
      return { id: j.id, x: t.x, y: t.y, radius: j.radius, vx: v.x, vy: v.y };
    }),
    bones: creature.bones.map((b) => {
      const t = b.body.translation();
      const v = b.body.linvel();
      return {
        id: b.id,
        x: t.x,
        y: t.y,
        angle: b.body.rotation(),
        halfLength: b.halfLength,
        halfWidth: b.halfWidth,
        vx: v.x,
        vy: v.y,
        omega: b.body.angvel(),
      };
    }),
    muscles: muscles.slice(),
    opacity,
    focused,
  };
}

function resetCreatureForces(creature: SpawnedCreature): void {
  for (const b of creature.bones) {
    b.body.resetForces(true);
    b.body.resetTorques(true);
  }
  for (const j of creature.joints) {
    j.body.resetForces(true);
    j.body.resetTorques(true);
  }
}

function applyExtraForces(creature: SpawnedCreature, drives: number[]): void {
  if (isFeatureEnabled('motorWheels')) {
    applyMotorTorques(creature, drives);
  }
  if (isFeatureEnabled('aeroLikeForces')) {
    applyAeroForces(creature);
  }
}

export class Simulation {
  world: RAPIER.World | null = null;
  creature: SpawnedCreature | null = null;
  design: CreatureDesign | null = null;
  running = false;
  driveMode: DriveMode = 'idle';
  /** Active scoring task for evolve / HUD. */
  task: TaskId = 'run';
  /**
   * D1 — simulated-time multiplier. ≤0 means “max” (large step budget).
   * Physics still advances only in FIXED_DT substeps.
   */
  timeScale = 1;
  manualDrives: number[] = [];
  /** Optional provider for disco drive frames (H2). */
  discoDriveProvider: (() => number[]) | null = null;
  time = 0;
  private muscleVisual: MuscleVisualState[] = [];
  private accumulator = 0;
  private brainShape: NetworkShape | null = null;
  private brainWeights: Float32Array | null = null;
  /** Channel-length drives when brain is active; expanded before forces. */
  private brainDrives: number[] = [];
  private brainAccumulator = 0;
  private obsBuf = new Float32Array(OBS_COUNT);
  private outBuf = new Float32Array(16);
  private hidBuf = new Float32Array(32);
  /** Solo / Play-best last activations for A7. */
  private lastSoloObs = new Float32Array(OBS_COUNT);
  private lastSoloHidden = new Float32Array(32);

  private cohort: CohortMember[] = [];
  private live: LiveEvolveState | null = null;
  private course: CourseHandle | null = null;
  private soloWatch: SoloEpisodeWatch | null = null;
  /** E5 — fired after live-gen champion score or solo replay episode. */
  onEpisodeComplete: ((snap: EpisodeCompleteSnapshot) => void) | null = null;

  async init(): Promise<void> {
    await initRapier();
    this.world = createWorld();
  }

  get isEvolving(): boolean {
    return this.live !== null;
  }

  loadDesign(design: CreatureDesign): void {
    if (!this.world) throw new Error('Simulation not initialized');
    this.clearCohort();
    this.live = null;
    this.soloWatch = null;
    if (this.creature) {
      destroyCreature(this.world, this.creature);
      this.creature = null;
    }
    this.syncCourseForTask(this.task);
    this.design = design;
    this.creature = spawnCreature(this.world, design);
    this.manualDrives = this.creature.muscles.map(() => 0);
    this.brainDrives = this.creature.muscles.map(() => 0);
    this.time = 0;
    this.accumulator = 0;
    this.brainAccumulator = 0;
    this.running = true;
  }

  /**
   * Watch a single brain-driven episode (Play best) and emit metrics at the end.
   * Call after loadDesign + setBrain.
   */
  beginSoloEpisodeWatch(episodeSeconds = EPISODE_SECONDS): void {
    if (!this.creature || !this.design) return;
    this.soloWatch = {
      design: cloneDesign(this.design),
      task: this.task,
      startX: avgJointX(this.creature),
      fallTime: 0,
      fell: false,
      footLifts: 0,
      planted: createFootLiftState(this.creature.joints.length),
      peakHeight: 0,
      airTime: 0,
      uprightSum: 0,
      uprightSteps: 0,
      episodeT: 0,
      episodeDuration: episodeSeconds,
    };
  }

  clearSoloEpisodeWatch(): void {
    this.soloWatch = null;
  }

  setTask(task: TaskId): void {
    this.task = task;
    if (this.world && !this.live) {
      this.syncCourseForTask(task);
    }
  }

  private syncCourseForTask(task: TaskId): void {
    if (!this.world) return;
    destroyCourse(this.world, this.course);
    this.course = null;
    if (task === 'climb' && isFeatureEnabled('climbCourse')) {
      this.course = spawnClimbCourse(this.world);
    }
  }

  reset(): void {
    if (this.live) return;
    if (this.design) this.loadDesign(this.design);
  }

  /** Attach a genome for driveMode = 'brain' (single-creature play). */
  setBrain(shape: NetworkShape, weights: Float32Array): void {
    this.brainShape = shape;
    this.brainWeights = weights;
    this.brainDrives = new Array(shape.outputCount).fill(0);
    this.brainAccumulator = 0;
    if (this.outBuf.length < shape.outputCount) {
      this.outBuf = new Float32Array(shape.outputCount);
    }
    if (this.obsBuf.length < shape.inputCount) {
      this.obsBuf = new Float32Array(shape.inputCount);
    }
  }

  clearBrain(): void {
    this.brainShape = null;
    this.brainWeights = null;
    this.brainDrives = [];
    this.brainAccumulator = 0;
  }

  setManualDrive(index: number, value: number): void {
    if (index >= 0 && index < this.manualDrives.length) {
      this.manualDrives[index] = Math.max(-1, Math.min(1, value));
    }
  }

  setAllManual(value: number): void {
    for (let i = 0; i < this.manualDrives.length; i++) {
      this.manualDrives[i] = value;
    }
  }

  startLiveEvolve(options: LiveEvolveOptions): void {
    if (!this.world) throw new Error('Simulation not initialized');
    const design = options.design;
    if (design.muscles.length === 0) {
      throw new Error('Design has no muscles to control');
    }

    const popSize = options.populationSize ?? LIVE_POPULATION_SIZE;
    const batchSize = Math.max(
      1,
      Math.min(options.batchSize ?? LIVE_BATCH_SIZE, popSize),
    );
    const maxGenerations = options.maxGenerations ?? LIVE_MAX_GENERATIONS;
    const episodeDuration = options.episodeSeconds ?? EPISODE_SECONDS;
    const rng = createRng(options.seed ?? 1);
    const shape = shapeForDesign(design);

    if (options.seedGenome) {
      const seed = options.seedGenome;
      if (
        seed.shape.inputCount !== shape.inputCount ||
        seed.shape.hiddenCount !== shape.hiddenCount ||
        seed.shape.outputCount !== shape.outputCount ||
        seed.weights.length !== shape.weightCount
      ) {
        throw new Error(
          'Seed genome shape mismatch — continue training requires the same actuator/obs layout.',
        );
      }
    }

    const population: Genome[] = [];
    if (options.seedGenome) {
      const elite = cloneWeights(options.seedGenome.weights);
      population.push({ weights: elite, fitness: 0 });
      while (population.length < popSize) {
        population.push({
          weights: mutate(options.seedGenome.weights, rng),
          fitness: 0,
        });
      }
    } else {
      for (let i = 0; i < popSize; i++) {
        population.push({ weights: randomWeights(shape, rng), fitness: 0 });
      }
    }

    this.clearCohort();
    this.soloWatch = null;
    if (this.creature) {
      destroyCreature(this.world, this.creature);
      this.creature = null;
    }
    this.design = design;
    this.clearBrain();
    this.driveMode = 'brain';
    this.running = true;
    this.time = 0;
    this.accumulator = 0;

    const task = options.task ?? this.task;
    this.task = task;
    this.syncCourseForTask(task);

    this.live = {
      design,
      task,
      shape,
      population,
      popSize,
      batchSize,
      maxGenerations,
      generation: 0,
      batchIndex: 0,
      batchCount: Math.ceil(popSize / batchSize),
      episodeT: 0,
      episodeDuration,
      focusIndex: 0,
      rng,
      bestOverall: {
        weights: cloneWeights(population[0].weights),
        fitness: -Infinity,
      },
      genBestMetrics: null,
      genBestFitness: -Infinity,
      displayMeanFitness: 0,
      stopRequested: false,
      status: 'Starting…',
      onProgress: options.onProgress,
      onFinished: options.onFinished,
    };

    this.spawnCurrentBatch();
    this.emitEvolveProgress();
  }

  /** Finish after the current live batch episode (Keiwan-style stop). */
  requestStopEvolve(): void {
    if (this.live) {
      this.live.stopRequested = true;
      this.live.status = 'Stopping after this batch…';
      this.emitEvolveProgress();
    }
  }

  /**
   * Update per-generation episode length (simulated seconds).
   * Applies to the current live evolve episode and solo replay watches.
   * If the new length is already elapsed, the episode ends on the next step.
   */
  setEpisodeSeconds(seconds: number): void {
    const duration = Math.max(1, seconds);
    if (this.live) {
      this.live.episodeDuration = duration;
      this.emitEvolveProgress();
    }
    if (this.soloWatch) {
      this.soloWatch.episodeDuration = duration;
    }
  }

  /** Immediately tear down a live evolve session (e.g. design changed). */
  abortLiveEvolve(): void {
    if (!this.live || !this.world) return;
    const design = this.live.design;
    this.clearCohort();
    this.live = null;
    this.soloWatch = null;
    this.creature = spawnCreature(this.world, design);
    this.design = design;
    this.manualDrives = this.creature.muscles.map(() => 0);
    this.brainDrives = this.creature.muscles.map(() => 0);
    this.driveMode = 'idle';
    this.time = 0;
    this.accumulator = 0;
  }

  focusNextCreature(): void {
    if (!this.live || this.cohort.length === 0) return;
    this.live.focusIndex = (this.live.focusIndex + 1) % this.cohort.length;
    this.emitEvolveProgress();
  }

  focusPrevCreature(): void {
    if (!this.live || this.cohort.length === 0) return;
    this.live.focusIndex =
      (this.live.focusIndex - 1 + this.cohort.length) % this.cohort.length;
    this.emitEvolveProgress();
  }

  step(frameDt: number): SimulationSnapshot {
    if (!this.world || !this.running) {
      return this.snapshot();
    }
    if (!this.live && !this.creature) {
      return this.snapshot();
    }

    // D1: scale how much simulated time is requested; integrator stays FIXED_DT.
    // timeScale ≤ 0 (“Max”) uses a large step budget. Never queue more sim time
    // than that budget can drain — leftover debt was blowing up A5 pose
    // extrapolation (bodies flung by multi-second velocity * dt).
    const scale = this.timeScale <= 0 ? 64 : this.timeScale;
    const maxSteps =
      frameDt <= FIXED_DT + 1e-9 && scale <= 1
        ? 1
        : Math.min(64, Math.max(8, Math.ceil(scale * 8)));
    const simDt = frameDt * scale;
    this.accumulator += Math.min(simDt, maxSteps * FIXED_DT);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < maxSteps) {
      this.physicsStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    // Sub-frame remainder only — A5 must never see multi-tick debt.
    if (this.accumulator >= FIXED_DT) {
      this.accumulator %= FIXED_DT;
    }
    return this.snapshot();
  }

  private physicsStep(dt: number): void {
    if (!this.world) return;

    if (this.live) {
      this.physicsStepCohort(dt);
      return;
    }

    if (!this.creature) return;

    if (this.driveMode === 'brain') {
      this.tickBrainSingle(dt);
    }

    const drives = this.resolveMuscleDrivesSingle();
    resetCreatureForces(this.creature);
    applyMuscleForces(this.creature.muscles, drives, this.muscleVisual);
    applyExtraForces(this.creature, drives);

    this.world.timestep = dt;
    this.world.step();
    // Plant slide brake: Idle settle + brain/evolve scoot. Skip flight/motor.
    if (this.task !== 'flight' && this.task !== 'motor') {
      applyPlantSlideBrake(this.creature);
    }
    this.time += dt;
    this.tickSoloWatch(dt);
  }

  private tickSoloWatch(dt: number): void {
    const watch = this.soloWatch;
    if (!watch || !this.creature || this.driveMode !== 'brain') return;

    if (!watch.fell) {
      const fall = updateFallState(this.creature, watch.fallTime, dt);
      watch.fallTime = fall.fallTime;
      if (fall.fell) watch.fell = true;
    }
    watch.footLifts += updateFootLiftState(this.creature, watch.planted);
    watch.uprightSum += instantUprightQuality(this.creature);
    watch.uprightSteps++;
    const track = updateJumpFlightTrackers(
      this.creature,
      dt,
      watch.peakHeight,
      watch.airTime,
    );
    watch.peakHeight = track.peakHeight;
    watch.airTime = track.airTime;
    watch.episodeT += dt;

    if (watch.episodeT < watch.episodeDuration) return;

    const uprightMean =
      watch.uprightSteps > 0 ? watch.uprightSum / watch.uprightSteps : 1;
    const metrics = scoreTaskPerformance(
      watch.task,
      this.creature,
      watch.startX,
      watch.fell,
      watch.footLifts,
      watch.peakHeight,
      watch.airTime,
      uprightMean,
    );
    const snap: EpisodeCompleteSnapshot = {
      task: watch.task,
      metrics,
      design: watch.design,
      episodeSeconds: watch.episodeDuration,
      context: 'replay',
    };
    this.soloWatch = null;
    this.onEpisodeComplete?.(snap);
  }

  private physicsStepCohort(dt: number): void {
    if (!this.world || !this.live) return;

    const muscleDefs = this.live.design.muscles;
    for (const member of this.cohort) {
      this.tickBrainMember(member, this.live.shape, dt);
      const muscleDrives = expandChannelDrives(muscleDefs, member.brainDrives);
      resetCreatureForces(member.creature);
      applyMuscleForces(
        member.creature.muscles,
        muscleDrives,
        member.muscleVisual,
      );
      applyExtraForces(member.creature, muscleDrives);

      if (!member.fell) {
        const fall = updateFallState(member.creature, member.fallTime, dt);
        member.fallTime = fall.fallTime;
        if (fall.fell) member.fell = true;
      }
    }

    this.world.timestep = dt;
    this.world.step();
    this.time += dt;
    this.live.episodeT += dt;

    if (this.live.task !== 'flight' && this.live.task !== 'motor') {
      for (const member of this.cohort) {
        applyPlantSlideBrake(member.creature);
      }
    }

    for (const member of this.cohort) {
      member.footLifts += updateFootLiftState(member.creature, member.planted);
      member.uprightSum += instantUprightQuality(member.creature);
      member.uprightSteps++;
      const track = updateJumpFlightTrackers(
        member.creature,
        dt,
        member.peakHeight,
        member.airTime,
      );
      member.peakHeight = track.peakHeight;
      member.airTime = track.airTime;
    }

    if (this.live.episodeT >= this.live.episodeDuration) {
      this.finishCurrentBatch();
    } else if (Math.floor(this.live.episodeT * 4) !== Math.floor((this.live.episodeT - dt) * 4)) {
      // ~4 Hz HUD refresh during the episode
      this.emitEvolveProgress();
    }
  }

  private finishCurrentBatch(): void {
    const live = this.live;
    if (!live) return;

    for (const member of this.cohort) {
      const uprightMean =
        member.uprightSteps > 0 ? member.uprightSum / member.uprightSteps : 1;
      const result = scoreTaskPerformance(
        live.task,
        member.creature,
        member.startX,
        member.fell,
        member.footLifts,
        member.peakHeight,
        member.airTime,
        uprightMean,
      );
      live.population[member.genomeIndex].fitness = result.fitness;
      if (result.fitness > live.bestOverall.fitness) {
        live.bestOverall = {
          weights: cloneWeights(live.population[member.genomeIndex].weights),
          fitness: result.fitness,
        };
      }
      if (result.fitness > live.genBestFitness) {
        live.genBestFitness = result.fitness;
        live.genBestMetrics = result;
      }
    }

    const evaluated = Math.min(
      (live.batchIndex + 1) * live.batchSize,
      live.popSize,
    );
    // Population fitness is cleared on breed; persist a HUD mean from scored genomes.
    live.displayMeanFitness = meanFitness(live.population.slice(0, evaluated));

    if (live.stopRequested) {
      this.endLiveEvolve('Stopped — use Play best');
      return;
    }

    if (live.batchIndex + 1 < live.batchCount) {
      live.batchIndex += 1;
      live.status = `Gen ${live.generation} · batch ${live.batchIndex + 1}/${live.batchCount}`;
      this.spawnCurrentBatch();
      this.emitEvolveProgress(evaluated);
      return;
    }

    // Generation complete
    live.population.sort((a, b) => b.fitness - a.fitness);
    live.status = `Gen ${live.generation} done · best ${live.population[0].fitness.toFixed(3)}`;
    this.emitEvolveProgress(live.popSize);
    this.emitGenChampionEpisode(live);

    if (live.generation + 1 >= live.maxGenerations) {
      this.endLiveEvolve('Done — use Play best');
      return;
    }

    live.population = breedNextGeneration(
      live.population,
      live.popSize,
      live.rng,
    );
    live.generation += 1;
    live.batchIndex = 0;
    live.batchCount = Math.ceil(live.popSize / live.batchSize);
    live.genBestMetrics = null;
    live.genBestFitness = -Infinity;
    live.status = `Gen ${live.generation} · batch 1/${live.batchCount}`;
    this.spawnCurrentBatch();
    this.emitEvolveProgress(0);
  }

  private emitGenChampionEpisode(live: LiveEvolveState): void {
    const metrics = live.genBestMetrics ?? emptyMetrics();
    this.onEpisodeComplete?.({
      task: live.task,
      metrics,
      design: live.design,
      episodeSeconds: live.episodeDuration,
      generation: live.generation,
      context: 'evolve',
    });
  }

  private endLiveEvolve(status: string): void {
    const live = this.live;
    if (!live || !this.world) return;

    const best = live.bestOverall;
    const shape = live.shape;
    const onFinished = live.onFinished;
    const onProgress = live.onProgress;

    this.clearCohort();
    this.live = null;

    // Leave a single idle creature on screen
    this.creature = spawnCreature(this.world, live.design);
    this.design = live.design;
    this.manualDrives = this.creature.muscles.map(() => 0);
    this.brainDrives = this.creature.muscles.map(() => 0);
    this.driveMode = 'idle';
    this.time = 0;
    this.accumulator = 0;

    onProgress?.({
      generation: live.generation,
      evaluated: live.popSize,
      populationSize: live.popSize,
      bestFitness: best.fitness === -Infinity ? 0 : best.fitness,
      meanFitness: live.displayMeanFitness,
      running: false,
      status,
      batch: live.batchIndex + 1,
      batchCount: live.batchCount,
      focusIndex: 0,
      episodeT: live.episodeDuration,
      episodeDuration: live.episodeDuration,
    });

    if (best.fitness > -Infinity) {
      onFinished?.(best, shape);
    }
  }

  private spawnCurrentBatch(): void {
    if (!this.world || !this.live) return;
    this.clearCohort();

    const live = this.live;
    const start = live.batchIndex * live.batchSize;
    const count = Math.min(live.batchSize, live.popSize - start);
    if (this.outBuf.length < live.shape.outputCount) {
      this.outBuf = new Float32Array(live.shape.outputCount);
    }
    if (this.hidBuf.length < live.shape.hiddenCount) {
      this.hidBuf = new Float32Array(live.shape.hiddenCount);
    }
    if (this.obsBuf.length < live.shape.inputCount) {
      this.obsBuf = new Float32Array(live.shape.inputCount);
    }

    for (let i = 0; i < count; i++) {
      const genomeIndex = start + i;
      const creature = spawnCreature(this.world, live.design);
      this.cohort.push({
        creature,
        genomeIndex,
        weights: live.population[genomeIndex].weights,
        brainDrives: new Array(live.shape.outputCount).fill(0),
        brainAccumulator: 0,
        lastObs: new Float32Array(live.shape.inputCount),
        lastHidden: new Float32Array(live.shape.hiddenCount),
        startX: avgJointX(creature),
        fallTime: 0,
        fell: false,
        footLifts: 0,
        planted: createFootLiftState(creature.joints.length),
        muscleVisual: [],
        peakHeight: 0,
        airTime: 0,
        uprightSum: 0,
        uprightSteps: 0,
      });
    }

    live.episodeT = 0;
    live.focusIndex = 0;
    this.time = 0;
    this.accumulator = 0;
    live.status = `Gen ${live.generation} · batch ${live.batchIndex + 1}/${live.batchCount}`;
  }

  private clearCohort(): void {
    if (!this.world) {
      this.cohort = [];
      return;
    }
    for (const member of this.cohort) {
      destroyCreature(this.world, member.creature);
    }
    this.cohort = [];
  }

  private tickBrainSingle(dt: number): void {
    if (!this.creature || !this.brainShape || !this.brainWeights) return;
    if (this.hidBuf.length < this.brainShape.hiddenCount) {
      this.hidBuf = new Float32Array(this.brainShape.hiddenCount);
    }
    if (this.lastSoloObs.length < this.brainShape.inputCount) {
      this.lastSoloObs = new Float32Array(this.brainShape.inputCount);
    }
    if (this.lastSoloHidden.length < this.brainShape.hiddenCount) {
      this.lastSoloHidden = new Float32Array(this.brainShape.hiddenCount);
    }
    this.brainAccumulator += dt;
    while (this.brainAccumulator >= BRAIN_DT) {
      this.brainAccumulator -= BRAIN_DT;
      buildObservations(this.creature, this.obsBuf);
      const outs = evaluateNetwork(
        this.brainShape,
        this.brainWeights,
        this.obsBuf,
        this.outBuf,
        this.hidBuf,
      );
      this.lastSoloObs.set(this.obsBuf.subarray(0, this.brainShape.inputCount));
      this.lastSoloHidden.set(this.hidBuf.subarray(0, this.brainShape.hiddenCount));
      for (let i = 0; i < this.brainDrives.length; i++) {
        this.brainDrives[i] = outs[i] ?? 0;
      }
    }
  }

  private tickBrainMember(
    member: CohortMember,
    shape: NetworkShape,
    dt: number,
  ): void {
    member.brainAccumulator += dt;
    while (member.brainAccumulator >= BRAIN_DT) {
      member.brainAccumulator -= BRAIN_DT;
      buildObservations(member.creature, this.obsBuf);
      const outs = evaluateNetwork(
        shape,
        member.weights,
        this.obsBuf,
        this.outBuf,
        this.hidBuf,
      );
      member.lastObs.set(this.obsBuf.subarray(0, shape.inputCount));
      member.lastHidden.set(this.hidBuf.subarray(0, shape.hiddenCount));
      for (let i = 0; i < member.brainDrives.length; i++) {
        member.brainDrives[i] = outs[i] ?? 0;
      }
    }
  }

  /**
   * Focused MLP probe for A7. Arrays are live views (mutated on brain ticks) —
   * UI should read them each frame and not retain them across sessions.
   */
  private probeFocusedBrain(): LiveBrainProbe | null {
    if (this.live && this.cohort.length > 0) {
      const focus = Math.min(
        this.live.focusIndex,
        Math.max(0, this.cohort.length - 1),
      );
      const member = this.cohort[focus];
      return {
        shape: this.live.shape,
        weights: member.weights,
        inputs: member.lastObs,
        outputs: Float32Array.from(member.brainDrives),
        hidden: member.lastHidden,
        genomeIndex: member.genomeIndex,
        focusIndex: focus,
      };
    }
    if (
      this.driveMode === 'brain' &&
      this.brainShape &&
      this.brainWeights &&
      this.brainDrives.length === this.brainShape.outputCount
    ) {
      return {
        shape: this.brainShape,
        weights: this.brainWeights,
        inputs: this.lastSoloObs,
        outputs: Float32Array.from(this.brainDrives),
        hidden: this.lastSoloHidden,
        genomeIndex: -1,
        focusIndex: 0,
      };
    }
    return null;
  }

  /** Per-muscle drives for force application (brain channels expanded). */
  private resolveMuscleDrivesSingle(): number[] {
    const n = this.creature?.muscles.length ?? 0;
    const muscles = this.design?.muscles ?? [];
    if (this.driveMode === 'sine') {
      const channels = countBrainActuatorChannels(muscles);
      const channelDrives = sineMuscleOutputs(Math.max(1, channels), this.time);
      return expandChannelDrives(muscles, channelDrives);
    }
    if (this.driveMode === 'manual') {
      return this.manualDrives.slice();
    }
    if (this.driveMode === 'brain') {
      if (!this.brainShape || this.brainDrives.length !== this.brainShape.outputCount) {
        return new Array(n).fill(0);
      }
      return expandChannelDrives(muscles, this.brainDrives);
    }
    if (this.driveMode === 'disco' && this.discoDriveProvider) {
      const frame = this.discoDriveProvider();
      if (frame.length === n) return frame;
      const out = new Array(n).fill(0);
      for (let i = 0; i < n; i++) out[i] = frame[i] ?? 0;
      return out;
    }
    return new Array(n).fill(0);
  }

  private emitEvolveProgress(evaluatedOverride?: number): void {
    const live = this.live;
    if (!live) return;
    const evaluated =
      evaluatedOverride ??
      live.batchIndex * live.batchSize +
        Math.floor(
          (live.episodeT / live.episodeDuration) *
            Math.min(live.batchSize, live.popSize - live.batchIndex * live.batchSize),
        );
    live.onProgress?.({
      generation: live.generation,
      evaluated: Math.min(live.popSize, Math.max(0, evaluated)),
      populationSize: live.popSize,
      bestFitness:
        live.bestOverall.fitness === -Infinity ? 0 : live.bestOverall.fitness,
      meanFitness: live.displayMeanFitness,
      running: true,
      status: live.status,
      batch: live.batchIndex + 1,
      batchCount: live.batchCount,
      focusIndex: live.focusIndex,
      cohortSize: this.cohort.length,
      episodeT: live.episodeT,
      episodeDuration: live.episodeDuration,
    });
  }

  muscles(): RuntimeMuscle[] {
    if (this.live && this.cohort.length > 0) {
      const idx = this.live.focusIndex % this.cohort.length;
      return this.cohort[idx].creature.muscles;
    }
    return this.creature?.muscles ?? [];
  }

  snapshot(): SimulationSnapshot {
    if (this.live && this.cohort.length > 0) {
      const focus = Math.min(
        this.live.focusIndex,
        Math.max(0, this.cohort.length - 1),
      );
      const agents = this.cohort.map((m, i) =>
        agentFromCreature(
          m.creature,
          m.muscleVisual,
          i === focus ? 1 : GHOST_OPACITY,
          i === focus,
        ),
      );
      const focused = agents[focus];
      let focusX = 0;
      let focusY = 1;
      if (focused.joints.length > 0) {
        focusX =
          focused.joints.reduce((s, j) => s + j.x, 0) / focused.joints.length;
        focusY =
          focused.joints.reduce((s, j) => s + j.y, 0) / focused.joints.length;
      }
      return {
        joints: focused.joints,
        bones: focused.bones,
        muscles: focused.muscles,
        time: this.time,
        agents,
        focusX,
        focusY,
        cameraFollow: true,
        appearance: this.live.design.appearance,
        task: this.live.task,
        extrapolateDt: Math.min(this.accumulator, FIXED_DT),
        brain: this.probeFocusedBrain(),
        evolve: {
          generation: this.live.generation,
          evaluated: this.live.batchIndex * this.live.batchSize,
          populationSize: this.live.popSize,
          bestFitness:
            this.live.bestOverall.fitness === -Infinity
              ? 0
              : this.live.bestOverall.fitness,
          meanFitness: this.live.displayMeanFitness,
          running: true,
          status: this.live.status,
          batch: this.live.batchIndex + 1,
          batchCount: this.live.batchCount,
          focusIndex: focus,
          cohortSize: this.cohort.length,
          episodeT: this.live.episodeT,
          episodeDuration: this.live.episodeDuration,
        },
      };
    }

    const primary = this.creature
      ? agentFromCreature(this.creature, this.muscleVisual, 1, true)
      : {
          joints: [],
          bones: [],
          muscles: [],
          opacity: 1,
          focused: true,
        };

    let focusX = 0;
    let focusY = 2;
    if (primary.joints.length > 0) {
      focusX =
        primary.joints.reduce((s, j) => s + j.x, 0) / primary.joints.length;
      focusY =
        primary.joints.reduce((s, j) => s + j.y, 0) / primary.joints.length;
    }

    return {
      joints: primary.joints,
      bones: primary.bones,
      muscles: primary.muscles,
      time: this.time,
      agents: primary.joints.length ? [primary] : [],
      focusX,
      focusY,
      cameraFollow: false,
      appearance: this.design?.appearance,
      task: this.task,
      extrapolateDt: Math.min(this.accumulator, FIXED_DT),
      brain: this.probeFocusedBrain(),
      evolve: null,
    };
  }
}
