import { Creature, EvolutionGoal } from './types';

export interface PerformanceDiagnosticsContext {
  generation: number;
  elapsedSeconds: number;
  simulationSpeed: number;
  goal: EvolutionGoal;
  populationSize: number;
  obstacleCount: number;
  historyLength: number;
}

export interface PerformanceDiagnosticsSample extends PerformanceDiagnosticsContext {
  wallTimeMs: number;
  wallFps: number;
  rendererFps: number;
  simStepsPerSecond: number;
  averagePhysicsFrameMs: number;
  maxPhysicsFrameMs: number;
  averagePhysicsStepMs: number;
  averageRenderMs: number;
  maxRenderMs: number;
  uiSyncsPerSecond: number;
  visibleCreatureCount: number;
  averageGenomeNodes: number;
  maxGenomeNodes: number;
  averageGenomeConnections: number;
  maxGenomeConnections: number;
  lastBreedMs: number;
  heapUsedMb?: number;
}

interface DiagnosticsBucket {
  startedAtMs: number;
  physicsFrames: number;
  rendererFrames: number;
  simSteps: number;
  physicsMs: number;
  maxPhysicsMs: number;
  renderMs: number;
  maxRenderMs: number;
  uiSyncs: number;
  visibleCreatureCount: number;
  context?: PerformanceDiagnosticsContext;
  creatures?: Creature[];
}

export interface PerformanceDiagnosticsExport {
  schemaVersion: 1;
  createdAt: string;
  userAgent: string;
  hardwareConcurrency?: number;
  devicePixelRatio: number;
  viewport: { width: number; height: number };
  samples: PerformanceDiagnosticsSample[];
}

const MAX_SAMPLES = 900;

let active = false;
let samples: PerformanceDiagnosticsSample[] = [];
let lastBreedMs = 0;
let bucket: DiagnosticsBucket = createBucket(0);

function createBucket(startedAtMs: number): DiagnosticsBucket {
  return {
    startedAtMs,
    physicsFrames: 0,
    rendererFrames: 0,
    simSteps: 0,
    physicsMs: 0,
    maxPhysicsMs: 0,
    renderMs: 0,
    maxRenderMs: 0,
    uiSyncs: 0,
    visibleCreatureCount: 0,
  };
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function browserHeapUsedMb(): number | undefined {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize?: number };
    }
  ).memory;
  return memory?.usedJSHeapSize
    ? memory.usedJSHeapSize / (1024 * 1024)
    : undefined;
}

function flush(nowMs: number) {
  if (!active || !bucket.context || !bucket.creatures) return;
  const elapsedMs = Math.max(1, nowMs - bucket.startedAtMs);
  if (elapsedMs < 1000) return;

  let genomeNodes = 0;
  let genomeConnections = 0;
  let maxGenomeNodes = 0;
  let maxGenomeConnections = 0;
  for (const creature of bucket.creatures) {
    const nodes = creature.genome.nodes.length;
    const connections = creature.genome.connections.length;
    genomeNodes += nodes;
    genomeConnections += connections;
    maxGenomeNodes = Math.max(maxGenomeNodes, nodes);
    maxGenomeConnections = Math.max(maxGenomeConnections, connections);
  }
  const creatureCount = Math.max(1, bucket.creatures.length);
  const seconds = elapsedMs / 1000;
  const sample: PerformanceDiagnosticsSample = {
    ...bucket.context,
    wallTimeMs: Math.round(elapsedMs),
    wallFps: finite(bucket.physicsFrames / seconds),
    rendererFps: finite(bucket.rendererFrames / seconds),
    simStepsPerSecond: finite(bucket.simSteps / seconds),
    averagePhysicsFrameMs: finite(bucket.physicsMs / Math.max(1, bucket.physicsFrames)),
    maxPhysicsFrameMs: bucket.maxPhysicsMs,
    averagePhysicsStepMs: finite(bucket.physicsMs / Math.max(1, bucket.simSteps)),
    averageRenderMs: finite(bucket.renderMs / Math.max(1, bucket.rendererFrames)),
    maxRenderMs: bucket.maxRenderMs,
    uiSyncsPerSecond: finite(bucket.uiSyncs / seconds),
    visibleCreatureCount: bucket.visibleCreatureCount,
    averageGenomeNodes: genomeNodes / creatureCount,
    maxGenomeNodes,
    averageGenomeConnections: genomeConnections / creatureCount,
    maxGenomeConnections,
    lastBreedMs,
    heapUsedMb: browserHeapUsedMb(),
  };
  samples = [...samples, sample].slice(-MAX_SAMPLES);
  bucket = createBucket(nowMs);
}

export function isPerformanceDiagnosticsActive(): boolean {
  return active;
}

export function startPerformanceDiagnostics() {
  active = true;
  samples = [];
  lastBreedMs = 0;
  bucket = createBucket(performance.now());
}

export function stopPerformanceDiagnostics() {
  if (active) flush(performance.now());
  active = false;
}

export function resetPerformanceDiagnostics() {
  samples = [];
  lastBreedMs = 0;
  bucket = createBucket(performance.now());
}

export function recordPhysicsFrame(
  nowMs: number,
  durationMs: number,
  simSteps: number,
  context: PerformanceDiagnosticsContext,
  creatures: Creature[]
) {
  if (!active) return;
  if (bucket.startedAtMs <= 0) bucket.startedAtMs = nowMs;
  bucket.physicsFrames += 1;
  bucket.simSteps += simSteps;
  bucket.physicsMs += durationMs;
  bucket.maxPhysicsMs = Math.max(bucket.maxPhysicsMs, durationMs);
  bucket.context = context;
  bucket.creatures = creatures;
  flush(nowMs);
}

export function recordRendererFrame(durationMs: number, visibleCreatureCount: number) {
  if (!active) return;
  bucket.rendererFrames += 1;
  bucket.renderMs += durationMs;
  bucket.maxRenderMs = Math.max(bucket.maxRenderMs, durationMs);
  bucket.visibleCreatureCount = visibleCreatureCount;
}

export function recordUiSync() {
  if (!active) return;
  bucket.uiSyncs += 1;
}

export function recordBreed(durationMs: number) {
  if (!active) return;
  lastBreedMs = durationMs;
}

export function getPerformanceDiagnosticsSamples(): PerformanceDiagnosticsSample[] {
  return samples.slice();
}

export function getLatestPerformanceDiagnosticsSample():
  | PerformanceDiagnosticsSample
  | undefined {
  return samples.at(-1);
}

export function createPerformanceDiagnosticsExport(): PerformanceDiagnosticsExport {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    samples: getPerformanceDiagnosticsSamples(),
  };
}

export function downloadPerformanceDiagnostics() {
  const report = createPerformanceDiagnosticsExport();
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `rl-performance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

declare global {
  interface Window {
    __RL_PERFORMANCE_DIAGNOSTICS__?: {
      start: typeof startPerformanceDiagnostics;
      stop: typeof stopPerformanceDiagnostics;
      reset: typeof resetPerformanceDiagnostics;
      samples: typeof getPerformanceDiagnosticsSamples;
      export: typeof createPerformanceDiagnosticsExport;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__RL_PERFORMANCE_DIAGNOSTICS__ = {
    start: startPerformanceDiagnostics,
    stop: stopPerformanceDiagnostics,
    reset: resetPerformanceDiagnostics,
    samples: getPerformanceDiagnosticsSamples,
    export: createPerformanceDiagnosticsExport,
  };
}
