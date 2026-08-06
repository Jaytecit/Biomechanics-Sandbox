import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BRAIN_HZ,
  BRAIN_HZ_FAST,
  EPISODE_LENGTH_PRESETS,
  EPISODE_SECONDS,
  LIVE_BATCH_SIZE,
  LIVE_POPULATION_SIZE,
  type BrainHz,
} from "./brain/constants";
import {
  DEFAULT_GOAL_PRIORITIES,
  DEFAULT_RUN_STAGES,
  type GoalPriorities,
} from "./brain/goalPriorities";
import {
  applyCourseCurriculumStage,
  clampCourseStageIndex,
  curriculumForPackageId,
} from "./env/courseCurriculum";
import {
  defaultGaKnobSet,
  loadGaKnobSet,
  saveGaKnobSet,
  type GaKnobSet,
} from "./brain/trainingRecipes";
import {
  collapseMuscleDrivesToChannels,
  normalizeDriveGroup,
} from "./brain/driveGroups";
import {
  fitMultiTrackImitation,
  refineDanceBrain,
} from "./brain/danceCurriculum";
import { DANCE_OBS_PACK_VERSION } from "./brain/danceObs";
import {
  fitImitation,
  imitationFitness,
} from "./brain/imitate";
import type { EvolutionProgress, Genome, NetworkShape } from "./brain/types";
import {
  analyzeTrainTelemetry,
  appendTrainTelemetryGen,
  beginTrainTelemetrySession,
  exportTrainTelemetryJson,
  finalizeTrainTelemetry,
  morphSummaryForGenes,
  telemetryFilename,
  TRAIN_TELEMETRY_WINDOW,
  type TrainTelemetrySession,
} from "./brain/trainTelemetry";
import {
  anyDiscoAutoEnabled,
  createDiscoAudioPlayer,
  createDiscoAutoTickState,
  DEFAULT_DISCO_AUTO,
  DEFAULT_DISCO_MOTION,
  DEFAULT_DISCO_REACTIVITY,
  DEFAULT_DISCO_ROUTING,
  DEFAULT_DISCO_TRACK_NAME,
  DEFAULT_DISCO_TRACK_URL,
  tickDiscoAuto,
  type DiscoAutoFlags,
  type DiscoBandRouting,
  type DiscoMotionControls,
  type DiscoReactivityGains,
} from "./audio/audioAnalysis";
import { MultiTrackDanceDataset } from "./audio/discoDataset";
import { discoDancerOffsets, resolveDiscoDrives } from "./audio/discoMode";
import {
  addPlaylistFiles,
  disposePlaylist,
  playlistFingerprint,
  removePlaylistTrack,
  type DiscoPlaylistTrack,
} from "./audio/discoPlaylist";
import {
  DiscoRecordBuffer,
  DISCO_RECORD_MIN_SAMPLES,
} from "./audio/discoRecord";
import {
  analyzeAudioFile,
  lookaheadAtTime,
} from "./audio/trackAnalysis";
import { ULTI_GROOVE_BOT_II } from "./creature/ultiGrooveBotII";
import {
  addBodyPartToBone,
  addBodyPartToJoint,
  removeBodyPart,
  updateBodyPart,
} from "./appearance/bodyPartOps";
import { getBodyPart } from "./appearance/bodyPartCatalog";
import {
  jointHasGooglyEyes,
  setJointGooglyEyes,
} from "./appearance/googlyEyes";
import { emptyAppearance } from "./appearance/types";
import { BodyPartCatalogPicker } from "./components/BodyPartCatalogPicker";
import { CapabilityPanel } from "./components/CapabilityPanel";
import { CollapsiblePanel } from "./components/CollapsiblePanel";
import { type DiscoSlotState } from "./components/DiscoSlotsPanel";
import { DiscoCurriculumPanel } from "./components/DiscoCurriculumPanel";
import { DiscoTrackLearnPanel } from "./components/DiscoTrackLearnPanel";
import { DiscoZonePanel } from "./components/DiscoZonePanel";
import { EnvPicker } from "./components/EnvPicker";
import {
  HeadToHeadPanel,
  headToHeadEntriesFromModels,
} from "./components/HeadToHeadPanel";
import { GoalInfoCard } from "./components/GoalInfoCard";
import { GoalPicker } from "./components/GoalPicker";
import { ModelsHub } from "./components/ModelsHub";
import { NetworkVisualizer } from "./components/NetworkVisualizer";
import { TrainingSetupPanel } from "./components/TrainingSetupPanel";
import { PerfDiagnostics } from "./components/PerfDiagnostics";
import { RewardsBreakdown } from "./components/RewardsBreakdown";
import {
  SandboxShell,
  SandboxTabRail,
  type SandboxTab,
  type SandboxTabId,
} from "./components/SandboxShell";
import { SecretGoalRevealOverlay } from "./components/SecretGoalRevealOverlay";
import { StatsPanel } from "./components/StatsPanel";
import { TrophyCabinet } from "./components/TrophyCabinet";
import { WorldDock } from "./components/WorldDock";
import { PRESETS } from "./creature/presets";
import { DISCO_DANCER } from "./creature/discoDancer";
import { cloneDesign, type CreatureDesign } from "./creature/types";
import { EditorCanvas, type EditTool } from "./editor/EditorCanvas";
import {
  jointsSelection,
  selectedJointIds,
  type EditorSelection,
} from "./editor/selection";
import {
  deleteSelection as deleteJointSelection,
  duplicateSelection,
  mirrorDuplicateSelection,
  selectionSummary,
} from "./editor/selectionOps";
import { createCamera } from "./sim/Camera";
import {
  AERO_TYPES,
  aeroTypeLabel,
  wingPairOk,
} from "./editor/aeroValidation";
import { AERO_AREA_SLIDER_MAX } from "./editor/flightMetrics";
import {
  assignDriveGroup,
  clearDriveGroup,
  updateBone,
  updateJoint,
} from "./editor/editOps";
import { isFeatureEnabled } from "./port/featureFlags";
import { discoFloorEnv } from "./env/discoEnv";
import {
  DEFAULT_DISCO_BALL_X,
  DEFAULT_DISCO_BALL_Y,
  DEFAULT_DISCO_PUPPET_MODE,
  DISCO_FOOT_MASS_DEFAULT,
  type DiscoPuppetMode,
} from "./physics/constants";
import { EnvEditorCanvas } from "./env/EnvEditorCanvas";
import { deleteSelection as deleteEnvSelection } from "./env/envEditOps";
import type { EnvSelection, EnvTool } from "./env/envSelection";
import { makeSineTerrain } from "./env/terrainMath";
import {
  cloneEnvironment,
  ENV_THEMES,
  flatGroundEnv,
  THEME_CSS,
  type EnvironmentDesign,
} from "./env/types";
import {
  defaultGoalForZone,
  getGoal,
  goalsForZone,
  loadActiveGoalId,
  saveActiveGoalId,
  type GoalId,
} from "./goals/catalog";
import { BUNDLED_MODELS } from "./library/bundledModels";
import { designCandidatePool } from "./library/resolveModelDesign";
import {
  bodyFingerprint,
  considerBestEver,
  getBestEver,
  loadBestEver,
  type BestEverEntry,
} from "./library/bestEver";
import {
  deletePackage,
  loadCreaturePackages,
  saveNewPackage,
  savePackageRevision,
  type CreaturePackage,
} from "./library/creaturePackages";
import {
  deleteEnvironmentPackage,
  duplicateEnvironmentPackage,
  listEnvironmentsForUi,
  saveNewEnvironmentPackage,
  type EnvironmentPackage,
} from "./library/environmentPackages";
import {
  captureDiscoSetup,
  danceBrainFromSetup,
  deleteDiscoSetup,
  exportDiscoSetupJson,
  loadDiscoSetups,
  saveDiscoSetup,
  type DiscoSetup,
} from "./library/discoSetups";
import {
  exportExperimentPackJson,
  exportRecipeJson,
  loadNamedRecipes,
  saveNamedRecipe,
  type TrainingRecipeSave,
} from "./library/experimentPacks";
import {
  downloadText,
  exportCreatureJson,
  exportEnvironmentJson,
  exportModelJson,
  importCreatureJson,
  importEnvironmentJson,
} from "./library/jsonIO";
import {
  deleteSavedModel,
  loadSavedModels,
  modelToSeed,
  saveModel,
  shapesCompatible,
  trainedModelName,
  type SavedModel,
} from "./library/savedModels";
import type { TaskEpisodeMetrics } from "./brain/taskScore";
import { evaluateSecretGoals } from "./secrets/eval";
import {
  listDiscoveries,
  recordDiscovery,
  type SecretGoalDiscovery,
} from "./secrets/progress";
import { SimCanvas } from "./sim/SimCanvas";
import {
  shapeForDanceDesign,
  shapeForDesign,
  Simulation,
  type DriveMode,
  type EpisodeCompleteSnapshot,
  type HeadToHeadResult,
  type LiveBrainProbe,
  type LiveFocusStats,
} from "./sim/simulation";
import {
  loadActiveZone,
  saveActiveZone,
  ZONE_ORDER,
  ZONES,
  type ZoneId,
} from "./zones/zones";
const OBSERVE_SPEEDS = [0.25, 1, 2, 4] as const;
const TRAIN_SPEEDS = [1, 4, 16, 0] as const; // 0 = max
/** edit = creature builder · world = env studio preview · sim = train/play */
type Mode = "edit" | "world" | "sim";
const BUILTIN_FLAT_ENV_ID = "builtin_flat_ground";
const MAX_UNDO = 80;
const idleProgress = (): EvolutionProgress => ({
  generation: 0,
  evaluated: 0,
  populationSize: 0,
  bestFitness: 0,
  meanFitness: 0,
  running: false,
  status: "Idle",
});
function ensureAppearance(design: CreatureDesign): CreatureDesign {
  if (design.appearance) return design;
  return { ...design, appearance: emptyAppearance() };
}
export default function App() {
  const simulation = useMemo(() => new Simulation(), []);
  const discoPlayer = useMemo(() => createDiscoAudioPlayer(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [tool, setTool] = useState<EditTool>("joint");
  const [snapEnabled, setSnapEnabled] = useState(true);
  /** Edit tab: drop creature idle under gravity to preview natural settle. */
  const [editPhysics, setEditPhysics] = useState(false);
  const [zone, setZone] = useState<ZoneId>(() => loadActiveZone());
  const [goalId, setGoalId] = useState<GoalId>(() => {
    const z = loadActiveZone();
    const saved = loadActiveGoalId(defaultGoalForZone(z).id);
    const allowed = goalsForZone(z);
    return allowed.some((g) => g.id === saved)
      ? saved
      : defaultGoalForZone(z).id;
  });
  const [design, setDesign] = useState<CreatureDesign>(() =>
    ensureAppearance(cloneDesign(PRESETS[0])),
  );
  const [selection, setSelection] = useState<EditorSelection>(null);
  const [driveMode, setDriveMode] = useState<DriveMode>("idle");
  /** Brain eval rate — 30 Hz default; 60 Hz for feel / CPU A-B tests. */
  const [brainHz, setBrainHz] = useState<BrainHz>(BRAIN_HZ);
  const [manualDrives, setManualDrives] = useState<number[]>([]);
  const [simTime, setSimTime] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [observeSpeed, setObserveSpeed] = useState(1);
  const [trainSpeed, setTrainSpeed] = useState(4);
  const [showGhostPack, setShowGhostPack] = useState(() => {
    try {
      const raw = localStorage.getItem("freshstart_show_ghost_pack_v1");
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {
      /* ignore */
    }
    return true;
  });
  const [episodeSeconds, setEpisodeSeconds] = useState<number>(EPISODE_SECONDS);
  const [gaKnobs, setGaKnobs] = useState<GaKnobSet>(() =>
    isFeatureEnabled("trainRecipes") ? loadGaKnobSet() : defaultGaKnobSet(),
  );
  const [trainHelpDismissed, setTrainHelpDismissed] = useState(() => {
    try {
      return localStorage.getItem("freshstart_train_help_v1") === "1";
    } catch {
      return false;
    }
  });
  const [runSeed, setRunSeed] = useState(() => Date.now() % 1_000_000);
  const [goalPriorities, setGoalPriorities] = useState<GoalPriorities>(() => ({
    ...DEFAULT_GOAL_PRIORITIES,
  }));
  const [stageTrainerOn, setStageTrainerOn] = useState(false);
  const [courseCurriculumOn, setCourseCurriculumOn] = useState(false);
  const [courseStageIndex, setCourseStageIndex] = useState(0);
  const [raceRecord, setRaceRecord] = useState(false);
  const [messyBodies, setMessyBodies] = useState(false);
  const [morphEvolveOn, setMorphEvolveOn] = useState(() => {
    try {
      return localStorage.getItem("freshstart_morph_evolve_v1") === "1";
    } catch {
      return false;
    }
  });
  const [trainTelemetryOn, setTrainTelemetryOn] = useState(() => {
    try {
      return localStorage.getItem("freshstart_train_telemetry_v1") === "1";
    } catch {
      return false;
    }
  });
  const [trainTelemetrySession, setTrainTelemetrySession] =
    useState<TrainTelemetrySession | null>(null);
  const [namedRecipes, setNamedRecipes] = useState<TrainingRecipeSave[]>([]);
  const [liveBrain, setLiveBrain] = useState<LiveBrainProbe | null>(null);
  const [evolveProgress, setEvolveProgress] =
    useState<EvolutionProgress>(idleProgress);
  const [bestGenome, setBestGenome] = useState<{
    shape: NetworkShape;
    genome: Genome;
  } | null>(null);
  const [packages, setPackages] = useState<CreaturePackage[]>([]);
  const [saveName, setSaveName] = useState("Custom");
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  const [discoTrack, setDiscoTrack] = useState("");
  const [discoGains, setDiscoGains] = useState<DiscoReactivityGains>(() => ({
    ...DEFAULT_DISCO_REACTIVITY,
  }));
  const [discoMotion, setDiscoMotion] = useState<DiscoMotionControls>(() => ({
    ...DEFAULT_DISCO_MOTION,
  }));
  const [discoAuto, setDiscoAuto] = useState<DiscoAutoFlags>(() => ({
    ...DEFAULT_DISCO_AUTO,
  }));
  const [discoSlots, setDiscoSlots] = useState<DiscoSlotState[]>(() => [
    {
      design: cloneDesign(ULTI_GROOVE_BOT_II),
      label: ULTI_GROOVE_BOT_II.name,
    },
    null,
    null,
    null,
    null,
    null,
  ]);
  const [discoRouting, setDiscoRouting] = useState<DiscoBandRouting>(() => ({
    ...DEFAULT_DISCO_ROUTING,
  }));
  const [discoPlaying, setDiscoPlaying] = useState(false);
  const [discoTrackTime, setDiscoTrackTime] = useState(0);
  const [discoTrackDuration, setDiscoTrackDuration] = useState(0);
  const [discoPuppetMode, setDiscoPuppetMode] = useState<DiscoPuppetMode>(
    DEFAULT_DISCO_PUPPET_MODE,
  );
  const [discoFootMass, setDiscoFootMass] = useState(DISCO_FOOT_MASS_DEFAULT);
  const [discoHideMuscles, setDiscoHideMuscles] = useState(false);
  const [discoHideBones, setDiscoHideBones] = useState(false);
  const [discoGreenscreen, setDiscoGreenscreen] = useState(false);
  const [discoBallPos, setDiscoBallPos] = useState({
    x: DEFAULT_DISCO_BALL_X,
    y: DEFAULT_DISCO_BALL_Y,
  });
  const [discoSetups, setDiscoSetups] = useState<DiscoSetup[]>([]);
  const [discoRecording, setDiscoRecording] = useState(false);
  const [discoRecordCount, setDiscoRecordCount] = useState(0);
  const [discoRecordDuration, setDiscoRecordDuration] = useState(0);
  const [discoLearning, setDiscoLearning] = useState(false);
  const [discoLearnProgress, setDiscoLearnProgress] = useState<{
    epoch: number;
    epochs: number;
    loss: number;
  } | null>(null);
  const [danceGenome, setDanceGenome] = useState<{
    shape: NetworkShape;
    genome: Genome;
  } | null>(null);
  const [danceStage, setDanceStage] = useState<"imitate" | "refine">(
    "imitate",
  );
  const [discoFreestyle, setDiscoFreestyle] = useState(false);
  const [discoPlaylist, setDiscoPlaylist] = useState<DiscoPlaylistTrack[]>(
    [],
  );
  const [discoPlaylistActiveId, setDiscoPlaylistActiveId] = useState<
    string | null
  >(null);
  const [curriculumRecording, setCurriculumRecording] = useState(false);
  const [curriculumSamples, setCurriculumSamples] = useState(0);
  const [curriculumDuration, setCurriculumDuration] = useState(0);
  const [curriculumLearning, setCurriculumLearning] = useState(false);
  const [curriculumRefining, setCurriculumRefining] = useState(false);
  const [curriculumLearnProgress, setCurriculumLearnProgress] = useState<{
    epoch: number;
    epochs: number;
    loss: number;
    holdoutLoss?: number;
  } | null>(null);
  const [curriculumRefineProgress, setCurriculumRefineProgress] = useState<{
    generation: number;
    generations: number;
    bestFitness: number;
    meanFitness: number;
  } | null>(null);
  const discoRecordBufRef = useRef(new DiscoRecordBuffer());
  const discoRecordingRef = useRef(false);
  const curriculumDatasetRef = useRef(new MultiTrackDanceDataset());
  const curriculumRecordingRef = useRef(false);
  const curriculumTrackIdRef = useRef<string | null>(null);
  const discoPlaylistRef = useRef<DiscoPlaylistTrack[]>([]);
  const lookBufRef = useRef(new Float32Array(6));
  const preDiscoEnvRef = useRef<EnvironmentDesign | null>(null);
  const [h2hRunning, setH2hRunning] = useState(false);
  const [h2hProgress, setH2hProgress] = useState<{
    episodeT: number;
    episodeDuration: number;
  } | null>(null);
  const [h2hResult, setH2hResult] = useState<HeadToHeadResult | null>(null);
  const [bestEverList, setBestEverList] = useState<BestEverEntry[]>([]);
  const [envDesign, setEnvDesign] = useState<EnvironmentDesign>(() =>
    flatGroundEnv(),
  );
  const [envPackages, setEnvPackages] = useState<EnvironmentPackage[]>([]);
  /** Saved package driving training; null = unsaved World studio draft. */
  const [activeEnvPackageId, setActiveEnvPackageId] = useState<string | null>(
    BUILTIN_FLAT_ENV_ID,
  );
  const [envUndoCount, setEnvUndoCount] = useState(0);
  const [secretRevealQueue, setSecretRevealQueue] = useState<
    SecretGoalDiscovery[]
  >([]);
  const [discoveries, setDiscoveries] = useState<SecretGoalDiscovery[]>([]);
  const [sandboxTab, setSandboxTab] = useState<SandboxTabId>("edit");
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [dockInset, setDockInset] = useState(0);
  const [feelNotesOpen, setFeelNotesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(
    () => !isFeatureEnabled("trainDockIa"),
  );
  const [rewardsOpen, setRewardsOpen] = useState(
    () => !isFeatureEnabled("trainDockIa"),
  );
  const [controlsOpen, setControlsOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const [liveStats, setLiveStats] = useState<LiveFocusStats | null>(null);
  const [lastMetrics, setLastMetrics] = useState<TaskEpisodeMetrics | null>(
    null,
  );
  const [perfFps, setPerfFps] = useState(0);
  const [perfFrameMs, setPerfFrameMs] = useState(0);
  const [immersive, setImmersive] = useState(false);
  const [creatureFilter, setCreatureFilter] = useState("");
  const [worldThemeOpen, setWorldThemeOpen] = useState(true);
  const [worldLibOpen, setWorldLibOpen] = useState(true);
  const [envTool, setEnvTool] = useState<EnvTool>("select");
  const [envSelection, setEnvSelection] = useState<EnvSelection>(null);
  const [envSnapEnabled, setEnvSnapEnabled] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const envFileInputRef = useRef<HTMLInputElement>(null);
  /** Persist Edit pan/zoom across tool/selection changes and remounts. */
  const editorCamRef = useRef(createCamera());
  const designRef = useRef(design);
  const trainTelemetryOnRef = useRef(trainTelemetryOn);
  trainTelemetryOnRef.current = trainTelemetryOn;
  const trainTelemetrySessionRef = useRef<TrainTelemetrySession | null>(null);
  const driveModeRef = useRef(driveMode);
  const discoGainsRef = useRef(discoGains);
  const discoMotionRef = useRef(discoMotion);
  const discoAutoRef = useRef(discoAuto);
  const discoAutoTickRef = useRef(createDiscoAutoTickState());
  const discoSlotsRef = useRef(discoSlots);
  const discoRoutingRef = useRef(discoRouting);
  const undoStackRef = useRef<CreatureDesign[]>([]);
  const envUndoStackRef = useRef<EnvironmentDesign[]>([]);
  const envDesignRef = useRef(envDesign);
  designRef.current = design;
  driveModeRef.current = driveMode;
  discoGainsRef.current = discoGains;
  discoMotionRef.current = discoMotion;
  discoAutoRef.current = discoAuto;
  discoSlotsRef.current = discoSlots;
  discoRoutingRef.current = discoRouting;
  envDesignRef.current = envDesign;
  const activeTask = getGoal(goalId).task;
  const zoneGoals = goalsForZone(zone);
  const refreshPackages = useCallback(() => {
    if (isFeatureEnabled("creaturePackages")) {
      setPackages(loadCreaturePackages());
    }
  }, []);
  const refreshModels = useCallback(() => {
    if (isFeatureEnabled("savedModels")) {
      setSavedModels(loadSavedModels());
    }
  }, []);
  const refreshEnvPackages = useCallback(() => {
    if (isFeatureEnabled("environmentsRepo")) {
      setEnvPackages(listEnvironmentsForUi());
    }
  }, []);
  useEffect(() => {
    refreshPackages();
    refreshModels();
    refreshEnvPackages();
    if (isFeatureEnabled("bestEverLedger")) {
      setBestEverList(loadBestEver());
    }
    if (isFeatureEnabled("secretGoals") || isFeatureEnabled("discoveryUi")) {
      setDiscoveries(listDiscoveries());
    }
    if (isFeatureEnabled("experimentPacks")) {
      setNamedRecipes(loadNamedRecipes());
    }
    if (isFeatureEnabled("discoSetups")) {
      setDiscoSetups(loadDiscoSetups());
    }
  }, [refreshPackages, refreshModels, refreshEnvPackages]);

  useEffect(() => {
    if (!isFeatureEnabled("trainRecipes")) return;
    saveGaKnobSet(gaKnobs);
    setEpisodeSeconds(gaKnobs.episodeSeconds);
  }, [gaKnobs]);

  /** Prefetch bundled disco track once physics is ready. */
  useEffect(() => {
    if (!ready || !isFeatureEnabled("discoMode")) return;
    let cancelled = false;
    void (async () => {
      try {
        await discoPlayer.loadUrl(
          DEFAULT_DISCO_TRACK_URL,
          DEFAULT_DISCO_TRACK_NAME,
        );
        if (cancelled) return;
        setDiscoTrack(DEFAULT_DISCO_TRACK_NAME);
        setDiscoTrackTime(0);
        const d = discoPlayer.duration();
        setDiscoTrackDuration(Number.isFinite(d) ? d : 0);
      } catch (err) {
        console.warn("Default disco track missing or failed to load", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, discoPlayer]);
  useEffect(() => {
    if (!isFeatureEnabled("environmentsRepo")) return;
    const theme = THEME_CSS[envDesign.theme];
    const root = document.documentElement;
    root.style.setProperty("--bg", theme.bg);
    root.style.setProperty("--panel", theme.panel);
  }, [envDesign.theme]);
  useEffect(() => {
    if (!ready || !isFeatureEnabled("environmentsRepo")) return;
    simulation.setEnvironment(envDesign);
  }, [ready, envDesign, simulation]);
  const finalizeAndMaybeDownloadTelemetry = useCallback(
    (session: TrainTelemetrySession, autoDownload: boolean) => {
      const final = finalizeTrainTelemetry(session);
      trainTelemetrySessionRef.current = final;
      setTrainTelemetrySession(final);
      if (autoDownload && final.generations.length > 0) {
        downloadText(
          telemetryFilename(final),
          exportTrainTelemetryJson(final),
        );
      }
      return final;
    },
    [],
  );

  const handleEpisodeComplete = useCallback((snap: EpisodeCompleteSnapshot) => {
    setLastMetrics(snap.metrics);

    if (
      isFeatureEnabled("trainTelemetryLog") &&
      trainTelemetryOnRef.current &&
      snap.context === "evolve" &&
      snap.generation != null &&
      trainTelemetrySessionRef.current
    ) {
      const prev = trainTelemetrySessionRef.current;
      if (prev.generations.length < prev.window) {
        const next = {
          ...appendTrainTelemetryGen(prev, {
            generation: snap.generation,
            task: snap.task,
            episodeSeconds: snap.episodeSeconds,
            bestFitness: snap.metrics.fitness,
            meanFitness: snap.meanFitness ?? 0,
            runBestFitness: snap.runBestFitness ?? snap.metrics.fitness,
            populationSize: snap.populationSize ?? 0,
            metrics: snap.metrics,
            stall: snap.stall ?? null,
            morphSummary: morphSummaryForGenes(snap.morph),
          }),
        };
        next.insights = analyzeTrainTelemetry(next);
        trainTelemetrySessionRef.current = next;
        setTrainTelemetrySession(next);
        if (next.generations.length >= next.window) {
          finalizeAndMaybeDownloadTelemetry(next, true);
        }
      }
    }

    if (!isFeatureEnabled("secretGoals")) return;
    const ids = evaluateSecretGoals({
      task: snap.task,
      metrics: snap.metrics,
      design: snap.design,
      episodeSeconds: snap.episodeSeconds,
      generation: snap.generation,
    });
    if (ids.length === 0) return;
    const fresh: SecretGoalDiscovery[] = [];
    for (const id of ids) {
      const entry: SecretGoalDiscovery = {
        secretGoalId: id,
        discoveredAt: new Date().toISOString(),
        modelName: snap.design.name || "Creature",
        activeTask: snap.task,
        context: snap.context,
        generation: snap.generation,
      };
      if (recordDiscovery(entry)) fresh.push(entry);
    }
    if (fresh.length === 0) return;
    setSecretRevealQueue((q) => [...q, ...fresh]);
    setDiscoveries(listDiscoveries());
  }, [finalizeAndMaybeDownloadTelemetry]);
  useEffect(() => {
    simulation.onEpisodeComplete = handleEpisodeComplete;
    return () => {
      simulation.onEpisodeComplete = null;
    };
  }, [simulation, handleEpisodeComplete]);
  useEffect(() => {
    simulation.setTask(activeTask);
  }, [activeTask, simulation]);
  useEffect(() => {
    const scale = evolveProgress.running ? trainSpeed : observeSpeed;
    simulation.timeScale = scale;
  }, [evolveProgress.running, observeSpeed, trainSpeed, simulation]);
  useEffect(() => {
    const ghosts = showGhostPack || raceRecord;
    simulation.setShowGhostPack(ghosts);
    try {
      localStorage.setItem(
        "freshstart_show_ghost_pack_v1",
        showGhostPack ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [showGhostPack, raceRecord, simulation]);
  useEffect(() => {
    if (!selection) return;
    if (selection.kind === "joints") {
      const valid = selection.ids.filter((id) =>
        design.joints.some((j) => j.id === id),
      );
      if (valid.length === 0) setSelection(null);
      else if (valid.length !== selection.ids.length) {
        setSelection(jointsSelection(valid));
      }
    } else if (
      selection.kind === "bone" &&
      !design.bones.some((b) => b.id === selection.id)
    ) {
      setSelection(null);
    } else if (
      selection.kind === "muscle" &&
      !design.muscles.some((m) => m.id === selection.id)
    ) {
      setSelection(null);
    } else if (
      selection.kind === "bodyPart" &&
      (!design.appearance ||
        selection.index < 0 ||
        selection.index >= design.appearance.bodyParts.length)
    ) {
      setSelection(null);
    }
  }, [design, selection]);
  useEffect(() => {
    if (mode !== "sim" && mode !== "world") setDockInset(0);
  }, [mode]);
  const hasCreature = design.joints.length > 0;
  const returnToEdit = useCallback(() => {
    if (simulation.isEvolving) simulation.abortLiveEvolve();
    if (simulation.isHeadToHead) simulation.abortHeadToHead();
    simulation.clearDiscoDancers();
    setH2hRunning(false);
    setH2hProgress(null);
    setEvolveProgress(idleProgress());
    setLiveBrain(null);
    setEditPhysics(false);
    simulation.running = false;
    setMode("edit");
    setSandboxTab("edit");
    setDockInset(0);
  }, [simulation]);
  /** World tab — env studio preview on SimCanvas (no train dock). */
  const enterWorld = useCallback(() => {
    if (simulation.isEvolving) simulation.abortLiveEvolve();
    setEvolveProgress(idleProgress());
    setLiveBrain(null);
    simulation.running = false;
    setMode("world");
    setSandboxTab("world");
    setDockInset(0);
  }, [simulation]);

  useEffect(() => {
    if (!hasCreature && mode === "sim") {
      returnToEdit();
    }
  }, [hasCreature, mode, returnToEdit]);
  /** Spawn staged dancer slot(s). One dancer is enough; audio applies only while dancing. */
  const syncMultiDisco = useCallback(() => {
    if (!isFeatureEnabled("multiDisco")) return false;
    if (!simulation.world) return false;
    const active = discoSlotsRef.current.filter(
      (s): s is NonNullable<DiscoSlotState> =>
        s !== null && s.design.joints.length > 0,
    );
    if (active.length === 0) {
      return false;
    }
    const defaults = discoDancerOffsets(active.length);
    simulation.startMultiDisco(
      active.map((slot, i) => ({
        design: slot.design,
        offsetX:
          typeof slot.offsetX === "number" && Number.isFinite(slot.offsetX)
            ? slot.offsetX
            : (defaults[i] ?? 0),
      })),
      (_index, slotDesign) => {
        if (driveModeRef.current !== "disco") {
          return new Array(slotDesign.muscles.length).fill(0);
        }
        return resolveDiscoDrives({
          player: discoPlayer,
          muscleCount: slotDesign.muscles.length,
          muscles: slotDesign.muscles,
          design: slotDesign,
          gains: discoGainsRef.current,
          motion: discoMotionRef.current,
          routing: discoRoutingRef.current,
          timeSec: discoPlayer.currentTime(),
        });
      },
    );
    simulation.driveMode =
      driveModeRef.current === "disco" ? "disco" : "idle";
    return true;
  }, [discoPlayer, simulation]);

  useEffect(() => {
    simulation.discoDriveProvider = () =>
      resolveDiscoDrives({
        player: discoPlayer,
        muscleCount: designRef.current.muscles.length,
        muscles: designRef.current.muscles,
        design: designRef.current,
        gains: discoGainsRef.current,
        motion: discoMotionRef.current,
        routing: discoRoutingRef.current,
        timeSec: discoPlayer.currentTime(),
      });
    return () => {
      simulation.discoDriveProvider = null;
    };
  }, [discoPlayer, simulation]);

  useEffect(() => {
    discoPlaylistRef.current = discoPlaylist;
  }, [discoPlaylist]);

  useEffect(() => {
    if (!isFeatureEnabled("discoDanceLearn")) return;
    simulation.audioObsProvider = () =>
      discoPlayer.hasTrack() ? discoPlayer.getBands() : null;
    return () => {
      simulation.audioObsProvider = null;
    };
  }, [discoPlayer, simulation]);

  useEffect(() => {
    if (
      !isFeatureEnabled("discoDanceLearn") &&
      !isFeatureEnabled("discoDanceCurriculum")
    ) {
      return;
    }
    simulation.audioLookaheadProvider = () => {
      if (!isFeatureEnabled("discoDanceCurriculum")) return null;
      const id = discoPlaylistActiveId;
      const track = discoPlaylistRef.current.find((t) => t.id === id);
      if (!track?.analysis) return null;
      const t = discoPlayer.currentTime();
      return lookaheadAtTime(track.analysis, t, lookBufRef.current);
    };
    return () => {
      simulation.audioLookaheadProvider = null;
    };
  }, [discoPlayer, discoPlaylistActiveId, simulation]);

  useEffect(() => {
    if (!isFeatureEnabled("discoDanceLearn")) return;
    simulation.discoSampleHook = (payload) => {
      const muscles =
        simulation.design?.muscles ??
        designRef.current.muscles;
      const channels = collapseMuscleDrivesToChannels(
        muscles,
        payload.muscleDrives,
      );
      if (discoRecordingRef.current) {
        discoRecordBufRef.current.pushSample(payload.obs, channels);
        setDiscoRecordCount(discoRecordBufRef.current.sampleCount);
        setDiscoRecordDuration(discoRecordBufRef.current.durationSec);
      }
      if (
        isFeatureEnabled("discoDanceCurriculum") &&
        curriculumRecordingRef.current &&
        curriculumTrackIdRef.current
      ) {
        const track = discoPlaylistRef.current.find(
          (t) => t.id === curriculumTrackIdRef.current,
        );
        const primary = discoSlotsRef.current.find(
          (s) => s !== null && s.design.joints.length > 0,
        );
        const body = primary?.design ?? designRef.current;
        curriculumDatasetRef.current.appendSamples(
          curriculumTrackIdRef.current,
          track?.name ?? "track",
          bodyFingerprint(body),
          payload.obs,
          channels,
        );
        setCurriculumSamples(curriculumDatasetRef.current.sampleCount());
        setCurriculumDuration(curriculumDatasetRef.current.durationSec());
      }
    };
    return () => {
      simulation.discoSampleHook = null;
    };
  }, [simulation]);

  useEffect(() => {
    return () => {
      discoPlayer.dispose();
    };
  }, [discoPlayer]);

  /** Keep the dock timeline in sync while a track is playing; drive auto sliders. */
  useEffect(() => {
    if (!discoPlaying) {
      setDiscoTrackTime(discoPlayer.currentTime());
      const d = discoPlayer.duration();
      if (Number.isFinite(d) && d > 0) setDiscoTrackDuration(d);
      discoAutoTickRef.current.initialized = false;
      return;
    }
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const t = discoPlayer.currentTime();
      const d = discoPlayer.duration();
      setDiscoTrackTime(t);
      if (Number.isFinite(d) && d > 0) setDiscoTrackDuration(d);

      const auto = discoAutoRef.current;
      if (anyDiscoAutoEnabled(auto)) {
        const result = tickDiscoAuto({
          bands: discoPlayer.getBands(),
          gains: discoGainsRef.current,
          motion: discoMotionRef.current,
          auto,
          state: discoAutoTickRef.current,
          timeSec: t,
        });
        discoAutoTickRef.current = result.state;
        if (result.changed) {
          discoGainsRef.current = result.gains;
          discoMotionRef.current = result.motion;
          setDiscoGains(result.gains);
          setDiscoMotion(result.motion);
        }
      }

      if (
        discoPlayer.hasTrack() &&
        !discoPlayer.isPlaying() &&
        d > 0 &&
        t >= d - 0.05
      ) {
        setDiscoPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [discoPlaying, discoPlayer]);

  /** Slot content signature — ignores offsetX so grab/drop does not respawn. */
  const discoStageKey = useMemo(
    () =>
      discoSlots
        .map((s) =>
          s
            ? `${s.label}\0${s.design.name}\0${s.design.joints.length}\0${s.design.bones.length}\0${s.design.muscles.length}\0${s.design.joints.map((j) => `${j.id}:${j.x.toFixed(3)}:${j.y.toFixed(3)}`).join(",")}`
            : "",
        )
        .join("|"),
    [discoSlots],
  );

  /** Keep the disco arena in sync with dancer slots (preview or dancing). */
  useEffect(() => {
    if (!ready) return;
    if (zone !== "disco" || !isFeatureEnabled("discoMode")) return;
    if (syncMultiDisco()) return;
    if (simulation.isMultiDisco) {
      simulation.clearDiscoDancers();
      if (designRef.current.joints.length > 0) {
        simulation.loadDesign(designRef.current);
      }
    }
    // Gains/motion/routing are read from refs inside resolveDrives — omit here
    // so slider tweaks do not respawn dancers. offsetX changes also omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- discoStageKey gates design/load
  }, [ready, zone, discoStageKey, syncMultiDisco, simulation]);

  const applyDiscoEnvironment = useCallback(() => {
    if (!preDiscoEnvRef.current) {
      preDiscoEnvRef.current = cloneEnvironment(envDesignRef.current);
    }
    const discoEnv = discoFloorEnv();
    setEnvDesign(discoEnv);
    simulation.setEnvironment(discoEnv);
  }, [simulation]);

  const restorePreDiscoEnvironment = useCallback(() => {
    const prev = preDiscoEnvRef.current;
    if (!prev) return;
    preDiscoEnvRef.current = null;
    setEnvDesign(cloneEnvironment(prev));
    simulation.setEnvironment(prev);
  }, [simulation]);

  const beginDiscoDrive = useCallback(() => {
    if (!discoPlayer.hasTrack()) return;
    setDriveMode("disco");
    driveModeRef.current = "disco";
    if (syncMultiDisco()) {
      simulation.driveMode = "disco";
      simulation.setDiscoPuppetMode(discoPuppetMode);
      return;
    }
    if (simulation.isMultiDisco) {
      simulation.clearDiscoDancers();
    }
    simulation.driveMode = "disco";
    if (designRef.current.joints.length > 0) {
      simulation.loadDesign(designRef.current);
    }
    simulation.setDiscoPuppetMode(discoPuppetMode);
  }, [discoPlayer, discoPuppetMode, simulation, syncMultiDisco]);

  const stopDiscoDrive = useCallback(() => {
    discoPlayer.pause();
    setDiscoPlaying(false);
    setDriveMode("idle");
    driveModeRef.current = "idle";
    simulation.driveMode = "idle";
    discoRecordingRef.current = false;
    setDiscoRecording(false);
    setDiscoFreestyle(false);
    // Keep staged dancers on the floor; drives go silent via driveModeRef.
  }, [discoPlayer, simulation]);

  const activeDiscoDesign = useCallback((): CreatureDesign => {
    const primary = discoSlotsRef.current.find(
      (s) => s !== null && s.design.joints.length > 0,
    );
    return primary?.design ?? designRef.current;
  }, []);

  const discoSoloOk = useMemo(() => {
    const n = discoSlots.filter(
      (s) => s !== null && s.design.joints.length > 0,
    ).length;
    return n <= 1;
  }, [discoSlots]);

  const toggleDiscoRecord = useCallback(() => {
    if (!isFeatureEnabled("discoDanceLearn") || !discoSoloOk) return;
    if (discoRecording) {
      discoRecordingRef.current = false;
      setDiscoRecording(false);
      return;
    }
    if (driveModeRef.current !== "disco") return;
    discoRecordingRef.current = true;
    setDiscoRecording(true);
  }, [discoRecording, discoSoloOk]);

  const clearDiscoRecord = useCallback(() => {
    discoRecordBufRef.current.clear();
    setDiscoRecordCount(0);
    setDiscoRecordDuration(0);
  }, []);

  const learnDiscoDance = useCallback(async () => {
    if (!isFeatureEnabled("discoDanceLearn") || !discoSoloOk) return;
    const buf = discoRecordBufRef.current;
    if (buf.sampleCount < DISCO_RECORD_MIN_SAMPLES) {
      setError(
        `Need at least ${(DISCO_RECORD_MIN_SAMPLES / 30).toFixed(0)}s of disco recording.`,
      );
      return;
    }
    const body = activeDiscoDesign();
    const shape = shapeForDanceDesign(body);
    const dataset = buf.toDataset();
    const warm =
      danceGenome && shapesCompatible(danceGenome.shape, shape)
        ? danceGenome.genome.weights
        : null;
    setDiscoLearning(true);
    setDiscoLearnProgress({ epoch: 0, epochs: 40, loss: 0 });
    try {
      const result = await fitImitation({
        shape,
        dataset,
        seed: (0xd15c0d4e ^ (body.muscles.length * 9973)) >>> 0,
        epochs: 40,
        lr: 0.05,
        batchSize: 32,
        yieldEvery: 1,
        initialWeights: warm,
        onProgress: (p) => setDiscoLearnProgress(p),
      });
      const genome: Genome = {
        weights: result.weights,
        fitness: imitationFitness(result.finalLoss),
      };
      setDanceGenome({ shape, genome });
      setDanceStage("imitate");
      setDiscoLearnProgress({
        epoch: 40,
        epochs: 40,
        loss: result.finalLoss,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscoLearning(false);
    }
  }, [activeDiscoDesign, danceGenome, discoSoloOk]);

  const beginDiscoFreestyle = useCallback(() => {
    if (!isFeatureEnabled("discoDanceLearn") || !danceGenome || !discoSoloOk) {
      return;
    }
    discoRecordingRef.current = false;
    setDiscoRecording(false);
    const body = cloneDesign(activeDiscoDesign());
    if (simulation.isMultiDisco) {
      simulation.clearDiscoDancers();
    }
    designRef.current = body;
    setDesign(body);
    simulation.loadDesign(body);
    simulation.setDiscoPuppetMode(discoPuppetMode);
    simulation.setBrain(danceGenome.shape, danceGenome.genome.weights);
    setDriveMode("brain");
    driveModeRef.current = "brain";
    simulation.driveMode = "brain";
    setDiscoFreestyle(true);
    if (!discoPlayer.isPlaying()) {
      discoPlayer.play();
      setDiscoPlaying(true);
    }
  }, [
    activeDiscoDesign,
    danceGenome,
    discoPlayer,
    discoPuppetMode,
    discoSoloOk,
    simulation,
  ]);

  const exitDiscoFreestyle = useCallback(() => {
    setDiscoFreestyle(false);
    simulation.clearBrain();
    if (discoPlayer.hasTrack()) {
      beginDiscoDrive();
    } else {
      setDriveMode("idle");
      driveModeRef.current = "idle";
      simulation.driveMode = "idle";
    }
  }, [beginDiscoDrive, discoPlayer, simulation]);

  const toggleDiscoFreestyle = useCallback(() => {
    if (discoFreestyle) exitDiscoFreestyle();
    else beginDiscoFreestyle();
  }, [beginDiscoFreestyle, discoFreestyle, exitDiscoFreestyle]);

  const saveDanceModel = useCallback(() => {
    if (!danceGenome) {
      setError("No dance brain to save.");
      return;
    }
    const body = activeDiscoDesign();
    saveModel({
      name: `${body.name || "Dancer"} · dance`,
      task: "dance",
      shape: danceGenome.shape,
      genome: danceGenome.genome,
      design: body,
      danceMeta: {
        obsPackVersion: DANCE_OBS_PACK_VERSION,
        stage: danceStage,
        playlistFingerprint: playlistFingerprint(discoPlaylist),
      },
    });
    refreshModels();
  }, [
    activeDiscoDesign,
    danceGenome,
    danceStage,
    discoPlaylist,
    refreshModels,
  ]);

  const refreshDiscoSetups = useCallback(() => {
    if (!isFeatureEnabled("discoSetups")) return;
    setDiscoSetups(loadDiscoSetups());
  }, []);

  /** H8 — name + persist full Disco stage (not audio files). */
  const saveCurrentDiscoSetup = useCallback(() => {
    if (!isFeatureEnabled("discoSetups")) return;
    const suggested =
      discoSlots.find((s) => s)?.label?.trim() ||
      discoTrack.trim() ||
      "Disco setup";
    const name = window.prompt("Name this Disco setup", suggested);
    if (!name?.trim()) return;
    const setup = captureDiscoSetup({
      name: name.trim(),
      gains: discoGains,
      motion: discoMotion,
      auto: discoAuto,
      routing: discoRouting,
      puppetMode: discoPuppetMode,
      footMass: discoFootMass,
      hideMuscles: discoHideMuscles,
      hideBones: discoHideBones,
      greenscreen: discoGreenscreen,
      ballX: discoBallPos.x,
      ballY: discoBallPos.y,
      slots: discoSlots,
      trackHint: discoTrack.trim() || undefined,
      danceBrain: danceGenome
        ? {
            shape: danceGenome.shape,
            weights: danceGenome.genome.weights,
            fitness: danceGenome.genome.fitness,
            stage: danceStage,
          }
        : undefined,
    });
    saveDiscoSetup(setup);
    refreshDiscoSetups();
    if (isFeatureEnabled("jsonImportExport")) {
      downloadText(
        `${name.trim().replace(/\s+/g, "_")}_disco_setup.json`,
        exportDiscoSetupJson(setup),
      );
    }
  }, [
    danceGenome,
    danceStage,
    discoAuto,
    discoFootMass,
    discoGains,
    discoGreenscreen,
    discoBallPos.x,
    discoBallPos.y,
    discoHideBones,
    discoHideMuscles,
    discoMotion,
    discoPuppetMode,
    discoRouting,
    discoSlots,
    discoTrack,
    refreshDiscoSetups,
  ]);

  const loadDiscoSetupById = useCallback(
    (id: string) => {
      if (!isFeatureEnabled("discoSetups")) return;
      const setup = loadDiscoSetups().find((s) => s.id === id);
      if (!setup) {
        setError("Disco setup not found.");
        refreshDiscoSetups();
        return;
      }
      if (discoFreestyle) {
        setDiscoFreestyle(false);
        simulation.clearBrain();
        if (driveModeRef.current === "brain") {
          setDriveMode("idle");
          driveModeRef.current = "idle";
          simulation.driveMode = "idle";
        }
      }
      setDiscoGains({ ...setup.gains });
      setDiscoMotion({ ...setup.motion });
      setDiscoAuto({ ...setup.auto });
      discoAutoTickRef.current.initialized = false;
      setDiscoRouting({ ...setup.routing });
      setDiscoPuppetMode(setup.puppetMode);
      simulation.setDiscoPuppetMode(setup.puppetMode);
      setDiscoFootMass(setup.footMass);
      simulation.setDiscoFootMass(setup.footMass);
      setDiscoHideMuscles(setup.hideMuscles);
      simulation.hideMuscles = setup.hideMuscles;
      setDiscoHideBones(setup.hideBones);
      simulation.hideBones = setup.hideBones;
      setDiscoGreenscreen(setup.greenscreen);
      setDiscoBallPos({ x: setup.ballX, y: setup.ballY });
      setDiscoSlots(
        setup.slots.map((s) =>
          s
            ? {
                design: cloneDesign(s.design),
                label: s.label,
                ...(typeof s.offsetX === "number" ? { offsetX: s.offsetX } : {}),
              }
            : null,
        ),
      );
      const brain = danceBrainFromSetup(setup);
      if (brain) {
        setDanceGenome({
          shape: brain.shape,
          genome: { weights: brain.weights, fitness: brain.fitness },
        });
        setDanceStage(brain.stage);
      } else {
        setDanceGenome(null);
        setDanceStage("imitate");
      }
    },
    [discoFreestyle, refreshDiscoSetups, simulation],
  );

  const deleteDiscoSetupById = useCallback(
    (id: string) => {
      if (!isFeatureEnabled("discoSetups")) return;
      const setup = discoSetups.find((s) => s.id === id);
      if (
        setup &&
        !window.confirm(`Delete Disco setup “${setup.name}”?`)
      ) {
        return;
      }
      deleteDiscoSetup(id);
      refreshDiscoSetups();
    },
    [discoSetups, refreshDiscoSetups],
  );

  const addCurriculumFiles = useCallback((files: File[]) => {
    setDiscoPlaylist((prev) => {
      const next = addPlaylistFiles(prev, files);
      if (prev.length === 0 && next.length > 0) {
        const id = next[next.length - 1]!.id;
        queueMicrotask(() => setDiscoPlaylistActiveId(id));
      }
      return next;
    });
  }, []);

  const removeCurriculumTrack = useCallback((id: string) => {
    setDiscoPlaylist((prev) => removePlaylistTrack(prev, id));
    curriculumDatasetRef.current.clearTrack(id);
    setCurriculumSamples(curriculumDatasetRef.current.sampleCount());
    setCurriculumDuration(curriculumDatasetRef.current.durationSec());
    setDiscoPlaylistActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const analyzeCurriculumAll = useCallback(async () => {
    if (!isFeatureEnabled("discoDanceCurriculum")) return;
    for (const track of discoPlaylistRef.current) {
      if (track.analysis || !track.file) continue;
      setDiscoPlaylist((prev) =>
        prev.map((t) =>
          t.id === track.id ? { ...t, analyzing: true, error: null } : t,
        ),
      );
      try {
        const analysis = await analyzeAudioFile(track.file);
        setDiscoPlaylist((prev) =>
          prev.map((t) =>
            t.id === track.id
              ? { ...t, analysis, analyzing: false, error: null }
              : t,
          ),
        );
      } catch (err) {
        setDiscoPlaylist((prev) =>
          prev.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  analyzing: false,
                  error: err instanceof Error ? err.message : String(err),
                }
              : t,
          ),
        );
      }
    }
  }, []);

  const selectCurriculumTrack = useCallback(
    async (id: string) => {
      setDiscoPlaylistActiveId(id);
      const track = discoPlaylistRef.current.find((t) => t.id === id);
      if (!track?.file) return;
      try {
        await discoPlayer.loadFile(track.file);
        setDiscoTrack(track.name);
        setDiscoPlaying(false);
        setDiscoTrackTime(0);
        const d = discoPlayer.duration();
        setDiscoTrackDuration(Number.isFinite(d) ? d : 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [discoPlayer],
  );

  const startCurriculumRecord = useCallback(() => {
    if (!isFeatureEnabled("discoDanceCurriculum") || !discoSoloOk) return;
    const id = discoPlaylistActiveId;
    if (!id) {
      setError("Select a playlist track to record.");
      return;
    }
    const track = discoPlaylistRef.current.find((t) => t.id === id);
    if (!track?.analysis) {
      setError("Analyze the track before curriculum record.");
      return;
    }
    curriculumTrackIdRef.current = id;
    curriculumRecordingRef.current = true;
    setCurriculumRecording(true);
    if (driveModeRef.current !== "disco") beginDiscoDrive();
    if (!discoPlayer.isPlaying()) {
      discoPlayer.play();
      setDiscoPlaying(true);
    }
  }, [beginDiscoDrive, discoPlayer, discoPlaylistActiveId, discoSoloOk]);

  const stopCurriculumRecord = useCallback(() => {
    curriculumRecordingRef.current = false;
    curriculumTrackIdRef.current = null;
    setCurriculumRecording(false);
  }, []);

  const learnCurriculum = useCallback(async () => {
    if (!isFeatureEnabled("discoDanceCurriculum") || !discoSoloOk) return;
    const ds = curriculumDatasetRef.current;
    if (ds.sampleCount() < DISCO_RECORD_MIN_SAMPLES) {
      setError(
        `Need at least ${(DISCO_RECORD_MIN_SAMPLES / 30).toFixed(0)}s of curriculum recording.`,
      );
      return;
    }
    const body = activeDiscoDesign();
    const shape = shapeForDanceDesign(body);
    const { train, holdout } = ds.splitHoldout(5);
    const warm =
      danceGenome && shapesCompatible(danceGenome.shape, shape)
        ? danceGenome.genome.weights
        : null;
    setCurriculumLearning(true);
    setCurriculumLearnProgress({ epoch: 0, epochs: 80, loss: 0 });
    try {
      const result = await fitMultiTrackImitation({
        shape,
        train,
        holdout,
        seed: (0xc0111c01 ^ (body.muscles.length * 4243)) >>> 0,
        epochs: 80,
        lr: 0.05,
        batchSize: 32,
        initialWeights: warm,
        onProgress: (p) => setCurriculumLearnProgress(p),
      });
      setDanceGenome({
        shape,
        genome: {
          weights: result.weights,
          fitness: imitationFitness(result.finalLoss),
        },
      });
      setDanceStage("imitate");
      setCurriculumLearnProgress({
        epoch: 80,
        epochs: 80,
        loss: result.finalLoss,
        holdoutLoss: result.holdoutLoss,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCurriculumLearning(false);
    }
  }, [activeDiscoDesign, danceGenome, discoSoloOk]);

  const refineCurriculum = useCallback(async () => {
    if (
      !isFeatureEnabled("discoDanceCurriculum") ||
      !discoSoloOk ||
      !danceGenome
    ) {
      return;
    }
    const id = discoPlaylistActiveId;
    const track = discoPlaylistRef.current.find((t) => t.id === id);
    if (!track?.analysis) {
      setError("Select an analyzed playlist track to refine on.");
      return;
    }
    const body = activeDiscoDesign();
    const teacher = curriculumDatasetRef.current.toDataset(
      bodyFingerprint(body),
    );
    setCurriculumRefining(true);
    setCurriculumRefineProgress({
      generation: 0,
      generations: 12,
      bestFitness: 0,
      meanFitness: 0,
    });
    try {
      const result = await refineDanceBrain({
        sim: simulation,
        design: body,
        shape: danceGenome.shape,
        seedWeights: danceGenome.genome.weights,
        analysis: track.analysis,
        seed: (0x7ef1e001 ^ (body.muscles.length * 1337)) >>> 0,
        generations: 12,
        populationSize: 10,
        episodeSeconds: 8,
        teacherDataset: teacher.inputs.length > 0 ? teacher : null,
        onProgress: (p) => setCurriculumRefineProgress(p),
      });
      setDanceGenome({
        shape: result.shape,
        genome: result.best,
      });
      setDanceStage("refine");
      simulation.setBrain(result.shape, result.best.weights);
      simulation.setDiscoPuppetMode(discoPuppetMode);
      setDriveMode("brain");
      driveModeRef.current = "brain";
      simulation.driveMode = "brain";
      setDiscoFreestyle(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCurriculumRefining(false);
    }
  }, [
    activeDiscoDesign,
    danceGenome,
    discoPlaylistActiveId,
    discoPuppetMode,
    discoSoloOk,
    simulation,
  ]);

  const clearCurriculumDataset = useCallback(() => {
    curriculumDatasetRef.current.clear();
    setCurriculumSamples(0);
    setCurriculumDuration(0);
  }, []);

  useEffect(() => {
    return () => {
      disposePlaylist(discoPlaylistRef.current);
    };
  }, []);

  /** Respawn dancers at spawn pose; keep audio + disco drive running. */
  const resetDiscoPose = useCallback(() => {
    if (syncMultiDisco()) {
      simulation.setDiscoPuppetMode(discoPuppetMode);
      return;
    }
    if (designRef.current.joints.length > 0) {
      simulation.loadDesign(designRef.current);
      if (driveModeRef.current === "disco") {
        simulation.driveMode = "disco";
        simulation.setDiscoPuppetMode(discoPuppetMode);
      }
    }
  }, [discoPuppetMode, simulation, syncMultiDisco]);

  /** Enter the Disco zone arena (env + sim viewport). Audio optional until Start dancing. */
  const enterDiscoZone = useCallback(() => {
    if (simulation.isEvolving) simulation.abortLiveEvolve();
    if (simulation.isHeadToHead) simulation.abortHeadToHead();
    setH2hRunning(false);
    setH2hProgress(null);
    applyDiscoEnvironment();
    if (!syncMultiDisco() && designRef.current.joints.length > 0) {
      simulation.loadDesign(designRef.current);
    }
    simulation.setDiscoPuppetMode(discoPuppetMode);
    simulation.setDiscoFootMass(discoFootMass);
    setMode("sim");
    setSandboxTab("zone");
    if (discoPlayer.hasTrack()) {
      beginDiscoDrive();
    } else {
      setDriveMode("idle");
      driveModeRef.current = "idle";
      simulation.driveMode = "idle";
    }
  }, [
    applyDiscoEnvironment,
    beginDiscoDrive,
    discoFootMass,
    discoPlayer,
    discoPuppetMode,
    simulation,
    syncMultiDisco,
  ]);

  const leaveDiscoZone = useCallback(() => {
    stopDiscoDrive();
    if (simulation.isMultiDisco) {
      simulation.clearDiscoDancers();
      if (designRef.current.joints.length > 0) {
        simulation.loadDesign(designRef.current);
      }
    }
    simulation.clearDiscoPuppetBodyTune();
    restorePreDiscoEnvironment();
  }, [restorePreDiscoEnvironment, simulation, stopDiscoDrive]);

  /** H7 — load a saved dance brain into Disco freestyle (not Free evolve). */
  const loadDanceFreestyle = useCallback(
    (model: SavedModel) => {
      if (model.task !== "dance") {
        setError("Not a dance model.");
        return;
      }
      const seed = modelToSeed(model);
      setDanceGenome({
        shape: seed.shape,
        genome: { weights: seed.weights, fitness: model.fitness },
      });
      setDanceStage(model.danceMeta?.stage ?? "imitate");
      if (zone !== "disco") {
        setZone("disco");
        saveActiveZone("disco");
        enterDiscoZone();
      }
      discoRecordingRef.current = false;
      setDiscoRecording(false);
      const body = cloneDesign(activeDiscoDesign());
      if (simulation.isMultiDisco) simulation.clearDiscoDancers();
      designRef.current = body;
      setDesign(body);
      simulation.loadDesign(body);
      simulation.setDiscoPuppetMode(discoPuppetMode);
      simulation.setBrain(seed.shape, seed.weights);
      setDriveMode("brain");
      driveModeRef.current = "brain";
      simulation.driveMode = "brain";
      setDiscoFreestyle(true);
      setMode("sim");
      setSandboxTab("creatures");
    },
    [
      activeDiscoDesign,
      discoPuppetMode,
      enterDiscoZone,
      simulation,
      zone,
    ],
  );

  useEffect(() => {
    if (!ready || !isFeatureEnabled("discoMode")) return;
    if (zone === "disco") enterDiscoZone();
    // Restore disco arena once after physics init when the saved zone is Disco.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/ready only
  }, [ready]);

  const invalidateGenomes = useCallback(() => {
    if (simulation.isEvolving) simulation.abortLiveEvolve();
    setBestGenome(null);
    setEvolveProgress(idleProgress());
    simulation.clearBrain();
    if (driveMode === "brain") {
      setDriveMode("idle");
      simulation.driveMode = "idle";
    }
  }, [driveMode, simulation]);
  const commitDesign = useCallback(
    (next: CreatureDesign) => {
      undoStackRef.current.push(cloneDesign(designRef.current));
      if (undoStackRef.current.length > MAX_UNDO) {
        undoStackRef.current.shift();
      }
      setUndoCount(undoStackRef.current.length);
      setDesign(ensureAppearance(next));
      invalidateGenomes();
    },
    [invalidateGenomes],
  );
  const undo = useCallback(() => {
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    setUndoCount(undoStackRef.current.length);
    setDesign(prev);
    invalidateGenomes();
  }, [invalidateGenomes]);
  const commitEnv = useCallback(
    (
      next: EnvironmentDesign,
      opts?: { packageId?: string | null },
    ) => {
      envUndoStackRef.current.push(cloneEnvironment(envDesignRef.current));
      if (envUndoStackRef.current.length > MAX_UNDO) {
        envUndoStackRef.current.shift();
      }
      setEnvUndoCount(envUndoStackRef.current.length);
      setEnvDesign(cloneEnvironment(next));
      if (opts && "packageId" in opts) {
        setActiveEnvPackageId(opts.packageId ?? null);
      } else {
        setActiveEnvPackageId(null);
      }
    },
    [],
  );
  const undoEnv = useCallback(() => {
    const prev = envUndoStackRef.current.pop();
    if (!prev) return;
    setEnvUndoCount(envUndoStackRef.current.length);
    setEnvDesign(prev);
    setActiveEnvPackageId(null);
    setEnvSelection(null);
  }, []);
  /** Apply a curriculum stage window onto the active course package. */
  const applyCourseStage = useCallback(
    (packageId: string, stageIndex: number, opts?: { selectSprint?: boolean }) => {
      const curriculum = curriculumForPackageId(packageId);
      if (!curriculum) return false;
      const idx = clampCourseStageIndex(curriculum, stageIndex);
      const staged = applyCourseCurriculumStage(curriculum, idx);
      setEnvDesign(staged);
      setActiveEnvPackageId(packageId);
      setCourseStageIndex(idx);
      setEnvSelection(null);
      if (opts?.selectSprint) {
        setGoalId("sprint");
      }
      return true;
    },
    [],
  );

  /** Apply a saved package as the active training / studio environment. */
  const applyTrainingEnv = useCallback(
    (pkg: EnvironmentPackage) => {
      const curriculum = curriculumForPackageId(pkg.id);
      if (courseCurriculumOn && curriculum) {
        applyCourseStage(pkg.id, 0, { selectSprint: true });
        setCourseCurriculumOn(true);
        return;
      }
      setEnvDesign(cloneEnvironment(pkg.environment));
      setActiveEnvPackageId(pkg.id);
      setEnvSelection(null);
      setCourseStageIndex(0);
    },
    [applyCourseStage, courseCurriculumOn],
  );
  const deleteEnvSelected = useCallback(() => {
    const result = deleteEnvSelection(envDesignRef.current, envSelection);
    if (!envSelection) return;
    commitEnv(result.env);
    setEnvSelection(result.selection);
  }, [commitEnv, envSelection]);
  useEffect(() => {
    let cancelled = false;
    simulation
      .init()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [simulation]);
  useEffect(() => {
    simulation.driveMode = driveMode;
  }, [driveMode, simulation]);
  useEffect(() => {
    simulation.setBrainHz(brainHz);
  }, [brainHz, simulation]);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== "edit" || editPhysics) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const multi = isFeatureEnabled("editorMultiSelectTransforms");

      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }

      if (!multi) return;

      if (mod && key === "a") {
        e.preventDefault();
        setSelection(jointsSelection(design.joints.map((j) => j.id)));
        setTool("select");
        return;
      }

      const jointIds = selectedJointIds(selection);
      if (mod && key === "d" && jointIds.length > 0) {
        e.preventDefault();
        const result = duplicateSelection(design, jointIds);
        commitDesign(result.design);
        setSelection(jointsSelection(result.newJointIds));
        return;
      }
      if (mod && key === "m" && jointIds.length > 0) {
        e.preventDefault();
        const result = mirrorDuplicateSelection(design, jointIds);
        commitDesign(result.design);
        setSelection(jointsSelection(result.newJointIds));
        return;
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        jointIds.length > 0
      ) {
        e.preventDefault();
        commitDesign(deleteJointSelection(design, jointIds));
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, undo, editPhysics, design, selection, commitDesign]);
  const selectGoal = (id: GoalId) => {
    setGoalId(id);
    saveActiveGoalId(id);
    simulation.setTask(getGoal(id).task);
    invalidateGenomes();
  };
  const selectZone = (id: ZoneId) => {
    if (id === "disco" && !isFeatureEnabled("discoMode")) return;
    const prev = zone;
    if (prev === "disco" && id !== "disco") {
      leaveDiscoZone();
    }
    setZone(id);
    saveActiveZone(id);
    if (id === "disco") {
      enterDiscoZone();
      return;
    }
    const next = defaultGoalForZone(id);
    setGoalId(next.id);
    saveActiveGoalId(next.id);
    simulation.setTask(next.task);
    invalidateGenomes();
  };
  /** Spawn `next` (or the current design) in the sim without changing tabs. */
  const syncDesignToSim = (designOverride?: CreatureDesign) => {
    const next = designOverride ?? design;
    if (next.joints.length === 0) return false;
    try {
      if (simulation.isEvolving) simulation.abortLiveEvolve();
      if (simulation.isHeadToHead) simulation.abortHeadToHead();
      simulation.clearDiscoDancers();
      setH2hRunning(false);
      setH2hProgress(null);
      setEvolveProgress(idleProgress());
      setLiveBrain(null);
      simulation.setTask(activeTask);
      simulation.loadDesign(next);
      setManualDrives(simulation.manualDrives.slice());
      setMode("sim");
      setDriveMode("idle");
      simulation.driveMode = "idle";
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const startEditPhysics = () => {
    if (design.joints.length === 0) {
      setError("Add at least one joint before enabling physics.");
      return;
    }
    if (syncDesignToSim(design)) {
      setEditPhysics(true);
      setSandboxTab("edit");
      simulation.timeScale = observeSpeed;
    }
  };

  const stopEditPhysics = () => {
    setEditPhysics(false);
    simulation.running = false;
    setMode("edit");
    setSandboxTab("edit");
    setDockInset(0);
  };
  /** Drop the current design into the sim viewport and open Train. */
  const startSim = (designOverride?: CreatureDesign) => {
    const next = designOverride ?? design;
    if (next.joints.length === 0) {
      returnToEdit();
      return;
    }
    setEditPhysics(false);
    if (syncDesignToSim(next)) setSandboxTab("train");
  };
  const onSandboxTabChange = (tab: SandboxTabId) => {
    if (tab === "edit") {
      if (zone === "disco") leaveDiscoZone();
      if (editPhysics) {
        // Stay in settle preview if already watching physics on Edit.
        setSandboxTab("edit");
        return;
      }
      returnToEdit();
      return;
    }
    if (tab === "world") {
      if (zone === "disco") leaveDiscoZone();
      setEditPhysics(false);
      enterWorld();
      return;
    }
    if (tab === "train") {
      if (design.joints.length === 0) {
        returnToEdit();
        return;
      }
      setEditPhysics(false);
      if (simulation.isEvolving) {
        setSandboxTab("train");
        return;
      }
      if (simulation.isHeadToHead) {
        setSandboxTab("train");
        setMode("sim");
        return;
      }
      if (zone === "disco" && isFeatureEnabled("discoMode")) {
        enterDiscoZone();
        setSandboxTab("train");
        return;
      }
      startSim();
      return;
    }
    if (tab === "h2h") {
      setSandboxTab("h2h");
      return;
    }
    if (tab === "zone") {
      setSandboxTab("zone");
      if (zone === "disco" && isFeatureEnabled("discoMode")) {
        enterDiscoZone();
      }
      return;
    }
    if (tab === "discoveries") {
      setSandboxTab("discoveries");
      return;
    }
    setSandboxTab(tab);
  };
  const loadPreset = (preset: CreatureDesign) => {
    const next = ensureAppearance(cloneDesign(preset));
    commitDesign(next);
    setSaveName(next.name || "Custom");
    // Keep the sim viewport in sync when picking from Creatures while already simulating.
    if (mode === "sim" && !simulation.isEvolving) {
      if (syncDesignToSim(next) && editPhysics) {
        setSandboxTab("edit");
        simulation.timeScale = observeSpeed;
      }
    }
  };
  const clearDesign = () => {
    commitDesign({
      name: "Custom",
      joints: [],
      bones: [],
      muscles: [],
      appearance: emptyAppearance(),
    });
    setSaveName("Custom");
    returnToEdit();
  };
  const updateManual = (index: number, value: number) => {
    simulation.setManualDrive(index, value);
    setManualDrives((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  };
  const resolveEvolveSeed = (seedFrom?: {
    shape: NetworkShape;
    weights: Float32Array;
    morph?: Genome["morph"];
  }):
    | { shape: NetworkShape; weights: Float32Array; morph?: Genome["morph"] }
    | undefined => {
    if (seedFrom) return seedFrom;
    if (!isFeatureEnabled("trainStartFrom")) return undefined;
    if (gaKnobs.startFrom === "best_of_run" && bestGenome) {
      return {
        shape: bestGenome.shape,
        weights: bestGenome.genome.weights,
        morph: bestGenome.genome.morph,
      };
    }
    if (gaKnobs.startFrom === "saved" && gaKnobs.savedModelId) {
      const model = savedModels.find((m) => m.id === gaKnobs.savedModelId);
      if (!model || model.task === "dance") return undefined;
      const expected = shapeForDesign(design);
      if (!shapesCompatible(model.shape, expected) || model.task !== activeTask) {
        setError(
          "Saved brain shape/task mismatch — pick a matching creature and goal first.",
        );
        return undefined;
      }
      return modelToSeed(model);
    }
    return undefined;
  };

  const startEvolve = (seedFrom?: {
    shape: NetworkShape;
    weights: Float32Array;
    morph?: Genome["morph"];
  }) => {
    if (design.muscles.length === 0) {
      setError("Add at least one muscle before evolving.");
      return;
    }
    try {
      const resolvedSeed = resolveEvolveSeed(seedFrom);
      if (
        !seedFrom &&
        isFeatureEnabled("trainStartFrom") &&
        gaKnobs.startFrom === "saved" &&
        gaKnobs.savedModelId &&
        !resolvedSeed
      ) {
        return;
      }
      const popSize = isFeatureEnabled("trainRecipes")
        ? gaKnobs.populationSize
        : LIVE_POPULATION_SIZE;
      const batchSize = isFeatureEnabled("trainRecipes")
        ? gaKnobs.batchSize
        : LIVE_BATCH_SIZE;
      const trySeconds = isFeatureEnabled("trainRecipes")
        ? gaKnobs.episodeSeconds
        : episodeSeconds;
      const maxGens = isFeatureEnabled("trainRecipes")
        ? gaKnobs.maxGenerations
        : undefined;
      setMode("sim");
      setSandboxTab("train");
      setDriveMode("brain");
      simulation.timeScale = trainSpeed;
      if (
        isFeatureEnabled("trainTelemetryLog") &&
        trainTelemetryOnRef.current
      ) {
        const session = beginTrainTelemetrySession({
          task: activeTask,
          design,
          runSeed,
          knobs: { ...gaKnobs },
          window: TRAIN_TELEMETRY_WINDOW,
        });
        trainTelemetrySessionRef.current = session;
        setTrainTelemetrySession(session);
      } else {
        trainTelemetrySessionRef.current = null;
        setTrainTelemetrySession(null);
      }
      setEvolveProgress({
        ...idleProgress(),
        running: true,
        status: resolvedSeed
          ? `Keep training (${activeTask})…`
          : `Watching live batch (${activeTask})…`,
        populationSize: popSize,
        batch: 1,
        batchCount: Math.ceil(popSize / batchSize),
        episodeDuration: trySeconds,
        episodeT: 0,
      });
      simulation.startLiveEvolve({
        design: cloneDesign(design),
        task: activeTask,
        populationSize: popSize,
        batchSize,
        morphEvolve:
          isFeatureEnabled("morphEvolve") && morphEvolveOn,
        messyBodies:
          isFeatureEnabled("trainExperiences") && messyBodies,
        episodeSeconds: trySeconds,
        maxGenerations: maxGens,
        seed: runSeed,
        seedGenome: resolvedSeed,
        breed: isFeatureEnabled("trainRecipes")
          ? {
              eliteCount: gaKnobs.eliteCount,
              tournamentSize: gaKnobs.tournamentSize,
              mutationSigma: gaKnobs.mutationSigma,
              mutationResetRate: gaKnobs.mutationResetRate,
              crossover: isFeatureEnabled("trainSchedules")
                ? gaKnobs.crossover
                : false,
              annealMutation: isFeatureEnabled("trainSchedules")
                ? gaKnobs.annealMutation
                : false,
              shortTriesFirst: isFeatureEnabled("trainSchedules")
                ? gaKnobs.shortTriesFirst
                : false,
              stopAfterFall: isFeatureEnabled("trainSchedules")
                ? gaKnobs.stopAfterFall
                : false,
            }
          : undefined,
        priorities: isFeatureEnabled("goalPriorities")
          ? goalPriorities
          : undefined,
        onProgress: (p) => setEvolveProgress(p),
        onFinished: (genome, shape) => {
          setBestGenome({ shape, genome });
          setLiveBrain(null);
          setDriveMode("idle");
          simulation.driveMode = "idle";
          simulation.timeScale = observeSpeed;
          const tel = trainTelemetrySessionRef.current;
          if (
            isFeatureEnabled("trainTelemetryLog") &&
            tel &&
            tel.endedAt == null
          ) {
            finalizeAndMaybeDownloadTelemetry(tel, true);
          }
          if (isFeatureEnabled("bestEverLedger")) {
            considerBestEver(activeTask, genome.fitness, designRef.current);
            setBestEverList(loadBestEver());
          }
          if (
            isFeatureEnabled("goalPriorities") &&
            stageTrainerOn &&
            DEFAULT_RUN_STAGES.some((s) => s.goalId === goalId)
          ) {
            const idx = DEFAULT_RUN_STAGES.findIndex((s) => s.goalId === goalId);
            const step = DEFAULT_RUN_STAGES[idx];
            const next = DEFAULT_RUN_STAGES[idx + 1];
            if (step && next && genome.fitness >= step.threshold) {
              selectGoal(next.goalId as GoalId);
            }
          }
          if (
            isFeatureEnabled("courseCurriculum") &&
            courseCurriculumOn &&
            activeEnvPackageId
          ) {
            const curriculum = curriculumForPackageId(activeEnvPackageId);
            if (curriculum) {
              const idx = clampCourseStageIndex(curriculum, courseStageIndex);
              const step = curriculum.stages[idx];
              const next = curriculum.stages[idx + 1];
              if (step && next && genome.fitness >= step.threshold) {
                applyCourseStage(activeEnvPackageId, idx + 1, {
                  selectSprint: true,
                });
              }
            }
          }
        },
      });
      setManualDrives([]);
    } catch (err) {
      setEvolveProgress((prev) => ({
        ...prev,
        running: false,
        status: "Error",
      }));
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const continueFromBest = () => {
    if (!bestGenome) {
      setError("No elite genome to continue from — Evolve first.");
      return;
    }
    startEvolve({
      shape: bestGenome.shape,
      weights: bestGenome.genome.weights,
    });
  };
  const continueFromModel = (model: SavedModel) => {
    if (model.task === "dance") {
      loadDanceFreestyle(model);
      return;
    }
    const expected = shapeForDesign(design);
    if (!shapesCompatible(model.shape, expected) || model.task !== activeTask) {
      setError(
        "Saved model shape/task mismatch — load a matching creature and goal first.",
      );
      return;
    }
    startEvolve(modelToSeed(model));
  };
  const stopH2h = useCallback(() => {
    simulation.abortHeadToHead();
    setH2hRunning(false);
    setH2hProgress(null);
    setDriveMode("idle");
    simulation.driveMode = "idle";
  }, [simulation]);

  const startH2hHeat = useCallback(
    (opts: {
      modelA: SavedModel;
      modelB: SavedModel;
      goalId: GoalId;
      useCurrentEnv: boolean;
    }) => {
      const pool = designCandidatePool(packages, BUNDLED_MODELS, design);
      const built = headToHeadEntriesFromModels(opts.modelA, opts.modelB, pool);
      if (!built) {
        setError("Could not resolve creature bodies for both saved models.");
        return;
      }
      try {
        if (simulation.isEvolving) simulation.abortLiveEvolve();
        simulation.clearDiscoDancers();
        const task = getGoal(opts.goalId).task;
        if (opts.useCurrentEnv) {
          simulation.setEnvironment(envDesignRef.current);
        }
        simulation.setTask(task);
        setGoalId(opts.goalId);
        saveActiveGoalId(opts.goalId);
        simulation.startHeadToHead({
          entries: built.entries,
          task,
          episodeSeconds,
          onProgress: (episodeT, episodeDuration) => {
            setH2hProgress({ episodeT, episodeDuration });
          },
          onFinished: (result) => {
            setH2hResult(result);
            setH2hRunning(false);
            setH2hProgress(null);
          },
        });
        setMode("sim");
        setSandboxTab("train");
        setDriveMode("brain");
        simulation.driveMode = "brain";
        setH2hRunning(true);
        setH2hResult(null);
        setH2hProgress({ episodeT: 0, episodeDuration: episodeSeconds });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [design, episodeSeconds, packages, simulation],
  );
  const saveBestModel = () => {
    if (!bestGenome) {
      setError("No elite genome to save.");
      return;
    }
    const name = trainedModelName(design.name);
    saveModel({
      name,
      task: activeTask,
      shape: bestGenome.shape,
      genome: bestGenome.genome,
      design,
    });
    downloadText(
      `${name.replace(/\s+/g, "_")}.json`,
      exportModelJson({
        name,
        task: activeTask,
        shape: bestGenome.shape,
        weights: bestGenome.genome.weights,
        fitness: bestGenome.genome.fitness,
        design,
      }),
    );
    refreshModels();
  };
  const stopEvolve = () => {
    simulation.requestStopEvolve();
  };
  const playBest = () => {
    if (!bestGenome) return;
    try {
      if (simulation.isEvolving) simulation.abortLiveEvolve();
      simulation.setTask(activeTask);
      simulation.loadDesign(design);
      setManualDrives(simulation.manualDrives.slice());
      setMode("sim");
      simulation.setBrain(bestGenome.shape, bestGenome.genome.weights);
      setDriveMode("brain");
      simulation.driveMode = "brain";
      if (isFeatureEnabled("secretGoals")) {
        simulation.beginSoloEpisodeWatch(episodeSeconds);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  const saveCurrentPackage = () => {
    const name = saveName.trim() || design.name.trim() || "Creature";
    const existing = packages.find(
      (p) => p.displayName.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      const ok = window.confirm(
        `A creature named "${existing.displayName}" already exists. Overwrite it?`,
      );
      if (!ok) return;
      const result = savePackageRevision(existing.id, {
        design: { ...design, name },
        appearance: design.appearance,
        displayName: name,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
    } else {
      const result = saveNewPackage(
        { ...design, name },
        {
          displayName: name,
          appearance: design.appearance,
          source: "user",
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }
    if (design.name !== name) {
      commitDesign({ ...design, name });
    }
    setSaveName(name);
    refreshPackages();
  };
  const saveCurrentEnv = () => {
    const result = saveNewEnvironmentPackage(envDesign, {
      displayName: envDesign.name,
      source: "user",
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setActiveEnvPackageId(result.value.id);
    refreshEnvPackages();
  };
  const dismissSecretReveal = () => {
    setSecretRevealQueue((q) => q.slice(1));
  };
  const toggleImmersive = useCallback(async () => {
    if (!isFeatureEnabled("immersiveFullscreen")) return;
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setImmersive(true);
      } else {
        await document.exitFullscreen();
        setImmersive(false);
      }
    } catch {
      setImmersive((v) => !v);
    }
  }, []);
  useEffect(() => {
    if (!isFeatureEnabled("immersiveFullscreen")) return;
    const onFs = () => {
      setImmersive(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);
  if (error) {
    return (
      <div className="app error">
        {" "}
        <h1>Solemn Sandbox</h1> <p>Failed to start: {error}</p>{" "}
        <button type="button" onClick={() => setError(null)}>
          {" "}
          Dismiss{" "}
        </button>{" "}
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="app loading">
        {" "}
        <h1>Solemn Sandbox</h1> <p>Loading physics…</p>{" "}
      </div>
    );
  }
  const driveButtons: [DriveMode, string][] = [
    ["idle", "Idle"],
    ["manual", "Manual"],
    ["sine", "Oscillate"],
    ["brain", "Brain"],
  ];
  return (
    <div className={immersive ? "app app-immersive" : "app"}>
      {immersive && isFeatureEnabled("immersiveFullscreen") && (
        <button
          type="button"
          className="immersive-exit"
          onClick={() => void toggleImmersive()}
        >
          Exit immersive
        </button>
      )}

      {(() => {
        const zonePanel = (
          <div className="panel-stack">
            {isFeatureEnabled("zoneTabs") && (
              <section>
                <h2>Zone</h2>
                <div className="zone-tabs">
                  {ZONE_ORDER.filter(
                    (id) => id !== "disco" || isFeatureEnabled("discoMode"),
                  ).map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={zone === id ? "active" : ""}
                      style={
                        zone === id
                          ? {
                              borderColor: ZONES[id].accent,
                              color: ZONES[id].accent,
                            }
                          : undefined
                      }
                      onClick={() => selectZone(id)}
                      title={ZONES[id].description}
                    >
                      {ZONES[id].shortLabel}
                    </button>
                  ))}
                </div>
                <p className="hint muted">{ZONES[zone].title}</p>
                {zone === "disco" && isFeatureEnabled("discoMode") ? (
                  <DiscoTrackLearnPanel
                    trackName={discoTrack}
                    hasTrack={discoPlayer.hasTrack()}
                    playing={discoPlaying}
                    dancing={driveMode === "disco"}
                    disabled={evolveProgress.running || h2hRunning || discoLearning}
                    recording={discoRecording}
                    recordSamples={discoRecordCount}
                    recordDurationSec={discoRecordDuration}
                    learning={discoLearning}
                    learnProgress={discoLearnProgress}
                    hasDanceBrain={!!danceGenome}
                    freestyle={discoFreestyle}
                    soloOk={discoSoloOk}
                    minRecordSamples={DISCO_RECORD_MIN_SAMPLES}
                    onToggleRecord={toggleDiscoRecord}
                    onLearn={() => {
                      void learnDiscoDance();
                    }}
                    onToggleFreestyle={toggleDiscoFreestyle}
                    onSaveDance={saveDanceModel}
                    onClearRecord={clearDiscoRecord}
                    onLoadFile={async (file) => {
                      await discoPlayer.loadFile(file);
                      setDiscoTrack(file.name);
                      setDiscoPlaying(false);
                      setDiscoTrackTime(0);
                      const d = discoPlayer.duration();
                      setDiscoTrackDuration(Number.isFinite(d) ? d : 0);
                    }}
                    onPlay={() => {
                      discoPlayer.play();
                      setDiscoPlaying(true);
                      if (discoFreestyle) return;
                      if (driveMode !== "disco") beginDiscoDrive();
                    }}
                    onPause={() => {
                      discoPlayer.pause();
                      setDiscoPlaying(false);
                      setDiscoTrackTime(discoPlayer.currentTime());
                    }}
                    onStartDancing={() => {
                      if (discoFreestyle) {
                        setDiscoFreestyle(false);
                        simulation.clearBrain();
                      }
                      discoPlayer.play();
                      setDiscoPlaying(true);
                      beginDiscoDrive();
                    }}
                    onResetPose={resetDiscoPose}
                  />
                ) : (
                  isFeatureEnabled("goalCatalog") && (
                    <>
                      <h3 className="subhead">Goal</h3>
                      <GoalPicker
                        goals={zoneGoals}
                        selectedId={goalId}
                        onSelect={selectGoal}
                      />
                      <GoalInfoCard goal={getGoal(goalId)} zone={zone} />
                    </>
                  )
                )}
                {zone === "disco" &&
                  isFeatureEnabled("discoDanceCurriculum") && (
                    <DiscoCurriculumPanel
                      tracks={discoPlaylist}
                      activeTrackId={discoPlaylistActiveId}
                      datasetSamples={curriculumSamples}
                      datasetDurationSec={curriculumDuration}
                      learning={curriculumLearning}
                      refining={curriculumRefining}
                      learnProgress={curriculumLearnProgress}
                      refineProgress={curriculumRefineProgress}
                      hasDanceBrain={!!danceGenome}
                      soloOk={discoSoloOk}
                      disabled={
                        evolveProgress.running ||
                        h2hRunning ||
                        discoLearning ||
                        curriculumLearning ||
                        curriculumRefining
                      }
                      recording={curriculumRecording}
                      onAddFiles={addCurriculumFiles}
                      onRemoveTrack={removeCurriculumTrack}
                      onSelectTrack={(id) => {
                        void selectCurriculumTrack(id);
                      }}
                      onAnalyzeAll={() => {
                        void analyzeCurriculumAll();
                      }}
                      onRecordCurriculum={startCurriculumRecord}
                      onStopRecord={stopCurriculumRecord}
                      onLearnCurriculum={() => {
                        void learnCurriculum();
                      }}
                      onRefine={() => {
                        void refineCurriculum();
                      }}
                      onClearDataset={clearCurriculumDataset}
                    />
                  )}
              </section>
            )}
            <CollapsiblePanel
              title="Feel notes"
              open={feelNotesOpen}
              onToggle={() => setFeelNotesOpen((v) => !v)}
            >
              <p className="hint muted">
                Muscles are always-on springs toward rest length, plus active
                contract / expand forces. Brace with triangles; serial chains
                flop. Parent soft-body physics is never imported.
              </p>
            </CollapsiblePanel>
          </div>
        );

        const discoveriesPanel = (
          <div className="panel-stack">
            <section>
              <h2>Discoveries</h2>
              <p className="hint muted">
                Hidden goals unlocked while training and experimenting.
              </p>
              {isFeatureEnabled("discoveryUi") ? (
                <TrophyCabinet discoveries={discoveries} />
              ) : (
                <p className="hint muted">Discovery UI is disabled.</p>
              )}
            </section>
          </div>
        );

        const creaturesPanel = (
          <div className="panel-stack">
            <section>
              <h2>Presets</h2>
              <div className="button-col">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => loadPreset(p)}
                  >
                    {p.name}
                  </button>
                ))}
                <button type="button" onClick={() => loadPreset(DISCO_DANCER)}>
                  Disco Dancer
                </button>
              </div>
            </section>
            {isFeatureEnabled("jsonImportExport") && (
              <section>
                <h2>Import / Export</h2>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() =>
                      downloadText(
                        `${design.name.replace(/\s+/g, "_").toLowerCase()}.json`,
                        exportCreatureJson(design),
                      )
                    }
                  >
                    Export creature
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Import creature
                  </button>
                </div>
              </section>
            )}
            {isFeatureEnabled("creaturePackages") && (
              <section>
                <h2>Library</h2>
                {isFeatureEnabled("creatureLibrary") && (
                  <label className="field-row" style={{ marginBottom: "0.35rem" }}>
                    <span>Filter</span>
                    <input
                      type="search"
                      value={creatureFilter}
                      onChange={(e) => setCreatureFilter(e.target.value)}
                      placeholder="Name…"
                    />
                  </label>
                )}
                <div className="button-col">
                  {packages.length === 0 && (
                    <p className="hint muted">No saved packages yet.</p>
                  )}
                  {packages
                    .filter((pkg) =>
                      creatureFilter.trim()
                        ? pkg.displayName
                            .toLowerCase()
                            .includes(creatureFilter.trim().toLowerCase())
                        : true,
                    )
                    .map((pkg) => (
                      <div key={pkg.id} className="library-row library-row-rich">
                        <button
                          type="button"
                          onClick={() =>
                            loadPreset({
                              ...cloneDesign(pkg.design),
                              appearance: pkg.appearance,
                              name: pkg.displayName,
                            })
                          }
                        >
                          <span className="library-name">{pkg.displayName}</span>
                          {isFeatureEnabled("creatureLibrary") && (
                            <span className="hint muted library-meta">
                              r{pkg.revision} · {pkg.source}
                              {pkg.notes ? ` · ${pkg.notes}` : ""}
                              {" · "}
                              {new Date(pkg.updatedAt).toLocaleDateString()}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="danger-ghost"
                          onClick={() => {
                            deletePackage(pkg.id);
                            refreshPackages();
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        );

        const worldPanel = (
          <div className="panel-stack">
            {isFeatureEnabled("environmentsRepo") ? (
              <>
                <section>
                  <h2>Environment Studio</h2>
                  <p className="hint muted">
                    Place and resize on the canvas with the World dock below.
                    Save packages here; pick the training course from the Train
                    dock.
                  </p>
                </section>
                <CollapsiblePanel
                  title="Theme & save"
                  open={worldThemeOpen}
                  onToggle={() => setWorldThemeOpen((v) => !v)}
                >
                <label className="field-row">
                  <span>Name</span>
                  <input
                    type="text"
                    value={envDesign.name}
                    onChange={(e) =>
                      commitEnv({ ...envDesign, name: e.target.value })
                    }
                  />
                </label>
                <label className="field-row">
                  <span>Theme</span>
                  <select
                    value={envDesign.theme}
                    onChange={(e) =>
                      commitEnv({
                        ...envDesign,
                        theme: e.target.value as (typeof ENV_THEMES)[number],
                      })
                    }
                  >
                    {ENV_THEMES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="button-row" style={{ marginTop: "0.35rem" }}>
                  <button type="button" onClick={saveCurrentEnv}>
                    Save env
                  </button>
                  <button
                    type="button"
                    onClick={undoEnv}
                    disabled={envUndoCount === 0}
                  >
                    Undo env
                  </button>
                </div>
                {isFeatureEnabled("jsonImportExport") && (
                  <div className="button-row" style={{ marginTop: "0.35rem" }}>
                    <button
                      type="button"
                      onClick={() =>
                        downloadText(
                          `${envDesign.name.replace(/\s+/g, "_").toLowerCase()}_env.json`,
                          exportEnvironmentJson(envDesign),
                        )
                      }
                    >
                      Export env
                    </button>
                    <button
                      type="button"
                      onClick={() => envFileInputRef.current?.click()}
                    >
                      Import env
                    </button>
                  </div>
                )}
                </CollapsiblePanel>
                <CollapsiblePanel
                  title="Env library"
                  open={worldLibOpen}
                  onToggle={() => setWorldLibOpen((v) => !v)}
                >
                <div className="button-col">
                  {envPackages.map((pkg) => (
                    <div key={pkg.id} className="library-row">
                      <button
                        type="button"
                        onClick={() => {
                          commitEnv(pkg.environment, {
                            packageId: pkg.id,
                          });
                          setEnvSelection(null);
                        }}
                        title={
                          pkg.source === "builtin"
                            ? "Builtin flat ground"
                            : `rev ${pkg.revision}`
                        }
                      >
                        {pkg.displayName}
                        {pkg.source === "builtin" ? " ★" : ""}
                        {pkg.environment.obstacles.length > 0
                          ? ` (${pkg.environment.obstacles.length} obst)`
                          : ""}
                        {pkg.environment.terrain
                          ? ` · terrain`
                          : ""}
                        {pkg.environment.tower ? ` · tower` : ""}
                      </button>
                      {pkg.source !== "builtin" && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              duplicateEnvironmentPackage(pkg.id);
                              refreshEnvPackages();
                            }}
                            title="Duplicate"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="danger-ghost"
                            onClick={() => {
                              deleteEnvironmentPackage(pkg.id);
                              refreshEnvPackages();
                            }}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                </CollapsiblePanel>
              </>
            ) : (
              <p className="hint muted">Environments disabled.</p>
            )}
          </div>
        );

        const editPanel = (
          <div className="panel-stack">
            <section>
              <h2>Tools</h2>
              <div className="button-row">
                {(["joint", "bone", "muscle", "select"] as EditTool[]).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      className={tool === t ? "active" : ""}
                      disabled={editPhysics}
                      onClick={() => setTool(t)}
                    >
                      {t}
                    </button>
                  ),
                )}
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={snapEnabled}
                  onChange={(e) => setSnapEnabled(e.target.checked)}
                  disabled={editPhysics}
                />
                Snap joints to grid
              </label>
              <label
                className="toggle-row"
                title="Drop the creature under gravity with muscles idle"
              >
                <input
                  type="checkbox"
                  checked={editPhysics}
                  disabled={
                    !hasCreature ||
                    evolveProgress.running ||
                    h2hRunning
                  }
                  onChange={(e) => {
                    if (e.target.checked) startEditPhysics();
                    else stopEditPhysics();
                  }}
                />
                Physics settle
              </label>
              {editPhysics && (
                <>
                  <p className="hint muted">
                    Muscles idle — watch how the body rests. Editing is paused
                    until you turn this off.
                  </p>
                  <div className="button-row wrap">
                    <button
                      type="button"
                      onClick={() => {
                        if (syncDesignToSim(design)) {
                          setSandboxTab("edit");
                          simulation.timeScale = observeSpeed;
                        }
                      }}
                    >
                      Reset drop
                    </button>
                    {OBSERVE_SPEEDS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={observeSpeed === s ? "active" : ""}
                        onClick={() => setObserveSpeed(s)}
                        title="Playback speed while settling"
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="button-row" style={{ marginTop: "0.45rem" }}>
                <button
                  type="button"
                  onClick={undo}
                  disabled={undoCount === 0 || editPhysics}
                >
                  Undo
                </button>
                <button
                  type="button"
                  onClick={clearDesign}
                  disabled={editPhysics}
                >
                  Clear
                </button>
              </div>
              {isFeatureEnabled("creaturePackages") && (
                <div className="save-current-block">
                  <label className="field-row">
                    <span>Name</span>
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Creature name"
                      aria-label="Save name"
                    />
                  </label>
                  <button type="button" onClick={saveCurrentPackage}>
                    Save current
                  </button>
                </div>
              )}
              <p className="hint">
                {tool === "joint" &&
                  "Click empty space to place · drag a joint to move (bones/muscles resize)."}
                {tool === "select" &&
                  (isFeatureEnabled("editorMultiSelectTransforms")
                    ? "Drag empty space to box-select · Shift-click add · Ctrl+A all · Ctrl+D copy · Ctrl+M mirror · handles scale/rotate · Delete removes."
                    : "Click a joint, bone, muscle, or body part · drag joints/parts · corner handles resize parts.")}
                {tool === "bone" && "Left-drag joint→joint to draw a bone."}
                {tool === "muscle" && "Left-drag bone→bone to draw a muscle."}
              </p>
              <CapabilityPanel design={design} />

              {selection?.kind === "joints" &&
                selection.ids.length > 1 &&
                isFeatureEnabled("editorMultiSelectTransforms") &&
                (() => {
                  const summary = selectionSummary(design, selection.ids);
                  return (
                    <div className="inspector">
                      <h3 className="subhead">Selection</h3>
                      <p className="hint muted">
                        {summary.joints} joints · {summary.bones} bones ·{" "}
                        {summary.muscles} muscles
                        {summary.bodyParts > 0
                          ? ` · ${summary.bodyParts} parts`
                          : ""}
                      </p>
                      <div className="button-row wrap">
                        <button
                          type="button"
                          disabled={editPhysics}
                          onClick={() => {
                            const result = duplicateSelection(
                              design,
                              selection.ids,
                            );
                            commitDesign(result.design);
                            setSelection(
                              jointsSelection(result.newJointIds),
                            );
                          }}
                          title="Ctrl+D"
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          disabled={editPhysics}
                          onClick={() => {
                            const result = mirrorDuplicateSelection(
                              design,
                              selection.ids,
                            );
                            commitDesign(result.design);
                            setSelection(
                              jointsSelection(result.newJointIds),
                            );
                          }}
                          title="Ctrl+M"
                        >
                          Mirror
                        </button>
                        <button
                          type="button"
                          disabled={editPhysics}
                          onClick={() => {
                            commitDesign(
                              deleteJointSelection(design, selection.ids),
                            );
                            setSelection(null);
                          }}
                          title="Delete"
                        >
                          Delete
                        </button>
                      </div>
                      <p className="hint muted">
                        Drag inside the box to move · corner handles scale ·
                        top handle rotates.
                      </p>
                    </div>
                  );
                })()}

              {selection?.kind === "joints" &&
                selection.ids.length === 1 &&
                (() => {
                  const joint = design.joints.find(
                    (j) => j.id === selection.ids[0],
                  );
                  if (!joint) return null;
                  return (
                    <div className="inspector">
                      <h3 className="subhead">Joint {joint.id}</h3>
                      {isFeatureEnabled("editorMultiSelectTransforms") && (
                        <div className="button-row wrap">
                          <button
                            type="button"
                            disabled={editPhysics}
                            onClick={() => {
                              const result = duplicateSelection(design, [
                                joint.id,
                              ]);
                              commitDesign(result.design);
                              setSelection(
                                jointsSelection(result.newJointIds),
                              );
                            }}
                            title="Ctrl+D"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            disabled={editPhysics}
                            onClick={() => {
                              const result = mirrorDuplicateSelection(
                                design,
                                [joint.id],
                              );
                              commitDesign(result.design);
                              setSelection(
                                jointsSelection(result.newJointIds),
                              );
                            }}
                            title="Ctrl+M"
                          >
                            Mirror
                          </button>
                        </div>
                      )}
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={!!joint.isFoot}
                          onChange={() =>
                            commitDesign(
                              updateJoint(design, joint.id, {
                                isFoot: !joint.isFoot,
                              }),
                            )
                          }
                        />
                        Mark as foot
                      </label>
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={!!joint.isHead}
                          onChange={() =>
                            commitDesign(
                              updateJoint(design, joint.id, {
                                isHead: !joint.isHead,
                              }),
                            )
                          }
                        />
                        Mark as head
                      </label>
                      {isFeatureEnabled("googlyEyes") && (
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            checked={jointHasGooglyEyes(
                              design.appearance,
                              joint.id,
                            )}
                            onChange={(e) => {
                              const base =
                                design.appearance ?? emptyAppearance();
                              commitDesign({
                                ...design,
                                appearance: setJointGooglyEyes(
                                  base,
                                  joint.id,
                                  e.target.checked,
                                ),
                              });
                            }}
                          />
                          Googly eyes
                        </label>
                      )}
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={!!joint.isWheel}
                          onChange={() =>
                            commitDesign(
                              updateJoint(design, joint.id, {
                                isWheel: !joint.isWheel,
                                motorStrength: joint.isWheel
                                  ? undefined
                                  : (joint.motorStrength ?? 36),
                              }),
                            )
                          }
                        />
                        Wheel / motor
                      </label>
                      {joint.isWheel && (
                        <label className="slider-row">
                          <span>Torque</span>
                          <input
                            type="range"
                            min={8}
                            max={80}
                            step={1}
                            value={joint.motorStrength ?? 36}
                            onChange={(e) =>
                              commitDesign(
                                updateJoint(design, joint.id, {
                                  motorStrength: Number(e.target.value),
                                }),
                              )
                            }
                          />
                          <span className="val">
                            {joint.motorStrength ?? 36}
                          </span>
                        </label>
                      )}
                      {isFeatureEnabled("spriteBodyParts") &&
                        (() => {
                          const jointParts =
                            design.appearance?.bodyParts.filter(
                              (p) =>
                                p.jointId === joint.id &&
                                p.boneId === undefined,
                            ) ?? [];
                          return (
                            <>
                              <h4 className="subhead">Body parts</h4>
                              <p className="hint muted">
                                {jointParts.length > 0
                                  ? `${jointParts.length} attached — Select tool to move/resize.`
                                  : "Attach Kenney sprites to this joint."}
                              </p>
                              <BodyPartCatalogPicker
                                onPick={(assetId) => {
                                  const next = addBodyPartToJoint(
                                    design,
                                    joint.id,
                                    assetId,
                                  );
                                  commitDesign(next);
                                  const idx =
                                    (next.appearance?.bodyParts.length ?? 1) -
                                    1;
                                  setSelection({
                                    kind: "bodyPart",
                                    index: idx,
                                  });
                                }}
                              />
                            </>
                          );
                        })()}
                    </div>
                  );
                })()}

              {selection?.kind === "bone" &&
                (() => {
                  const bone = design.bones.find((b) => b.id === selection.id);
                  if (!bone) return null;
                  const structural = isFeatureEnabled("structuralAeroParts");
                  const hasAero = (bone.aeroArea ?? 0) > 0;
                  const boneParts =
                    design.appearance?.bodyParts.filter(
                      (p) => p.boneId === bone.id,
                    ) ?? [];
                  return (
                    <div className="inspector">
                      <h3 className="subhead">Bone {bone.id}</h3>
                      <label className="slider-row">
                        <span>Aero</span>
                        <input
                          type="range"
                          min={0}
                          max={AERO_AREA_SLIDER_MAX}
                          step={0.1}
                          value={Math.min(
                            AERO_AREA_SLIDER_MAX,
                            bone.aeroArea ?? 0,
                          )}
                          onChange={(e) =>
                            commitDesign(
                              updateBone(design, bone.id, {
                                aeroArea: Number(e.target.value),
                              }),
                            )
                          }
                        />
                        <span className="val">
                          {(bone.aeroArea ?? 0).toFixed(1)}
                        </span>
                      </label>
                      {structural && hasAero && (
                        <label className="slider-row">
                          <span>Part</span>
                          <select
                            value={bone.aeroType ?? "glider"}
                            onChange={(e) => {
                              const v = e.target.value;
                              commitDesign(
                                updateBone(design, bone.id, {
                                  aeroType:
                                    v === "wing" ||
                                    v === "glider" ||
                                    v === "parachute"
                                      ? v
                                      : undefined,
                                }),
                              );
                            }}
                          >
                            {AERO_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {aeroTypeLabel(t)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {!wingPairOk(design) && (
                        <p className="hint muted">
                          Wings should be in pairs (even count).
                        </p>
                      )}
                      <p className="hint muted">
                        {structural
                          ? "Wing: flap lift · Glider: pitch sail · Parachute: inflation drag. Higher area helps heavy bodies take off (see Capabilities → Flight readiness)."
                          : "Area scale for aero-like lift/drag."}
                      </p>
                      {isFeatureEnabled("spriteBodyParts") && (
                        <>
                          <h4 className="subhead">Body parts</h4>
                          {boneParts.length > 0 && (
                            <p className="hint muted">
                              {boneParts.length} attached — select on canvas
                              (Select tool) to move/resize.
                            </p>
                          )}
                          <BodyPartCatalogPicker
                            onPick={(assetId) => {
                              const next = addBodyPartToBone(
                                design,
                                bone.id,
                                assetId,
                              );
                              commitDesign(next);
                              const idx =
                                (next.appearance?.bodyParts.length ?? 1) - 1;
                              setSelection({ kind: "bodyPart", index: idx });
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })()}

              {selection?.kind === "bodyPart" &&
                (() => {
                  const part = design.appearance?.bodyParts[selection.index];
                  if (!part) return null;
                  const def = getBodyPart(part.assetId);
                  const scale = part.scale ?? def?.defaultScale ?? 0.28;
                  return (
                    <div className="inspector">
                      <h3 className="subhead">
                        Body part · {def?.label ?? part.assetId}
                      </h3>
                      <p className="hint muted">
                        {part.boneId !== undefined
                          ? `Anchored to bone ${part.boneId}`
                          : part.jointId !== undefined
                            ? `Anchored to joint ${part.jointId}`
                            : "Unanchored"}
                      </p>
                      <label className="slider-row">
                        <span>Scale</span>
                        <input
                          type="range"
                          min={0.12}
                          max={2.5}
                          step={0.02}
                          value={scale}
                          onChange={(e) =>
                            commitDesign(
                              updateBodyPart(design, selection.index, {
                                scale: Number(e.target.value),
                              }),
                            )
                          }
                        />
                        <span className="val">{scale.toFixed(2)}</span>
                      </label>
                      <label className="slider-row">
                        <span>Rotation</span>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={1}
                          value={Math.round(
                            (((part.rotation ?? 0) * 180) / Math.PI + 540) %
                              360 -
                              180,
                          )}
                          onChange={(e) =>
                            commitDesign(
                              updateBodyPart(design, selection.index, {
                                rotation:
                                  (Number(e.target.value) * Math.PI) / 180,
                              }),
                            )
                          }
                        />
                        <span className="val">
                          {Math.round(
                            (((part.rotation ?? 0) * 180) / Math.PI + 540) %
                              360 -
                              180,
                          )}
                          °
                        </span>
                      </label>
                      {part.boneId !== undefined && (
                        <label className="slider-row">
                          <span>Along</span>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={part.along ?? 0.5}
                            onChange={(e) =>
                              commitDesign(
                                updateBodyPart(design, selection.index, {
                                  along: Number(e.target.value),
                                }),
                              )
                            }
                          />
                          <span className="val">
                            {(part.along ?? 0.5).toFixed(2)}
                          </span>
                        </label>
                      )}
                      <label className="toggle-row">
                        <input
                          type="checkbox"
                          checked={!!part.mirror}
                          onChange={(e) =>
                            commitDesign(
                              updateBodyPart(design, selection.index, {
                                mirror: e.target.checked,
                              }),
                            )
                          }
                        />
                        Mirror
                      </label>
                      <div className="button-row">
                        <button
                          type="button"
                          onClick={() => {
                            commitDesign(
                              removeBodyPart(design, selection.index),
                            );
                            setSelection(null);
                          }}
                        >
                          Remove part
                        </button>
                      </div>
                    </div>
                  );
                })()}

              {selection?.kind === "muscle" &&
                (() => {
                  const muscle = design.muscles.find(
                    (m) => m.id === selection.id,
                  );
                  if (!muscle) return null;
                  const g = normalizeDriveGroup(muscle.driveGroup);
                  return (
                    <div className="inspector">
                      <h3 className="subhead">Muscle {muscle.id}</h3>
                      <p className="hint muted">
                        {g !== undefined
                          ? `Shared brain channel G${g}`
                          : "Own brain channel (ungrouped)"}
                      </p>
                      <div className="button-row">
                        <button
                          type="button"
                          onClick={() =>
                            commitDesign(assignDriveGroup(design, [muscle.id]))
                          }
                        >
                          New group
                        </button>
                        {g !== undefined && (
                          <button
                            type="button"
                            onClick={() =>
                              commitDesign(clearDriveGroup(design, [muscle.id]))
                            }
                          >
                            Ungroup
                          </button>
                        )}
                      </div>
                      {design.muscles.filter((m) => m.id !== muscle.id).length >
                        0 && (
                        <label className="field-row">
                          <span>Join group</span>
                          <select
                            value={g ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) {
                                commitDesign(
                                  clearDriveGroup(design, [muscle.id]),
                                );
                                return;
                              }
                              commitDesign(
                                assignDriveGroup(
                                  design,
                                  [muscle.id],
                                  Number(v),
                                ),
                              );
                            }}
                          >
                            <option value="">—</option>
                            {[
                              ...new Set(
                                design.muscles
                                  .map((m) => normalizeDriveGroup(m.driveGroup))
                                  .filter((x): x is number => x !== undefined),
                              ),
                            ].map((id) => (
                              <option key={id} value={id}>
                                G{id}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })()}
            </section>
          </div>
        );

        const vizShape = liveBrain?.shape ?? bestGenome?.shape ?? null;
        const trainPanel = (
          <div className="panel-stack">
            <section>
              <h2>Train</h2>
              {!hasCreature && (
                <p className="hint muted">
                  Load or build a creature first — empty designs stay in Edit.
                </p>
              )}
              {isFeatureEnabled("trainDockIa") &&
                hasCreature &&
                !trainHelpDismissed && (
                  <div className="train-help-strip">
                    <strong>How to train</strong>
                    <ol>
                      <li>Pick a Goal</li>
                      <li>Press Evolve — many brains try the course</li>
                      <li>Play best to watch the winner</li>
                      <li>
                        Save model downloads{" "}
                        <code>{trainedModelName(design.name || "Creature")}</code>
                      </li>
                    </ol>
                    <button
                      type="button"
                      style={{ marginTop: "0.35rem" }}
                      onClick={() => {
                        setTrainHelpDismissed(true);
                        try {
                          localStorage.setItem("freshstart_train_help_v1", "1");
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      Got it
                    </button>
                  </div>
                )}
              {isFeatureEnabled("goalCatalog") && (
                <>
                  <h3 className="subhead">Goal</h3>
                  <GoalPicker
                    goals={zoneGoals}
                    selectedId={goalId}
                    onSelect={selectGoal}
                    compact
                  />
                </>
              )}
              <p className="hint muted">
                Goal: <strong>{getGoal(goalId).title}</strong>
                {mode === "sim"
                  ? ` · t = ${simTime.toFixed(1)}s · task ${activeTask}`
                  : ""}
                {evolveProgress.running ? " · ← → focus" : ""}
              </p>
              {design.muscles.length === 0 && hasCreature && (
                <p className="hint muted">Add at least one muscle in Edit first.</p>
              )}
              {isFeatureEnabled("goalPriorities") && (
                <div className="priority-sliders">
                  <h3 className="subhead">Priorities</h3>
                  <p className="hint muted">
                    What matters more — changes the score mix, not physics.
                  </p>
                  {(
                    [
                      ["distance", "Distance"],
                      ["upright", "Stay upright"],
                      ["dontFall", "Don’t fall"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={goalPriorities[key]}
                        disabled={evolveProgress.running}
                        onChange={(e) =>
                          setGoalPriorities((p) => ({
                            ...p,
                            [key]: Number(e.target.value),
                          }))
                        }
                      />
                      <span className="val">
                        {goalPriorities[key].toFixed(2)}
                      </span>
                    </label>
                  ))}
                  <label className="toggle-row" style={{ marginTop: "0.35rem" }}>
                    <input
                      type="checkbox"
                      checked={stageTrainerOn}
                      disabled={evolveProgress.running}
                      onChange={(e) => setStageTrainerOn(e.target.checked)}
                    />
                    Train in stages
                  </label>
                  {stageTrainerOn && (
                    <p className="hint muted">
                      Stay tall → Run → Sprint when fitness clears each step.
                    </p>
                  )}
                  {isFeatureEnabled("courseCurriculum") &&
                    curriculumForPackageId(activeEnvPackageId) && (
                      <>
                        <label
                          className="toggle-row"
                          style={{ marginTop: "0.35rem" }}
                        >
                          <input
                            type="checkbox"
                            checked={courseCurriculumOn}
                            disabled={evolveProgress.running}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setCourseCurriculumOn(on);
                              if (!activeEnvPackageId) return;
                              if (on) {
                                applyCourseStage(activeEnvPackageId, 0, {
                                  selectSprint: true,
                                });
                              } else {
                                const pkg = envPackages.find(
                                  (p) => p.id === activeEnvPackageId,
                                );
                                if (pkg) {
                                  setEnvDesign(
                                    cloneEnvironment(pkg.environment),
                                  );
                                  setCourseStageIndex(0);
                                }
                              }
                            }}
                          />
                          Train course stages
                        </label>
                        {courseCurriculumOn && (
                          <p className="hint muted">
                            {(() => {
                              const c = curriculumForPackageId(
                                activeEnvPackageId,
                              );
                              if (!c) return null;
                              const idx = clampCourseStageIndex(
                                c,
                                courseStageIndex,
                              );
                              const stage = c.stages[idx];
                              return (
                                <>
                                  {stage.label} ({idx + 1}/{c.stages.length})
                                  {idx < c.stages.length - 1
                                    ? ` · next at fit ≥ ${stage.threshold}`
                                    : " · full course"}
                                  . Sprint finish moves forward each clear.
                                  Timer starts at the start line.
                                </>
                              );
                            })()}
                          </p>
                        )}
                      </>
                    )}
                </div>
              )}
              {isFeatureEnabled("trainExperiences") && (
                <div style={{ marginTop: "0.5rem" }}>
                  <h3 className="subhead">Practice extras</h3>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={raceRecord}
                      onChange={(e) => setRaceRecord(e.target.checked)}
                    />
                    Race your record
                  </label>
                  <p className="hint muted">
                    Keep the prior best on screen when playing (ghost pack).
                  </p>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={messyBodies}
                      disabled={evolveProgress.running}
                      onChange={(e) => setMessyBodies(e.target.checked)}
                    />
                    Practice with messy bodies
                  </label>
                  <p className="hint muted">
                    Slight mass/length jitter each try (fixed topology).
                  </p>
                </div>
              )}
              {isFeatureEnabled("morphEvolve") && (
                <div style={{ marginTop: "0.5rem" }}>
                  <h3 className="subhead">Biodiversity</h3>
                  <label
                    className="toggle-row"
                    title="Evolve mass, leg length, aero, and wheels with the brain (same muscle layout)."
                  >
                    <input
                      type="checkbox"
                      checked={morphEvolveOn}
                      disabled={evolveProgress.running}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setMorphEvolveOn(on);
                        try {
                          localStorage.setItem(
                            "freshstart_morph_evolve_v1",
                            on ? "1" : "0",
                          );
                        } catch {
                          /* ignore */
                        }
                      }}
                    />
                    Evolve body traits
                  </label>
                  <p className="hint muted">
                    Soft morph genes: longer/heavier limbs, aero, wheels — not
                    new joints. Off by default for classic brain-only runs.
                  </p>
                </div>
              )}
              {isFeatureEnabled("trainTelemetryLog") && (
                <div style={{ marginTop: "0.5rem" }}>
                  <h3 className="subhead">Training log</h3>
                  <label
                    className="toggle-row"
                    title="Capture gen-champion body, metrics, and failure/reward patterns for up to 50 generations."
                  >
                    <input
                      type="checkbox"
                      checked={trainTelemetryOn}
                      disabled={evolveProgress.running}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setTrainTelemetryOn(on);
                        try {
                          localStorage.setItem(
                            "freshstart_train_telemetry_v1",
                            on ? "1" : "0",
                          );
                        } catch {
                          /* ignore */
                        }
                        if (!on) {
                          trainTelemetrySessionRef.current = null;
                          setTrainTelemetrySession(null);
                        }
                      }}
                    />
                    Log next run ({TRAIN_TELEMETRY_WINDOW} gens)
                  </label>
                  <p className="hint muted">
                    Records body, gen-champion metrics, and stall contacts
                    (ramp angle/height, foot slip, what they were touching).
                    Downloads JSON when the window fills or the run ends.
                  </p>
                  {trainTelemetrySession && (
                    <div className="button-row wrap" style={{ marginTop: "0.35rem" }}>
                      <button
                        type="button"
                        disabled={trainTelemetrySession.generations.length === 0}
                        onClick={() => {
                          const final =
                            trainTelemetrySession.endedAt != null
                              ? trainTelemetrySession
                              : finalizeAndMaybeDownloadTelemetry(
                                  trainTelemetrySession,
                                  false,
                                );
                          downloadText(
                            telemetryFilename(final),
                            exportTrainTelemetryJson(final),
                          );
                        }}
                      >
                        Download log (
                        {trainTelemetrySession.generations.length}/
                        {trainTelemetrySession.window})
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isFeatureEnabled("experimentPacks") && (
                <div style={{ marginTop: "0.5rem" }}>
                  <h3 className="subhead">Training recipes</h3>
                  <p className="hint muted">
                    Recipe = how you search. Brain (
                    <code>NameT</code>) = what you learned.
                  </p>
                  <div className="button-row wrap">
                    <button
                      type="button"
                      disabled={evolveProgress.running}
                      onClick={() => {
                        const name = window.prompt(
                          "Name this training recipe",
                          gaKnobs.recipeId,
                        );
                        if (!name?.trim()) return;
                        const recipe: TrainingRecipeSave = {
                          kind: "training_recipe",
                          version: 1,
                          name: name.trim(),
                          knobs: { ...gaKnobs },
                          createdAt: Date.now(),
                        };
                        saveNamedRecipe(recipe);
                        setNamedRecipes(loadNamedRecipes());
                        downloadText(
                          `${name.trim().replace(/\s+/g, "_")}_recipe.json`,
                          exportRecipeJson(recipe),
                        );
                      }}
                    >
                      Save recipe
                    </button>
                    <button
                      type="button"
                      disabled={!bestGenome || evolveProgress.running}
                      title="Export body + env + goal + recipe + brain"
                      onClick={() => {
                        if (!bestGenome) return;
                        const name =
                          window.prompt(
                            "Experiment pack name",
                            `${design.name || "Creature"}_${activeTask}`,
                          ) ?? "";
                        if (!name.trim()) return;
                        downloadText(
                          `${name.trim().replace(/\s+/g, "_")}_pack.json`,
                          exportExperimentPackJson({
                            kind: "experiment_pack",
                            version: 1,
                            name: name.trim(),
                            goalId,
                            task: activeTask,
                            design: cloneDesign(design),
                            environment: cloneEnvironment(envDesign),
                            knobs: { ...gaKnobs },
                            brain: {
                              shape: bestGenome.shape,
                              weights: Array.from(bestGenome.genome.weights),
                              fitness: bestGenome.genome.fitness,
                            },
                            createdAt: Date.now(),
                          }),
                        );
                      }}
                    >
                      Export experiment pack
                    </button>
                  </div>
                  {namedRecipes.length > 0 && (
                    <div className="button-col" style={{ marginTop: "0.35rem" }}>
                      {namedRecipes.slice(0, 6).map((r) => (
                        <button
                          key={`${r.name}-${r.createdAt}`}
                          type="button"
                          disabled={evolveProgress.running}
                          title="Try this setup"
                          onClick={() => {
                            setGaKnobs({ ...r.knobs });
                          }}
                        >
                          Try: {r.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
            {!isFeatureEnabled("trainDockIa") &&
              isFeatureEnabled("controlPanel") && (
                <CollapsiblePanel
                  title="Controls"
                  open={controlsOpen}
                  onToggle={() => setControlsOpen((v) => !v)}
                >
                  <p className="hint muted">
                    Observe / train speed live in the bottom dock.
                  </p>
                </CollapsiblePanel>
              )}
            {isFeatureEnabled("savedModels") && (
              <ModelsHub
                task={activeTask}
                savedModels={savedModels}
                bestEverList={bestEverList}
                evolving={evolveProgress.running}
                onContinue={(m) => {
                  if (
                    isFeatureEnabled("trainStartFrom") &&
                    m.task !== "dance"
                  ) {
                    setGaKnobs((k) => ({
                      ...k,
                      startFrom: "saved",
                      savedModelId: m.id,
                      recipeId: "fine_tune",
                    }));
                  }
                  continueFromModel(m);
                }}
                onLoadDanceFreestyle={loadDanceFreestyle}
                onDelete={(id) => {
                  deleteSavedModel(id);
                  refreshModels();
                }}
              />
            )}
            {isFeatureEnabled("networkVisualizer") && (
              <section>
                <h2>Brain {evolveProgress.running ? "(live)" : ""}</h2>
                <NetworkVisualizer
                  shape={vizShape}
                  weights={
                    liveBrain?.weights ?? bestGenome?.genome.weights ?? null
                  }
                  inputs={liveBrain?.inputs ?? null}
                  outputs={liveBrain?.outputs ?? null}
                  hidden={liveBrain?.hidden ?? null}
                  liveLabel={
                    evolveProgress.running && liveBrain
                      ? `Focus #${liveBrain.focusIndex + 1} · genome ${liveBrain.genomeIndex + 1} · gen ${evolveProgress.generation}`
                      : liveBrain && driveMode === "brain"
                        ? "Play / brain drive"
                        : null
                  }
                  width={280}
                  height={200}
                />
                <p className="hint muted">
                  Fixed MLP ·{" "}
                  {vizShape
                    ? `${vizShape.inputCount}–${vizShape.hiddenCount}–${vizShape.outputCount}`
                    : "no genome"}
                  {evolveProgress.running
                    ? " · updates while training (← → change focus)"
                    : ""}
                </p>
              </section>
            )}
            {isFeatureEnabled("statsPanel") && (
              <StatsPanel
                live={liveStats}
                last={lastMetrics}
                open={statsOpen}
                onToggle={() => setStatsOpen((v) => !v)}
              />
            )}
            {isFeatureEnabled("statsPanel") && (
              <RewardsBreakdown
                task={activeTask}
                metrics={lastMetrics}
                open={rewardsOpen}
                onToggle={() => setRewardsOpen((v) => !v)}
              />
            )}
            {isFeatureEnabled("performanceDiagnostics") && (
              <PerfDiagnostics
                fps={perfFps}
                frameMs={perfFrameMs}
                open={diagOpen}
                onToggle={() => setDiagOpen((v) => !v)}
              />
            )}
          </div>
        );

        const h2hPanel =
          isFeatureEnabled("headToHead") ? (
            <HeadToHeadPanel
              savedModels={savedModels}
              packages={packages}
              currentDesign={design}
              envDesign={envDesign}
              episodeSeconds={episodeSeconds}
              busy={evolveProgress.running}
              lastResult={h2hResult}
              running={h2hRunning}
              progress={h2hProgress}
              onStartHeat={startH2hHeat}
              onStopHeat={stopH2h}
            />
          ) : null;

        const evolveButtons = (
          <>
            <div className="button-row">
              <button
                type="button"
                disabled={evolveProgress.running || h2hRunning || design.muscles.length === 0}
                onClick={() => startEvolve()}
              >
                Evolve
              </button>
              <button
                type="button"
                disabled={!evolveProgress.running}
                onClick={stopEvolve}
              >
                Stop
              </button>
              <button
                type="button"
                disabled={!bestGenome || evolveProgress.running || h2hRunning}
                onClick={playBest}
              >
                Play best
              </button>
              <button
                type="button"
                disabled={!bestGenome || evolveProgress.running || h2hRunning}
                onClick={continueFromBest}
                title="Keep training from this run’s best brain"
              >
                {isFeatureEnabled("trainDockIa") ? "Keep training" : "Continue"}
              </button>
              {isFeatureEnabled("savedModels") && (
                <button
                  type="button"
                  disabled={!bestGenome || evolveProgress.running || h2hRunning}
                  onClick={saveBestModel}
                  title={`Download trained brain as ${trainedModelName(design.name || "Creature")}`}
                >
                  Save model
                </button>
              )}
            </div>
            {evolveProgress.running && (
              <div className="button-row" style={{ marginTop: "0.35rem" }}>
                <button
                  type="button"
                  onClick={() => simulation.focusPrevCreature()}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  onClick={() => simulation.focusNextCreature()}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        );

        const envPickerControl = isFeatureEnabled("environmentsRepo") ? (
          <EnvPicker
            packages={envPackages}
            selectedPackageId={activeEnvPackageId}
            activeName={envDesign.name}
            disabled={evolveProgress.running}
            onSelect={applyTrainingEnv}
            compact
          />
        ) : null;

        const dockSummary = (
          <div className="dock-summary">
            {evolveButtons}
            {envPickerControl}
            <span className="dock-summary-stats">
              {h2hRunning && h2hProgress
                ? `H2H ${h2hProgress.episodeT.toFixed(1)}/${h2hProgress.episodeDuration.toFixed(0)}s`
                : `Gen ${evolveProgress.generation} · Best ${evolveProgress.bestFitness.toFixed(2)}`}
              {isFeatureEnabled("environmentsRepo")
                ? ` · ${envDesign.name}`
                : ""}
            </span>
          </div>
        );

        const discoDock = isFeatureEnabled("discoMode") ? (
          <DiscoZonePanel
            trackName={discoTrack}
            hasTrack={discoPlayer.hasTrack()}
            playing={discoPlaying}
            dancing={driveMode === "disco"}
            trackTime={discoTrackTime}
            trackDuration={discoTrackDuration}
            puppetMode={discoPuppetMode}
            footMass={discoFootMass}
            gains={discoGains}
            motion={discoMotion}
            auto={discoAuto}
            routing={discoRouting}
            slots={discoSlots}
            packages={packages}
            savedModels={savedModels}
            currentDesign={design}
            selection={selection}
            disabled={evolveProgress.running || h2hRunning || discoLearning}
            collapsed={dockCollapsed}
            onPlay={() => {
              discoPlayer.play();
              setDiscoPlaying(true);
              if (discoFreestyle) return;
              if (driveMode !== "disco") beginDiscoDrive();
            }}
            onPause={() => {
              discoPlayer.pause();
              setDiscoPlaying(false);
              setDiscoTrackTime(discoPlayer.currentTime());
            }}
            onStartDancing={() => {
              if (discoFreestyle) {
                setDiscoFreestyle(false);
                simulation.clearBrain();
              }
              discoPlayer.play();
              setDiscoPlaying(true);
              beginDiscoDrive();
            }}
            onResetPose={resetDiscoPose}
            onSeek={(seconds) => {
              discoPlayer.seek(seconds);
              setDiscoTrackTime(discoPlayer.currentTime());
            }}
            onPuppetModeChange={(mode) => {
              setDiscoPuppetMode(mode);
              simulation.setDiscoPuppetMode(mode);
            }}
            onFootMassChange={(mass) => {
              setDiscoFootMass(mass);
              simulation.setDiscoFootMass(mass);
            }}
            onGainsChange={setDiscoGains}
            onMotionChange={setDiscoMotion}
            onAutoChange={(next) => {
              setDiscoAuto(next);
              discoAutoTickRef.current.initialized = false;
            }}
            onRoutingChange={setDiscoRouting}
            onSlotsChange={setDiscoSlots}
            hideMuscles={discoHideMuscles}
            hideBones={discoHideBones}
            greenscreen={discoGreenscreen}
            onHideMusclesChange={(hide) => {
              setDiscoHideMuscles(hide);
              simulation.hideMuscles = hide;
            }}
            onHideBonesChange={(hide) => {
              setDiscoHideBones(hide);
              simulation.hideBones = hide;
            }}
            onGreenscreenChange={setDiscoGreenscreen}
            savedSetups={discoSetups}
            onSaveSetup={saveCurrentDiscoSetup}
            onLoadSetup={loadDiscoSetupById}
            onDeleteSetup={deleteDiscoSetupById}
          />
        ) : null;

        const dockFull = (
          <div
            className={
              evolveProgress.running ? "dock-full evolve-running" : "dock-full"
            }
          >
            {h2hRunning && h2hProgress && (
              <p className="hint h2h-live">
                Head-to-Head heat · {h2hProgress.episodeT.toFixed(1)}s /{" "}
                {h2hProgress.episodeDuration.toFixed(0)}s
              </p>
            )}
            {h2hResult && !h2hRunning && (
              <p className="hint h2h-live">
                Last heat — A {h2hResult.fitness[0].toFixed(3)} · B{" "}
                {h2hResult.fitness[1].toFixed(3)}
              </p>
            )}
            <div className="dock-col">
              <h3 className="subhead">Drive</h3>
              <div className="button-row wrap">
                {driveButtons.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={driveMode === id ? "active" : ""}
                    disabled={
                      evolveProgress.running ||
                      h2hRunning ||
                      (id === "brain" && !bestGenome)
                    }
                    onClick={() => {
                      if (id === "brain" && bestGenome) {
                        simulation.setBrain(
                          bestGenome.shape,
                          bestGenome.genome.weights,
                        );
                      }
                      if (driveMode === "disco" || simulation.isMultiDisco) {
                        stopDiscoDrive();
                      }
                      setDriveMode(id);
                      simulation.driveMode = id;
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={evolveProgress.running}
                onClick={() => simulation.reset()}
              >
                Reset pose
              </button>
              <label
                className="toggle-row"
                style={{ marginTop: "0.45rem" }}
                title="Brain updates every physics step (60 Hz) instead of every other (30 Hz). Muscle forces always apply at 60 Hz; this only changes how often drives are recomputed. Disco imitation recording stays at 30 Hz."
              >
                <input
                  type="checkbox"
                  checked={brainHz === BRAIN_HZ_FAST}
                  onChange={(e) =>
                    setBrainHz(e.target.checked ? BRAIN_HZ_FAST : BRAIN_HZ)
                  }
                />
                Brain 60 Hz
                <span className="muted" style={{ marginLeft: "0.35rem" }}>
                  ({brainHz} Hz)
                </span>
              </label>
              {driveMode === "manual" && (
                <div className="sliders dock-sliders">
                  {manualDrives.map((v, i) => (
                    <label key={i} className="slider-row">
                      <span>M{i + 1}</span>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.01}
                        value={v}
                        onChange={(e) =>
                          updateManual(i, Number(e.target.value))
                        }
                      />
                      <span className="val">{v.toFixed(2)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="dock-col dock-col-grow">
              <h3 className="subhead">
                {isFeatureEnabled("trainDockIa")
                  ? `Train · ${getGoal(goalId).title}`
                  : `Evolve (${getGoal(goalId).title})`}
              </h3>
              {evolveButtons}
              {isFeatureEnabled("environmentsRepo") && (
                <>
                  <p className="hint muted" style={{ marginTop: "0.35rem" }}>
                    Practice course
                  </p>
                  <EnvPicker
                    packages={envPackages}
                    selectedPackageId={activeEnvPackageId}
                    activeName={envDesign.name}
                    disabled={evolveProgress.running}
                    onSelect={applyTrainingEnv}
                  />
                  {isFeatureEnabled("courseCurriculum") &&
                    curriculumForPackageId(activeEnvPackageId) && (
                      <p className="hint muted">
                        Gauntlet supports course stages (Train panel) and a
                        start-line race timer.
                      </p>
                    )}
                </>
              )}
            </div>

            {isFeatureEnabled("controlPanel") && (
              <div className="dock-col">
                <h3 className="subhead">
                  {isFeatureEnabled("trainDockIa") ? "Watch & speed" : "Speed"}
                </h3>
                <p className="hint muted">
                  Observe
                  {evolveProgress.running ? " (after stop)" : ""}
                </p>
                <div className="button-row wrap">
                  {OBSERVE_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={observeSpeed === s ? "active" : ""}
                      onClick={() => setObserveSpeed(s)}
                      title={
                        evolveProgress.running
                          ? "Used when training stops — train speed stays active now"
                          : "Playback speed when not training"
                      }
                    >
                      {s}×
                    </button>
                  ))}
                </div>
                <p className="hint muted" style={{ marginTop: "0.25rem" }}>
                  Train speed
                  {evolveProgress.running ? " (active)" : ""}
                </p>
                <div className="button-row wrap">
                  {TRAIN_SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={trainSpeed === s ? "active" : ""}
                      onClick={() => setTrainSpeed(s)}
                    >
                      {s === 0 ? "Max" : `${s}×`}
                    </button>
                  ))}
                </div>
                {!isFeatureEnabled("trainRecipes") && (
                  <>
                    <p className="hint muted" style={{ marginTop: "0.25rem" }}>
                      Gen length
                    </p>
                    <div className="button-row wrap">
                      {EPISODE_LENGTH_PRESETS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={episodeSeconds === s ? "active" : ""}
                          onClick={() => {
                            setEpisodeSeconds(s);
                            if (evolveProgress.running) {
                              simulation.setEpisodeSeconds(s);
                            }
                          }}
                          title="Simulated seconds per generation episode"
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <label
                  className="toggle-row"
                  style={{ marginTop: "0.45rem" }}
                  title="Show the rest of the live batch as translucent ghosts"
                >
                  <input
                    type="checkbox"
                    checked={showGhostPack || raceRecord}
                    onChange={(e) => {
                      setShowGhostPack(e.target.checked);
                      if (!e.target.checked) setRaceRecord(false);
                    }}
                  />
                  {isFeatureEnabled("trainDockIa")
                    ? "Show the others"
                    : "Ghost pack"}
                </label>
              </div>
            )}

            {isFeatureEnabled("trainRecipes") && (
              <TrainingSetupPanel
                knobs={gaKnobs}
                disabled={evolveProgress.running}
                hasBestOfRun={!!bestGenome}
                savedBrainOptions={savedModels
                  .filter((m) => m.task === activeTask)
                  .map((m) => ({ id: m.id, name: m.name }))}
                onChange={setGaKnobs}
                showSchedules={isFeatureEnabled("trainSchedules")}
              />
            )}

            <div className="dock-col">
              <h3 className="subhead">
                {isFeatureEnabled("trainDockIa") ? "Progress" : "Status"}
              </h3>
              {evolveProgress.populationSize > 0 && (
                <div className="evolve-bar">
                  <div
                    className="evolve-bar-fill"
                    style={{
                      width: `${Math.min(
                        100,
                        evolveProgress.episodeDuration
                          ? (100 * (evolveProgress.episodeT ?? 0)) /
                              Math.max(1e-6, evolveProgress.episodeDuration)
                          : (100 * evolveProgress.evaluated) /
                              Math.max(1, evolveProgress.populationSize),
                      )}%`,
                    }}
                  />
                </div>
              )}
              <ul className="stats dock-stats">
                <li>
                  {isFeatureEnabled("trainDockIa") ? "Round" : "Gen"}:{" "}
                  {evolveProgress.generation}
                </li>
                <li>
                  Try:{" "}
                  {(evolveProgress.episodeT ?? 0).toFixed(1)}/
                  {(evolveProgress.episodeDuration ?? episodeSeconds).toFixed(0)}
                  s
                </li>
                <li>Best: {evolveProgress.bestFitness.toFixed(3)}</li>
                <li>Mean: {evolveProgress.meanFitness.toFixed(3)}</li>
                {bestGenome && !evolveProgress.running && (
                  <li>Elite fit: {bestGenome.genome.fitness.toFixed(3)}</li>
                )}
                {isFeatureEnabled("bestEverLedger") && (
                  <li>
                    All-time ({activeTask}):{" "}
                    {(getBestEver(activeTask)?.fitness ?? 0).toFixed(3)}
                  </li>
                )}
                {isFeatureEnabled("trainStartFrom") && (
                  <li>
                    Run # {runSeed}{" "}
                    <button
                      type="button"
                      disabled={evolveProgress.running}
                      title="Reseed RNG for the next Evolve"
                      onClick={() => setRunSeed(Date.now() % 1_000_000)}
                    >
                      Reseed
                    </button>
                  </li>
                )}
              </ul>
              <p className={evolveProgress.running ? "hint" : "hint muted"}>
                {evolveProgress.status}
              </p>
              {isFeatureEnabled("trainTelemetryLog") &&
                trainTelemetryOn &&
                trainTelemetrySession && (
                  <div className="train-telemetry-live">
                    <p className="hint">
                      Log: {trainTelemetrySession.generations.length}/
                      {trainTelemetrySession.window} gens
                      {trainTelemetrySession.endedAt
                        ? " · complete"
                        : evolveProgress.running
                          ? " · capturing"
                          : ""}
                    </p>
                    {trainTelemetrySession.morphology && (
                      <p className="hint muted">
                        {trainTelemetrySession.morphology.name} ·{" "}
                        {trainTelemetrySession.morphology.joints}j/
                        {trainTelemetrySession.morphology.bones}b/
                        {trainTelemetrySession.morphology.muscles}m · feet{" "}
                        {trainTelemetrySession.morphology.feet}
                      </p>
                    )}
                    {(() => {
                      const last =
                        trainTelemetrySession.generations[
                          trainTelemetrySession.generations.length - 1
                        ];
                      const cause = last?.stall?.summaryCause;
                      return cause ? (
                        <p className="hint muted" title={cause}>
                          Last stall: {cause}
                        </p>
                      ) : null;
                    })()}
                    {trainTelemetrySession.insights.length > 0 && (
                      <ul className="stats dock-stats train-telemetry-insights">
                        {trainTelemetrySession.insights
                          .slice(0, 5)
                          .map((ins) => (
                            <li key={`${ins.kind}-${ins.label}`}>
                              <span className="muted">{ins.label}:</span>{" "}
                              {ins.detail}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
            </div>
          </div>
        );

        const worldDock = (
          <WorldDock
            tool={envTool}
            onToolChange={setEnvTool}
            snapEnabled={envSnapEnabled}
            onSnapChange={setEnvSnapEnabled}
            environment={envDesign}
            selection={envSelection}
            onDeleteSelected={deleteEnvSelected}
            onUndo={undoEnv}
            undoDisabled={envUndoCount === 0}
            onSineTerrain={() => {
              commitEnv({
                ...envDesign,
                terrain: makeSineTerrain({
                  startX: envDesign.terrain?.startX ?? 0,
                  endX: envDesign.terrain?.endX ?? 40,
                  amplitude: envDesign.terrain?.amplitude ?? 1.2,
                  sampleCount: envDesign.terrain?.samples.length ?? 41,
                }),
              });
              setEnvSelection({ kind: "terrain" });
            }}
            onClearTerrain={() => {
              commitEnv({ ...envDesign, terrain: undefined });
              setEnvSelection(null);
            }}
            onClearTower={() => {
              commitEnv({ ...envDesign, tower: undefined });
              setEnvSelection(null);
            }}
            collapsed={dockCollapsed}
          />
        );

        const viewport =
          mode === "edit" ? (
            <EditorCanvas
              design={design}
              onChange={commitDesign}
              tool={tool}
              snapEnabled={snapEnabled}
              selection={selection}
              onSelect={setSelection}
              cameraRef={editorCamRef}
            />
          ) : mode === "world" ? (
            <EnvEditorCanvas
              environment={envDesign}
              onChange={(env) => commitEnv(env)}
              tool={envTool}
              onToolChange={setEnvTool}
              snapEnabled={envSnapEnabled}
              selection={envSelection}
              onSelect={setEnvSelection}
              viewportInsetBottom={
                isFeatureEnabled("sandboxMenuShell") ? dockInset : 0
              }
            />
          ) : (
            <SimCanvas
              simulation={simulation}
              evolveFocusKeys={evolveProgress.running}
              viewportInsetBottom={
                isFeatureEnabled("sandboxMenuShell") ? dockInset : 0
              }
              greenscreen={zone === "disco" && discoGreenscreen}
              discoBallPos={
                zone === "disco" && isFeatureEnabled("discoMode")
                  ? discoBallPos
                  : undefined
              }
              onDiscoBallMoved={
                zone === "disco" && isFeatureEnabled("discoMode")
                  ? setDiscoBallPos
                  : undefined
              }
              discoFxProvider={
                zone === "disco" && isFeatureEnabled("discoMode")
                  ? () => ({
                      bands: discoPlayer.getBands(),
                      timeSec: discoPlayer.currentTime(),
                    })
                  : null
              }
              onDiscoDancerPlaced={(activeIndex, offsetX) => {
                setDiscoSlots((prev) => {
                  const activeIdxs: number[] = [];
                  for (let i = 0; i < prev.length; i++) {
                    if (prev[i] && prev[i]!.design.joints.length > 0) {
                      activeIdxs.push(i);
                    }
                  }
                  const slotIndex = activeIdxs[activeIndex];
                  if (slotIndex === undefined) return prev;
                  const copy = prev.slice();
                  const slot = copy[slotIndex];
                  if (!slot) return prev;
                  copy[slotIndex] = { ...slot, offsetX };
                  return copy;
                });
              }}
              onPerf={(perf) => {
                setPerfFps(perf.fps);
                setPerfFrameMs(perf.frameMs);
              }}
              onFrame={(snap) => {
                setSimTime(snap.time);
                if (snap.evolve) setEvolveProgress(snap.evolve);
                if (isFeatureEnabled("statsPanel")) {
                  setLiveStats(snap.liveStats);
                  if (snap.lastEpisodeMetrics) {
                    setLastMetrics(snap.lastEpisodeMetrics);
                  }
                }
                if (isFeatureEnabled("networkVisualizer")) {
                  setLiveBrain(snap.brain ?? null);
                }
              }}
            />
          );

        const sandboxTabs: SandboxTab[] = [
          { id: "zone", label: "Zone", content: zonePanel },
          ...(isFeatureEnabled("discoveryUi")
            ? [
                {
                  id: "discoveries" as const,
                  label: "Discoveries",
                  content: discoveriesPanel,
                },
              ]
            : []),
          {
            id: "creatures",
            label: "Creatures",
            content: creaturesPanel,
          },
          { id: "edit", label: "Edit", content: editPanel },
          { id: "train", label: "Train", content: trainPanel },
          ...(isFeatureEnabled("headToHead") && h2hPanel
            ? [{ id: "h2h" as const, label: "H2H", content: h2hPanel }]
            : []),
          { id: "world", label: "World", content: worldPanel },
        ];

        const topbar = (
          <header className="topbar">
            <div className="brand">
              <h1>Solemn Sandbox</h1>
              <p>A serious environment to carry out silly experiments.</p>
            </div>
            {isFeatureEnabled("sandboxMenuShell") && (
              <SandboxTabRail
                tabs={sandboxTabs}
                activeTab={sandboxTab}
                onActiveTabChange={onSandboxTabChange}
              />
            )}
            <div className="topbar-actions">
              {isFeatureEnabled("immersiveFullscreen") && (
                <button
                  type="button"
                  className={immersive ? "active" : ""}
                  onClick={() => void toggleImmersive()}
                  title="Hide chrome and expand the viewport"
                >
                  {immersive ? "Exit immersive" : "Immersive"}
                </button>
              )}
            </div>
          </header>
        );

        if (isFeatureEnabled("sandboxMenuShell")) {
          return (
            <>
              {topbar}
              <SandboxShell
                tabs={sandboxTabs}
                activeTab={sandboxTab}
                onActiveTabChange={onSandboxTabChange}
                hideTabRail
                viewport={viewport}
                dock={
                  editPhysics
                    ? null
                    : mode === "world"
                      ? worldDock
                      : mode === "sim" && zone === "disco" && discoDock
                        ? discoDock
                        : mode === "sim"
                          ? dockCollapsed
                            ? dockSummary
                            : dockFull
                          : null
                }
                dockLabel={
                  mode === "world"
                    ? "World"
                    : zone === "disco"
                      ? "Disco"
                      : "Train"
                }
                dockCollapsed={dockCollapsed}
                onDockCollapsedChange={setDockCollapsed}
                onDockHeightChange={setDockInset}
              />
            </>
          );
        }

        return (
          <>
            {topbar}
            <div className="main">
              <aside className="sidebar">
                {zonePanel}
                {creaturesPanel}
                {isFeatureEnabled("discoveryUi") && discoveriesPanel}
                {worldPanel}
                {(mode === "edit" || editPhysics) && editPanel}
                {!editPhysics && mode === "sim" && zone === "disco" && discoDock}
                {!editPhysics && mode === "sim" && zone !== "disco" && (
                  <>
                    {dockFull}
                    {trainPanel}
                  </>
                )}
                {mode === "world" && worldDock}
              </aside>
              <div className="viewport">{viewport}</div>
            </div>
          </>
        );
      })()}

      {isFeatureEnabled("jsonImportExport") && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const text = await file.text();
              const result = importCreatureJson(text);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              loadPreset(result.value);
            }}
          />
          <input
            ref={envFileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const text = await file.text();
              const result = importEnvironmentJson(text);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              commitEnv(result.value);
            }}
          />
        </>
      )}

      {isFeatureEnabled("secretGoals") && (
        <SecretGoalRevealOverlay
          discovery={secretRevealQueue[0] ?? null}
          onDismiss={dismissSecretReveal}
        />
      )}
    </div>
  );
}
