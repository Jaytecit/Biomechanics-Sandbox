/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, ChangeEvent } from 'react';
import {
  EvolutionGoal,
  SimulationConfig,
  Creature,
  GenerationRecord,
  CreatureBlueprint,
  Genome,
  WorldObject,
  DEFAULT_ARENA_MODIFIERS,
  DEFAULT_CUSTOM_GOAL,
  ChallengeDefinition,
  genomeIOForBlueprint,
  genomeMatchesBlueprint,
  createParaPilot,
  ParaPilotStage,
} from './types';
import { CREATURE_TEMPLATES } from './templates';
import { loadAllTemplates, upsertSavedCreature, removeSavedCreature, isBuiltinTemplate } from './savedCreatures';
import {
  spawnCreature,
  updateCreaturePhysics,
  generateObstacles,
  createWorldObjects,
  updateWorldState,
  stepPrivateWorld,
  extendEndlessStairs,
  extendEndlessTerrain,
  hasTerrain,
  getUprightScore,
  GROUND_Y,
} from './physics';
import { createBaseGenome, crossover, mutateWeights, mutateAddConnection, mutateAddNode, cloneGenome } from './neat';
import { CHALLENGES, loadChallengeProgress, saveChallengeProgress, clearChallengeProgress } from './challenges';
import { formatBestEver, formatLiveLeader } from './formatGoal';
import { getGoalInfo } from './goalCatalog';
import {
  breedParaPilotChild,
  eliteParaPilot,
  isParaRampGoal,
  maybeAdvanceParaStage,
  paraStageMetric,
  paraStageLabel,
} from './paraPilot';
import { escalateLimitsAfterGeneration, nextChallengeTarget } from './progressiveLimits';
import { BASE_GAP_WIDTH, BASE_RAMP_WIDTH, DEFAULT_RAMP_ANGLE_DEG } from './physicsConstants';

import { Visualizer } from './components/Visualizer';
import { NetworkVisualizer } from './components/NetworkVisualizer';
import { StatsPanel } from './components/StatsPanel';
import { ControlPanel } from './components/ControlPanel';
import { Studio } from './components/Studio';
import { DiscoveryPanel } from './components/DiscoveryPanel';
import { GaitFingerprints } from './components/GaitFingerprints';
import { ModelsPanel, ARENA_CHAMPIONSHIP_HREF } from './components/ModelsPanel';
import { ModelPickerPanel } from './components/ModelPickerPanel';
import { ZoneTabs } from './components/ZoneTabs';
import { SandboxMenu } from './components/SandboxMenu';
import { CapabilityPanel } from './components/CapabilityPanel';
import { ArenaModifiersPanel } from './components/ArenaModifiersPanel';
import { EnvironmentStudio } from './components/EnvironmentStudio';
import { PerformanceDiagnosticsPanel } from './components/PerformanceDiagnosticsPanel';
import { EnvironmentPackage, EnvironmentTheme } from './environments';
import {
  isPerformanceDiagnosticsActive,
  recordBreed,
  recordPhysicsFrame,
  recordUiSync,
} from './performanceDiagnostics';
import {
  ArenaZoneId,
  ARENA_ZONES,
  loadStoredZone,
  persistZone,
  filterTemplatesForZone,
  blueprintAllowedInZone,
  rejectReasonForZone,
  goalAllowedInZone,
  goalsForZone,
  resolveSimulationZone,
  sanitizeArenaForZone,
} from './zones';
import {
  FinishedModel,
  exportProductPayload,
  findBestModelForGoal,
  getPersistedGoalBestEver,
  importElitePayloadAsProduct,
  loadFinishedModels,
  promoteGoalBestEver,
  removeFinishedModel,
  renameFinishedModel,
  resolveGoalBestEver,
  saveCreatureAsProduct,
  seedGoalBestEverFromShelf,
  suggestTransferProductName,
  wipeBrokenScoresOnce,
  wipePreStepRunBestEverOnce,
  wipeStepPointRunBestEverOnce,
} from './savedModels';
import {
  eligibilityMessage,
  evaluateEligibility,
  resolveTrainingZone,
} from './eligibility';
import {
  AppearanceRig,
  CreaturePackage,
  bodyFingerprint,
  deletePackage,
  exportCreaturePackage,
  loadCreaturePackages,
  saveNewPackage,
  savePackageRevision,
} from './creaturePackages';

import {
  Brain,
  Activity,
  Award,
  Trophy,
  Sparkles,
  History,
  Timer,
  Zap,
  TrendingUp,
  Wrench,
  Gauge,
  ArrowUpToLine,
  MoveHorizontal,
  Footprints,
  Anchor,
  Ruler,
  ExternalLink,
  Swords,
  Maximize2,
  Minimize2,
  Boxes,
} from 'lucide-react';

const DEFAULT_CONFIG: SimulationConfig = {
  populationSize: 20,
  generationDuration: 28,
  simulationSpeed: 1,
  mutationRate: 0.25,
  addNodeRate: 0.05,
  addConnectionRate: 0.1,
  goal: EvolutionGoal.LOCOMOTION_RIGHT,
  gravity: 0.4,
  groundFriction: 0.8,
  arena: { ...DEFAULT_ARENA_MODIFIERS },
  customGoal: { ...DEFAULT_CUSTOM_GOAL, rules: DEFAULT_CUSTOM_GOAL.rules.map(r => ({ ...r })) },
  paraPilotStage: 'runUp',
  paraStageBestHistory: [],
};

// Physics stays tied to requestAnimationFrame, while React telemetry only needs
// human-readable cadence. The canvas reads the live creature objects directly.
const UI_SYNC_INTERVAL_MS = 1000 / 15;

