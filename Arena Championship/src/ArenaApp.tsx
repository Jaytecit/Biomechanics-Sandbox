/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Arena Championship — showmanship layer over frozen sandbox finished models.
 * No evolution, no breeding. Pure heats, podiums, and leaderboards.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, ChangeEvent } from 'react';
import {
  Creature,
  DEFAULT_CUSTOM_GOAL,
  EvolutionGoal,
  SimulationConfig,
  WorldObject,
  createParaPilot,
  genomeIOForBlueprint,
  genomeMatchesBlueprint,
} from '../../src/types';
import {
  createWorldObjects,
  extendEndlessStairs,
  extendEndlessTerrain,
  generateObstacles,
  GROUND_Y,
  hasTerrain,
  spawnCreature,
  stepPrivateWorld,
  updateCreaturePhysics,
  updateWorldState,
} from '../../src/physics';
import { createBaseGenome, cloneGenome } from '../../src/neat';
import { isParaRampGoal } from '../../src/paraPilot';
import {
  FinishedModel,
  importElitePayloadAsProduct,
  loadFinishedModels,
  MAX_COMPETITORS,
  resolveModelAppearance,
  traitLabel,
} from '../../src/savedModels';
import { Visualizer } from '../../src/components/Visualizer';
import { SecretGoalRevealOverlay } from '../../src/components/SecretGoalRevealOverlay';
import {
  SecretTrophiesPanel,
  secretTrophiesTabLabel,
} from '../../src/components/SecretTrophiesPanel';
import { evaluateSecretGoals } from '../../src/secretGoalEval';
import { recordDiscovery, SecretGoalDiscovery } from '../../src/secretGoalProgress';
import { SecretGoalId } from '../../src/secretGoals';
import { AppearanceRig } from '../../src/creaturePackages';
import { getGoalInfo } from '../../src/goalCatalog';
import {
  buildEventArena,
  CHAMPIONSHIP_EVENTS,
  ChampionshipEvent,
  eventById,
} from './events';
import {
  clearLeaderboard,
  LeaderboardEntry,
  loadLeaderboard,
  recordHeatResults,
} from './leaderboard';
import {
  Trophy,
  Swords,
  Play,
  Pause,
  RotateCcw,
  Medal,
  Upload,
  ExternalLink,
  Crown,
  Flame,
  Users,
  Timer,
  Sparkles,
} from 'lucide-react';

type Phase = 'lobby' | 'racing' | 'podium';
type SideTab = 'events' | 'roster' | 'leaderboard' | 'secrets';

const SANDBOX_HREF = '../';

function buildConfig(event: ChampionshipEvent, freestyleGoal?: EvolutionGoal): SimulationConfig {
  const goal = event.id === 'freestyle_open' && freestyleGoal ? freestyleGoal : event.goal;
  return {
    populationSize: event.maxEntrants,
    generationDuration: event.matchSeconds,
    simulationSpeed: 1,
    mutationRate: 0,
    addNodeRate: 0,
    addConnectionRate: 0,
    goal,
    gravity: 0.4,
    groundFriction: 0.8,
    arena: buildEventArena(event),
    customGoal: { ...DEFAULT_CUSTOM_GOAL, rules: DEFAULT_CUSTOM_GOAL.rules.map(r => ({ ...r })) },
    paraPilotStage: 'eval',
    paraStageBestHistory: [],
  };
}

