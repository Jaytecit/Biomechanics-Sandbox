import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EPISODE_LENGTH_PRESETS,
  EPISODE_SECONDS,
  LIVE_BATCH_SIZE,
  LIVE_POPULATION_SIZE,
} from "./brain/constants";
import {
  countBrainActuatorChannels,
  normalizeDriveGroup,
} from "./brain/driveGroups";
import type { EvolutionProgress, Genome, NetworkShape } from "./brain/types";
import { createDiscoAudioPlayer } from "./audio/audioAnalysis";
import { resolveDiscoDrives } from "./audio/discoMode";
import { emptyAppearance } from "./appearance/types";
import { CollapsiblePanel } from "./components/CollapsiblePanel";
import { NetworkVisualizer } from "./components/NetworkVisualizer";
import { SandboxShell, type SandboxTabId } from "./components/SandboxShell";
import { SecretGoalRevealOverlay } from "./components/SecretGoalRevealOverlay";
import { PRESETS } from "./creature/presets";
import { DISCO_DANCER } from "./creature/discoDancer";
import { cloneDesign, type CreatureDesign } from "./creature/types";
import { EditorCanvas, type EditTool } from "./editor/EditorCanvas";
import type { EditorSelection } from "./editor/selection";
import {
  assignDriveGroup,
  clearDriveGroup,
  updateBone,
  updateJoint,
} from "./editor/editOps";
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
import {
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
  downloadText,
  exportCreatureJson,
  exportEnvironmentJson,
  importCreatureJson,
  importEnvironmentJson,
} from "./library/jsonIO";
import {
  deleteSavedModel,
  loadSavedModels,
  modelToSeed,
  saveModel,
  shapesCompatible,
  type SavedModel,
} from "./library/savedModels";
import { isFeatureEnabled } from "./port/featureFlags";
import { evaluateSecretGoals } from "./secrets/eval";
import { revealedTitle } from "./secrets/definitions";
import {
  listDiscoveries,
  recordDiscovery,
  type SecretGoalDiscovery,
} from "./secrets/progress";
import { SimCanvas } from "./sim/SimCanvas";
import {
  shapeForDesign,
  Simulation,
  type DriveMode,
  type EpisodeCompleteSnapshot,
  type LiveBrainProbe,
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
type Mode = "edit" | "sim";
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
  if (design.joints.length === 0) {
    return { ...design, appearance: emptyAppearance() };
  }
  let best = design.joints[0];
  for (const j of design.joints) {
    if (j.y > best.y) best = j;
  }
  return {
    ...design,
    appearance: {
      version: 1,
      googlyEyes: [
        { jointId: best.id, domeRadius: 0.18, offsetX: -0.12, offsetY: 0.06 },
        { jointId: best.id, domeRadius: 0.18, offsetX: 0.12, offsetY: 0.06 },
      ],
      bodyParts: [],
    },
  };
}
export default function App() {
  const simulation = useMemo(() => new Simulation(), []);
  const discoPlayer = useMemo(() => createDiscoAudioPlayer(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("edit");
  const [tool, setTool] = useState<EditTool>("joint");
  const [snapEnabled, setSnapEnabled] = useState(true);
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
  const [manualDrives, setManualDrives] = useState<number[]>([]);
  const [simTime, setSimTime] = useState(0);
  const [undoCount, setUndoCount] = useState(0);
  const [observeSpeed, setObserveSpeed] = useState(1);
  const [trainSpeed, setTrainSpeed] = useState(4);
  const [episodeSeconds, setEpisodeSeconds] = useState<number>(EPISODE_SECONDS);
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
  const [bestEverList, setBestEverList] = useState<BestEverEntry[]>([]);
  const [envDesign, setEnvDesign] = useState<EnvironmentDesign>(() =>
    flatGroundEnv(),
  );
  const [envPackages, setEnvPackages] = useState<EnvironmentPackage[]>([]);
  const [envUndoCount, setEnvUndoCount] = useState(0);
  const [secretRevealQueue, setSecretRevealQueue] = useState<
    SecretGoalDiscovery[]
  >([]);
  const [discoveries, setDiscoveries] = useState<SecretGoalDiscovery[]>([]);
  const [sandboxTab, setSandboxTab] = useState<SandboxTabId>("edit");
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [dockInset, setDockInset] = useState(0);
  const [feelNotesOpen, setFeelNotesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const envFileInputRef = useRef<HTMLInputElement>(null);
  const designRef = useRef(design);
  const undoStackRef = useRef<CreatureDesign[]>([]);
  const envUndoStackRef = useRef<EnvironmentDesign[]>([]);
  const envDesignRef = useRef(envDesign);
  designRef.current = design;
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
  }, [refreshPackages, refreshModels, refreshEnvPackages]);
  useEffect(() => {
    if (!isFeatureEnabled("environmentsRepo")) return;
    const theme = THEME_CSS[envDesign.theme];
    const root = document.documentElement;
    root.style.setProperty("--bg", theme.bg);
    root.style.setProperty("--panel", theme.panel);
  }, [envDesign.theme]);
  const handleEpisodeComplete = useCallback((snap: EpisodeCompleteSnapshot) => {
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
  }, []);
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
    if (!selection) return;
    if (
      selection.kind === "joint" &&
      !design.joints.some((j) => j.id === selection.id)
    ) {
      setSelection(null);
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
    }
  }, [design, selection]);
  useEffect(() => {
    if (mode !== "sim") setDockInset(0);
  }, [mode]);
  const hasCreature = design.joints.length > 0;
  const returnToEdit = useCallback(() => {
    if (simulation.isEvolving) simulation.abortLiveEvolve();
    setEvolveProgress(idleProgress());
    setLiveBrain(null);
    setMode("edit");
    setSandboxTab("edit");
    setDockInset(0);
  }, [simulation]);
  useEffect(() => {
    if (!hasCreature && mode === "sim") {
      returnToEdit();
    }
  }, [hasCreature, mode, returnToEdit]);
  useEffect(() => {
    simulation.discoDriveProvider = () =>
      resolveDiscoDrives({
        player: discoPlayer,
        muscleCount: designRef.current.muscles.length,
        timeSec: discoPlayer.currentTime(),
      });
    return () => {
      simulation.discoDriveProvider = null;
      discoPlayer.dispose();
    };
  }, [discoPlayer, simulation]);
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
  const commitEnv = useCallback((next: EnvironmentDesign) => {
    envUndoStackRef.current.push(cloneEnvironment(envDesignRef.current));
    if (envUndoStackRef.current.length > MAX_UNDO) {
      envUndoStackRef.current.shift();
    }
    setEnvUndoCount(envUndoStackRef.current.length);
    setEnvDesign(cloneEnvironment(next));
  }, []);
  const undoEnv = useCallback(() => {
    const prev = envUndoStackRef.current.pop();
    if (!prev) return;
    setEnvUndoCount(envUndoStackRef.current.length);
    setEnvDesign(prev);
  }, []);
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
    const onKeyDown = (e: KeyboardEvent) => {
      if (mode !== "edit") return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, undo]);
  const selectGoal = (id: GoalId) => {
    setGoalId(id);
    saveActiveGoalId(id);
    simulation.setTask(getGoal(id).task);
    invalidateGenomes();
  };
  const selectZone = (id: ZoneId) => {
    setZone(id);
    saveActiveZone(id);
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
  /** Drop the current design into the sim viewport and open Train. */
  const startSim = (designOverride?: CreatureDesign) => {
    const next = designOverride ?? design;
    if (next.joints.length === 0) {
      returnToEdit();
      return;
    }
    if (syncDesignToSim(next)) setSandboxTab("train");
  };
  const onSandboxTabChange = (tab: SandboxTabId) => {
    if (tab === "edit") {
      returnToEdit();
      return;
    }
    if (tab === "train") {
      if (design.joints.length === 0) {
        returnToEdit();
        return;
      }
      // Always sync design → sim. Previously, once mode was already "sim",
      // Train only switched the tab — so a creature picked on Creatures stayed
      // unloaded unless the user visited Edit first (which cleared sim mode).
      if (simulation.isEvolving) {
        setSandboxTab("train");
        return;
      }
      startSim();
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
      syncDesignToSim(next);
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
  const startEvolve = (seedFrom?: {
    shape: NetworkShape;
    weights: Float32Array;
  }) => {
    if (design.muscles.length === 0) {
      setError("Add at least one muscle before evolving.");
      return;
    }
    try {
      setMode("sim");
      setSandboxTab("train");
      setDriveMode("brain");
      simulation.timeScale = trainSpeed;
      setEvolveProgress({
        ...idleProgress(),
        running: true,
        status: seedFrom
          ? `Continue training (${activeTask})…`
          : `Watching live batch (${activeTask})…`,
        populationSize: LIVE_POPULATION_SIZE,
        batch: 1,
        batchCount: Math.ceil(LIVE_POPULATION_SIZE / LIVE_BATCH_SIZE),
        episodeDuration: episodeSeconds,
        episodeT: 0,
      });
      simulation.startLiveEvolve({
        design: cloneDesign(design),
        task: activeTask,
        populationSize: LIVE_POPULATION_SIZE,
        batchSize: LIVE_BATCH_SIZE,
        episodeSeconds,
        seed: Date.now() % 1_000_000,
        seedGenome: seedFrom,
        onProgress: (p) => setEvolveProgress(p),
        onFinished: (genome, shape) => {
          setBestGenome({ shape, genome });
          setLiveBrain(null);
          setDriveMode("idle");
          simulation.driveMode = "idle";
          simulation.timeScale = observeSpeed;
          if (isFeatureEnabled("bestEverLedger")) {
            considerBestEver(activeTask, genome.fitness, designRef.current);
            setBestEverList(loadBestEver());
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
    const expected = shapeForDesign(design);
    if (!shapesCompatible(model.shape, expected) || model.task !== activeTask) {
      setError(
        "Saved model shape/task mismatch — load a matching creature and goal first.",
      );
      return;
    }
    startEvolve(modelToSeed(model));
  };
  const saveBestModel = () => {
    if (!bestGenome) {
      setError("No elite genome to save.");
      return;
    }
    saveModel({
      name: `${design.name} · ${activeTask}`,
      task: activeTask,
      shape: bestGenome.shape,
      genome: bestGenome.genome,
      design,
    });
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
    refreshEnvPackages();
  };
  const dismissSecretReveal = () => {
    setSecretRevealQueue((q) => q.slice(1));
  };
  if (error) {
    return (
      <div className="app error">
        {" "}
        <h1>Fresh Start</h1> <p>Failed to start: {error}</p>{" "}
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
        <h1>Fresh Start</h1> <p>Loading physics…</p>{" "}
      </div>
    );
  }
  const driveButtons: [DriveMode, string][] = [
    ["idle", "Idle"],
    ["manual", "Manual"],
    ["sine", "Oscillate"],
    ["brain", "Brain"],
  ];
  if (isFeatureEnabled("discoMode")) {
    driveButtons.push(["disco", "Disco"]);
  }
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Fresh Start</h1>
          <p>Keiwan-like rigid joints, bones &amp; spring muscles</p>
        </div>
      </header>

      {(() => {
        const zonePanel = (
          <div className="panel-stack">
            {isFeatureEnabled("zoneTabs") && (
              <section>
                <h2>Zone</h2>
                <div className="zone-tabs">
                  {ZONE_ORDER.map((id) => (
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
                {isFeatureEnabled("goalCatalog") && (
                  <>
                    <h3 className="subhead">Goal</h3>
                    <div className="button-row wrap">
                      {zoneGoals.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className={goalId === g.id ? "active" : ""}
                          onClick={() => selectGoal(g.id)}
                          title={g.blurb}
                        >
                          {g.title}
                        </button>
                      ))}
                    </div>
                    <p className="hint muted">{getGoal(goalId).blurb}</p>
                  </>
                )}
                {isFeatureEnabled("discoveryUi") && (
                  <div className="discovery-strip">
                    <h3 className="subhead">
                      Discoveries ({discoveries.length})
                    </h3>
                    {discoveries.length === 0 ? (
                      <p className="hint muted">No secret trophies yet.</p>
                    ) : (
                      <ul>
                        {discoveries.map((d) => (
                          <li key={d.secretGoalId}>
                            {revealedTitle(d.secretGoalId)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
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
                <div className="button-col">
                  {packages.length === 0 && (
                    <p className="hint muted">No saved packages yet.</p>
                  )}
                  {packages.map((pkg) => (
                    <div key={pkg.id} className="library-row">
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
                        {pkg.displayName}
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
              <section>
                <h2>Environments</h2>
                <p className="hint muted">
                  Themes &amp; packages only — geometry spawns in a later wave.
                </p>
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
                <div className="button-col" style={{ marginTop: "0.4rem" }}>
                  {envPackages.map((pkg) => (
                    <div key={pkg.id} className="library-row">
                      <button
                        type="button"
                        onClick={() => commitEnv(pkg.environment)}
                        title={
                          pkg.source === "builtin"
                            ? "Builtin flat ground"
                            : `rev ${pkg.revision}`
                        }
                      >
                        {pkg.displayName}
                        {pkg.source === "builtin" ? " ★" : ""}
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
              </section>
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
                />
                Snap joints to grid
              </label>
              <div className="button-row" style={{ marginTop: "0.45rem" }}>
                <button type="button" onClick={undo} disabled={undoCount === 0}>
                  Undo
                </button>
                <button type="button" onClick={clearDesign}>
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
                  "Click a joint, bone, or muscle to inspect · drag joints to move."}
                {tool === "bone" && "Left-drag joint→joint to draw a bone."}
                {tool === "muscle" && "Left-drag bone→bone to draw a muscle."}
              </p>
              <ul className="stats">
                <li>Joints: {design.joints.length}</li>
                <li>Bones: {design.bones.length}</li>
                <li>Muscles: {design.muscles.length}</li>
                <li>
                  Brain channels: {countBrainActuatorChannels(design.muscles)}
                </li>
              </ul>

              {selection?.kind === "joint" &&
                (() => {
                  const joint = design.joints.find(
                    (j) => j.id === selection.id,
                  );
                  if (!joint) return null;
                  return (
                    <div className="inspector">
                      <h3 className="subhead">Joint {joint.id}</h3>
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
                    </div>
                  );
                })()}

              {selection?.kind === "bone" &&
                (() => {
                  const bone = design.bones.find((b) => b.id === selection.id);
                  if (!bone) return null;
                  return (
                    <div className="inspector">
                      <h3 className="subhead">Bone {bone.id}</h3>
                      <label className="slider-row">
                        <span>Aero</span>
                        <input
                          type="range"
                          min={0}
                          max={3}
                          step={0.1}
                          value={bone.aeroArea ?? 0}
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
                      <p className="hint muted">
                        Area scale for aero-like lift/drag.
                      </p>
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
              <p className="hint muted">
                {hasCreature
                  ? "Start evolution from Evolve in the bottom training controls."
                  : "Load or build a creature first — empty designs stay in Edit."}
              </p>
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
            </section>
            {isFeatureEnabled("networkVisualizer") && (
              <section>
                <h2>Network {evolveProgress.running ? "(live)" : ""}</h2>
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
            {isFeatureEnabled("bestEverLedger") && bestEverList.length > 0 && (
              <section>
                <h2>Best ever</h2>
                <ul className="stats">
                  {bestEverList.slice(0, 6).map((e) => (
                    <li key={e.task}>
                      {e.task}: {e.fitness.toFixed(3)} · {e.designName}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {isFeatureEnabled("savedModels") && savedModels.length > 0 && (
              <section>
                <h2>Saved models</h2>
                <div className="button-col">
                  {savedModels.slice(0, 8).map((m) => (
                    <div key={m.id} className="library-row">
                      <button
                        type="button"
                        disabled={evolveProgress.running}
                        onClick={() => continueFromModel(m)}
                        title={`${m.task} · fit ${m.fitness.toFixed(3)}`}
                      >
                        {m.name}
                      </button>
                      <button
                        type="button"
                        className="danger-ghost"
                        onClick={() => {
                          deleteSavedModel(m.id);
                          refreshModels();
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

        const evolveButtons = (
          <>
            <div className="button-row">
              <button
                type="button"
                disabled={evolveProgress.running || design.muscles.length === 0}
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
                disabled={!bestGenome || evolveProgress.running}
                onClick={playBest}
              >
                Play best
              </button>
              <button
                type="button"
                disabled={!bestGenome || evolveProgress.running}
                onClick={continueFromBest}
              >
                Continue
              </button>
              {isFeatureEnabled("savedModels") && (
                <button
                  type="button"
                  disabled={!bestGenome || evolveProgress.running}
                  onClick={saveBestModel}
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

        const dockSummary = (
          <div className="dock-summary">
            {evolveButtons}
            <span className="dock-summary-stats">
              Gen {evolveProgress.generation} · Best{" "}
              {evolveProgress.bestFitness.toFixed(2)}
            </span>
          </div>
        );

        const dockFull = (
          <div
            className={
              evolveProgress.running ? "dock-full evolve-running" : "dock-full"
            }
          >
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
                      (id === "brain" && !bestGenome) ||
                      (id === "disco" && !discoPlayer.hasTrack())
                    }
                    onClick={() => {
                      if (id === "brain" && bestGenome) {
                        simulation.setBrain(
                          bestGenome.shape,
                          bestGenome.genome.weights,
                        );
                      }
                      if (id === "disco") discoPlayer.play();
                      setDriveMode(id);
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
              {isFeatureEnabled("discoMode") && (
                <div className="disco-panel">
                  <label className="file-row">
                    <span>Audio file</span>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        await discoPlayer.loadFile(file);
                        setDiscoTrack(file.name);
                      }}
                    />
                  </label>
                  {discoTrack && (
                    <p className="hint muted truncate">{discoTrack}</p>
                  )}
                  <div className="button-row">
                    <button type="button" onClick={() => discoPlayer.play()}>
                      Play
                    </button>
                    <button type="button" onClick={() => discoPlayer.pause()}>
                      Pause
                    </button>
                  </div>
                </div>
              )}
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

            {isFeatureEnabled("controlPanel") && (
              <div className="dock-col">
                <h3 className="subhead">Speed</h3>
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
                  Train
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
              </div>
            )}

            <div className="dock-col dock-col-grow">
              <h3 className="subhead">Evolve ({getGoal(goalId).title})</h3>
              {evolveButtons}
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
                <li>Gen: {evolveProgress.generation}</li>
                <li>
                  Episode:{" "}
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
              </ul>
              <p className={evolveProgress.running ? "hint" : "hint muted"}>
                {evolveProgress.status}
              </p>
            </div>
          </div>
        );

        const viewport =
          mode === "edit" ? (
            <EditorCanvas
              key={tool}
              design={design}
              onChange={commitDesign}
              tool={tool}
              snapEnabled={snapEnabled}
              selection={selection}
              onSelect={setSelection}
            />
          ) : (
            <SimCanvas
              simulation={simulation}
              evolveFocusKeys={evolveProgress.running}
              viewportInsetBottom={
                isFeatureEnabled("sandboxMenuShell") ? dockInset : 0
              }
              onFrame={(snap) => {
                setSimTime(snap.time);
                if (snap.evolve) setEvolveProgress(snap.evolve);
                if (isFeatureEnabled("networkVisualizer")) {
                  setLiveBrain(snap.brain ?? null);
                }
              }}
            />
          );

        if (isFeatureEnabled("sandboxMenuShell")) {
          return (
            <SandboxShell
              tabs={[
                { id: "zone", label: "Zone", content: zonePanel },
                {
                  id: "creatures",
                  label: "Creatures",
                  content: creaturesPanel,
                },
                { id: "edit", label: "Edit", content: editPanel },
                { id: "train", label: "Train", content: trainPanel },
                { id: "world", label: "World", content: worldPanel },
              ]}
              activeTab={sandboxTab}
              onActiveTabChange={onSandboxTabChange}
              viewport={viewport}
              dock={
                mode === "sim" ? (dockCollapsed ? dockSummary : dockFull) : null
              }
              dockCollapsed={dockCollapsed}
              onDockCollapsedChange={setDockCollapsed}
              onDockHeightChange={setDockInset}
            />
          );
        }

        return (
          <div className="main">
            <aside className="sidebar">
              {zonePanel}
              {creaturesPanel}
              {worldPanel}
              {mode === "edit" && editPanel}
              {mode === "sim" && (
                <>
                  {dockFull}
                  {trainPanel}
                </>
              )}
            </aside>
            <div className="viewport">{viewport}</div>
          </div>
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