export default function App() {
  const [activeTab, setActiveTab] = useState<'models' | 'simulation' | 'studio' | 'environment'>(
    'simulation'
  );
  const [activeZone, setActiveZone] = useState<ArenaZoneId>(() => loadStoredZone());
  // Start in the immersive workspace: it keeps the arena, controls, and live
  // telemetry visible together. Escape and the toggle still restore the page view.
  const [isFullscreen, setIsFullscreen] = useState(true);
  /** Bumped when opening the Models hub so package lists refresh from storage. */
  const [packagesRefreshToken, setPackagesRefreshToken] = useState(0);
  const [templates, setTemplates] = useState<CreatureBlueprint[]>(() => loadAllTemplates());
  const [config, setConfig] = useState<SimulationConfig>(() => {
    const zone = loadStoredZone();
    const goals = goalsForZone(zone);
    const z = ARENA_ZONES[zone];
    return {
      ...DEFAULT_CONFIG,
      ...(z.trainingDefaults ?? {}),
      goal: goals.includes(DEFAULT_CONFIG.goal) ? DEFAULT_CONFIG.goal : z.defaultGoal,
      arena: sanitizeArenaForZone(DEFAULT_CONFIG.arena, zone),
    };
  });
  const [selectedTemplate, setSelectedTemplate] = useState<CreatureBlueprint>(() => {
    const zone = loadStoredZone();
    const all = loadAllTemplates();
    const allowed = filterTemplatesForZone(all, zone);
    const preferred = allowed.find(t => t.name === ARENA_ZONES[zone].defaultTemplateName);
    return preferred ?? allowed[0] ?? all[0] ?? CREATURE_TEMPLATES[0];
  });
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const [selectedCreatureId, setSelectedCreatureId] = useState<string | null>(null);
  const [obstacles, setObstacles] = useState(() =>
    generateObstacles(
      (() => {
        const zone = loadStoredZone();
        const goals = goalsForZone(zone);
        return goals.includes(DEFAULT_CONFIG.goal)
          ? DEFAULT_CONFIG.goal
          : ARENA_ZONES[zone].defaultGoal;
      })(),
      sanitizeArenaForZone(DEFAULT_CONFIG.arena, loadStoredZone())
    )
  );
  const [worldObjects, setWorldObjects] = useState<WorldObject[]>(() =>
    createWorldObjects(
      (() => {
        const zone = loadStoredZone();
        const goals = goalsForZone(zone);
        return goals.includes(DEFAULT_CONFIG.goal)
          ? DEFAULT_CONFIG.goal
          : ARENA_ZONES[zone].defaultGoal;
      })()
    )
  );
  const [generationHistory, setGenerationHistory] = useState<GenerationRecord[]>([]);
  
  const [currentGen, setCurrentGen] = useState<number>(1);
  const [bestEverFitness, setBestEverFitness] = useState<number>(0);
  const [bestEverDistance, setBestEverDistance] = useState<number>(0);
  /** Generation length (seconds) when bestEverFitness was set */
  const [bestEverGenerationDuration, setBestEverGenerationDuration] = useState<number>(0);
  /** Peak horizontal speed (px/frame) seen under the Speed goal */
  const [bestEverPeakSpeed, setBestEverPeakSpeed] = useState<number>(0);
  /** Peak grounded speed (px/frame) under Landspeed */
  const [bestEverPeakLandSpeed, setBestEverPeakLandSpeed] = useState<number>(0);
  /** Max jump clearance (px) under jump-related goals */
  const [bestEverJumpHeight, setBestEverJumpHeight] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [challengeProgress, setChallengeProgress] = useState(loadChallengeProgress);
  const [activeChallengeId, setActiveChallengeId] = useState<string | null>(null);
  const [finishedModels, setFinishedModels] = useState<FinishedModel[]>(() => loadFinishedModels());
  const [environmentTheme, setEnvironmentTheme] = useState<EnvironmentTheme>('meadow');
  /** When set, Freeze suggests a transfer name (source → current goal). */
  const [transferSourceName, setTransferSourceName] = useState<string | null>(null);

  const zoneTemplates = useMemo(
    () => filterTemplatesForZone(templates, activeZone),
    [templates, activeZone]
  );
  const selectedAppearance = useMemo(
    () => {
      const packages = loadCreaturePackages();
      const fingerprint = bodyFingerprint(selectedTemplate);
      return (
        packages.find(item =>
          item.displayName === selectedTemplate.name && item.appearance
        )?.appearance ??
        packages.find(item =>
          item.bodyFingerprint === fingerprint && item.appearance
        )?.appearance
      );
    },
    [selectedTemplate, templates]
  );

  const creaturesRef = useRef<Creature[]>([]);
  const elapsedSecondsRef = useRef<number>(0);
  const simTimeRef = useRef<number>(0);
  const worldObjectsRef = useRef<WorldObject[]>(worldObjects);
  const obstaclesRef = useRef(obstacles);
  const configRef = useRef(config);
  const selectedCreatureIdRef = useRef<string | null>(selectedCreatureId);
  const lastUiSyncMsRef = useRef<number>(0);
  const generationHistoryLengthRef = useRef(generationHistory.length);
  const bestEverFitnessRef = useRef(bestEverFitness);
  const bestEverGenerationDurationRef = useRef(bestEverGenerationDuration);
  /**
   * Continue-training installs a cloned population then updates goal/body.
   * Keep that seed across the ensuing React rebuild effect (incl. Strict Mode).
   * Cleared when the user deliberately changes zone, body, goal, or resets.
   */
  const protectSeededPopulationRef = useRef(false);
  configRef.current = config;
  worldObjectsRef.current = worldObjects;
  obstaclesRef.current = obstacles;
  selectedCreatureIdRef.current = selectedCreatureId;
  generationHistoryLengthRef.current = generationHistory.length;
  bestEverFitnessRef.current = bestEverFitness;
  bestEverGenerationDurationRef.current = bestEverGenerationDuration;

  const openSimulation = useCallback(() => {
    setActiveTab('simulation');
    setIsFullscreen(true);
  }, []);

  const resetWorld = useCallback((goal: EvolutionGoal, arena: SimulationConfig['arena']) => {
    const obs = generateObstacles(goal, arena);
    const objs = createWorldObjects(goal, arena.difficulty);
    setObstacles(obs);
    setWorldObjects(objs);
    obstaclesRef.current = obs;
    worldObjectsRef.current = objs;
  }, []);

  /**
   * Seed session high-water from the permanent ledger (and shelf). Never clears
   * an all-time Best Ever — only loads the record for the active goal.
   */
  const applyPersistedBestEverBaseline = useCallback((goal: EvolutionGoal) => {
    const shelf = findBestModelForGoal(goal);
    const ledger = getPersistedGoalBestEver(goal);
    const shelfBest = shelf?.fitness ?? 0;
    const ledgerBest = ledger?.fitness ?? 0;
    const best = Math.max(shelfBest, ledgerBest);
    const dur =
      ledgerBest >= shelfBest
        ? (ledger?.generationDurationSec ?? 0)
        : (shelf?.generationDurationSec ?? 0);
    setBestEverFitness(best);
    bestEverFitnessRef.current = best;
    setBestEverGenerationDuration(dur);
    bestEverGenerationDurationRef.current = dur;
  }, []);

  /** Raise session + permanent Best Ever when a candidate beats the record. */
  const raiseBestEverIfBeaten = useCallback(
    (
      goal: EvolutionGoal,
      fitness: number,
      generationDurationSec: number,
      modelName?: string
    ) => {
      if (!Number.isFinite(fitness) || fitness <= 0) return;
      const entry = promoteGoalBestEver(goal, {
        fitness,
        modelName: modelName || 'This run',
        generationDurationSec,
      });
      const next = Math.max(fitness, entry?.fitness ?? 0, bestEverFitnessRef.current);
      if (next > bestEverFitnessRef.current) {
        const dur =
          fitness >= (entry?.fitness ?? 0)
            ? generationDurationSec
            : (entry?.generationDurationSec ?? generationDurationSec);
        bestEverFitnessRef.current = next;
        bestEverGenerationDurationRef.current = dur;
        setBestEverFitness(next);
        setBestEverGenerationDuration(dur);
      }
    },
    []
  );

  const initializePopulation = useCallback((template: CreatureBlueprint, popSize: number, resetHistory: boolean) => {
    const newCreatures: Creature[] = [];
    const { inputs: inputsCount, outputs: outputsCount } = genomeIOForBlueprint(template);
    const difficulty = configRef.current.arena.difficulty ?? 1;

    for (let i = 0; i < popSize; i++) {
      const genome = createBaseGenome(inputsCount, outputsCount);
      const usePara = isParaRampGoal(configRef.current.goal);
      const creature = spawnCreature(
        {
          id: `c_1_${Math.random().toString(36).substring(2, 8)}`,
          generation: 1,
          blueprint: template,
          genome,
          paraPilot: usePara ? createParaPilot(genome, cloneGenome) : undefined,
        },
        100,
        GROUND_Y - 50,
        configRef.current.goal,
        difficulty
      );
      newCreatures.push(creature);
    }

    setCreatures(newCreatures);
    creaturesRef.current = newCreatures;
    setSelectedCreatureId(newCreatures[0].id);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    simTimeRef.current = 0;
    resetWorld(configRef.current.goal, configRef.current.arena);

    if (resetHistory) {
      setGenerationHistory([]);
      setCurrentGen(1);
      applyPersistedBestEverBaseline(configRef.current.goal);
      setBestEverDistance(0);
      setBestEverPeakSpeed(0);
      setBestEverPeakLandSpeed(0);
      setBestEverJumpHeight(0);
    }
  }, [resetWorld, applyPersistedBestEverBaseline]);

  // Escape exits immersive fullscreen layout; lock page scroll while active
  useEffect(() => {
    if (!isFullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isFullscreen]);

  // First-turn boot: wipe lock-era broken scores once, then seed Best Ever.
  useEffect(() => {
    const wiped = wipeBrokenScoresOnce();
    const runCriterionWiped = wipePreStepRunBestEverOnce();
    const runTravelWiped = wipeStepPointRunBestEverOnce();
    if (wiped || runCriterionWiped || runTravelWiped) {
      if (wiped) {
        clearChallengeProgress();
        try {
          localStorage.removeItem('biomech_arena_leaderboard_v1');
        } catch {
          // ignore
        }
        setChallengeProgress({});
      }
      setFinishedModels(loadFinishedModels());
      setBestEverFitness(0);
      bestEverFitnessRef.current = 0;
      setBestEverGenerationDuration(0);
      bestEverGenerationDurationRef.current = 0;
      setBestEverDistance(0);
      if (wiped) {
        setBestEverPeakSpeed(0);
        setBestEverPeakLandSpeed(0);
        setBestEverJumpHeight(0);
      }
    }
    seedGoalBestEverFromShelf(loadFinishedModels());
    applyPersistedBestEverBaseline(config.goal);
    initializePopulation(selectedTemplate, config.populationSize, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild when goal / body / population size change
  useEffect(() => {
    resetWorld(config.goal, config.arena);
    if (protectSeededPopulationRef.current) return;
    initializePopulation(selectedTemplate, config.populationSize, false);
  }, [config.goal, selectedTemplate, config.populationSize, initializePopulation, resetWorld]);

  // When focus changes (esp. while paused), show that agent's private ball/crate
  useEffect(() => {
    const focused = creaturesRef.current.find(c => c.id === selectedCreatureId);
    if (focused?.privateWorld) {
      const displayObjs = focused.privateWorld.map(o => ({ ...o }));
      setWorldObjects(displayObjs);
      worldObjectsRef.current = displayObjs;
    }
  }, [selectedCreatureId]);

  // Goal change: load that goal's permanent record (never wipe all-time scores).
  useEffect(() => {
    applyPersistedBestEverBaseline(config.goal);
    setBestEverDistance(0);
    setBestEverPeakSpeed(0);
    setBestEverPeakLandSpeed(0);
    setBestEverJumpHeight(0);
    setConfig(prev => ({
      ...prev,
      arena: { ...prev.arena, progressiveTiers: 0 },
    }));
  }, [config.goal, applyPersistedBestEverBaseline]);

  // Refresh ice / ramp / pit / gap geometry without wiping generation progress
  useEffect(() => {
    const obs = generateObstacles(config.goal, config.arena);
    setObstacles(obs);
    obstaclesRef.current = obs;
  }, [
    config.arena.iceEnabled,
    config.arena.rampEnabled,
    config.arena.pitEnabled,
    config.arena.gapWidthPx,
    config.arena.rampAngleDeg,
    config.arena.rampWidthPx,
    config.arena.progressiveTier,
    config.arena.difficulty,
    config.arena.terrainEnabled,
    config.arena.terrainObstaclesEnabled,
    config.arena.terrainSeed,
    config.goal,
  ]);

  // Track challenge progress each generation / fitness update — escalate live target when beaten
  useEffect(() => {
    if (!activeChallengeId) return;
    const challenge = CHALLENGES.find(c => c.id === activeChallengeId);
    if (!challenge) return;

    setChallengeProgress(prev => {
      const existing = prev[challenge.id] || {
        cleared: false,
        bestScore: 0,
        liveTarget: challenge.targetValue,
        clearCount: 0,
      };
      const bestScore = Math.max(existing.bestScore, bestEverFitness);
      let cleared = existing.cleared;
      let clearedAtGeneration = existing.clearedAtGeneration;
      let liveTarget = existing.liveTarget ?? challenge.targetValue;
      let clearCount = existing.clearCount ?? 0;

      while (bestScore >= liveTarget && currentGen <= challenge.maxGenerations) {
        if (!cleared) {
          cleared = true;
          clearedAtGeneration = currentGen;
        }
        clearCount += 1;
        liveTarget = nextChallengeTarget(liveTarget, challenge.targetValue);
      }

      const next = {
        ...prev,
        [challenge.id]: { cleared, clearedAtGeneration, bestScore, liveTarget, clearCount },
      };
      saveChallengeProgress(next);
      return next;
    });
  }, [bestEverFitness, currentGen, activeChallengeId]);

  // Handle template selection change
  const handleSelectTemplate = (template: CreatureBlueprint) => {
    if (!blueprintAllowedInZone(template, activeZone)) {
      alert(rejectReasonForZone(template, activeZone));
      return;
    }
    protectSeededPopulationRef.current = false;
    setSelectedTemplate(template);
    initializePopulation(template, config.populationSize, true);
  };

  const handleSelectZone = (zoneId: ArenaZoneId) => {
    if (zoneId === activeZone) return;
    const zone = ARENA_ZONES[zoneId];
    const allowedBodies = filterTemplatesForZone(templates, zoneId);
    const currentAllowed = blueprintAllowedInZone(selectedTemplate, zoneId);

    let nextTemplate: CreatureBlueprint;
    if (currentAllowed) {
      // Keep the loaded model when it is eligible in the destination mode.
      nextTemplate =
        allowedBodies.find(t => t.name === selectedTemplate.name) || selectedTemplate;
    } else {
      const fallback =
        allowedBodies.find(t => t.name === zone.defaultTemplateName) ||
        allowedBodies[0];
      if (!fallback) return;
      const reason =
        rejectReasonForZone(selectedTemplate, zoneId) ||
        `"${selectedTemplate.name}" is not allowed in ${zone.title}.`;
      const proceed = window.confirm(
        `${reason}\n\nSwitching to ${zone.title} will unload "${selectedTemplate.name}" and load "${fallback.name}" instead. Continue?`
      );
      if (!proceed) return;
      nextTemplate = fallback;
    }

    protectSeededPopulationRef.current = false;
    persistZone(zoneId);
    setActiveZone(zoneId);
    const zoneGoals = goalsForZone(zoneId);
    const nextGoal = zoneGoals.includes(config.goal) ? config.goal : zone.defaultGoal;
    const nextArena = sanitizeArenaForZone(config.arena, zoneId);
    setConfig(prev => ({
      ...prev,
      goal: nextGoal,
      arena: nextArena,
      ...(zone.trainingDefaults ?? {}),
      ...(nextGoal === EvolutionGoal.PARA_RAMP_GLIDE
        ? {}
        : { paraPilotStage: 'runUp', paraStageBestHistory: [] }),
    }));
    setSelectedTemplate(nextTemplate);
    setActiveChallengeId(null);
    setIsRunning(false);
  };

  // Handle removing a custom template from selector (builtins are protected)
  const handleRemoveTemplate = (templateName: string) => {
    if (isBuiltinTemplate(templateName)) return;
    removeSavedCreature(templateName);
    setTemplates(prev => {
      const updated = prev.filter(t => t.name !== templateName);
      if (updated.length === 0) return prev;

      if (selectedTemplate.name === templateName) {
        const nextTemplate = updated[0];
        setSelectedTemplate(nextTemplate);
        initializePopulation(nextTemplate, config.populationSize, true);
      }
      return updated;
    });
  };

  /** Persist studio anatomy into the Creature Anatomy selector (and localStorage). */
  const handleSaveCreature = (
    blueprint: CreatureBlueprint,
    appearance?: AppearanceRig
  ) => {
    if (isBuiltinTemplate(blueprint.name)) {
      alert(
        `"${blueprint.name}" is a built-in body. Rename your creature in the Studio before saving.`
      );
      return false;
    }
    const packages = loadCreaturePackages();
    const existingPackage = packages.find(item => item.displayName === blueprint.name);
    const packageResult = existingPackage
      ? savePackageRevision(existingPackage.id, {
          blueprint,
          displayName: blueprint.name,
          appearance,
        })
      : saveNewPackage(blueprint, {
          displayName: blueprint.name,
          appearance,
          source: 'studio-draft',
        });
    if (!packageResult.ok) {
      alert(`Could not save the creature appearance: ${packageResult.error}`);
      return false;
    }
    upsertSavedCreature(blueprint);
    setTemplates(prev => {
      const exists = prev.some(t => t.name === blueprint.name);
      if (exists) return prev.map(t => (t.name === blueprint.name ? blueprint : t));
      return [...prev, blueprint];
    });
    return true;
  };

  // Handle loading custom template designed in Studio (save + select + reset sim)
  const handleLoadCustomTemplate = (
    blueprint: CreatureBlueprint,
    appearance?: AppearanceRig
  ) => {
    if (!blueprintAllowedInZone(blueprint, activeZone)) {
      alert(rejectReasonForZone(blueprint, activeZone));
      return;
    }
    if (!handleSaveCreature(blueprint, appearance)) return;
    setSelectedTemplate(blueprint);
    initializePopulation(blueprint, config.populationSize, true);
    openSimulation();
  };

  // Perform full crossover and breed calculations for the next generation
  const breedNextGeneration = useCallback(() => {
    const currentPopulation = creaturesRef.current;
    if (currentPopulation.length === 0) return;
    const measureBreed = isPerformanceDiagnosticsActive();
    const breedStartedAt = measureBreed ? performance.now() : 0;

    // 1. Evaluate final fitness scores
    const sorted = [...currentPopulation].sort((a, b) => b.fitness - a.fitness);
    const bestFit = sorted[0]?.fitness || 0;
    const minFit = sorted[sorted.length - 1]?.fitness || 0;
    const avgFit = sorted.reduce((sum, c) => sum + c.fitness, 0) / sorted.length;

    // Keep track of high records (session + permanent ledger)
    if (bestFit > bestEverFitnessRef.current) {
      const champName = sorted[0]?.blueprint.name || 'This run';
      raiseBestEverIfBeaten(config.goal, bestFit, config.generationDuration, champName);
    }

    // Specifically track absolute distance traveled right
    const bestX = Math.max(...currentPopulation.map(c => c.currentX));
    if (bestX > bestEverDistance) {
      setBestEverDistance(bestX);
    }

    const topPeak = Math.max(...currentPopulation.map(c => c.peakSpeed ?? 0));
    if (topPeak > bestEverPeakSpeed) {
      setBestEverPeakSpeed(topPeak);
    }

    const topLand = Math.max(...currentPopulation.map(c => c.peakLandSpeed ?? 0));
    if (topLand > bestEverPeakLandSpeed) {
      setBestEverPeakLandSpeed(topLand);
    }

    const topJump = Math.max(
      ...currentPopulation.map(c =>
        Math.max(
          c.jumpHeightBestClearance ?? 0,
          c.aerialBoutIsHop ? 0 : c.aerialBoutPeakLowestClearance ?? 0
        )
      )
    );
    if (topJump > bestEverJumpHeight) {
      setBestEverJumpHeight(topJump);
    }

    // Escalate goal limits when the best agent beats the current bar/gap/finish
    let arenaForNext = config.arena;
    const escalation = escalateLimitsAfterGeneration(config.goal, config.arena, sorted[0]);
    if (escalation.arenaPatch) {
      arenaForNext = { ...config.arena, ...escalation.arenaPatch };
      setConfig(prev => ({
        ...prev,
        arena: arenaForNext,
      }));
      const refreshed = generateObstacles(config.goal, arenaForNext);
      setObstacles(refreshed);
      obstaclesRef.current = refreshed;
    }

    // Record generation history
    const record: GenerationRecord = {
      generation: currentGen,
      bestFitness: bestFit,
      avgFitness: avgFit,
      minFitness: minFit,
    };

    setGenerationHistory(prev => [...prev, record]);

    // 2. Build the new population (same body blueprint for everyone)
    const bodyBlueprint = selectedTemplate;
    const expectedIO = genomeIOForBlueprint(bodyBlueprint);
    const nextPopulation: Creature[] = [];

    const compatibleGenome = (genome: Genome): Genome => {
      if (genomeMatchesBlueprint(genome, bodyBlueprint)) return genome;
      // Body/brain dimension mismatch — start a fresh matching network
      return createBaseGenome(expectedIO.inputs, expectedIO.outputs);
    };

    // Elitism: Keep the top 15% (minimum 1, up to 4) of previous generation exactly
    const eliteCount = Math.max(1, Math.floor(config.populationSize * 0.15));
    const difficulty = arenaForNext.difficulty ?? 1;
    const paraMode = isParaRampGoal(config.goal);
    const stage: ParaPilotStage = config.paraPilotStage ?? 'runUp';

    for (let i = 0; i < eliteCount; i++) {
      const parent = sorted[i];
      const elitePack = paraMode
        ? eliteParaPilot(parent, cloneGenome, compatibleGenome, stage)
        : {
            genome: compatibleGenome(cloneGenome(parent.genome)),
            paraPilot: undefined,
          };
      const elite = spawnCreature(
        {
          id: `c_${currentGen + 1}_elite_${i}_${Math.random().toString(36).substring(2, 6)}`,
          generation: currentGen + 1,
          blueprint: bodyBlueprint,
          genome: elitePack.genome,
          paraPilot: elitePack.paraPilot,
        },
        100,
        GROUND_Y - 50,
        config.goal,
        difficulty
      );
      nextPopulation.push(elite);
    }

    // Tournament selection for breeding remaining population
    const selectParent = (): Creature => {
      const competitors: Creature[] = [];
      for (let i = 0; i < 3; i++) {
        competitors.push(sorted[Math.floor(Math.random() * sorted.length)]);
      }
      return competitors.reduce((best, c) => (c.fitness > best.fitness ? c : best), competitors[0]);
    };

    const mutateChild = (g: Genome): Genome => {
      let childGenome = g;
      if (Math.random() < 0.85) {
        childGenome = mutateWeights(childGenome, config.mutationRate);
      }
      if (Math.random() < config.addConnectionRate) {
        childGenome = mutateAddConnection(childGenome);
      }
      if (Math.random() < config.addNodeRate) {
        childGenome = mutateAddNode(childGenome);
      }
      return childGenome;
    };

    while (nextPopulation.length < config.populationSize) {
      const parentA = selectParent();
      const parentB = selectParent();

      let childGenome: Genome;
      let childPilot: Creature['paraPilot'];

      if (paraMode) {
        const bred = breedParaPilotChild(
          parentA,
          parentB,
          stage,
          mutateChild,
          cloneGenome,
          compatibleGenome
        );
        childGenome = bred.genome;
        childPilot = bred.paraPilot;
      } else {
        childGenome = crossover(parentA.genome, parentB.genome, parentA.fitness, parentB.fitness);
        childGenome = mutateChild(childGenome);
        childGenome = compatibleGenome(childGenome);
        childPilot = undefined;
      }

      const child = spawnCreature(
        {
          id: `c_${currentGen + 1}_${Math.random().toString(36).substring(2, 8)}`,
          generation: currentGen + 1,
          blueprint: bodyBlueprint,
          genome: childGenome,
          paraPilot: childPilot,
        },
        100,
        GROUND_Y - 50,
        config.goal,
        difficulty
      );
      nextPopulation.push(child);
    }

    // Para Ramp: auto-advance training stage from generation best metric
    if (paraMode) {
      const metricBest = Math.max(
        ...currentPopulation.map(c => paraStageMetric(c, stage)),
        0
      );
      const advanced = maybeAdvanceParaStage(
        stage,
        config.paraStageBestHistory ?? [],
        metricBest
      );
      if (advanced.stage !== stage || advanced.history !== config.paraStageBestHistory) {
        setConfig(prev => ({
          ...prev,
          paraPilotStage: advanced.stage,
          paraStageBestHistory: advanced.history,
        }));
      }
    }

    // Update state to start the new generation
    setCreatures(nextPopulation);
    creaturesRef.current = nextPopulation;

    // Default focus to the new leader
    const newLeader = nextPopulation.reduce(
      (best, current) => (current.fitness > best.fitness ? current : best),
      nextPopulation[0]
    );
    setSelectedCreatureId(newLeader.id);

    setCurrentGen(prev => prev + 1);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    simTimeRef.current = 0;
    resetWorld(config.goal, config.arena);
    if (measureBreed) recordBreed(performance.now() - breedStartedAt);
  }, [currentGen, config, selectedTemplate, bestEverDistance, bestEverPeakSpeed, bestEverPeakLandSpeed, bestEverJumpHeight, resetWorld, raiseBestEverIfBeaten]);

  // Fractional-speed accumulator so 0.5x can step every other frame
  const speedAccumulatorRef = useRef<number>(0);

  // Main high-frequency physics tick loop
  useEffect(() => {
    if (!isRunning) return;

    let animId: number;
    speedAccumulatorRef.current = 0;
    lastUiSyncMsRef.current = 0;

    const tick = (frameTimeMs: number) => {
      const cfg = configRef.current;
      const measurePerformance = isPerformanceDiagnosticsActive();
      const physicsStartedAt = measurePerformance ? performance.now() : 0;
      speedAccumulatorRef.current += cfg.simulationSpeed;
      const steps = Math.floor(speedAccumulatorRef.current);
      speedAccumulatorRef.current -= steps;
      const stepDuration = 1 / 60;

      const currentPop = creaturesRef.current;
      const obs = obstaclesRef.current;

      for (let s = 0; s < steps; s++) {
        simTimeRef.current += 1;
        if (cfg.goal === EvolutionGoal.STAIR_CLIMB) {
          const furthestX = Math.max(...currentPop.map(c => c.currentX), 100);
          extendEndlessStairs(obs, furthestX, cfg.arena.difficulty ?? 1);
        }
        if (
          cfg.goal === EvolutionGoal.MOTOR_LOOP ||
          cfg.arena.terrainEnabled ||
          hasTerrain(obs)
        ) {
          const furthestX = Math.max(
            ...currentPop.map(c => {
              const hoop = c.privateWorld?.find(o => o.type === 'hoop');
              return hoop ? hoop.x : c.currentX;
            }),
            100
          );
          extendEndlessTerrain(
            obs,
            furthestX,
            cfg.arena.terrainSeed ?? 42,
            cfg.arena.difficulty ?? 1,
            !!cfg.arena.terrainObstaclesEnabled
          );
        }
        // Shared arena geometry. Ball/crate are per-creature.
        updateWorldState([], obs, simTimeRef.current, cfg);
        for (const creature of currentPop) {
          const privateObjs = creature.privateWorld ?? [];
          stepPrivateWorld(privateObjs, obs, cfg, simTimeRef.current);
          updateCreaturePhysics(creature, obs, simTimeRef.current, cfg, privateObjs);
        }
        elapsedSecondsRef.current += stepDuration;
      }

      creaturesRef.current = currentPop;
      // Display the focused agent's private objects (never a shared contested ball/crate)
      const focusId = selectedCreatureIdRef.current;
      const focused =
        currentPop.find(c => c.id === focusId) ||
        currentPop.reduce(
          (best, c) => (c.fitness > best.fitness ? c : best),
          currentPop[0]
        );
      const displayObjs = (focused?.privateWorld ?? []).map(o => ({ ...o }));
      worldObjectsRef.current = displayObjs;
      obstaclesRef.current = obs;

      // Avoid rebuilding the entire inspector and telemetry tree at physics
      // frequency. Visualizer keeps rendering the live, mutated objects at the
      // display refresh rate; React summaries update at a steady 15 Hz.
      if (frameTimeMs - lastUiSyncMsRef.current >= UI_SYNC_INTERVAL_MS) {
        lastUiSyncMsRef.current = frameTimeMs;
        let liveBest = 0;
        for (const c of currentPop) {
          if (c.fitness > liveBest) liveBest = c.fitness;
        }
        if (liveBest > bestEverFitnessRef.current) {
          let champName = 'This run';
          for (const c of currentPop) {
            if (c.fitness === liveBest) {
              champName = c.blueprint.name || 'This run';
              break;
            }
          }
          raiseBestEverIfBeaten(cfg.goal, liveBest, cfg.generationDuration, champName);
        }
        setCreatures([...currentPop]);
        setWorldObjects(displayObjs);
        setObstacles(obs.map(o => ({ ...o })));
        setElapsedSeconds(elapsedSecondsRef.current);
        recordUiSync();
      }

      if (measurePerformance) {
        recordPhysicsFrame(
          performance.now(),
          performance.now() - physicsStartedAt,
          steps,
          {
            generation: currentPop[0]?.generation ?? currentGen,
            elapsedSeconds: elapsedSecondsRef.current,
            simulationSpeed: cfg.simulationSpeed,
            goal: cfg.goal,
            populationSize: currentPop.length,
            obstacleCount: obs.length,
            historyLength: generationHistoryLengthRef.current,
          },
          currentPop
        );
      }

      if (elapsedSecondsRef.current >= cfg.generationDuration) {
        breedNextGeneration();
      } else {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isRunning, breedNextGeneration]);

  const handleUpdateConfig = (newConfig: Partial<SimulationConfig>) => {
    protectSeededPopulationRef.current = false;
    setConfig(prev => {
      let nextGoal = newConfig.goal ?? prev.goal;
      if (newConfig.goal && !goalAllowedInZone(newConfig.goal, activeZone)) {
        nextGoal = prev.goal;
      }
      const mergedArena = newConfig.arena ? { ...prev.arena, ...newConfig.arena } : { ...prev.arena };
      const arena = sanitizeArenaForZone(mergedArena, activeZone);
      const enablingTerrain =
        newConfig.arena?.terrainEnabled === true && !prev.arena.terrainEnabled;
      const switchingToHoop =
        newConfig.goal === EvolutionGoal.MOTOR_LOOP && prev.goal !== EvolutionGoal.MOTOR_LOOP;
      if (enablingTerrain || switchingToHoop) {
        arena.terrainSeed = (Math.random() * 1e9) | 0;
      }
      if (nextGoal === EvolutionGoal.MOTOR_LOOP && ARENA_ZONES[activeZone].arena.terrain) {
        arena.terrainEnabled = true;
      }
      // Reset Para Ramp curriculum stage when entering the goal
      const enteringPara =
        nextGoal === EvolutionGoal.PARA_RAMP_GLIDE && prev.goal !== EvolutionGoal.PARA_RAMP_GLIDE;
      // Respect slider (min 10s) for every goal/zone — no flight-only floor.
      const generationDuration = Math.max(
        10,
        newConfig.generationDuration ?? prev.generationDuration
      );
      return {
        ...prev,
        ...newConfig,
        arena,
        generationDuration,
        customGoal: newConfig.customGoal
          ? { ...newConfig.customGoal, rules: [...newConfig.customGoal.rules] }
          : prev.customGoal,
        goal: nextGoal,
        ...(enteringPara
          ? { paraPilotStage: 'runUp' as ParaPilotStage, paraStageBestHistory: [] }
          : {}),
      };
    });
  };

  const handleStartChallenge = (challenge: ChallengeDefinition) => {
    if (!goalAllowedInZone(challenge.goal, activeZone)) {
      alert(
        `Challenge "${challenge.title}" belongs to another zone. Switch areas to run it.`
      );
      return;
    }
    setActiveChallengeId(challenge.id);
    setConfig(prev => ({
      ...prev,
      goal: challenge.goal,
      generationDuration: Math.max(prev.generationDuration, 28),
      arena: {
        ...prev.arena,
        difficulty: Math.max(prev.arena.difficulty ?? 1, 1.15),
        progressiveTier: 0,
        gapWidthPx: prev.arena.gapWidthPx ?? BASE_GAP_WIDTH,
        rampAngleDeg: prev.arena.rampAngleDeg ?? DEFAULT_RAMP_ANGLE_DEG,
        rampWidthPx: prev.arena.rampWidthPx ?? BASE_RAMP_WIDTH,
        ...(challenge.goal === EvolutionGoal.MOTOR_LOOP
          ? { terrainEnabled: true, terrainSeed: (Math.random() * 1e9) | 0 }
          : {}),
      },
      ...(isParaRampGoal(challenge.goal)
        ? { paraPilotStage: 'runUp' as ParaPilotStage, paraStageBestHistory: [] }
        : {}),
    }));
    setBestEverDistance(0);
    setBestEverPeakSpeed(0);
    setBestEverPeakLandSpeed(0);
    setBestEverJumpHeight(0);
    setCurrentGen(1);
    applyPersistedBestEverBaseline(challenge.goal);
    initializePopulation(selectedTemplate, config.populationSize, true);
    setIsRunning(true);
  };

  const handleLoadSnapshot = (blueprint: CreatureBlueprint, genome: Genome, name: string) => {
    const named = { ...blueprint, name: name || blueprint.name };
    if (!blueprintAllowedInZone(named, activeZone)) {
      alert(rejectReasonForZone(named, activeZone));
      return;
    }
    if (!isBuiltinTemplate(named.name)) {
      upsertSavedCreature(named);
    }
    setTemplates(prev => {
      const exists = prev.some(t => t.name === named.name);
      return exists ? prev.map(t => (t.name === named.name ? named : t)) : [...prev, named];
    });
    setSelectedTemplate(named);

    const { inputs: needIn, outputs: needOut } = genomeIOForBlueprint(named);
    const seedGenome = genomeMatchesBlueprint(genome, named)
      ? genome
      : createBaseGenome(needIn, needOut);

    const popSize = config.populationSize;
    const newCreatures: Creature[] = [];
    for (let i = 0; i < popSize; i++) {
      let g = cloneGenome(seedGenome);
      if (i > 0) g = mutateWeights(g, config.mutationRate);
      newCreatures.push(
        spawnCreature(
          {
            id: `c_1_share_${i}_${Math.random().toString(36).substring(2, 6)}`,
            generation: 1,
            blueprint: named,
            genome: g,
          },
          100,
          GROUND_Y - 50,
          config.goal,
          config.arena.difficulty ?? 1
        )
      );
    }
    setCreatures(newCreatures);
    creaturesRef.current = newCreatures;
    setSelectedCreatureId(newCreatures[0].id);
    setGenerationHistory([]);
    setCurrentGen(1);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    simTimeRef.current = 0;
    resetWorld(config.goal, config.arena);
    openSimulation();
  };

  const handleAddRandomMorph = (blueprint: CreatureBlueprint) => {
    let named = blueprint;
    if (isBuiltinTemplate(blueprint.name)) {
      named = { ...blueprint, name: `${blueprint.name} ${Date.now().toString(36).slice(-4)}` };
    }
    if (!blueprintAllowedInZone(named, activeZone)) {
      alert(rejectReasonForZone(named, activeZone));
      return;
    }
    upsertSavedCreature(named);
    setTemplates(prev => [...prev, named]);
    setSelectedTemplate(named);
    initializePopulation(named, config.populationSize, true);
    openSimulation();
  };

  // Skip/Breed immediately
  const handleManualBreed = () => {
    breedNextGeneration();
  };

  // Wipe statistics and start fresh
  const handleResetSimulation = () => {
    protectSeededPopulationRef.current = false;
    if (isParaRampGoal(config.goal)) {
      setConfig(prev => ({
        ...prev,
        paraPilotStage: 'runUp',
        paraStageBestHistory: [],
      }));
    }
    initializePopulation(selectedTemplate, config.populationSize, true);
  };

  const handleSaveLeaderAsProduct = (name: string, notes: string) => {
    const sorted = [...creatures].sort((a, b) => b.fitness - a.fitness);
    const leader = sorted[0];
    if (!leader) {
      alert('No creature to save yet.');
      return;
    }
    saveCreatureAsProduct({
      name,
      notes,
      creature: leader,
      trainedGoal: config.goal,
      generation: currentGen,
      generationDurationSec: config.generationDuration,
    });
    setFinishedModels(loadFinishedModels());
    setTransferSourceName(null);
  };

  /**
   * Sequential transfer: clone a frozen shelf brain into a new population under
   * a chosen eligible goal. May switch arena zone when required. The source
   * product is never overwritten.
   */
  const handleContinueTrainingFromModel = (model: FinishedModel, targetGoal: EvolutionGoal) => {
    const named = { ...model.blueprint, name: model.blueprint.name || model.name };
    const destZone = resolveTrainingZone(named, targetGoal, activeZone);
    if (!destZone) {
      alert(
        eligibilityMessage(
          evaluateEligibility(named, { zoneId: activeZone, goal: targetGoal })
        )
      );
      return;
    }
    const eligibility = evaluateEligibility(named, { zoneId: destZone, goal: targetGoal });
    if (!eligibility.eligible) {
      alert(eligibilityMessage(eligibility));
      return;
    }

    if (destZone !== activeZone) {
      persistZone(destZone);
      setActiveZone(destZone);
    }

    if (!isBuiltinTemplate(named.name)) {
      upsertSavedCreature(named);
    }
    setTemplates(prev => {
      const exists = prev.some(t => t.name === named.name);
      return exists ? prev.map(t => (t.name === named.name ? named : t)) : [...prev, named];
    });
    protectSeededPopulationRef.current = true;
    setSelectedTemplate(named);
    setActiveChallengeId(null);

    const zoneDefaults = ARENA_ZONES[destZone].trainingDefaults ?? {};
    const nextArena = sanitizeArenaForZone(config.arena, destZone);

    // Fine-tune defaults: freeze topology so prior circuits survive; weights adapt.
    // Keep para stage reset only when entering / staying on Para Ramp.
    setConfig(prev => ({
      ...prev,
      goal: targetGoal,
      arena: nextArena,
      ...zoneDefaults,
      addNodeRate: 0,
      addConnectionRate: Math.min(
        zoneDefaults.addConnectionRate ?? prev.addConnectionRate,
        0.05
      ),
      ...(isParaRampGoal(targetGoal)
        ? { paraPilotStage: 'runUp' as ParaPilotStage, paraStageBestHistory: [] }
        : {}),
    }));

    const { inputs: needIn, outputs: needOut } = genomeIOForBlueprint(named);
    const seedGenome = genomeMatchesBlueprint(model.genome, named)
      ? model.genome
      : createBaseGenome(needIn, needOut);
    if (!genomeMatchesBlueprint(model.genome, named)) {
      alert(
        `Brain I/O no longer matches this body (${needIn}→${needOut}). Starting a fresh matching network instead.`
      );
    }

    const popSize = config.populationSize;
    const difficulty = nextArena.difficulty ?? 1;
    const newCreatures: Creature[] = [];
    const usePara = isParaRampGoal(targetGoal) && !!model.paraPilot;
    for (let i = 0; i < popSize; i++) {
      let g = cloneGenome(seedGenome);
      if (i > 0) g = mutateWeights(g, config.mutationRate);
      newCreatures.push(
        spawnCreature(
          {
            id: `c_1_xfer_${i}_${Math.random().toString(36).substring(2, 6)}`,
            generation: 1,
            blueprint: named,
            genome: g,
            paraPilot:
              usePara && model.paraPilot
                ? structuredClone(model.paraPilot)
                : undefined,
          },
          100,
          GROUND_Y - 50,
          targetGoal,
          difficulty
        )
      );
    }

    setCreatures(newCreatures);
    creaturesRef.current = newCreatures;
    setSelectedCreatureId(newCreatures[0].id);
    setGenerationHistory([]);
    setCurrentGen(1);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    simTimeRef.current = 0;
    applyPersistedBestEverBaseline(targetGoal);
    setBestEverDistance(0);
    setBestEverPeakSpeed(0);
    setBestEverPeakLandSpeed(0);
    setBestEverJumpHeight(0);
    resetWorld(targetGoal, nextArena);
    setTransferSourceName(model.name);
    setIsRunning(true);
    openSimulation();
  };

  /**
   * Fresh training from an untrained body: set goal/zone, spawn a new random
   * population (no shelf brain clone), then open Simulation.
   */
  const handleStartFreshTraining = (blueprint: CreatureBlueprint, targetGoal: EvolutionGoal) => {
    const named = { ...blueprint, name: blueprint.name || 'Custom' };
    const destZone = resolveTrainingZone(named, targetGoal, activeZone);
    if (!destZone) {
      alert(
        eligibilityMessage(
          evaluateEligibility(named, { zoneId: activeZone, goal: targetGoal })
        )
      );
      return;
    }
    const eligibility = evaluateEligibility(named, { zoneId: destZone, goal: targetGoal });
    if (!eligibility.eligible) {
      alert(eligibilityMessage(eligibility));
      return;
    }

    if (destZone !== activeZone) {
      persistZone(destZone);
      setActiveZone(destZone);
    }

    if (!isBuiltinTemplate(named.name)) {
      upsertSavedCreature(named);
    }
    setTemplates(prev => {
      const exists = prev.some(t => t.name === named.name);
      return exists ? prev.map(t => (t.name === named.name ? named : t)) : [...prev, named];
    });
    protectSeededPopulationRef.current = false;
    setSelectedTemplate(named);
    setActiveChallengeId(null);
    setTransferSourceName(null);

    const zoneDefaults = ARENA_ZONES[destZone].trainingDefaults ?? {};
    const nextArena = sanitizeArenaForZone(config.arena, destZone);
    setConfig(prev => ({
      ...prev,
      goal: targetGoal,
      arena: nextArena,
      ...zoneDefaults,
      ...(isParaRampGoal(targetGoal)
        ? { paraPilotStage: 'runUp' as ParaPilotStage, paraStageBestHistory: [] }
        : {}),
    }));

    setIsRunning(true);
    openSimulation();
  };

  /** Open Anatomy Studio with the chosen body without forcing Simulation. */
  const handleOpenInStudioFromPicker = (
    blueprint: CreatureBlueprint,
    appearance?: AppearanceRig
  ) => {
    const named = { ...blueprint, name: blueprint.name || 'Custom' };
    if (!isBuiltinTemplate(named.name)) {
      const existing = loadCreaturePackages().find(item => item.displayName === named.name);
      if (existing) {
        savePackageRevision(existing.id, {
          blueprint: named,
          displayName: named.name,
          appearance: appearance ?? existing.appearance,
        });
      } else {
        upsertSavedCreature(named);
        if (appearance) {
          const created = loadCreaturePackages().find(item => item.displayName === named.name);
          if (created) {
            savePackageRevision(created.id, {
              blueprint: named,
              displayName: named.name,
              appearance,
            });
          }
        }
      }
    }
    setTemplates(prev => {
      const exists = prev.some(t => t.name === named.name);
      return exists ? prev.map(t => (t.name === named.name ? named : t)) : [...prev, named];
    });
    protectSeededPopulationRef.current = false;
    setSelectedTemplate(named);
    setPackagesRefreshToken(t => t + 1);
    setIsFullscreen(false);
    setActiveTab('studio');
  };

  /**
   * Load body into Simulation. Auto-switches arena zone when the current
   * sandbox environment rejects the morphology. Shelf loads prefer the
   * product's trained goal and its compatible arena.
   */
  const handleLoadIntoSimulationFromPicker = (
    blueprint: CreatureBlueprint,
    options?: { preferredGoal?: EvolutionGoal }
  ) => {
    const named = { ...blueprint, name: blueprint.name || 'Custom' };
    const preferredGoal = options?.preferredGoal ?? config.goal;

    let destZone: ArenaZoneId | null = null;
    let destGoal = preferredGoal;

    if (options?.preferredGoal) {
      destZone = resolveTrainingZone(named, options.preferredGoal, activeZone);
      if (destZone) destGoal = options.preferredGoal;
    }

    if (!destZone) {
      destZone = resolveSimulationZone(named, activeZone);
      const zoneGoals = goalsForZone(destZone);
      destGoal = zoneGoals.includes(preferredGoal)
        ? preferredGoal
        : zoneGoals.includes(config.goal)
          ? config.goal
          : ARENA_ZONES[destZone].defaultGoal;
    }

    const zoneChanged = destZone !== activeZone;
    if (zoneChanged) {
      persistZone(destZone);
      setActiveZone(destZone);
    }

    const zoneDefaults = ARENA_ZONES[destZone].trainingDefaults ?? {};
    const nextArena = sanitizeArenaForZone(config.arena, destZone);
    setConfig(prev => ({
      ...prev,
      goal: destGoal,
      arena: nextArena,
      ...(zoneChanged ? zoneDefaults : {}),
      paraPilotStage: 'runUp' as ParaPilotStage,
      paraStageBestHistory: [],
    }));

    if (!isBuiltinTemplate(named.name)) {
      upsertSavedCreature(named);
    }
    setTemplates(prev => {
      const exists = prev.some(t => t.name === named.name);
      return exists ? prev.map(t => (t.name === named.name ? named : t)) : [...prev, named];
    });
    protectSeededPopulationRef.current = false;
    setSelectedTemplate(named);
    setActiveChallengeId(null);
    setTransferSourceName(null);
    openSimulation();
  };

  /**
   * After purging bodies from storage, refresh anatomy templates and re-seed
   * the live selection if the active body was removed.
   */
  const syncTemplatesAfterBodyPurge = (purgedNames: Set<string>) => {
    const rebuilt = loadAllTemplates();
    setTemplates(rebuilt);
    if (
      purgedNames.has(selectedTemplate.name) ||
      !rebuilt.some(t => t.name === selectedTemplate.name)
    ) {
      const zoneAllowed = filterTemplatesForZone(rebuilt, activeZone);
      const fallback =
        zoneAllowed.find(t => t.name === ARENA_ZONES[activeZone].defaultTemplateName) ||
        zoneAllowed[0] ||
        rebuilt[0];
      if (fallback) {
        protectSeededPopulationRef.current = false;
        setSelectedTemplate(fallback);
        initializePopulation(fallback, config.populationSize, true);
      }
    }
    setPackagesRefreshToken(t => t + 1);
  };

  /** Remove custom packages/templates for the given display names (never builtins). */
  const purgeNamedBodies = (names: string[]): Set<string> => {
    const purgedNames = new Set<string>();
    for (const name of names) {
      if (!name || isBuiltinTemplate(name)) continue;
      removeSavedCreature(name);
      purgedNames.add(name);
    }
    // Catch packages still present under those names (idempotent).
    for (const pkg of loadCreaturePackages()) {
      if (purgedNames.has(pkg.displayName)) {
        deletePackage(pkg.id);
      }
    }
    return purgedNames;
  };

  /**
   * Permanent shelf delete: remove the finished product from shelf / championship
   * and drop any matching custom anatomy menu entry. Best Ever ledger is kept.
   */
  const handlePermanentlyDeleteShelfModel = (id: string) => {
    const model =
      finishedModels.find(m => m.id === id) ?? loadFinishedModels().find(m => m.id === id);
    setFinishedModels(removeFinishedModel(id));
    if (!model) {
      setPackagesRefreshToken(t => t + 1);
      return;
    }
    const purged = purgeNamedBodies([model.name, model.blueprint.name]);
    syncTemplatesAfterBodyPurge(purged);
  };

  /** Permanent untrained delete: remove package + anatomy menu entry. */
  const handlePermanentlyDeleteUntrainedPackage = (id: string) => {
    const pkg = loadCreaturePackages().find(item => item.id === id);
    if (!pkg) {
      setPackagesRefreshToken(t => t + 1);
      return;
    }
    const purged = purgeNamedBodies([pkg.displayName, pkg.blueprint.name]);
    deletePackage(id);
    purged.add(pkg.displayName);
    syncTemplatesAfterBodyPurge(purged);
  };

  /** Batch permanent delete — one anatomy/template sync at the end. */
  const handlePermanentlyDeleteMany = (payload: {
    shelfIds: string[];
    packageIds: string[];
  }) => {
    const shelfIdSet = new Set(payload.shelfIds);
    const packageIdSet = new Set(payload.packageIds);
    const namesToPurge: string[] = [];

    const shelfSnapshot = loadFinishedModels();
    for (const model of shelfSnapshot) {
      if (!shelfIdSet.has(model.id)) continue;
      namesToPurge.push(model.name, model.blueprint.name);
    }
    let nextShelf = shelfSnapshot;
    for (const id of shelfIdSet) {
      nextShelf = removeFinishedModel(id);
    }
    setFinishedModels(nextShelf);

    const packageSnapshot = loadCreaturePackages();
    for (const pkg of packageSnapshot) {
      if (!packageIdSet.has(pkg.id)) continue;
      namesToPurge.push(pkg.displayName, pkg.blueprint.name);
      deletePackage(pkg.id);
    }

    const purged = purgeNamedBodies(namesToPurge);
    for (const name of namesToPurge) {
      if (name) purged.add(name);
    }
    syncTemplatesAfterBodyPurge(purged);
  };

  const handleDeleteFinishedModel = (id: string) => {
    handlePermanentlyDeleteShelfModel(id);
  };

  const handleRenameFinishedModel = (id: string, name: string, notes: string) => {
    setFinishedModels(renameFinishedModel(id, name, notes));
  };

  const handleRenameUntrainedPackage = (id: string, displayName: string) => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    const existing = loadCreaturePackages().find(item => item.id === id);
    if (!existing) return;
    const priorName = existing.displayName;
    const result = savePackageRevision(id, {
      displayName: trimmed,
      blueprint: { ...existing.blueprint, name: trimmed },
      notes: existing.notes,
    });
    if (!result.ok) {
      alert(result.error || 'Could not rename package.');
      return;
    }
    const named = result.value!;
    const bp = { ...named.blueprint, name: named.displayName };
    setTemplates(prev => {
      const withoutOld = prev.filter(t => t.name !== priorName && t.name !== bp.name);
      return [...withoutOld, bp];
    });
    if (selectedTemplate.name === priorName) {
      setSelectedTemplate(bp);
    }
    setPackagesRefreshToken(t => t + 1);
  };

  const handleExportFinishedProduct = (model: FinishedModel) => {
    const payload = exportProductPayload(model);
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `${model.name.replace(/\s+/g, '_')}_product.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleExportUntrainedPackage = (pkg: CreaturePackage) => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(exportCreaturePackage(pkg));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute(
      'download',
      `${pkg.displayName.replace(/\s+/g, '_')}_creature_package.json`
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleImportProductFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(String(e.target?.result || '{}')) as Record<string, unknown>;
        const product = importElitePayloadAsProduct(data, file.name.replace(/\.json$/i, ''));
        if (!product) {
          alert('Invalid model file. Need blueprint + genome.');
          return;
        }
        setFinishedModels(loadFinishedModels());
        alert(`Added "${product.name}" to Finished Models.`);
      } catch {
        alert('Failed to parse model JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Find the selected creature
  const selectedCreature = creatures.find(c => c.id === selectedCreatureId) || null;

  // --- MODEL EXPORT FUNCTIONALITY ---
  const handleExportBestModel = () => {
    const sorted = [...creatures].sort((a, b) => b.fitness - a.fitness);
    const topCreature = sorted[0];

    if (!topCreature) {
      alert('No creature models trained yet!');
      return;
    }

    const payload = {
      modelName: `${selectedTemplate.name} - Elite Model Gen ${currentGen}`,
      timestamp: new Date().toISOString(),
      generation: currentGen,
      fitness: topCreature.fitness,
      goal: config.goal,
      blueprint: topCreature.blueprint,
      genome: topCreature.genome,
      paraPilot: topCreature.paraPilot,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${selectedTemplate.name.replace(/\s+/g, '_')}_elite_gen${currentGen}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // --- MODEL IMPORT FUNCTIONALITY ---
  const handleImportModel = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.blueprint || !data.genome) {
          alert('Invalid model file. Must contain a valid physical blueprint and NEAT neural genome.');
          return;
        }

        if (!blueprintAllowedInZone(data.blueprint, activeZone)) {
          alert(rejectReasonForZone(data.blueprint, activeZone));
          return;
        }

        if (data.goal && !goalAllowedInZone(data.goal, activeZone)) {
          alert(
            `Imported goal is not available in ${ARENA_ZONES[activeZone].title}. Body will load with the zone default goal.`
          );
        }

        // Set the active creature anatomy and config goals matching the imported model
        setSelectedTemplate(data.blueprint);
        if (data.goal && goalAllowedInZone(data.goal, activeZone)) {
          handleUpdateConfig({ goal: data.goal });
        }

        // Reset the simulation but insert the imported creature as the elite "Seed"
        const { inputs: needIn, outputs: needOut } = genomeIOForBlueprint(data.blueprint);
        let seedGenome = data.genome;
        let mismatchNote = '';
        if (!genomeMatchesBlueprint(seedGenome, data.blueprint)) {
          seedGenome = createBaseGenome(needIn, needOut);
          mismatchNote =
            ' (brain size did not match this body — started a fresh matching network)';
        }
        const popSize = config.populationSize;
        const newCreatures: Creature[] = [];

        for (let i = 0; i < popSize; i++) {
          // Keep first one as pure clone, slightly mutate the others to create a diverse starting gene pool
          let finalGenome = cloneGenome(seedGenome);
          if (i > 0) {
            finalGenome = mutateWeights(finalGenome, config.mutationRate);
          }

          const creature = spawnCreature(
            {
              id: `c_1_imported_${i}_${Math.random().toString(36).substring(2, 6)}`,
              generation: 1,
              blueprint: data.blueprint,
              genome: finalGenome,
            },
            100,
            GROUND_Y - 50,
            data.goal || config.goal,
            config.arena.difficulty ?? 1
          );
          newCreatures.push(creature);
        }

        setCreatures(newCreatures);
        creaturesRef.current = newCreatures;
        setSelectedCreatureId(newCreatures[0].id);
        
        // Reset metrics starting from Gen 1; promote permanent Best Ever if beaten.
        setGenerationHistory([]);
        setCurrentGen(1);
        const importedBest = data.fitness || 0;
        const importedDur =
          typeof data.generationDurationSec === 'number'
            ? data.generationDurationSec
            : typeof data.generationDuration === 'number'
              ? data.generationDuration
              : config.generationDuration;
        const importGoal = (data.goal as EvolutionGoal) || config.goal;
        const importName =
          (typeof data.modelName === 'string' && data.modelName) ||
          data.blueprint?.name ||
          'Imported';
        raiseBestEverIfBeaten(importGoal, importedBest, importedDur || config.generationDuration, String(importName));
        applyPersistedBestEverBaseline(importGoal);
        setBestEverDistance(0);
        setBestEverPeakSpeed(0);
        setBestEverPeakLandSpeed(0);
        setBestEverJumpHeight(0);
        setElapsedSeconds(0);
        elapsedSecondsRef.current = 0;
        simTimeRef.current = 0;

        alert(
          `Successfully imported Trained Seed: "${data.modelName}" (Best Fitness: ${data.fitness?.toFixed(1) || 0})${mismatchNote}`
        );
      } catch (err) {
        alert('Failed to parse the imported JSON model file.');
      }
    };
    reader.readAsText(file);
  };

  // Focused creature for telemetry (selected, else leader)
  const activeLeader = creatures.reduce(
    (best, current) => (current.fitness > best.fitness ? current : best),
    creatures[0] || null
  );
  const telemetryCreature =
    creatures.find(c => c.id === selectedCreatureId) || activeLeader || null;
  const telemetryHeight = telemetryCreature
    ? Math.max(0, GROUND_Y - telemetryCreature.currentY)
    : 0;
  const telemetryJump = telemetryCreature
    ? Math.max(
        telemetryCreature.jumpHeightBestClearance ?? 0,
        telemetryCreature.aerialBoutIsHop
          ? 0
          : telemetryCreature.aerialBoutPeakLowestClearance ?? 0
      )
    : 0;
  const telemetryDistance = telemetryCreature
    ? telemetryCreature.currentX - telemetryCreature.startX
    : 0;
  const telemetrySpeed = telemetryCreature?.currentSpeed ?? 0;
  const telemetryPeakSpeed = telemetryCreature?.peakSpeed ?? 0;
  const telemetryUpright = telemetryCreature ? getUprightScore(telemetryCreature) : 0;
  const telemetryGrounded = telemetryCreature
    ? telemetryCreature.nodes.filter(n => n.isGround).length
    : 0;
  const telemetryAirborne = telemetryCreature
    ? telemetryCreature.nodes.length - telemetryGrounded
    : 0;

  const bestEverDisplay = formatBestEver(config.goal, bestEverFitness);
  const liveLeaderDisplay = formatLiveLeader(config.goal, activeLeader);

  const goalBestEver = useMemo(
    () =>
      resolveGoalBestEver(
        config.goal,
        {
          fitness: bestEverFitness,
          generationDurationSec: bestEverGenerationDuration || config.generationDuration,
        },
        finishedModels
      ),
    [config.goal, config.generationDuration, bestEverFitness, bestEverGenerationDuration, finishedModels]
  );

  const suggestedSaveName = transferSourceName
    ? suggestTransferProductName(transferSourceName, config.goal)
    : `${selectedTemplate.name} Gen ${currentGen}`;

  const MetricCard = ({
    icon,
    iconClass,
    label,
    value,
    valueClass = 'text-slate-800',
  }: {
    icon: React.ReactNode;
    iconClass: string;
    label: string;
    value: string;
    valueClass?: string;
  }) => (
    <div className="bg-white p-1.5 rounded-lg border border-slate-200/80 shadow-xs flex items-center gap-1.5 min-w-0">
      <span className={`p-1 rounded-md shrink-0 ${iconClass}`}>{icon}</span>
      <div className="flex flex-col min-w-0">
        <span className="text-[7px] font-bold text-slate-400 uppercase tracking-wider truncate leading-tight">
          {label}
        </span>
        <span className={`text-xs font-bold tabular-nums truncate leading-tight ${valueClass}`}>
          {value}
        </span>
      </div>
    </div>
  );

  const inspectorControlProps = {
    config,
    onUpdateConfig: handleUpdateConfig,
    selectedTemplate,
    onSelectTemplate: handleSelectTemplate,
    onRemoveTemplate: handleRemoveTemplate,
    isRunning,
    onToggleRun: () => setIsRunning(!isRunning),
    onManualBreed: handleManualBreed,
    onResetSimulation: handleResetSimulation,
    onExportBestModel: handleExportBestModel,
    onImportModel: handleImportModel,
    generation: currentGen,
    templates: zoneTemplates,
    zoneId: activeZone,
  };

  const sandboxMenuSections = {
    run: (
      <>
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-slate-800">
          <span>Run controls</span>
          <span className="rounded bg-slate-100 px-2 py-1 text-[10px] text-slate-600">
            Generation {currentGen}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className="rounded bg-indigo-600 px-2 py-2 text-[11px] font-bold text-white"
          >
            {isRunning ? 'Pause' : 'Start'}
          </button>
          <button
            type="button"
            onClick={handleManualBreed}
            className="rounded border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700"
          >
            Next Gen
          </button>
          <button
            type="button"
            onClick={handleResetSimulation}
            className="rounded border border-slate-200 px-2 py-2 text-[11px] font-bold text-slate-700"
          >
            Reset
          </button>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          {[0.5, 1, 2, 4, 10, 25].map(speed => (
            <button
              key={speed}
              type="button"
              aria-pressed={config.simulationSpeed === speed}
              onClick={() => handleUpdateConfig({ simulationSpeed: speed })}
              className={`rounded border px-1 py-1.5 text-[10px] font-bold ${
                config.simulationSpeed === speed
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
            <label htmlFor="run-generation-length">Generation Length</label>
            <span className="text-indigo-600">{config.generationDuration}s</span>
          </div>
          <input
            id="run-generation-length"
            aria-label="Generation Length"
            type="range"
            min={10}
            max={300}
            step={1}
            value={config.generationDuration}
            onChange={event =>
              handleUpdateConfig({ generationDuration: Number(event.target.value) })
            }
            className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-600"
          />
        </div>
      </section>
      <ArenaModifiersPanel
        config={config}
        onUpdateConfig={handleUpdateConfig}
        zoneId={activeZone}
        defaultOpen
      />
      <PerformanceDiagnosticsPanel />
      </>
    ),
    creature: (
      <ControlPanel {...inspectorControlProps} section="creature" />
    ),
    challenge: (
      <>
        <ControlPanel {...inspectorControlProps} section="challenge" />
        <DiscoveryPanel
          config={config}
          onUpdateConfig={handleUpdateConfig}
          creatures={creatures}
          selectedCreatureId={selectedCreatureId}
          currentGen={currentGen}
          bestEverFitness={bestEverFitness}
          challengeProgress={challengeProgress}
          activeChallengeId={activeChallengeId}
          onStartChallenge={handleStartChallenge}
          onLoadSnapshot={handleLoadSnapshot}
          onAddRandomMorph={handleAddRandomMorph}
          zoneId={activeZone}
        />
      </>
    ),
    build: (
      <>
        <section className="grid gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-[11px] leading-relaxed text-indigo-900">
            Open either editor, build visually, then return to Simulation for testing.
          </p>
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              setActiveTab('studio');
            }}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white"
          >
            Open Creature Studio
          </button>
          <button
            type="button"
            onClick={() => {
              setIsFullscreen(false);
              setActiveTab('environment');
            }}
            className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800"
          >
            Open Environment Studio
          </button>
        </section>
        <ModelsPanel
          models={finishedModels}
          canSaveLeader={creatures.length > 0}
          suggestedSaveName={suggestedSaveName}
          currentGoal={config.goal}
          activeZone={activeZone}
          onSaveLeader={handleSaveLeaderAsProduct}
          onDeleteModel={handleDeleteFinishedModel}
          onRenameModel={handleRenameFinishedModel}
          onImportProductFile={handleImportProductFile}
          onExportProduct={handleExportFinishedProduct}
          onContinueTraining={handleContinueTrainingFromModel}
        />
      </>
    ),
    analyse: (
      <div className="flex flex-col gap-2 min-w-0" id="analyse-panel-layout">
        <NetworkVisualizer creature={selectedCreature} />
        <div className="grid grid-cols-1 gap-2 min-w-0">
          <StatsPanel
            generationHistory={generationHistory}
            bestEverFitness={bestEverFitness}
            goal={config.goal}
          />
          <GaitFingerprints creature={selectedCreature} />
        </div>
      </div>
    ),
    settings: <ControlPanel {...inspectorControlProps} section="settings" />,
  };

  return (
    <div
      className={`bg-slate-50 text-slate-800 flex flex-col font-sans ${
        isFullscreen
          ? 'h-dvh max-h-dvh overflow-hidden fixed inset-0 z-50'
          : activeTab === 'simulation'
            ? 'min-h-screen'
            : 'h-dvh max-h-dvh overflow-hidden'
      }`}
      id="app-root"
    >
      
      {/* Premium Header — hidden in immersive fullscreen */}
      {!isFullscreen && (
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4 shadow-sm" id="main-header">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200 animate-pulse">
              <Brain className="w-5.5 h-5.5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 flex items-center gap-2">
                Biomechanics & Neuroevolution Sandbox
                <span className="text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">NEAT + Verlet</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Observe creature adaptation, motor coordination, and gait evolution in real-time</p>
            </div>
          </div>

          {/* Quick status counters */}
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
            <a
              href={ARENA_CHAMPIONSHIP_HREF}
              className="flex items-center gap-2 bg-slate-900 text-amber-300 border border-slate-700 px-3 py-1.5 rounded-lg shadow-sm hover:bg-slate-800 no-underline"
              title="Open Arena Championship"
            >
              <Swords className="w-3.5 h-3.5" />
              Arena Championship
              <ExternalLink className="w-3 h-3 opacity-70" />
            </a>
            {/* Gen */}
            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200/60 px-3 py-1.5 rounded-lg shadow-sm">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500">Generation</span>
              <span className="text-slate-800 font-bold">{currentGen}</span>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-2 bg-slate-100 border border-slate-200/60 px-3 py-1.5 rounded-lg shadow-sm">
              <Timer className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500">Timer</span>
              <span className="text-slate-800 font-bold">
                {elapsedSeconds.toFixed(1)}s / {config.generationDuration}s
              </span>
            </div>

            {config.goal === EvolutionGoal.PARA_RAMP_GLIDE && (
              <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg shadow-sm">
                <Brain className="w-3.5 h-3.5 text-indigo-600" />
                <span className="text-indigo-800 font-bold">
                  {paraStageLabel(config.paraPilotStage ?? 'runUp')}
                </span>
              </div>
            )}

            {/* Live leader — primary metric for the active goal */}
            <div
              className="flex items-center gap-2 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg shadow-sm"
              title={`${liveLeaderDisplay.label} (live)`}
            >
              <Trophy className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-orange-700">{liveLeaderDisplay.label}</span>
              <span className="text-orange-900 font-bold tabular-nums">{liveLeaderDisplay.value}</span>
            </div>

            {/* Top Score — label/units follow active goal */}
            <div
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg shadow-sm"
              title={
                goalBestEver?.durationLabel
                  ? `All-time best for ${config.goal} (${goalBestEver.durationLabel})`
                  : `All-time best for ${config.goal}`
              }
            >
              <Award className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700">{bestEverDisplay.label}</span>
              <span className="text-emerald-800 font-bold tabular-nums">{bestEverDisplay.value}</span>
              {goalBestEver?.durationLabel ? (
                <span className="text-emerald-700/80 font-semibold tabular-nums text-[11px]">
                  · {goalBestEver.durationLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      )}

      {/* Main Sandbox Layout — visualizer-first */}
      <main
        className={`flex-1 w-full mx-auto flex flex-col min-h-0 ${
          isFullscreen || activeTab !== 'simulation'
            ? 'max-w-none p-2 gap-1.5 overflow-hidden'
            : 'max-w-[1800px] p-3 md:p-4 gap-3'
        }`}
        id="main-sandbox-view"
      >
        
        {/* Navigation Tabs + fullscreen toggle */}
        <div
          className={`flex items-end justify-between gap-2 shrink-0 ${
            isFullscreen ? '' : 'border-b border-slate-200 bg-white px-4 pt-2 rounded-xl shadow-xs'
          }`}
          id="sandbox-tabs"
        >
          <div className={`flex ${isFullscreen ? 'bg-white rounded-lg border border-slate-200 px-2 pt-1' : ''}`}>
            <button
              onClick={() => {
                setIsFullscreen(false);
                setPackagesRefreshToken(t => t + 1);
                setActiveTab('models');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'models'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Boxes className="w-4 h-4" />
              {isFullscreen ? 'Models' : 'Model Management'}
            </button>
            <button
              onClick={openSimulation}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'simulation'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Activity className="w-4 h-4" />
              {isFullscreen ? 'Sim' : 'Simulation Sandbox'}
            </button>
            <button
              onClick={() => {
                setIsFullscreen(false);
                setActiveTab('studio');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'studio'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Wrench className="w-4 h-4" />
              {isFullscreen ? 'Studio' : 'Creature Anatomy Studio'}
            </button>
            <button
              onClick={() => {
                setIsFullscreen(false);
                setActiveTab('environment');
              }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border-b-2 transition-all cursor-pointer ${
                activeTab === 'environment'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <Ruler className="w-4 h-4" />
              Environment Studio
            </button>
          </div>

          {activeTab === 'simulation' && (
            <button
              type="button"
              onClick={() => setIsFullscreen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 mb-1 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-700 hover:bg-slate-50 shadow-sm cursor-pointer shrink-0"
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen — fit arena, stats, and menu with no scrolling'}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" /> Exit fullscreen
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
                </>
              )}
            </button>
          )}
        </div>

        {activeTab !== 'models' && (
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex-1 min-w-0">
            <ZoneTabs
              activeZone={activeZone}
              onSelectZone={handleSelectZone}
              compact={isFullscreen}
            />
          </div>
          {isFullscreen && (
            <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold text-slate-600 shrink-0">
              <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded-md">
                Gen {currentGen}
              </span>
              <span className="bg-slate-100 border border-slate-200 px-2 py-1 rounded-md tabular-nums">
                {elapsedSeconds.toFixed(1)}s
              </span>
              <span
                className="bg-orange-50 border border-orange-200 text-orange-900 px-2 py-1 rounded-md tabular-nums"
                title={`${liveLeaderDisplay.label} (live)`}
              >
                {liveLeaderDisplay.value}
              </span>
              <span
                className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-2 py-1 rounded-md tabular-nums"
                title={bestEverDisplay.label}
              >
                {bestEverDisplay.value}
              </span>
            </div>
          )}
        </div>
        )}

        {activeTab === 'models' ? (
          <ModelPickerPanel
            finishedModels={finishedModels}
            currentGoal={config.goal}
            activeZone={activeZone}
            packagesRefreshToken={packagesRefreshToken}
            onContinueTraining={handleContinueTrainingFromModel}
            onStartFreshTraining={handleStartFreshTraining}
            onOpenInStudio={handleOpenInStudioFromPicker}
            onLoadIntoSimulation={handleLoadIntoSimulationFromPicker}
            onRenameShelfModel={handleRenameFinishedModel}
            onRenameUntrainedPackage={handleRenameUntrainedPackage}
            onExportShelfModel={handleExportFinishedProduct}
            onExportUntrainedPackage={handleExportUntrainedPackage}
            onPermanentlyDeleteShelfModel={handlePermanentlyDeleteShelfModel}
            onPermanentlyDeleteUntrainedPackage={handlePermanentlyDeleteUntrainedPackage}
            onPermanentlyDeleteMany={handlePermanentlyDeleteMany}
          />
        ) : activeTab === 'simulation' ? (
          <div
            className={`flex gap-2 min-h-0 ${
              isFullscreen ? 'flex-1 overflow-hidden' : 'items-stretch'
            }`}
            id="core-interactive-layout"
          >
            <div
              className={`flex flex-col gap-1.5 min-w-0 flex-1 ${
                isFullscreen ? 'min-h-0 overflow-hidden' : ''
              }`}
            >
              <CapabilityPanel blueprint={selectedTemplate} />
              <Visualizer
                creatures={creatures}
                selectedCreatureId={selectedCreatureId}
                onSelectCreature={(id) => setSelectedCreatureId(id)}
                obstacles={obstacles}
                worldObjects={worldObjects}
                goal={config.goal}
                isRunning={isRunning}
                bestEverDistance={bestEverDistance}
                goalBestEver={goalBestEver}
                appearance={selectedAppearance}
                environmentTheme={environmentTheme}
                fillHeight={isFullscreen}
                className={isFullscreen ? 'min-h-0 flex-1' : ''}
                simulationSpeed={config.simulationSpeed}
                onToggleRun={() => setIsRunning(!isRunning)}
                onManualBreed={handleManualBreed}
                onResetSimulation={handleResetSimulation}
                onSetSimulationSpeed={speed => handleUpdateConfig({ simulationSpeed: speed })}
              />

              {/* Live telemetry — retained cards at ~70% size */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1 shrink-0" id="stats-ticker-grid">
              <MetricCard
                icon={<Activity className="w-3 h-3" />}
                iconClass="bg-indigo-50 text-indigo-600"
                label="Current Leader"
                value={
                  activeLeader
                    ? activeLeader.displayName ||
                      `#${activeLeader.id.substring(0, 6)}`
                    : 'N/A'
                }
              />
              <MetricCard
                icon={<TrendingUp className="w-3 h-3" />}
                iconClass="bg-orange-50 text-orange-600"
                label={liveLeaderDisplay.label}
                value={liveLeaderDisplay.value}
                valueClass="text-orange-700"
              />
              <MetricCard
                icon={<Zap className="w-3 h-3" />}
                iconClass="bg-purple-50 text-purple-600"
                label="Mutations"
                value={`${(config.mutationRate * 100).toFixed(0)}% rate`}
                valueClass="text-purple-600"
              />
              <MetricCard
                icon={<Sparkles className="w-3 h-3" />}
                iconClass="bg-blue-50 text-blue-600"
                label="Population"
                value={`${creatures.length} simulated`}
                valueClass="text-blue-600"
              />
              <MetricCard
                icon={<Gauge className="w-3 h-3" />}
                iconClass="bg-sky-50 text-sky-600"
                label="Horiz. Speed"
                value={`${telemetrySpeed.toFixed(2)} px/f`}
                valueClass="text-sky-700"
              />
              <MetricCard
                icon={<Gauge className="w-3 h-3" />}
                iconClass="bg-cyan-50 text-cyan-600"
                label="Peak Speed"
                value={`${telemetryPeakSpeed.toFixed(2)} px/f`}
                valueClass="text-cyan-700"
              />
              <MetricCard
                icon={<ArrowUpToLine className="w-3 h-3" />}
                iconClass="bg-amber-50 text-amber-600"
                label="COM Height"
                value={`${telemetryHeight.toFixed(1)} px`}
                valueClass="text-amber-700"
              />
              <MetricCard
                icon={<ArrowUpToLine className="w-3 h-3" />}
                iconClass="bg-orange-50 text-orange-600"
                label="Jump Clearance"
                value={`${telemetryJump.toFixed(1)} px`}
                valueClass="text-orange-700"
              />
              <MetricCard
                icon={<MoveHorizontal className="w-3 h-3" />}
                iconClass="bg-teal-50 text-teal-600"
                label="Net Distance"
                value={`${telemetryDistance >= 0 ? '+' : ''}${telemetryDistance.toFixed(1)} px`}
                valueClass="text-teal-700"
              />
              <MetricCard
                icon={<Ruler className="w-3 h-3" />}
                iconClass="bg-fuchsia-50 text-fuchsia-600"
                label="Upright Score"
                value={telemetryUpright.toFixed(1)}
                valueClass="text-fuchsia-700"
              />
              <MetricCard
                icon={<Footprints className="w-3 h-3" />}
                iconClass="bg-lime-50 text-lime-700"
                label="Ground Contacts"
                value={`${telemetryGrounded} / ${telemetryCreature?.nodes.length ?? 0}`}
                valueClass="text-lime-800"
              />
              <MetricCard
                icon={<Anchor className="w-3 h-3" />}
                iconClass="bg-rose-50 text-rose-600"
                label="Airborne Nodes"
                value={`${telemetryAirborne}`}
                valueClass="text-rose-700"
              />
            </div>
            </div>

            <SandboxMenu
              placement="side"
              fillHeight={isFullscreen}
              defaultOpen
              sections={sandboxMenuSections}
              summary={`${ARENA_ZONES[activeZone].shortLabel} · ${selectedTemplate.name} · ${getGoalInfo(config.goal).shortLabel}`}
              className={isFullscreen ? 'self-stretch' : 'self-start sticky top-3 max-h-[calc(100vh-5rem)]'}
            />
          </div>
        ) : activeTab === 'studio' ? (
          <Studio
            onLoadCustomTemplate={handleLoadCustomTemplate}
            onSaveCreature={handleSaveCreature}
            activeTemplate={selectedTemplate}
            activeAppearance={selectedAppearance}
            libraryTemplates={templates}
            zoneId={activeZone}
          />
        ) : (
          <EnvironmentStudio
            onTest={(environment: EnvironmentPackage) => {
              const nextGoal = environment.goal ?? config.goal;
              setEnvironmentTheme(environment.theme);
              if (environment.goal) {
                setConfig(current => ({ ...current, goal: environment.goal! }));
              }
              const copied = structuredClone(environment.obstacles);
              setObstacles(copied);
              obstaclesRef.current = copied;
              const objects = environment.worldObjects.length
                ? structuredClone(environment.worldObjects)
                : createWorldObjects(nextGoal, config.arena.difficulty);
              setWorldObjects(objects);
              worldObjectsRef.current = objects;
              initializePopulation(selectedTemplate, config.populationSize, true);
              openSimulation();
            }}
          />
        )}

      </main>

      {/* Modern footer */}
      {!isFullscreen && activeTab === 'simulation' && (
      <footer className="border-t border-slate-200 bg-white/70 backdrop-blur-sm mt-auto py-5 text-center text-xs text-slate-400 font-medium" id="main-footer">
        <div className="max-w-7xl mx-auto px-6">
          Inspired by Keiwan's Evolution. Designed using custom 2D point-spring physics constraints, Verlet Integration, and NEAT neuroevolution algorithms.
        </div>
      </footer>
      )}
    </div>
  );
}
