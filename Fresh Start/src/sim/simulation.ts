import {
  BRAIN_DT,
  BRAIN_HZ,
  ELITE_COUNT,
  EPISODE_SECONDS,
  GHOST_OPACITY,
  LIVE_BATCH_SIZE,
  LIVE_MAX_GENERATIONS,
  LIVE_POPULATION_SIZE,
  MUTATION_RESET_RATE,
  MUTATION_SIGMA,
  OBS_COUNT,
  TOURNAMENT_SIZE,
  type BrainHz,
} from '../brain/constants';
import {
  countBrainActuatorChannels,
  expandChannelDrives,
} from '../brain/driveGroups';
import {
  breedNextGeneration,
  meanFitness,
  mutate,
  type BreedOptions,
} from '../brain/ga';
import {
  adaptiveEpisodeSeconds,
  annealedMutationSigma,
} from '../brain/trainingRecipes';
import {
  applyGoalPriorities,
  DEFAULT_GOAL_PRIORITIES,
  type GoalPriorities,
} from '../brain/goalPriorities';
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
import {
  activeCourseMarkers,
  emptyCourseMarkerAccum,
  updateCourseMarkerAccum,
  type CourseMarkerAccum,
} from '../brain/courseMarkers';
import {
  activeScoreRegions,
  emptyScoreRegionAccum,
  updateScoreRegionAccum,
  type ScoreRegionAccum,
} from '../brain/scoreRegions';
import {
  avgJointVelX,
  avgJointX,
  buildObservations,
} from '../brain/observations';
import {
  buildDanceObservations,
  DANCE_OBS_COUNT,
} from '../brain/danceObs';
import type {
  EvolutionProgress,
  Genome,
  NetworkShape,
  TaskId,
} from '../brain/types';
import type { AudioBands } from '../audio/audioAnalysis';
import type { CreatureDesign } from '../creature/types';
import { cloneDesign } from '../creature/types';
import {
  applyMuscleForces,
  type MuscleForceOptions,
  type MuscleVisualState,
  type RuntimeMuscle,
} from '../control/muscleDrive';
import { sineMuscleOutputs } from '../control/sineDriver';
import { applyAeroForces } from '../physics/aeroForces';
import {
  destroyCourse,
  destroyRoughCourse,
  spawnClimbCourse,
  spawnRoughCourse,
  type CourseHandle,
  type RoughCourseHandle,
} from '../physics/course';
import {
  ANGULAR_DAMPING,
  DEFAULT_DISCO_PUPPET_MODE,
  DEFAULT_JOINT_MASS,
  DISCO_FOOT_MASS_DEFAULT,
  DISCO_PUPPET_MODES,
  FIXED_DT,
  LINEAR_DAMPING,
  type DiscoPuppetMode,
} from '../physics/constants';
import {
  destroyObstacles,
  spawnStaticObstacles,
  type ObstacleHandle,
  type ObstacleVisual,
} from '../physics/obstacles';
import {
  destroyTerrain,
  spawnTerrainHeightfield,
  type TerrainHandle,
  type TerrainVisual,
} from '../physics/terrain';
import {
  destroyTower,
  spawnLaunchTower,
  type TowerCuboidVisual,
  type TowerHandle,
} from '../physics/tower';
import { applyPlantSlideBrake } from '../physics/plantSlideBrake';
import { applyMotorTorques } from '../physics/motorDrive';
import {
  createStallTracker,
  finalizeStallDiagnostics,
  noteStallProgress,
  type StallDiagnostics,
  type StallTracker,
} from '../physics/obstacleContactProbe';
import {
  applyMessyBodyJitter,
  applyMorphToDesign,
  cloneMorphGenes,
  mutateMorphGenes,
  zeroMorphGenes,
} from '../creature/morphGenes';
import { isFeatureEnabled } from '../port/featureFlags';
import {
  cloneEnvironment,
  flatGroundEnv,
  resolveSpawn,
  type EnvironmentDesign,
  type EnvCourseMarker,
  type EnvScoreRegion,
} from '../env/types';
import {
  destroyCreature,
  spawnCreature,
  syncCreatureSoftCcd,
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
  /** Per-agent cosmetics (disco multi-dancer / mirrored slots). */
  appearance?: import('../appearance/types').AppearanceRig;
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

/** B6 — live episode trackers for the focused creature. */
export interface LiveFocusStats {
  distance: number;
  footLifts: number;
  peakHeight: number;
  airTime: number;
  fell: boolean;
  uprightQuality: number;
  fitness: number;
  /** C2.10 — race clock armed after start line. */
  courseArmed: boolean;
  /** C2.10 — elapsed race seconds; null until start. */
  raceTime: number | null;
  checkpointsHit: number;
  finished: boolean;
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
  /** Disco session — skip muscle strokes when drawing. */
  hideMuscles?: boolean;
  /** Disco session — skip bone capsules + joint dots when drawing. */
  hideBones?: boolean;
  task: TaskId;
  /** Leftover fixed-dt accumulator — used for A5 visual pose smoothing. */
  extrapolateDt: number;
  /** Focused creature brain (live evolve or brain drive). */
  brain?: LiveBrainProbe | null;
  /** G1 — static obstacle visuals for render (empty when flag off / none). */
  obstacles: ObstacleVisual[];
  /** G3 — heightfield polyline for render. */
  terrain: TerrainVisual | null;
  /** C2.4 — launch tower cuboids for render. */
  tower: TowerCuboidVisual[];
  /** C2.9 — score region overlays (score-only; empty when flag off). */
  scoreRegions: EnvScoreRegion[];
  /** C2.10 — course marker overlays (score-only; empty when flag off). */
  courseMarkers: EnvCourseMarker[];
  /** Live focused episode stats (evolve cohort or solo watch). */
  liveStats: LiveFocusStats | null;
  /** Most recent completed episode metrics. */
  lastEpisodeMetrics: TaskEpisodeMetrics | null;
  /** I6 — dual-model gauntlet HUD when active. */
  headToHead: HeadToHeadSnapshot | null;
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
  airHeightIntegral: number;
  uprightSum: number;
  uprightSteps: number;
  peakSpeed: number;
  /** Best forward progress (avgJointX − startX) this episode. */
  peakDistance: number;
  regionAccum: ScoreRegionAccum;
  courseAccum: CourseMarkerAccum;
  /** D16 — stall contact tracker (telemetry). */
  stall: StallTracker;
  /** Per-member design when cohort members differ (H2H). */
  memberDesign?: CreatureDesign;
  /** Per-member MLP shape when cohort members differ (H2H). */
  memberShape?: NetworkShape;
}

interface DiscoDancerRuntime {
  design: CreatureDesign;
  creature: SpawnedCreature;
  muscleVisual: MuscleVisualState[];
  resolveDrives: () => number[];
}

export interface DiscoDancerSlot {
  design: CreatureDesign;
  offsetX: number;
}

export interface HeadToHeadEntry {
  design: CreatureDesign;
  shape: NetworkShape;
  weights: Float32Array;
}

export interface HeadToHeadResult {
  fitness: [number, number];
  metrics: [TaskEpisodeMetrics, TaskEpisodeMetrics];
}

export interface HeadToHeadOptions {
  entries: [HeadToHeadEntry, HeadToHeadEntry];
  task: TaskId;
  episodeSeconds?: number;
  onProgress?: (episodeT: number, episodeDuration: number) => void;
  onFinished?: (result: HeadToHeadResult) => void;
}

export interface HeadToHeadSnapshot {
  episodeT: number;
  episodeDuration: number;
  fitness: [number, number];
  names: [string, string];
}

/** E5 — champion / replay metrics snapshot for secret evaluation. */
export interface EpisodeCompleteSnapshot {
  task: TaskId;
  metrics: TaskEpisodeMetrics;
  design: CreatureDesign;
  episodeSeconds: number;
  generation?: number;
  context: 'evolve' | 'replay';
  /** Population mean fitness at gen complete (evolve champion emit only). */
  meanFitness?: number;
  /** Run-best fitness so far (evolve champion emit only). */
  runBestFitness?: number;
  /** Population size for the evolve run (evolve champion emit only). */
  populationSize?: number;
  /** D16 — stall / contact diagnostics for gen champion (evolve only). */
  stall?: StallDiagnostics | null;
  /** D17 — morph genes for gen champion (evolve only). */
  morph?: Genome['morph'];
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
  airHeightIntegral: number;
  uprightSum: number;
  uprightSteps: number;
  peakSpeed: number;
  peakDistance: number;
  regionAccum: ScoreRegionAccum;
  courseAccum: CourseMarkerAccum;
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
  /** Base try length before adaptive schedule (D12). */
  baseEpisodeSeconds: number;
  focusIndex: number;
  rng: () => number;
  bestOverall: Genome;
  /** Metrics for current-generation champion (reset each gen). */
  genBestMetrics: TaskEpisodeMetrics | null;
  genBestFitness: number;
  /** Stall diagnostics for current-generation champion. */
  genBestStall: StallDiagnostics | null;
  /** Morph genes for current-generation champion. */
  genBestMorph: Genome['morph'];
  /**
   * HUD mean: average of genomes scored so far this generation.
   * Kept across breed (population fitness is zeroed for the next gen).
   */
  displayMeanFitness: number;
  stopRequested: boolean;
  status: string;
  breed: Required<
    Pick<
      BreedOptions,
      | 'eliteCount'
      | 'tournamentSize'
      | 'mutationSigma'
      | 'mutationResetRate'
      | 'crossover'
    >
  > & {
    annealMutation: boolean;
    shortTriesFirst: boolean;
    stopAfterFall: boolean;
  };
  /** D13 — score-mix priorities (not physics). */
  priorities: GoalPriorities;
  /** D17 — soft morph evolve. */
  morphEvolve: boolean;
  /** D14/D17 — per-episode messy body jitter. */
  messyBodies: boolean;
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
  seedGenome?: {
    shape: NetworkShape;
    weights: Float32Array;
    morph?: Genome['morph'];
  };
  /** D10–D12 — GA search knobs (defaults match constants). */
  breed?: BreedOptions & {
    annealMutation?: boolean;
    shortTriesFirst?: boolean;
    stopAfterFall?: boolean;
  };
  /** D13 — fitness priority remapping. */
  priorities?: GoalPriorities;
  /** D17 — evolve morph genes with the brain. */
  morphEvolve?: boolean;
  /** D14/D17 — jitter mass/length each spawn. */
  messyBodies?: boolean;
  onProgress?: (p: EvolutionProgress) => void;
  onFinished?: (best: Genome, shape: NetworkShape) => void;
}

/** MLP shape for a design after drive-group channel collapse. */
export function shapeForDesign(design: CreatureDesign): NetworkShape {
  const channels = countBrainActuatorChannels(design.muscles);
  return makeShape(Math.max(channels, 1));
}

/** H6 — dance MLP shape (pose + audio bands). */
export function shapeForDanceDesign(design: CreatureDesign): NetworkShape {
  const channels = countBrainActuatorChannels(design.muscles);
  return makeShape(Math.max(channels, 1), DANCE_OBS_COUNT);
}

export interface DiscoSamplePayload {
  obs: Float32Array;
  muscleDrives: number[];
}

function agentFromCreature(
  creature: SpawnedCreature,
  muscles: MuscleVisualState[],
  opacity: number,
  focused: boolean,
  appearance?: import('../appearance/types').AppearanceRig,
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
    appearance,
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

/** Disco puppet body tune — gravityScale + damping on all creature bodies. */
function applyCreatureBodyTune(
  creature: SpawnedCreature,
  gravityScale: number,
  linearDamping: number,
  angularDamping: number,
): void {
  for (const j of creature.joints) {
    j.body.setGravityScale(gravityScale, true);
    j.body.setLinearDamping(linearDamping);
    j.body.setAngularDamping(angularDamping);
  }
  for (const b of creature.bones) {
    b.body.setGravityScale(gravityScale, true);
    b.body.setLinearDamping(linearDamping);
    b.body.setAngularDamping(angularDamping);
  }
}

function resetCreatureBodyTune(creature: SpawnedCreature): void {
  applyCreatureBodyTune(creature, 1, LINEAR_DAMPING, ANGULAR_DAMPING);
}

function setRigidBodyMass(body: RAPIER.RigidBody, mass: number): void {
  const m = Math.max(0.05, mass);
  for (let i = 0; i < body.numColliders(); i++) {
    body.collider(i).setMass(m);
  }
}

/** Disco-only: weigh down marked feet so they plant instead of floating. */
function applyDiscoFootMass(
  creature: SpawnedCreature,
  footMass: number,
): void {
  for (const j of creature.joints) {
    if (j.isFoot) setRigidBodyMass(j.body, footMass);
  }
}

/** Restore joint masses from the design (or DEFAULT_JOINT_MASS). */
function restoreJointMassesFromDesign(
  creature: SpawnedCreature,
  design: CreatureDesign | null | undefined,
): void {
  const byId = new Map(
    (design?.joints ?? []).map((j) => [j.id, j.mass ?? DEFAULT_JOINT_MASS]),
  );
  for (const j of creature.joints) {
    setRigidBodyMass(j.body, byId.get(j.id) ?? DEFAULT_JOINT_MASS);
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
  /** When false, live-evolve snapshot omits non-focused cohort members. */
  showGhostPack = true;
  manualDrives: number[] = [];
  /** Optional provider for solo-creature disco drive frames (H2). */
  discoDriveProvider: (() => number[]) | null = null;
  /** H6 — live audio bands for dance-brain observations (freestyle). */
  audioObsProvider: (() => AudioBands | null) | null = null;
  /** H7 — offline lookahead features synced to playback / episode time. */
  audioLookaheadProvider: (() => ArrayLike<number> | null) | null = null;
  /**
   * H6 — called at BRAIN_HZ while solo disco is driving, for imitation record.
   * Payload obs is dance-sized (pose + audio); muscleDrives are per-muscle.
   */
  discoSampleHook: ((payload: DiscoSamplePayload) => void) | null = null;
  private discoSampleAccumulator = 0;
  private discoSampleObsBuf = new Float32Array(DANCE_OBS_COUNT);
  /** Disco-only puppet feel (does not affect evolve/edit). */
  discoPuppetMode: DiscoPuppetMode = DEFAULT_DISCO_PUPPET_MODE;
  /**
   * When true, disco muscle force options apply (reactive + freestyle).
   * Cleared on leave-disco; set by setDiscoPuppetMode.
   */
  discoArenaFeel = false;
  /** Disco-only mass applied to joints marked as feet. */
  discoFootMass = DISCO_FOOT_MASS_DEFAULT;
  /** Disco session — hide muscle strokes in render. */
  hideMuscles = false;
  /** Disco session — hide bone capsules + joint dots in render. */
  hideBones = false;
  time = 0;
  /**
   * Brain / control update rate. Default Keiwan 30 Hz; 60 Hz = one eval per
   * physics step. Disco imitation sampling stays at BRAIN_HZ for dataset parity.
   */
  brainHz: BrainHz = BRAIN_HZ;
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
  private discoDancers: DiscoDancerRuntime[] = [];
  private h2h: {
    task: TaskId;
    episodeT: number;
    episodeDuration: number;
    onProgress?: (episodeT: number, episodeDuration: number) => void;
    onFinished?: (result: HeadToHeadResult) => void;
  } | null = null;
  private h2hFinished: HeadToHeadResult | null = null;
  private live: LiveEvolveState | null = null;
  private course: CourseHandle | null = null;
  private roughCourse: RoughCourseHandle | null = null;
  private environment: EnvironmentDesign = flatGroundEnv();
  private envObstacles: ObstacleHandle | null = null;
  private envTerrain: TerrainHandle | null = null;
  private envTower: TowerHandle | null = null;
  private soloWatch: SoloEpisodeWatch | null = null;
  /** B6/B10 — last completed episode metrics for Train panels. */
  private lastEpisodeMetrics: TaskEpisodeMetrics | null = null;
  /** E5 — fired after live-gen champion score or solo replay episode. */
  onEpisodeComplete: ((snap: EpisodeCompleteSnapshot) => void) | null = null;

  async init(): Promise<void> {
    await initRapier();
    this.world = createWorld();
  }

  get isEvolving(): boolean {
    return this.live !== null;
  }

  get isHeadToHead(): boolean {
    return this.h2h !== null;
  }

  get isMultiDisco(): boolean {
    return this.discoDancers.length > 0;
  }

  loadDesign(design: CreatureDesign): void {
    if (!this.world) throw new Error('Simulation not initialized');
    this.clearDiscoDancers();
    this.abortHeadToHead();
    this.clearCohort();
    this.live = null;
    this.soloWatch = null;
    if (this.creature) {
      destroyCreature(this.world, this.creature);
      this.creature = null;
    }
    this.syncCourseForTask(this.task);
    this.syncEnvironmentGeometry();
    this.design = design;
    this.creature = spawnCreature(this.world, design, resolveSpawn(this.environment));
    this.manualDrives = this.creature.muscles.map(() => 0);
    this.brainDrives = this.creature.muscles.map(() => 0);
    this.time = 0;
    this.accumulator = 0;
    this.brainAccumulator = 0;
    this.running = true;
    if (this.driveMode === 'disco') {
      this.applyDiscoPuppetBodyTune();
    }
  }

  /** H2 — switch disco puppet feel; re-tunes staged dancers / solo disco body. */
  setDiscoPuppetMode(mode: DiscoPuppetMode): void {
    this.discoPuppetMode = mode;
    this.discoArenaFeel = true;
    this.applyDiscoPuppetBodyTune();
  }

  /** Channel-length brain drives (dance refine / diagnostics). */
  getBrainChannelDrives(): number[] {
    return this.brainDrives.slice();
  }

  /** Disco-only mass for marked foot joints. */
  setDiscoFootMass(mass: number): void {
    this.discoFootMass = Math.max(0.05, mass);
    this.applyDiscoFootMassTune();
  }

  private discoMuscleForceOptions(): MuscleForceOptions {
    const t = DISCO_PUPPET_MODES[this.discoPuppetMode];
    return {
      springMult: t.springMult,
      damperMult: t.damperMult,
      maxForceMult: t.maxForceMult,
      restLengthDrive: t.restLengthDrive,
    };
  }

  private applyDiscoFootMassTune(): void {
    const mass = this.discoFootMass;
    for (const d of this.discoDancers) {
      applyDiscoFootMass(d.creature, mass);
    }
    if (this.creature && this.discoDancers.length === 0) {
      applyDiscoFootMass(this.creature, mass);
    }
  }

  private applyDiscoPuppetBodyTune(): void {
    const t = DISCO_PUPPET_MODES[this.discoPuppetMode];
    for (const d of this.discoDancers) {
      applyCreatureBodyTune(
        d.creature,
        t.gravityScale,
        t.linearDamping,
        t.angularDamping,
      );
      applyDiscoFootMass(d.creature, this.discoFootMass);
    }
    // Solo arena creature (empty slots) — App only retunes while in Disco.
    if (this.creature && this.discoDancers.length === 0) {
      applyCreatureBodyTune(
        this.creature,
        t.gravityScale,
        t.linearDamping,
        t.angularDamping,
      );
      applyDiscoFootMass(this.creature, this.discoFootMass);
    }
  }

  /** Restore spawn defaults after leaving the disco arena. */
  clearDiscoPuppetBodyTune(): void {
    this.discoArenaFeel = false;
    if (this.creature && this.discoDancers.length === 0) {
      resetCreatureBodyTune(this.creature);
      restoreJointMassesFromDesign(this.creature, this.design);
    }
  }

  /**
   * Watch a single brain-driven episode (Play best) and emit metrics at the end.
   * Call after loadDesign + setBrain.
   */
  beginSoloEpisodeWatch(episodeSeconds = EPISODE_SECONDS): void {
    if (!this.creature || !this.design) return;
    const markers = activeCourseMarkers(this.environment);
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
      airHeightIntegral: 0,
      uprightSum: 0,
      uprightSteps: 0,
      peakSpeed: 0,
      peakDistance: 0,
      regionAccum: emptyScoreRegionAccum(),
      courseAccum: emptyCourseMarkerAccum(markers),
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

  setShowGhostPack(show: boolean): void {
    this.showGhostPack = show;
  }

  private syncCourseForTask(task: TaskId): void {
    if (!this.world) return;
    destroyCourse(this.world, this.course);
    this.course = null;
    destroyRoughCourse(this.world, this.roughCourse);
    this.roughCourse = null;
    if (task === 'climb' && isFeatureEnabled('climbCourse')) {
      this.course = spawnClimbCourse(this.world);
    }
    if (task === 'rough' && isFeatureEnabled('roughTerrainCourse')) {
      this.roughCourse = spawnRoughCourse(this.world);
    }
  }

  /** Active terrain for obs / plant / fall (course preferred over studio). */
  activeTerrain(): EnvironmentDesign['terrain'] {
    return this.observationContext().terrain;
  }

  private activeTerrainVisual(): TerrainVisual | null {
    return this.roughCourse?.terrain.visual ?? this.envTerrain?.visual ?? null;
  }

  /** Apply Environment Studio design (G1 / G3 / C2.4 when flagged). */
  setEnvironment(env: EnvironmentDesign): void {
    this.environment = cloneEnvironment(env);
    if (this.world) this.syncEnvironmentGeometry();
  }

  getEnvironment(): EnvironmentDesign {
    return cloneEnvironment(this.environment);
  }

  private observationContext(): {
    terrain: EnvironmentDesign['terrain'];
    timeSec: number;
  } {
    const timeSec = this.time;
    if (this.roughCourse?.design) {
      return { terrain: this.roughCourse.design, timeSec };
    }
    if (
      isFeatureEnabled('terrainHeightfield') &&
      this.environment.terrain &&
      this.environment.terrain.samples.length >= 2
    ) {
      return { terrain: this.environment.terrain, timeSec };
    }
    return { terrain: undefined, timeSec };
  }

  private syncEnvironmentGeometry(): void {
    if (!this.world) return;
    destroyObstacles(this.world, this.envObstacles);
    this.envObstacles = null;
    destroyTerrain(this.world, this.envTerrain);
    this.envTerrain = null;
    destroyTower(this.world, this.envTower);
    this.envTower = null;
    if (
      isFeatureEnabled('staticObstacles') &&
      this.environment.obstacles.length > 0
    ) {
      this.envObstacles = spawnStaticObstacles(
        this.world,
        this.environment.obstacles,
      );
    }
    if (
      isFeatureEnabled('terrainHeightfield') &&
      this.environment.terrain &&
      this.environment.terrain.samples.length >= 2
    ) {
      this.envTerrain = spawnTerrainHeightfield(
        this.world,
        this.environment.terrain,
      );
    }
    if (isFeatureEnabled('launchTower') && this.environment.tower) {
      this.envTower = spawnLaunchTower(this.world, this.environment.tower);
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

  /** Toggle brain eval rate (30 Hz default ↔ 60 Hz). Muscle forces stay at FIXED_DT. */
  setBrainHz(hz: BrainHz): void {
    if (this.brainHz === hz) return;
    this.brainHz = hz;
    this.brainAccumulator = 0;
    for (const member of this.cohort) {
      member.brainAccumulator = 0;
    }
  }

  private get brainDt(): number {
    return 1 / this.brainHz;
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

  /**
   * H5 — spawn up to six lateral disco dancers sharing one audio player.
   * Each slot supplies its own drive resolver (muscle count / design aware).
   */
  startMultiDisco(
    slots: DiscoDancerSlot[],
    resolveDrives: (index: number, design: CreatureDesign) => number[],
  ): void {
    if (!this.world) throw new Error('Simulation not initialized');
    if (slots.length === 0) {
      this.clearDiscoDancers();
      return;
    }

    this.clearCohort();
    this.live = null;
    this.h2h = null;
    this.h2hFinished = null;
    this.soloWatch = null;
    this.clearBrain();
    if (this.creature) {
      destroyCreature(this.world, this.creature);
      this.creature = null;
    }
    this.clearDiscoDancers();

    const spawn = resolveSpawn(this.environment);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const creature = spawnCreature(this.world, slot.design, {
        x: slot.offsetX,
        y: spawn.y,
      });
      this.discoDancers.push({
        design: slot.design,
        creature,
        muscleVisual: [],
        resolveDrives: () => resolveDrives(i, slot.design),
      });
    }

    this.design = slots[0].design;
    this.driveMode = 'disco';
    this.discoDriveProvider = null;
    this.time = 0;
    this.accumulator = 0;
    this.running = true;
    this.applyDiscoPuppetBodyTune();
  }

  clearDiscoDancers(): void {
    if (!this.world) {
      this.discoDancers = [];
      return;
    }
    for (const d of this.discoDancers) {
      destroyCreature(this.world, d.creature);
    }
    this.discoDancers = [];
  }

  /** World-space center of a disco dancer (joint average). */
  discoDancerCenter(index: number): { x: number; y: number } | null {
    const d = this.discoDancers[index];
    if (!d || d.creature.joints.length === 0) return null;
    let x = 0;
    let y = 0;
    for (const j of d.creature.joints) {
      const t = j.body.translation();
      x += t.x;
      y += t.y;
    }
    const n = d.creature.joints.length;
    return { x: x / n, y: y / n };
  }

  /**
   * Hit-test disco dancers for grab/drop placement.
   * Returns the nearest dancer whose joints enclose the point (padded AABB).
   */
  hitTestDiscoDancer(wx: number, wy: number): number | null {
    const PAD = 0.55;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < this.discoDancers.length; i++) {
      const d = this.discoDancers[i];
      if (d.creature.joints.length === 0) continue;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let cx = 0;
      let cy = 0;
      for (const j of d.creature.joints) {
        const t = j.body.translation();
        minX = Math.min(minX, t.x);
        maxX = Math.max(maxX, t.x);
        minY = Math.min(minY, t.y);
        maxY = Math.max(maxY, t.y);
        cx += t.x;
        cy += t.y;
      }
      const n = d.creature.joints.length;
      cx /= n;
      cy /= n;
      if (
        wx < minX - PAD ||
        wx > maxX + PAD ||
        wy < minY - PAD ||
        wy > maxY + PAD
      ) {
        continue;
      }
      const dist = Math.hypot(wx - cx, wy - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  /** Translate all rigid bodies of a disco dancer; zeros velocities. */
  translateDiscoDancer(index: number, dx: number, dy: number): void {
    const d = this.discoDancers[index];
    if (!d) return;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
    const moveBody = (body: { translation: () => { x: number; y: number }; setTranslation: (t: { x: number; y: number }, wake: boolean) => void; setLinvel: (v: { x: number; y: number }, wake: boolean) => void; setAngvel: (v: number, wake: boolean) => void }) => {
      const t = body.translation();
      body.setTranslation({ x: t.x + dx, y: t.y + dy }, true);
      body.setLinvel({ x: 0, y: 0 }, true);
      body.setAngvel(0, true);
    };
    for (const j of d.creature.joints) moveBody(j.body);
    for (const b of d.creature.bones) moveBody(b.body);
  }

  /** B20/I6 — timed dual-model gauntlet (fixed genomes, cohort of two). */
  startHeadToHead(options: HeadToHeadOptions): void {
    if (!this.world) throw new Error('Simulation not initialized');
    const [a, b] = options.entries;
    if (a.design.muscles.length === 0 || b.design.muscles.length === 0) {
      throw new Error('Both designs need muscles for head-to-head');
    }

    this.clearDiscoDancers();
    this.clearCohort();
    this.live = null;
    this.soloWatch = null;
    this.clearBrain();
    if (this.creature) {
      destroyCreature(this.world, this.creature);
      this.creature = null;
    }

    this.task = options.task;
    this.syncCourseForTask(options.task);
    this.syncEnvironmentGeometry();
    this.h2hFinished = null;

    const spawn = resolveSpawn(this.environment);
    const offsets = [-3.5, 3.5];
    const entries = [a, b];
    const markers = activeCourseMarkers(this.environment);

    for (let i = 0; i < 2; i++) {
      const entry = entries[i];
      const creature = spawnCreature(this.world, entry.design, {
        x: offsets[i],
        y: spawn.y,
      });
      this.cohort.push({
        creature,
        genomeIndex: i,
        weights: entry.weights,
        brainDrives: new Array(entry.shape.outputCount).fill(0),
        brainAccumulator: 0,
        lastObs: new Float32Array(entry.shape.inputCount),
        lastHidden: new Float32Array(entry.shape.hiddenCount),
        startX: avgJointX(creature),
        fallTime: 0,
        fell: false,
        footLifts: 0,
        planted: createFootLiftState(creature.joints.length),
        muscleVisual: [],
        peakHeight: 0,
        airTime: 0,
        airHeightIntegral: 0,
        uprightSum: 0,
        uprightSteps: 0,
        peakSpeed: 0,
        peakDistance: 0,
        regionAccum: emptyScoreRegionAccum(),
        courseAccum: emptyCourseMarkerAccum(markers),
        stall: createStallTracker(),
        memberDesign: cloneDesign(entry.design),
        memberShape: entry.shape,
      });
    }

    this.design = a.design;
    this.driveMode = 'brain';
    this.discoDriveProvider = null;
    this.time = 0;
    this.accumulator = 0;
    this.running = true;
    this.h2h = {
      task: options.task,
      episodeT: 0,
      episodeDuration: options.episodeSeconds ?? EPISODE_SECONDS,
      onProgress: options.onProgress,
      onFinished: options.onFinished,
    };
  }

  abortHeadToHead(): void {
    if (!this.h2h && !this.h2hFinished) return;
    const design =
      this.cohort[0]?.memberDesign ?? this.design ?? null;
    this.clearCohort();
    this.h2h = null;
    this.h2hFinished = null;
    if (!this.world || !design) return;
    this.creature = spawnCreature(
      this.world,
      design,
      resolveSpawn(this.environment),
    );
    this.design = design;
    this.manualDrives = this.creature.muscles.map(() => 0);
    this.brainDrives = this.creature.muscles.map(() => 0);
    this.driveMode = 'idle';
    this.time = 0;
    this.accumulator = 0;
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
    const baseEpisodeSeconds = options.episodeSeconds ?? EPISODE_SECONDS;
    const breedOpts = options.breed ?? {};
    const breed = {
      eliteCount: breedOpts.eliteCount ?? ELITE_COUNT,
      tournamentSize: breedOpts.tournamentSize ?? TOURNAMENT_SIZE,
      mutationSigma: breedOpts.mutationSigma ?? MUTATION_SIGMA,
      mutationResetRate: breedOpts.mutationResetRate ?? MUTATION_RESET_RATE,
      crossover: breedOpts.crossover ?? false,
      annealMutation: breedOpts.annealMutation ?? false,
      shortTriesFirst: breedOpts.shortTriesFirst ?? false,
      stopAfterFall: breedOpts.stopAfterFall ?? false,
    };
    const episodeDuration = adaptiveEpisodeSeconds(
      baseEpisodeSeconds,
      0,
      breed.shortTriesFirst,
    );
    const rng = createRng(options.seed ?? 1);
    const shape = shapeForDesign(design);
    const mutOpts = {
      mutationSigma: breed.mutationSigma,
      mutationResetRate: breed.mutationResetRate,
    };

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

    const morphEvolve =
      !!options.morphEvolve && isFeatureEnabled('morphEvolve');
    const messyBodies =
      !!options.messyBodies && isFeatureEnabled('trainExperiences');
    const baseMorph = morphEvolve ? zeroMorphGenes(design) : undefined;
    const seedMorph =
      morphEvolve && options.seedGenome?.morph
        ? cloneMorphGenes(options.seedGenome.morph)
        : baseMorph
          ? cloneMorphGenes(baseMorph)
          : undefined;

    const population: Genome[] = [];
    if (options.seedGenome) {
      const elite = cloneWeights(options.seedGenome.weights);
      population.push({
        weights: elite,
        fitness: 0,
        morph: seedMorph ? cloneMorphGenes(seedMorph) : undefined,
      });
      while (population.length < popSize) {
        population.push({
          weights: mutate(options.seedGenome.weights, rng, mutOpts),
          fitness: 0,
          morph:
            morphEvolve && seedMorph
              ? mutateMorphGenes(seedMorph, rng, mutOpts.mutationSigma)
              : undefined,
        });
      }
    } else {
      for (let i = 0; i < popSize; i++) {
        population.push({
          weights: randomWeights(shape, rng),
          fitness: 0,
          morph:
            morphEvolve && baseMorph
              ? i === 0
                ? cloneMorphGenes(baseMorph)
                : mutateMorphGenes(baseMorph, rng, mutOpts.mutationSigma)
              : undefined,
        });
      }
    }

    this.clearCohort();
    this.clearDiscoDancers();
    this.h2h = null;
    this.h2hFinished = null;
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
    this.syncEnvironmentGeometry();

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
      baseEpisodeSeconds,
      focusIndex: 0,
      rng,
      bestOverall: {
        weights: cloneWeights(population[0]!.weights),
        fitness: -Infinity,
        morph: population[0]!.morph
          ? cloneMorphGenes(population[0]!.morph)
          : undefined,
      },
      genBestMetrics: null,
      genBestFitness: -Infinity,
      genBestStall: null,
      genBestMorph: undefined,
      displayMeanFitness: 0,
      stopRequested: false,
      status: 'Starting…',
      breed,
      priorities: options.priorities ?? { ...DEFAULT_GOAL_PRIORITIES },
      morphEvolve,
      messyBodies,
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
    if (this.h2h) {
      this.h2h.episodeDuration = duration;
    }
  }

  /** Immediately tear down a live evolve session (e.g. design changed). */
  abortLiveEvolve(): void {
    if (!this.live || !this.world) return;
    const design = this.live.design;
    this.clearCohort();
    this.clearDiscoDancers();
    this.h2h = null;
    this.live = null;
    this.soloWatch = null;
    this.creature = spawnCreature(
      this.world,
      design,
      resolveSpawn(this.environment),
    );
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
    if (!this.live && !this.creature && this.discoDancers.length === 0 && !this.h2h && !this.h2hFinished) {
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

    if (this.h2h) {
      this.physicsStepHeadToHead(dt);
      return;
    }

    if (this.isHeadToHeadView() && this.h2hFinished) {
      return;
    }

    if (this.discoDancers.length > 0) {
      this.physicsStepMultiDisco(dt);
      return;
    }

    if (!this.creature) return;

    if (this.driveMode === 'brain') {
      this.tickBrainSingle(dt);
    }

    const drives = this.resolveMuscleDrivesSingle();
    if (this.driveMode === 'disco') {
      this.tickDiscoSample(dt, drives);
    }
    resetCreatureForces(this.creature);
    applyMuscleForces(
      this.creature.muscles,
      drives,
      this.muscleVisual,
      this.discoArenaFeel ? this.discoMuscleForceOptions() : undefined,
    );
    applyExtraForces(this.creature, drives);

    syncCreatureSoftCcd(this.creature);
    this.world.timestep = dt;
    this.world.step();
    // Plant slide brake: Idle settle + brain/evolve scoot.
    // Skip flight/motor and disco freestyle (dance brain + arena feel).
    const skipPlantBrake =
      this.task === 'flight' ||
      this.task === 'motor' ||
      (this.discoArenaFeel &&
        this.driveMode === 'brain' &&
        this.brainShape?.inputCount === DANCE_OBS_COUNT);
    if (!skipPlantBrake) {
      applyPlantSlideBrake(
        this.creature,
        this.activeTerrain(),
        this.world,
        this.envObstacles,
      );
    }
    this.time += dt;
    this.tickSoloWatch(dt);
  }

  /** H6 — emit dance obs + teacher drives at brain rate while disco. */
  private tickDiscoSample(dt: number, muscleDrives: number[]): void {
    if (!this.discoSampleHook || !this.creature) {
      this.discoSampleAccumulator = 0;
      return;
    }
    this.discoSampleAccumulator += dt;
    while (this.discoSampleAccumulator >= BRAIN_DT) {
      this.discoSampleAccumulator -= BRAIN_DT;
      const bands = this.audioObsProvider?.() ?? null;
      const lookahead = this.audioLookaheadProvider?.() ?? null;
      buildDanceObservations(
        this.creature,
        bands,
        this.discoSampleObsBuf,
        this.observationContext(),
        lookahead,
      );
      this.discoSampleHook({
        obs: this.discoSampleObsBuf,
        muscleDrives,
      });
    }
  }

  private tickSoloWatch(dt: number): void {
    const watch = this.soloWatch;
    if (!watch || !this.creature || this.driveMode !== 'brain') return;
    const terrain = this.activeTerrain();
    const regions = activeScoreRegions(this.environment);
    const markers = activeCourseMarkers(this.environment);

    if (!watch.fell) {
      const fall = updateFallState(this.creature, watch.fallTime, dt, terrain);
      watch.fallTime = fall.fallTime;
      if (fall.fell) watch.fell = true;
    }
    watch.peakDistance = Math.max(
      watch.peakDistance,
      avgJointX(this.creature) - watch.startX,
    );
    // Freeze posture / lift accounting after a fall so thrash doesn't erase quality.
    if (!watch.fell) {
      watch.footLifts += updateFootLiftState(
        this.creature,
        watch.planted,
        terrain,
      );
      watch.uprightSum += instantUprightQuality(this.creature);
      watch.uprightSteps++;
      watch.peakSpeed = Math.max(watch.peakSpeed, avgJointVelX(this.creature));
    }
    const track = updateJumpFlightTrackers(
      this.creature,
      dt,
      watch.peakHeight,
      watch.airTime,
      watch.airHeightIntegral,
    );
    watch.peakHeight = track.peakHeight;
    watch.airTime = track.airTime;
    watch.airHeightIntegral = track.airHeightIntegral;
    watch.regionAccum = updateScoreRegionAccum(
      this.creature,
      regions,
      dt,
      watch.regionAccum,
    );
    watch.courseAccum = updateCourseMarkerAccum(
      this.creature,
      markers,
      watch.episodeT + dt,
      watch.courseAccum,
    );
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
      track.meanAirHeight,
      watch.regionAccum,
      watch.courseAccum,
      watch.peakSpeed,
      watch.episodeT,
      watch.peakDistance,
    );
    const snap: EpisodeCompleteSnapshot = {
      task: watch.task,
      metrics,
      design: watch.design,
      episodeSeconds: watch.episodeDuration,
      context: 'replay',
    };
    this.lastEpisodeMetrics = metrics;
    this.soloWatch = null;
    this.onEpisodeComplete?.(snap);
  }

  private physicsStepMultiDisco(dt: number): void {
    if (!this.world) return;

    const muscleOpts = this.discoMuscleForceOptions();
    let firstDrives: number[] | null = null;
    for (let di = 0; di < this.discoDancers.length; di++) {
      const dancer = this.discoDancers[di];
      const drives = dancer.resolveDrives();
      const n = dancer.creature.muscles.length;
      const muscleDrives =
        drives.length === n
          ? drives
          : Array.from({ length: n }, (_, i) => drives[i] ?? 0);
      if (di === 0) firstDrives = muscleDrives;
      resetCreatureForces(dancer.creature);
      applyMuscleForces(
        dancer.creature.muscles,
        muscleDrives,
        dancer.muscleVisual,
        muscleOpts,
      );
      applyExtraForces(dancer.creature, muscleDrives);
      if (this.task !== 'flight' && this.task !== 'motor') {
        applyPlantSlideBrake(
          dancer.creature,
          this.activeTerrain(),
          this.world,
          this.envObstacles,
        );
      }
    }

    // H6 — record from the primary dancer when only one is staged.
    if (
      this.discoSampleHook &&
      this.discoDancers.length === 1 &&
      firstDrives
    ) {
      const dancer = this.discoDancers[0];
      this.discoSampleAccumulator += dt;
      while (this.discoSampleAccumulator >= BRAIN_DT) {
        this.discoSampleAccumulator -= BRAIN_DT;
        const bands = this.audioObsProvider?.() ?? null;
        const lookahead = this.audioLookaheadProvider?.() ?? null;
        buildDanceObservations(
          dancer.creature,
          bands,
          this.discoSampleObsBuf,
          this.observationContext(),
          lookahead,
        );
        this.discoSampleHook({
          obs: this.discoSampleObsBuf,
          muscleDrives: firstDrives,
        });
      }
    }

    for (const dancer of this.discoDancers) {
      syncCreatureSoftCcd(dancer.creature);
    }
    this.world.timestep = dt;
    this.world.step();
    this.time += dt;
  }

  private physicsStepHeadToHead(dt: number): void {
    if (!this.world || !this.h2h) return;

    for (const member of this.cohort) {
      const shape = member.memberShape;
      if (!shape) continue;
      if (member.fell) {
        resetCreatureForces(member.creature);
        continue;
      }
      const muscleDefs =
        member.memberDesign?.muscles ?? this.design?.muscles ?? [];
      this.tickBrainMember(member, shape, dt);
      const muscleDrives = expandChannelDrives(muscleDefs, member.brainDrives);
      resetCreatureForces(member.creature);
      applyMuscleForces(
        member.creature.muscles,
        muscleDrives,
        member.muscleVisual,
      );
      applyExtraForces(member.creature, muscleDrives);

      const fall = updateFallState(
        member.creature,
        member.fallTime,
        dt,
        this.activeTerrain(),
      );
      member.fallTime = fall.fallTime;
      if (fall.fell) member.fell = true;
    }

    for (const member of this.cohort) {
      syncCreatureSoftCcd(member.creature);
    }
    this.world.timestep = dt;
    this.world.step();
    this.time += dt;
    this.h2h.episodeT += dt;

    const terrain = this.activeTerrain();
    if (this.h2h.task !== 'flight' && this.h2h.task !== 'motor') {
      for (const member of this.cohort) {
        if (!member.fell) {
          applyPlantSlideBrake(
            member.creature,
            terrain,
            this.world,
            this.envObstacles,
          );
        }
      }
    }

    const regions = activeScoreRegions(this.environment);
    const markers = activeCourseMarkers(this.environment);
    for (const member of this.cohort) {
      member.peakDistance = Math.max(
        member.peakDistance,
        avgJointX(member.creature) - member.startX,
      );
      if (!member.fell) {
        member.footLifts += updateFootLiftState(
          member.creature,
          member.planted,
          terrain,
        );
        member.uprightSum += instantUprightQuality(member.creature);
        member.uprightSteps++;
        member.peakSpeed = Math.max(
          member.peakSpeed,
          avgJointVelX(member.creature),
        );
      }
      const track = updateJumpFlightTrackers(
        member.creature,
        dt,
        member.peakHeight,
        member.airTime,
        member.airHeightIntegral,
      );
      member.peakHeight = track.peakHeight;
      member.airTime = track.airTime;
      member.airHeightIntegral = track.airHeightIntegral;
      member.regionAccum = updateScoreRegionAccum(
        member.creature,
        regions,
        dt,
        member.regionAccum,
      );
      member.courseAccum = updateCourseMarkerAccum(
        member.creature,
        markers,
        this.h2h.episodeT,
        member.courseAccum,
      );
    }

    this.h2h.onProgress?.(this.h2h.episodeT, this.h2h.episodeDuration);

    if (this.h2h.episodeT < this.h2h.episodeDuration) return;

    const task = this.h2h.task;
    const fitness: [number, number] = [0, 0];
    const metrics: [TaskEpisodeMetrics, TaskEpisodeMetrics] = [
      emptyMetrics(),
      emptyMetrics(),
    ];
    for (let i = 0; i < this.cohort.length && i < 2; i++) {
      const member = this.cohort[i];
      const uprightMean =
        member.uprightSteps > 0 ? member.uprightSum / member.uprightSteps : 1;
      const meanAirHeight =
        member.airTime > 1e-6
          ? member.airHeightIntegral / member.airTime
          : 0;
      const result = scoreTaskPerformance(
        task,
        member.creature,
        member.startX,
        member.fell,
        member.footLifts,
        member.peakHeight,
        member.airTime,
        uprightMean,
        meanAirHeight,
        member.regionAccum,
        member.courseAccum,
        member.peakSpeed,
        this.h2h.episodeT,
        member.peakDistance,
      );
      fitness[i] = result.fitness;
      metrics[i] = result;
    }

    const onFinished = this.h2h.onFinished;
    const episodeDuration = this.h2h.episodeDuration;
    const finished: HeadToHeadResult = { fitness, metrics };
    this.lastEpisodeMetrics = metrics[0];
    this.h2h = null;
    this.h2hFinished = finished;
    this.driveMode = 'idle';
    onFinished?.(finished);
    this.onEpisodeComplete?.({
      task,
      metrics: metrics[0],
      design: this.cohort[0]?.memberDesign ?? this.design!,
      episodeSeconds: episodeDuration,
      context: 'replay',
    });
  }

  private physicsStepCohort(dt: number): void {
    if (!this.world || !this.live) return;

    for (const member of this.cohort) {
      // Freeze actuators after a fall so post-tumble thrash cannot erase progress.
      if (member.fell) {
        resetCreatureForces(member.creature);
        continue;
      }
      this.tickBrainMember(member, this.live.shape, dt);
      const muscleDefs =
        member.memberDesign?.muscles ?? this.live.design.muscles;
      const muscleDrives = expandChannelDrives(muscleDefs, member.brainDrives);
      resetCreatureForces(member.creature);
      applyMuscleForces(
        member.creature.muscles,
        muscleDrives,
        member.muscleVisual,
      );
      applyExtraForces(member.creature, muscleDrives);

      const fall = updateFallState(
        member.creature,
        member.fallTime,
        dt,
        this.activeTerrain(),
      );
      member.fallTime = fall.fallTime;
      if (fall.fell) member.fell = true;
    }

    for (const member of this.cohort) {
      syncCreatureSoftCcd(member.creature);
    }
    this.world.timestep = dt;
    this.world.step();
    this.time += dt;
    this.live.episodeT += dt;

    const terrain = this.activeTerrain();
    if (this.live.task !== 'flight' && this.live.task !== 'motor') {
      for (const member of this.cohort) {
        if (!member.fell) {
          applyPlantSlideBrake(
            member.creature,
            terrain,
            this.world,
            this.envObstacles,
          );
        }
      }
    }

    const regions = activeScoreRegions(this.environment);
    const markers = activeCourseMarkers(this.environment);
    for (const member of this.cohort) {
      const dist = avgJointX(member.creature) - member.startX;
      member.peakDistance = Math.max(member.peakDistance, dist);
      if (this.world) {
        noteStallProgress(
          member.stall,
          this.world,
          member.creature,
          this.envObstacles,
          {
            episodeT: this.live!.episodeT,
            startX: member.startX,
            distance: dist,
            terrain,
          },
        );
      }
      if (!member.fell) {
        member.footLifts += updateFootLiftState(
          member.creature,
          member.planted,
          terrain,
        );
        member.uprightSum += instantUprightQuality(member.creature);
        member.uprightSteps++;
        member.peakSpeed = Math.max(
          member.peakSpeed,
          avgJointVelX(member.creature),
        );
      }
      const track = updateJumpFlightTrackers(
        member.creature,
        dt,
        member.peakHeight,
        member.airTime,
        member.airHeightIntegral,
      );
      member.peakHeight = track.peakHeight;
      member.airTime = track.airTime;
      member.airHeightIntegral = track.airHeightIntegral;
      member.regionAccum = updateScoreRegionAccum(
        member.creature,
        regions,
        dt,
        member.regionAccum,
      );
      member.courseAccum = updateCourseMarkerAccum(
        member.creature,
        markers,
        this.live!.episodeT,
        member.courseAccum,
      );
    }

    const allFell =
      this.live.breed.stopAfterFall &&
      this.cohort.length > 0 &&
      this.cohort.every((m) => m.fell);

    if (this.live.episodeT >= this.live.episodeDuration || allFell) {
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
      const meanAirHeight =
        member.airTime > 1e-6
          ? member.airHeightIntegral / member.airTime
          : 0;
      const result = scoreTaskPerformance(
        live.task,
        member.creature,
        member.startX,
        member.fell,
        member.footLifts,
        member.peakHeight,
        member.airTime,
        uprightMean,
        meanAirHeight,
        member.regionAccum,
        member.courseAccum,
        member.peakSpeed,
        live.episodeT,
        member.peakDistance,
      );
      result.fitness = applyGoalPriorities(result.fitness, {
        distance: result.distance,
        uprightQuality: result.uprightQuality,
        fell: result.fell,
        priorities: live.priorities,
      });
      live.population[member.genomeIndex].fitness = result.fitness;
      if (result.fitness > live.bestOverall.fitness) {
        const g = live.population[member.genomeIndex]!;
        live.bestOverall = {
          weights: cloneWeights(g.weights),
          fitness: result.fitness,
          morph: g.morph ? cloneMorphGenes(g.morph) : undefined,
        };
      }
      if (result.fitness > live.genBestFitness) {
        live.genBestFitness = result.fitness;
        live.genBestMetrics = result;
        live.genBestMorph = live.population[member.genomeIndex]?.morph
          ? cloneMorphGenes(live.population[member.genomeIndex]!.morph!)
          : undefined;
        if (this.world) {
          live.genBestStall = finalizeStallDiagnostics(
            member.stall,
            this.world,
            member.creature,
            this.envObstacles,
            {
              episodeT: live.episodeT,
              startX: member.startX,
              distance: result.distance,
              terrain: this.activeTerrain(),
            },
          );
        }
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

    const sigma = annealedMutationSigma(
      live.breed.mutationSigma,
      live.generation + 1,
      live.maxGenerations,
      live.breed.annealMutation,
    );
    live.population = breedNextGeneration(
      live.population,
      live.popSize,
      live.rng,
      {
        eliteCount: live.breed.eliteCount,
        tournamentSize: live.breed.tournamentSize,
        mutationSigma: sigma,
        mutationResetRate: live.breed.mutationResetRate,
        crossover: live.breed.crossover,
        morphEvolve: live.morphEvolve,
      },
    );
    live.generation += 1;
    live.batchIndex = 0;
    live.batchCount = Math.ceil(live.popSize / live.batchSize);
    live.episodeDuration = adaptiveEpisodeSeconds(
      live.baseEpisodeSeconds,
      live.generation,
      live.breed.shortTriesFirst,
    );
    live.genBestMetrics = null;
    live.genBestFitness = -Infinity;
    live.genBestStall = null;
    live.genBestMorph = undefined;
    live.status = `Gen ${live.generation} · batch 1/${live.batchCount}`;
    this.spawnCurrentBatch();
    this.emitEvolveProgress(0);
  }

  private emitGenChampionEpisode(live: LiveEvolveState): void {
    const metrics = live.genBestMetrics ?? emptyMetrics();
    this.lastEpisodeMetrics = metrics;
    const genBest = live.population[0]?.fitness ?? metrics.fitness;
    this.onEpisodeComplete?.({
      task: live.task,
      metrics,
      design: live.design,
      episodeSeconds: live.episodeDuration,
      generation: live.generation,
      context: 'evolve',
      meanFitness: live.displayMeanFitness,
      runBestFitness:
        live.bestOverall.fitness === -Infinity ? genBest : live.bestOverall.fitness,
      populationSize: live.popSize,
      stall: live.genBestStall,
      morph: live.genBestMorph,
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
    this.creature = spawnCreature(
      this.world,
      live.design,
      resolveSpawn(this.environment),
    );
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
      const genome = live.population[genomeIndex]!;
      let memberDesign = applyMorphToDesign(live.design, genome.morph);
      if (live.messyBodies) {
        memberDesign = applyMessyBodyJitter(memberDesign, live.rng);
      }
      const creature = spawnCreature(
        this.world,
        memberDesign,
        resolveSpawn(this.environment),
      );
      const markers = activeCourseMarkers(this.environment);
      this.cohort.push({
        creature,
        genomeIndex,
        weights: genome.weights,
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
        airHeightIntegral: 0,
        uprightSum: 0,
        uprightSteps: 0,
        peakSpeed: 0,
        peakDistance: 0,
        regionAccum: emptyScoreRegionAccum(),
        courseAccum: emptyCourseMarkerAccum(markers),
        stall: createStallTracker(),
        memberDesign,
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
    const brainDt = this.brainDt;
    this.brainAccumulator += dt;
    while (this.brainAccumulator >= brainDt) {
      this.brainAccumulator -= brainDt;
      if (this.brainShape.inputCount === DANCE_OBS_COUNT) {
        if (this.obsBuf.length < DANCE_OBS_COUNT) {
          this.obsBuf = new Float32Array(DANCE_OBS_COUNT);
        }
        const bands = this.audioObsProvider?.() ?? null;
        const lookahead = this.audioLookaheadProvider?.() ?? null;
        buildDanceObservations(
          this.creature,
          bands,
          this.obsBuf,
          this.observationContext(),
          lookahead,
        );
      } else {
        buildObservations(this.creature, this.obsBuf, this.observationContext());
      }
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
    const brainDt = this.brainDt;
    member.brainAccumulator += dt;
    while (member.brainAccumulator >= brainDt) {
      member.brainAccumulator -= brainDt;
      buildObservations(member.creature, this.obsBuf, this.observationContext());
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
    if (this.h2h && this.cohort.length > 0) {
      return this.cohort[0].creature.muscles;
    }
    if (this.discoDancers.length > 0) {
      return this.discoDancers[0].creature.muscles;
    }
    if (this.live && this.cohort.length > 0) {
      const idx = this.live.focusIndex % this.cohort.length;
      return this.cohort[idx].creature.muscles;
    }
    return this.creature?.muscles ?? [];
  }

  private liveStatsFromMember(
    member: CohortMember,
    task: TaskId,
    episodeSimTime: number,
  ): LiveFocusStats {
    const uprightMean =
      member.uprightSteps > 0 ? member.uprightSum / member.uprightSteps : 1;
    const meanAirHeight =
      member.airTime > 1e-6
        ? member.airHeightIntegral / member.airTime
        : 0;
    const scored = scoreTaskPerformance(
      task,
      member.creature,
      member.startX,
      member.fell,
      member.footLifts,
      member.peakHeight,
      member.airTime,
      uprightMean,
      meanAirHeight,
      member.regionAccum,
      member.courseAccum,
      member.peakSpeed,
      episodeSimTime,
      member.peakDistance,
    );
    return {
      distance: scored.distance,
      footLifts: scored.footLifts,
      peakHeight: scored.peakHeight,
      airTime: scored.airTime,
      fell: scored.fell,
      uprightQuality: scored.uprightQuality,
      fitness: scored.fitness,
      courseArmed: scored.courseArmed,
      raceTime: scored.raceTime,
      checkpointsHit: scored.checkpointsHit,
      finished: scored.finished,
    };
  }

  private liveStatsFromSolo(): LiveFocusStats | null {
    const watch = this.soloWatch;
    if (!watch || !this.creature) return null;
    const uprightMean =
      watch.uprightSteps > 0 ? watch.uprightSum / watch.uprightSteps : 1;
    const meanAirHeight =
      watch.airTime > 1e-6
        ? watch.airHeightIntegral / watch.airTime
        : 0;
    const scored = scoreTaskPerformance(
      watch.task,
      this.creature,
      watch.startX,
      watch.fell,
      watch.footLifts,
      watch.peakHeight,
      watch.airTime,
      uprightMean,
      meanAirHeight,
      watch.regionAccum,
      watch.courseAccum,
      watch.peakSpeed,
      watch.episodeT,
      watch.peakDistance,
    );
    return {
      distance: scored.distance,
      footLifts: scored.footLifts,
      peakHeight: scored.peakHeight,
      airTime: scored.airTime,
      fell: scored.fell,
      uprightQuality: scored.uprightQuality,
      fitness: scored.fitness,
      courseArmed: scored.courseArmed,
      raceTime: scored.raceTime,
      checkpointsHit: scored.checkpointsHit,
      finished: scored.finished,
    };
  }

  private headToHeadSnapshot(): HeadToHeadSnapshot | null {
    const task = this.h2h?.task ?? this.task;
    if (this.cohort.length < 2) return null;
    const episodeT = this.h2h?.episodeT ?? 0;
    const stats = this.cohort.slice(0, 2).map((m) =>
      this.liveStatsFromMember(m, task, episodeT),
    );
    if (this.h2hFinished) {
      return {
        episodeT: 0,
        episodeDuration: 0,
        fitness: this.h2hFinished.fitness,
        names: [
          this.cohort[0]?.memberDesign?.name ?? 'A',
          this.cohort[1]?.memberDesign?.name ?? 'B',
        ],
      };
    }
    if (!this.h2h) return null;
    return {
      episodeT: this.h2h.episodeT,
      episodeDuration: this.h2h.episodeDuration,
      fitness: [stats[0]?.fitness ?? 0, stats[1]?.fitness ?? 0],
      names: [
        this.cohort[0]?.memberDesign?.name ?? 'A',
        this.cohort[1]?.memberDesign?.name ?? 'B',
      ],
    };
  }

  private isHeadToHeadView(): boolean {
    return (
      this.cohort.length >= 2 &&
      this.cohort[0].memberDesign !== undefined &&
      (this.h2h !== null || this.h2hFinished !== null)
    );
  }

  private agentCenter(agent: AgentSnapshot): { x: number; y: number } {
    if (agent.joints.length === 0) return { x: 0, y: 2 };
    return {
      x: agent.joints.reduce((s, j) => s + j.x, 0) / agent.joints.length,
      y: agent.joints.reduce((s, j) => s + j.y, 0) / agent.joints.length,
    };
  }

  snapshot(): SimulationSnapshot {
    if (this.live && this.cohort.length > 0) {
      const focus = Math.min(
        this.live.focusIndex,
        Math.max(0, this.cohort.length - 1),
      );
      const allAgents = this.cohort.map((m, i) =>
        agentFromCreature(
          m.creature,
          m.muscleVisual,
          i === focus ? 1 : GHOST_OPACITY,
          i === focus,
          this.live!.design.appearance,
        ),
      );
      const agents = this.showGhostPack
        ? allAgents
        : [allAgents[focus]];
      const focused = allAgents[focus];
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
        obstacles: this.envObstacles?.visuals ?? [],
        terrain: this.activeTerrainVisual(),
        tower: this.envTower?.visuals ?? [],
        scoreRegions: activeScoreRegions(this.environment),
        courseMarkers: activeCourseMarkers(this.environment),
        liveStats: this.liveStatsFromMember(
          this.cohort[focus],
          this.live.task,
          this.live.episodeT,
        ),
        lastEpisodeMetrics: this.lastEpisodeMetrics,
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
        headToHead: null,
        hideMuscles: this.hideMuscles,
        hideBones: this.hideBones,
      };
    }

    if (this.isHeadToHeadView()) {
      const task = this.h2h?.task ?? this.task;
      const allAgents = this.cohort.slice(0, 2).map((m, i) =>
        agentFromCreature(
          m.creature,
          m.muscleVisual,
          1,
          i === 0,
          m.memberDesign?.appearance,
        ),
      );
      const c0 = this.agentCenter(allAgents[0]);
      const c1 = this.agentCenter(allAgents[1]);
      const focusX = (c0.x + c1.x) / 2;
      const focusY = (c0.y + c1.y) / 2;
      return {
        joints: allAgents[0].joints,
        bones: allAgents[0].bones,
        muscles: allAgents[0].muscles,
        time: this.time,
        agents: allAgents,
        focusX,
        focusY,
        cameraFollow: true,
        appearance: this.cohort[0].memberDesign?.appearance,
        task,
        extrapolateDt: Math.min(this.accumulator, FIXED_DT),
        brain: null,
        obstacles: this.envObstacles?.visuals ?? [],
        terrain: this.activeTerrainVisual(),
        tower: this.envTower?.visuals ?? [],
        scoreRegions: activeScoreRegions(this.environment),
        courseMarkers: activeCourseMarkers(this.environment),
        liveStats: this.liveStatsFromMember(
          this.cohort[0],
          task,
          this.h2h?.episodeT ?? 0,
        ),
        lastEpisodeMetrics: this.lastEpisodeMetrics,
        evolve: null,
        headToHead: this.headToHeadSnapshot(),
        hideMuscles: this.hideMuscles,
        hideBones: this.hideBones,
      };
    }

    if (this.discoDancers.length > 0) {
      const allAgents = this.discoDancers.map((d, i) =>
        agentFromCreature(
          d.creature,
          d.muscleVisual,
          1,
          i === 0,
          d.design.appearance,
        ),
      );
      let focusX = 0;
      let focusY = 2;
      if (allAgents.length > 0) {
        const centers = allAgents.map((a) => this.agentCenter(a));
        focusX = centers.reduce((s, c) => s + c.x, 0) / centers.length;
        focusY = centers.reduce((s, c) => s + c.y, 0) / centers.length;
      }
      const lead = allAgents[0] ?? {
        joints: [],
        bones: [],
        muscles: [],
        opacity: 1,
        focused: true,
      };
      return {
        joints: lead.joints,
        bones: lead.bones,
        muscles: lead.muscles,
        time: this.time,
        agents: allAgents,
        focusX,
        focusY,
        // Arena overview — SimCanvas applies a fixed zoom-out in Disco.
        cameraFollow: false,
        appearance: this.discoDancers[0].design.appearance,
        task: this.task,
        extrapolateDt: Math.min(this.accumulator, FIXED_DT),
        brain: null,
        obstacles: this.envObstacles?.visuals ?? [],
        terrain: this.activeTerrainVisual(),
        tower: this.envTower?.visuals ?? [],
        scoreRegions: activeScoreRegions(this.environment),
        courseMarkers: activeCourseMarkers(this.environment),
        liveStats: null,
        lastEpisodeMetrics: this.lastEpisodeMetrics,
        evolve: null,
        headToHead: null,
        hideMuscles: this.hideMuscles,
        hideBones: this.hideBones,
      };
    }

    const primary = this.creature
      ? agentFromCreature(
          this.creature,
          this.muscleVisual,
          1,
          true,
          this.design?.appearance,
        )
      : {
          joints: [],
          bones: [],
          muscles: [],
          opacity: 1,
          focused: true,
          appearance: this.design?.appearance,
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
      obstacles: this.envObstacles?.visuals ?? [],
      terrain: this.activeTerrainVisual(),
      tower: this.envTower?.visuals ?? [],
      scoreRegions: activeScoreRegions(this.environment),
      courseMarkers: activeCourseMarkers(this.environment),
      liveStats: this.liveStatsFromSolo(),
      lastEpisodeMetrics: this.lastEpisodeMetrics,
      evolve: null,
      headToHead: null,
      hideMuscles: this.hideMuscles,
      hideBones: this.hideBones,
    };
  }
}