export function ArenaApp() {
  const [models, setModels] = useState<FinishedModel[]>(() => loadFinishedModels());
  const [eventId, setEventId] = useState(CHAMPIONSHIP_EVENTS[0].id);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('lobby');
  const [isRunning, setIsRunning] = useState(false);
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const [selectedCreatureId, setSelectedCreatureId] = useState<string | null>(null);
  const [obstacles, setObstacles] = useState(() =>
    generateObstacles(CHAMPIONSHIP_EVENTS[0].goal, buildEventArena(CHAMPIONSHIP_EVENTS[0]))
  );
  const [worldObjects, setWorldObjects] = useState<WorldObject[]>(() =>
    createWorldObjects(CHAMPIONSHIP_EVENTS[0].goal)
  );
  const [elapsed, setElapsed] = useState(0);
  const [heatNumber, setHeatNumber] = useState(1);
  const [announcer, setAnnouncer] = useState('Welcome to the Arena Championship.');
  const [podium, setPodium] = useState<{ name: string; score: number; modelId: string }[]>([]);
  const [board, setBoard] = useState<LeaderboardEntry[]>(() => loadLeaderboard());
  const [speed, setSpeed] = useState(1);
  const [freestyleGoal, setFreestyleGoal] = useState(EvolutionGoal.LOCOMOTION_RIGHT);
  const [newRecordFlash, setNewRecordFlash] = useState(false);
  const [appearanceByCreatureId, setAppearanceByCreatureId] = useState<
    Record<string, AppearanceRig>
  >({});
  const [sideTab, setSideTab] = useState<SideTab>('events');
  const [secretRevealQueue, setSecretRevealQueue] = useState<SecretGoalDiscovery[]>([]);
  const [secretRefreshKey, setSecretRefreshKey] = useState(0);

  const event = eventById(eventId) ?? CHAMPIONSHIP_EVENTS[0];
  const config = useMemo(
    () => ({ ...buildConfig(event, freestyleGoal), simulationSpeed: speed }),
    [event, freestyleGoal, speed]
  );

  const creaturesRef = useRef<Creature[]>([]);
  const elapsedRef = useRef(0);
  const simTimeRef = useRef(0);
  const obstaclesRef = useRef(obstacles);
  const worldObjectsRef = useRef(worldObjects);
  const configRef = useRef(config);
  const selectedIdRef = useRef<string | null>(null);
  const phaseRef = useRef<Phase>('lobby');
  const finishHeatRef = useRef<(() => void) | null>(null);

  configRef.current = config;
  obstaclesRef.current = obstacles;
  worldObjectsRef.current = worldObjects;
  selectedIdRef.current = selectedCreatureId;
  phaseRef.current = phase;

  const refreshModels = () => setModels(loadFinishedModels());

  useEffect(() => {
    const onFocus = () => refreshModels();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const spawnHeat = useCallback(
    (ids: string[], evt: ChampionshipEvent, goal: EvolutionGoal) => {
      const roster = ids
        .map(id => loadFinishedModels().find(m => m.id === id))
        .filter((m): m is FinishedModel => !!m)
        .slice(0, Math.min(evt.maxEntrants, MAX_COMPETITORS));
      if (roster.length < evt.minEntrants) return false;

      const arena = buildEventArena(evt);
      const difficulty = arena.difficulty ?? 1;
      const usePara = isParaRampGoal(goal);
      const next: Creature[] = [];
      const nextAppearances: Record<string, AppearanceRig> = {};

      for (const model of roster) {
        let genome = structuredClone(model.genome);
        if (!genomeMatchesBlueprint(genome, model.blueprint)) {
          const io = genomeIOForBlueprint(model.blueprint);
          genome = createBaseGenome(io.inputs, io.outputs);
        }
        const paraPilot =
          usePara && model.paraPilot
            ? structuredClone(model.paraPilot)
            : usePara
              ? createParaPilot(genome, cloneGenome)
              : model.paraPilot
                ? structuredClone(model.paraPilot)
                : undefined;

        const creatureId = `heat_${model.id}_${Math.random().toString(36).slice(2, 6)}`;
        const modelAppearance = resolveModelAppearance(model.blueprint, {
          name: model.name,
          stored: model.appearance,
        });
        if (modelAppearance) {
          nextAppearances[creatureId] = modelAppearance;
        }

        next.push(
          spawnCreature(
            {
              id: creatureId,
              generation: model.generation,
              blueprint: structuredClone(model.blueprint),
              genome,
              paraPilot,
              displayName: model.name,
              productId: model.id,
            },
            100,
            GROUND_Y - 50,
            goal,
            difficulty
          )
        );
      }

      const obs = generateObstacles(goal, arena);
      const objs = createWorldObjects(goal, difficulty);
      setObstacles(obs);
      setWorldObjects(objs);
      obstaclesRef.current = obs;
      worldObjectsRef.current = objs;
      setCreatures(next);
      creaturesRef.current = next;
      setAppearanceByCreatureId(nextAppearances);
      setSelectedCreatureId(next[0]?.id ?? null);
      elapsedRef.current = 0;
      simTimeRef.current = 0;
      setElapsed(0);
      return true;
    },
    []
  );

  const finishHeat = useCallback(() => {
    setIsRunning(false);
    const sorted = [...creaturesRef.current].sort((a, b) => b.fitness - a.fitness);
    const standings = sorted.map(c => ({
      name: c.displayName || c.blueprint.name,
      score: c.fitness,
      modelId: c.productId || c.id,
    }));
    setPodium(standings);
    setPhase('podium');
    phaseRef.current = 'podium';

    const champ = standings[0];
    const champCreature = sorted[0];
    if (champ) {
      setAnnouncer(`Heat complete — ${champ.name} takes the crown with ${champ.score.toFixed(1)}!`);
    }

    if (champCreature) {
      const cfg = configRef.current;
      const minFit = sorted[sorted.length - 1]?.fitness ?? 0;
      const newIds = evaluateSecretGoals({
        creature: champCreature,
        activeGoal: cfg.goal,
        arena: cfg.arena,
        modelName: champCreature.displayName || champCreature.blueprint.name,
        context: 'arena',
        isLowestFitnessInHeat: champCreature.fitness <= minFit,
      });
      const fresh: SecretGoalDiscovery[] = [];
      for (const id of newIds) {
        const entry: SecretGoalDiscovery = {
          secretGoalId: id as SecretGoalId,
          discoveredAt: new Date().toISOString(),
          modelName: champCreature.displayName || champCreature.blueprint.name,
          activeGoal: cfg.goal,
          context: 'arena',
        };
        if (recordDiscovery(entry)) fresh.push(entry);
      }
      if (fresh.length > 0) {
        setSecretRevealQueue(q => [...q, ...fresh]);
        setSecretRefreshKey(k => k + 1);
      }
    }

    const evt = eventById(eventId) ?? CHAMPIONSHIP_EVENTS[0];
    const modelLookup = new Map(loadFinishedModels().map(m => [m.id, m]));
    const rows = standings.map(s => {
      const model = modelLookup.get(s.modelId);
      return {
        eventId: evt.id,
        eventTitle: evt.title,
        modelId: s.modelId,
        modelName: s.name,
        score: s.score,
        traits: model?.traits.bodyTraits.map(traitLabel) ?? [],
        notes: model?.notes,
      };
    });

    const prevBest = loadLeaderboard(evt.id)[0]?.score ?? -Infinity;
    const updated = recordHeatResults(rows);
    setBoard(updated);
    if (champ && champ.score > prevBest) {
      setNewRecordFlash(true);
      setAnnouncer(`NEW ARENA RECORD — ${champ.name} · ${champ.score.toFixed(1)} on ${evt.title}!`);
      window.setTimeout(() => setNewRecordFlash(false), 4200);
    }
  }, [eventId]);

  finishHeatRef.current = finishHeat;

  // Physics loop — only while racing
  useEffect(() => {
    if (!isRunning || phase !== 'racing') return;

    let animId = 0;
    let speedAccum = 0;

    const tick = () => {
      const cfg = configRef.current;
      speedAccum += cfg.simulationSpeed;
      const steps = Math.floor(speedAccum);
      speedAccum -= steps;
      const stepDuration = 1 / 60;
      const pop = creaturesRef.current;
      const obs = obstaclesRef.current;

      for (let s = 0; s < steps; s++) {
        simTimeRef.current += 1;
        if (cfg.goal === EvolutionGoal.STAIR_CLIMB) {
          const furthestX = Math.max(...pop.map(c => c.currentX), 100);
          extendEndlessStairs(obs, furthestX, cfg.arena.difficulty ?? 1);
        }
        if (cfg.goal === EvolutionGoal.MOTOR_LOOP || cfg.arena.terrainEnabled || hasTerrain(obs)) {
          const packLeftX = Math.min(
            ...pop.map(c => {
              const hoop = c.privateWorld?.find(o => o.type === 'hoop');
              return hoop ? hoop.x : c.currentX;
            }),
            100
          );
          const packRightX = Math.max(
            ...pop.map(c => {
              const hoop = c.privateWorld?.find(o => o.type === 'hoop');
              return hoop ? hoop.x : c.currentX;
            }),
            100
          );
          extendEndlessTerrain(
            obs,
            { leftX: packLeftX, rightX: packRightX },
            cfg.arena.terrainSeed ?? 42,
            cfg.arena.difficulty ?? 1,
            !!cfg.arena.terrainObstaclesEnabled
          );
        }
        updateWorldState([], obs, simTimeRef.current, cfg);
        for (const creature of pop) {
          const privateObjs = creature.privateWorld ?? [];
          stepPrivateWorld(privateObjs, obs, cfg, simTimeRef.current);
          updateCreaturePhysics(creature, obs, simTimeRef.current, cfg, privateObjs);
        }
        elapsedRef.current += stepDuration;
      }

      setCreatures([...pop]);
      creaturesRef.current = pop;
      const focusId = selectedIdRef.current;
      const focused =
        pop.find(c => c.id === focusId) ||
        pop.reduce((best, c) => (c.fitness > best.fitness ? c : best), pop[0]);
      setWorldObjects((focused?.privateWorld ?? []).map(o => ({ ...o })));
      setObstacles(obs.map(o => ({ ...o })));
      setElapsed(elapsedRef.current);

      const leader = pop.reduce((b, c) => (c.fitness > b.fitness ? c : b), pop[0]);
      if (leader && Math.floor(elapsedRef.current * 2) % 7 === 0) {
        setAnnouncer(
          `Heat ${heatNumber} — ${leader.displayName || 'Leader'} leads at ${leader.fitness.toFixed(1)} pts`
        );
      }

      if (elapsedRef.current >= cfg.generationDuration) {
        finishHeatRef.current?.();
      } else {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isRunning, phase, heatNumber]);

  const handleStartHeat = () => {
    const goal = event.id === 'freestyle_open' ? freestyleGoal : event.goal;
    if (selectedIds.length < event.minEntrants) {
      setAnnouncer(`Need at least ${event.minEntrants} finished models for ${event.title}.`);
      return;
    }
    if (!spawnHeat(selectedIds, event, goal)) {
      setAnnouncer('Could not load roster — refresh models from the Sandbox shelf.');
      return;
    }
    setHeatNumber(n => (phase === 'lobby' ? n : n + 1));
    setPhase('racing');
    setIsRunning(true);
    setPodium([]);
    setAnnouncer(`Heat underway — ${event.title}!`);
  };

  const handleRematch = () => {
    const goal = event.id === 'freestyle_open' ? freestyleGoal : event.goal;
    if (!spawnHeat(selectedIds, event, goal)) return;
    setHeatNumber(n => n + 1);
    setPhase('racing');
    setIsRunning(true);
    setPodium([]);
    setAnnouncer(`Rematch — Heat ${heatNumber + 1} on ${event.title}!`);
  };

  const handleBackToLobby = () => {
    setIsRunning(false);
    setPhase('lobby');
    setAnnouncer('Back in the lobby. Pick an event and your champions.');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= event.maxEntrants) return prev;
      return [...prev, id];
    });
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(String(ev.target?.result || '{}')) as Record<string, unknown>;
        const product = importElitePayloadAsProduct(data, file.name.replace(/\.json$/i, ''));
        if (!product) {
          setAnnouncer('Import failed — need a finished model JSON (blueprint + genome).');
          return;
        }
        refreshModels();
        setAnnouncer(`"${product.name}" checked into the championship roster.`);
      } catch {
        setAnnouncer('Import failed — invalid JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const liveStandings = useMemo(
    () =>
      [...creatures]
        .sort((a, b) => b.fitness - a.fitness)
        .map(c => ({
          id: c.id,
          name: c.displayName || c.blueprint.name,
          score: c.fitness,
        })),
    [creatures]
  );

  const eventBoard = useMemo(() => loadLeaderboard(eventId), [eventId, board]);
  const leader = liveStandings[0];
  const remaining = Math.max(0, config.generationDuration - elapsed);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Broadcast header */}
      <header className="relative overflow-hidden border-b border-[var(--arena-line)]">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse 50% 80% at 20% 50%, ${event.accent}33, transparent 60%)`,
          }}
        />
        <div className="relative max-w-[1600px] mx-auto px-5 py-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--arena-gold)] mb-1">
              Intergalactic Olympic Games · Finished models only
            </p>
            <h1 className="font-display text-5xl md:text-6xl text-[var(--arena-spot)] leading-none">
              Arena Championship
            </h1>
            <p className="mt-2 text-sm text-[var(--arena-crowd)] max-w-xl">
              Bring creations from the Sandbox — body parts, skins, and all. Compete on rough
              alien rock under twin moons. No breeding here — only heats, podiums, and glory.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={SANDBOX_HREF}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--arena-line)] bg-[var(--arena-panel)]/80 text-sm font-semibold text-[var(--arena-spot)] hover:border-[var(--arena-gold)] transition-colors"
            >
              <ExternalLink className="w-4 h-4 text-[var(--arena-gold)]" />
              Open Sandbox
            </a>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--arena-line)] bg-[var(--arena-panel)]/80 text-sm font-semibold cursor-pointer hover:border-[var(--arena-mint)] transition-colors">
              <Upload className="w-4 h-4 text-[var(--arena-mint)]" />
              Import model
              <input type="file" accept=".json" className="hidden" onChange={handleImport} />
            </label>
            <button
              type="button"
              onClick={refreshModels}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--arena-line)] bg-[var(--arena-panel)]/80 text-sm font-semibold cursor-pointer hover:border-[var(--arena-mint)]"
            >
              <Users className="w-4 h-4" />
              Refresh roster ({models.length})
            </button>
          </div>
        </div>

        {/* Crowd ticker */}
        <div className="border-t border-[var(--arena-line)]/60 bg-black/25 overflow-hidden py-1.5">
          <div className="crowd-ticker flex whitespace-nowrap text-[11px] font-semibold tracking-wide text-[var(--arena-crowd)] gap-10 w-max">
            {[0, 1].map(copy => (
              <span key={copy} className="flex gap-10 px-5">
                <span>LIVE · {event.title}</span>
                <span>{announcer}</span>
                <span>
                  {leader
                    ? `LEADER ${leader.name} · ${leader.score.toFixed(1)}`
                    : 'AWAITING HEAT'}
                </span>
                <span>
                  {eventBoard[0]
                    ? `RECORD ${eventBoard[0].modelName} · ${eventBoard[0].score.toFixed(1)}`
                    : 'NO RECORD YET'}
                </span>
              </span>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        {/* Stage */}
        <section className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--arena-line)] bg-[var(--arena-panel)]/70 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <Flame className="w-4 h-4 shrink-0" style={{ color: event.accent }} />
              <div className="min-w-0">
                <div className="font-display text-2xl text-[var(--arena-spot)] leading-none truncate">
                  {event.title}
                </div>
                <div className="text-[11px] text-[var(--arena-crowd)] truncate">{event.tagline}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/30 border border-[var(--arena-line)]">
                <Timer className="w-3.5 h-3.5 text-[var(--arena-gold)]" />
                {phase === 'racing' ? `${remaining.toFixed(1)}s` : `${event.matchSeconds}s`}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/30 border border-[var(--arena-line)]">
                Heat {heatNumber}
              </span>
              {newRecordFlash && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--arena-gold)] text-[var(--arena-ink)] arena-pulse">
                  <Crown className="w-3.5 h-3.5" /> NEW RECORD
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl overflow-hidden border border-[var(--arena-line)] shadow-[0_0_0_1px_rgba(232,184,74,0.08)] bg-slate-900 arena-stage">
            {phase === 'lobby' && creatures.length === 0 ? (
              <div className="aspect-[16/9] min-h-[320px] flex flex-col items-center justify-center gap-3 arena-stage-placeholder text-slate-300 px-6 text-center">
                <Trophy className="w-12 h-12 text-[var(--arena-gold-deep)]" />
                <p className="font-display text-3xl text-[var(--arena-spot)]">Select champions & start a heat</p>
                <p className="text-sm max-w-md text-[var(--arena-crowd)]">
                  Finished models from the Sandbox appear on the right — with any body parts you
                  placed in Studio. Import a JSON if you transferred one by file.
                </p>
              </div>
            ) : (
              <Visualizer
                creatures={creatures}
                selectedCreatureId={selectedCreatureId}
                onSelectCreature={setSelectedCreatureId}
                obstacles={obstacles}
                worldObjects={worldObjects}
                goal={config.goal}
                isRunning={isRunning}
                bestEverDistance={0}
                appearanceByCreatureId={appearanceByCreatureId}
                environmentTheme="olympic"
                uniformOpacity
              />
            )}
          </div>

          {/* Live / podium strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--arena-line)] bg-[var(--arena-panel)]/70 p-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--arena-gold)] mb-2">
                <Swords className="w-3.5 h-3.5" />
                {phase === 'podium' ? 'Final podium' : 'Live standings'}
              </div>
              {(phase === 'podium' ? podium : liveStandings).length === 0 ? (
                <p className="text-sm text-[var(--arena-crowd)]">No active heat.</p>
              ) : (
                <ol className="space-y-1.5">
                  {(phase === 'podium' ? podium : liveStandings).slice(0, 8).map((row, i) => (
                    <li
                      key={'id' in row ? row.id : `${row.modelId}-${i}`}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border podium-rise ${
                        i === 0
                          ? 'border-[var(--arena-gold)]/50 bg-[var(--arena-gold)]/10'
                          : 'border-[var(--arena-line)] bg-black/20'
                      }`}
                      style={{ animationDelay: `${i * 0.06}s` }}
                    >
                      <span className="font-semibold truncate">
                        <span className="text-[var(--arena-gold)] mr-2">#{i + 1}</span>
                        {row.name}
                      </span>
                      <span className="tabular-nums font-bold text-[var(--arena-mint)] shrink-0">
                        {row.score.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="rounded-xl border border-[var(--arena-line)] bg-[var(--arena-panel)]/70 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[var(--arena-gold)]">
                <Sparkles className="w-3.5 h-3.5" />
                Broadcast desk
              </div>
              <p className="text-sm leading-relaxed text-[var(--arena-spot)]/90 flex-1">{announcer}</p>
              <div className="flex flex-wrap gap-2">
                {phase === 'lobby' && (
                  <button
                    type="button"
                    onClick={handleStartHeat}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--arena-gold)] text-[var(--arena-ink)] text-sm font-bold cursor-pointer hover:brightness-110"
                  >
                    <Play className="w-4 h-4" /> Start heat
                  </button>
                )}
                {phase === 'racing' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsRunning(r => !r)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--arena-line)] text-sm font-semibold cursor-pointer"
                    >
                      {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      {isRunning ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      onClick={() => finishHeat()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--arena-line)] text-sm font-semibold cursor-pointer"
                    >
                      <Medal className="w-4 h-4" /> End heat
                    </button>
                  </>
                )}
                {phase === 'podium' && (
                  <>
                    <button
                      type="button"
                      onClick={handleRematch}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--arena-gold)] text-[var(--arena-ink)] text-sm font-bold cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" /> Rematch
                    </button>
                    <button
                      type="button"
                      onClick={handleBackToLobby}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--arena-line)] text-sm font-semibold cursor-pointer"
                    >
                      Lobby
                    </button>
                  </>
                )}
                <div className="flex rounded-lg overflow-hidden border border-[var(--arena-line)]">
                  {([0.5, 1, 2, 4] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`px-2 py-1.5 text-[11px] font-bold cursor-pointer ${
                        speed === s ? 'bg-[var(--arena-gold)] text-[var(--arena-ink)]' : 'bg-black/20'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Side rail */}
        <aside className="flex flex-col gap-3 min-w-0">
          <div className="flex rounded-lg overflow-hidden border border-[var(--arena-line)] text-[10px] font-bold">
            {(
              [
                ['events', 'Events'],
                ['roster', 'Roster'],
                ['leaderboard', 'Board'],
                ['secrets', secretTrophiesTabLabel(secretRefreshKey)],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSideTab(id)}
                className={`flex-1 px-1.5 py-2 cursor-pointer transition-colors ${
                  sideTab === id
                    ? 'bg-[var(--arena-gold)] text-[var(--arena-ink)]'
                    : 'bg-black/20 text-[var(--arena-crowd)] hover:text-[var(--arena-spot)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {sideTab === 'events' && (
          <div className="rounded-xl border border-[var(--arena-line)] bg-[var(--arena-panel)]/70 p-3">
            <div className="font-display text-xl text-[var(--arena-spot)] mb-2">Events</div>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
              {CHAMPIONSHIP_EVENTS.map(ev => {
                const active = ev.id === eventId;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    disabled={phase === 'racing'}
                    onClick={() => {
                      setEventId(ev.id);
                      setAnnouncer(`${ev.title} — ${ev.blurb}`);
                    }}
                    className={`text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                      active
                        ? 'border-[var(--arena-gold)] bg-[var(--arena-gold)]/10'
                        : 'border-[var(--arena-line)] hover:border-[var(--arena-crowd)]'
                    }`}
                  >
                    <div className="text-sm font-bold" style={{ color: active ? ev.accent : undefined }}>
                      {ev.title}
                    </div>
                    <div className="text-[10px] text-[var(--arena-crowd)]">{ev.tagline}</div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-[var(--arena-crowd)] leading-relaxed">{event.blurb}</p>
            <p className="mt-1 text-[10px] text-[var(--arena-crowd)]">
              Arena goal: {getGoalInfo(event.id === 'freestyle_open' ? freestyleGoal : event.goal).shortLabel} ·{' '}
              {event.minEntrants}–{event.maxEntrants} entrants
            </p>
            {event.id === 'freestyle_open' && (
              <select
                value={freestyleGoal}
                disabled={phase === 'racing'}
                onChange={e => setFreestyleGoal(e.target.value as EvolutionGoal)}
                className="mt-2 w-full text-xs rounded-md bg-black/30 border border-[var(--arena-line)] px-2 py-1.5"
              >
                {Object.values(EvolutionGoal)
                  .filter(g => g !== EvolutionGoal.CUSTOM)
                  .map(g => (
                    <option key={g} value={g}>
                      {getGoalInfo(g).shortLabel}
                    </option>
                  ))}
              </select>
            )}
          </div>
          )}

          {sideTab === 'roster' && (
          <div className="rounded-xl border border-[var(--arena-line)] bg-[var(--arena-panel)]/70 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="font-display text-xl text-[var(--arena-spot)]">Roster</div>
              <span className="text-[10px] font-bold text-[var(--arena-crowd)]">
                {selectedIds.length}/{event.maxEntrants}
              </span>
            </div>
            {models.length === 0 ? (
              <p className="text-sm text-[var(--arena-crowd)] leading-relaxed">
                No finished models yet. In the{' '}
                <a href={SANDBOX_HREF} className="text-[var(--arena-gold)] underline">
                  Sandbox
                </a>
                , evolve a creature and use <strong>Freeze &amp; Save</strong>, then refresh here.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5 max-h-64 overflow-y-auto pr-1">
                {models.map(m => {
                  const on = selectedIds.includes(m.id);
                  const full = !on && selectedIds.length >= event.maxEntrants;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        disabled={full || phase === 'racing'}
                        onClick={() => toggleSelect(m.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 ${
                          on
                            ? 'border-[var(--arena-mint)] bg-[var(--arena-mint)]/10'
                            : 'border-[var(--arena-line)] hover:border-[var(--arena-crowd)]'
                        }`}
                      >
                        <div className="text-sm font-bold truncate">{m.name}</div>
                        <div className="text-[10px] text-[var(--arena-crowd)]">
                          {m.traits.trainedGoalLabel} · Gen {m.generation}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {m.traits.bodyTraits.slice(0, 4).map(t => (
                            <span
                              key={t}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-black/30 border border-[var(--arena-line)]"
                            >
                              {traitLabel(t)}
                            </span>
                          ))}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          )}

          {sideTab === 'leaderboard' && (
          <div className="rounded-xl border border-[var(--arena-line)] bg-[var(--arena-panel)]/70 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="font-display text-xl text-[var(--arena-spot)] flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[var(--arena-gold)]" />
                Leaderboard
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Clear ${event.title} leaderboard?`)) {
                    setBoard(clearLeaderboard(eventId));
                  }
                }}
                className="text-[10px] font-semibold text-[var(--arena-crowd)] underline cursor-pointer"
              >
                Clear event
              </button>
            </div>
            {eventBoard.length === 0 ? (
              <p className="text-sm text-[var(--arena-crowd)]">No records for this event yet.</p>
            ) : (
              <ol className="space-y-1.5 max-h-52 overflow-y-auto">
                {eventBoard.slice(0, 12).map((row, i) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded-md bg-black/20 border border-[var(--arena-line)]"
                  >
                    <span className="truncate">
                      <span className="text-[var(--arena-gold)] font-bold mr-1.5">#{i + 1}</span>
                      {row.modelName}
                    </span>
                    <span className="tabular-nums font-bold text-[var(--arena-mint)] shrink-0">
                      {row.score.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
          )}

          {sideTab === 'secrets' && (
          <div className="rounded-xl border border-[var(--arena-line)] bg-[var(--arena-panel)]/70 p-3 max-h-[70vh] overflow-y-auto">
            <div className="font-display text-xl text-[var(--arena-spot)] mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[var(--arena-gold)]" />
              {secretTrophiesTabLabel(secretRefreshKey)}
            </div>
            <SecretTrophiesPanel variant="arena" refreshKey={secretRefreshKey} />
          </div>
          )}
        </aside>
      </main>

      <SecretGoalRevealOverlay
        discovery={secretRevealQueue[0] ?? null}
        onDismiss={() => setSecretRevealQueue(q => q.slice(1))}
        variant="arena"
      />

      <footer className="border-t border-[var(--arena-line)] py-4 text-center text-[11px] text-[var(--arena-crowd)]">
        Arena Championship · Intergalactic Olympic circuit · rough-rock terrain · scores follow the event goal · brains stay frozen
      </footer>
    </div>
  );
}
