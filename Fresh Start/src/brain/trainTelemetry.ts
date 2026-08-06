/**
 * D16 — Training telemetry log: capture gen-champion behavior over a window
 * so a run can be inspected for what the body is, what elites did, and
 * recurring failure / reward patterns (including stall contact surfaces).
 */
import { bodyFingerprint } from '../library/bestEver';
import {
  summarizeMorphGenes,
  type MorphGenes,
} from '../creature/morphGenes';
import type { CreatureDesign } from '../creature/types';
import type { StallDiagnostics } from '../physics/obstacleContactProbe';
import type { TaskId } from './types';
import { explainTaskScore } from './taskScore';
import type { TaskEpisodeMetrics } from './taskScore';

/** Default capture window (generations) for a telemetry session. */
export const TRAIN_TELEMETRY_WINDOW = 50;

export interface CreatureMorphologySummary {
  name: string;
  fingerprint: string;
  joints: number;
  bones: number;
  muscles: number;
  feet: number;
  heads: number;
  wheels: number;
  aeroBones: number;
  totalMass: number;
}

export interface TrainTelemetryGenRow {
  generation: number;
  task: TaskId;
  episodeSeconds: number;
  bestFitness: number;
  meanFitness: number;
  runBestFitness: number;
  populationSize: number;
  metrics: TaskEpisodeMetrics;
  /** Human-readable score terms for the gen champion. */
  scoreTerms: { label: string; value: string; note?: string }[];
  /** Stall / contact surface diagnostics for the gen champion. */
  stall?: StallDiagnostics | null;
  /** D17 — soft morph summary for the gen champion. */
  morphSummary?: ReturnType<typeof summarizeMorphGenes> | null;
}

export interface TrainTelemetryInsight {
  kind: 'failure' | 'reward' | 'trend';
  label: string;
  detail: string;
}

export interface TrainTelemetrySession {
  version: 1;
  startedAt: string;
  endedAt: string | null;
  window: number;
  task: TaskId;
  runSeed: number;
  morphology: CreatureMorphologySummary;
  knobs: Record<string, unknown>;
  generations: TrainTelemetryGenRow[];
  insights: TrainTelemetryInsight[];
}

export function summarizeMorphology(
  design: CreatureDesign,
): CreatureMorphologySummary {
  let totalMass = 0;
  let feet = 0;
  let heads = 0;
  let wheels = 0;
  for (const j of design.joints) {
    totalMass += j.mass ?? 1;
    if (j.isFoot) feet += 1;
    if (j.isHead) heads += 1;
    if (j.isWheel) wheels += 1;
  }
  let aeroBones = 0;
  for (const b of design.bones) {
    totalMass += b.mass ?? 1;
    if ((b.aeroArea ?? 0) > 0) aeroBones += 1;
  }
  return {
    name: design.name || 'Creature',
    fingerprint: bodyFingerprint(design),
    joints: design.joints.length,
    bones: design.bones.length,
    muscles: design.muscles.length,
    feet,
    heads,
    wheels,
    aeroBones,
    totalMass: Math.round(totalMass * 100) / 100,
  };
}

export function beginTrainTelemetrySession(opts: {
  task: TaskId;
  design: CreatureDesign;
  runSeed: number;
  knobs: Record<string, unknown>;
  window?: number;
}): TrainTelemetrySession {
  return {
    version: 1,
    startedAt: new Date().toISOString(),
    endedAt: null,
    window: opts.window ?? TRAIN_TELEMETRY_WINDOW,
    task: opts.task,
    runSeed: opts.runSeed,
    morphology: summarizeMorphology(opts.design),
    knobs: opts.knobs,
    generations: [],
    insights: [],
  };
}

export function appendTrainTelemetryGen(
  session: TrainTelemetrySession,
  row: Omit<TrainTelemetryGenRow, 'scoreTerms'> & {
    scoreTerms?: TrainTelemetryGenRow['scoreTerms'];
  },
): TrainTelemetrySession {
  if (session.generations.length >= session.window) return session;
  const scoreTerms =
    row.scoreTerms ??
    explainTaskScore(row.task, row.metrics).map((t) => ({
      label: t.label,
      value: t.value,
      note: t.note,
    }));
  return {
    ...session,
    generations: [
      ...session.generations,
      {
        generation: row.generation,
        task: row.task,
        episodeSeconds: row.episodeSeconds,
        bestFitness: row.bestFitness,
        meanFitness: row.meanFitness,
        runBestFitness: row.runBestFitness,
        populationSize: row.populationSize,
        metrics: { ...row.metrics },
        scoreTerms,
        stall: row.stall ?? null,
        morphSummary: row.morphSummary ?? null,
      },
    ],
  };
}

/** Helper for App wiring — summarize optional morph genes. */
export function morphSummaryForGenes(
  morph: MorphGenes | null | undefined,
): ReturnType<typeof summarizeMorphGenes> | null {
  if (!morph) return null;
  return summarizeMorphGenes(morph);
}

function rate(
  rows: TrainTelemetryGenRow[],
  pred: (r: TrainTelemetryGenRow) => boolean,
): number {
  if (rows.length === 0) return 0;
  let n = 0;
  for (const r of rows) if (pred(r)) n += 1;
  return n / rows.length;
}

function mean(vals: number[]): number {
  if (vals.length === 0) return 0;
  let s = 0;
  for (const v of vals) s += v;
  return s / vals.length;
}

/** Derive consistent failure / reward / trend notes from captured gens. */
export function analyzeTrainTelemetry(
  session: TrainTelemetrySession,
): TrainTelemetryInsight[] {
  const rows = session.generations;
  const insights: TrainTelemetryInsight[] = [];
  if (rows.length === 0) {
    insights.push({
      kind: 'trend',
      label: 'No generations captured',
      detail: 'Toggle was on but no gen-complete events arrived.',
    });
    return insights;
  }

  const fallRate = rate(rows, (r) => r.metrics.fell);
  if (fallRate >= 0.4) {
    insights.push({
      kind: 'failure',
      label: 'Frequent falls',
      detail: `${Math.round(fallRate * 100)}% of gen champions fell — upright / balance is a consistent failure mode.`,
    });
  }

  const lowLiftRate = rate(
    rows,
    (r) => r.metrics.distance > 1 && r.metrics.footLifts < 3,
  );
  if (
    (session.task === 'run' || session.task === 'rough' || session.task === 'sprint') &&
    lowLiftRate >= 0.4
  ) {
    insights.push({
      kind: 'failure',
      label: 'Scoot / low foot lifts',
      detail: `${Math.round(lowLiftRate * 100)}% of champions moved with fewer than 3 foot lifts — gait credit is weak.`,
    });
  }

  const penaltyHits = rows.filter((r) => r.metrics.regionPenalty > 0.05);
  if (penaltyHits.length >= Math.max(3, Math.floor(rows.length * 0.25))) {
    const avgPen = mean(penaltyHits.map((r) => r.metrics.regionPenalty));
    insights.push({
      kind: 'failure',
      label: 'Region penalties',
      detail: `${penaltyHits.length}/${rows.length} gens took penalty zones (avg ${avgPen.toFixed(2)} when hit).`,
    });
  }

  const unfinished = rows.filter(
    (r) => r.metrics.courseArmed && !r.metrics.finished,
  );
  if (unfinished.length >= Math.max(3, Math.floor(rows.length * 0.3))) {
    const maxCp = Math.max(...unfinished.map((r) => r.metrics.checkpointsHit));
    insights.push({
      kind: 'failure',
      label: 'Course stall',
      detail: `${unfinished.length} gens armed the course but never finished (best CP streak among them: ${maxCp}).`,
    });
  }

  const withStall = rows.filter((r) => r.stall?.atEpisodeEnd);
  if (withStall.length > 0) {
    const rampStalls = withStall.filter(
      (r) => r.stall?.atEpisodeEnd?.primarySurface?.kind === 'ramp',
    );
    const airStalls = withStall.filter(
      (r) => (r.stall?.atEpisodeEnd?.feetTouching ?? 0) === 0,
    );
    const highSlipRamp = rampStalls.filter(
      (r) => (r.stall?.atEpisodeEnd?.meanContactSlipSpeed ?? 0) > 1.5,
    );
    const groundOnly = withStall.filter(
      (r) =>
        (r.stall?.atEpisodeEnd?.feetOnObstacle ?? 0) === 0 &&
        (r.stall?.atEpisodeEnd?.feetOnGround ?? 0) > 0,
    );

    if (rampStalls.length >= Math.max(3, Math.floor(withStall.length * 0.25))) {
      const sample = rampStalls[rampStalls.length - 1]!.stall!;
      const end = sample.atEpisodeEnd!;
      const ang = end.primarySurface?.angleDeg;
      const avgSlip = mean(
        rampStalls.map((r) => r.stall!.atEpisodeEnd!.meanContactSlipSpeed),
      );
      const avgFootY = mean(
        rampStalls.map((r) => r.stall!.atEpisodeEnd!.meanFootY),
      );
      insights.push({
        kind: 'failure',
        label: 'Ramp purchase failure',
        detail:
          `${rampStalls.length}/${withStall.length} gens ended on a ramp` +
          (ang != null ? ` (sample angle ${ang.toFixed(1)}°)` : '') +
          `; avg slip |vx|=${avgSlip.toFixed(2)}, avg footY=${avgFootY.toFixed(2)}. ` +
          (sample.summaryCause || ''),
      });
    }

    if (highSlipRamp.length >= Math.max(2, Math.floor(rampStalls.length * 0.4))) {
      insights.push({
        kind: 'failure',
        label: 'Ramp slip',
        detail: `${highSlipRamp.length} ramp-contact gens had mean foot |vx| > 1.5 — feet touching the slab but not holding.`,
      });
    }

    if (airStalls.length >= Math.max(3, Math.floor(withStall.length * 0.25))) {
      insights.push({
        kind: 'failure',
        label: 'Airborne stall',
        detail: `${airStalls.length}/${withStall.length} gens had zero Rapier foot contacts at episode end — bouncing / floating instead of planting.`,
      });
    }

    if (
      groundOnly.length >= Math.max(3, Math.floor(withStall.length * 0.4)) &&
      rampStalls.length === 0
    ) {
      const avgDist = mean(
        groundOnly.map((r) => r.stall!.atEpisodeEnd!.distance),
      );
      insights.push({
        kind: 'failure',
        label: 'Never reached ramp',
        detail: `${groundOnly.length}/${withStall.length} gens stalled on ground only (avg dist ${avgDist.toFixed(2)} m) — first ramp contact never happened.`,
      });
    }

    const peak = withStall.reduce((a, b) =>
      a.bestFitness >= b.bestFitness ? a : b,
    );
    if (peak.stall?.summaryCause) {
      insights.push({
        kind: 'trend',
        label: 'Peak-gen stall cause',
        detail: `Gen ${peak.generation}: ${peak.stall.summaryCause}`,
      });
    }
  }

  const dists = rows.map((r) => r.metrics.distance);
  const early = mean(dists.slice(0, Math.min(10, dists.length)));
  const late = mean(dists.slice(Math.max(0, dists.length - 10)));
  if (rows.length >= 15 && Math.abs(late - early) < 0.75 && late < 8) {
    insights.push({
      kind: 'failure',
      label: 'Distance plateau',
      detail: `Early avg distance ${early.toFixed(2)} m vs late ${late.toFixed(2)} m — little travel progress across the window.`,
    });
  }

  const rewardHits = rows.filter((r) => r.metrics.regionReward > 0.05);
  if (rewardHits.length > 0) {
    const best = rewardHits.reduce((a, b) =>
      a.metrics.regionReward >= b.metrics.regionReward ? a : b,
    );
    insights.push({
      kind: 'reward',
      label: 'Reward zones',
      detail: `${rewardHits.length}/${rows.length} gens collected region rewards; peak ${best.metrics.regionReward.toFixed(2)} at gen ${best.generation}.`,
    });
  }

  const finishers = rows.filter((r) => r.metrics.finished);
  if (finishers.length > 0) {
    const bestTime = finishers.reduce((a, b) => {
      const at = a.metrics.finishTime ?? Infinity;
      const bt = b.metrics.finishTime ?? Infinity;
      return at <= bt ? a : b;
    });
    insights.push({
      kind: 'reward',
      label: 'Course finishes',
      detail: `${finishers.length} gen champions finished` +
        (bestTime.metrics.finishTime != null
          ? `; best race time ${bestTime.metrics.finishTime.toFixed(2)}s (gen ${bestTime.generation}).`
          : '.'),
    });
  }

  const fits = rows.map((r) => r.bestFitness);
  const bestIdx = fits.reduce(
    (bi, v, i) => (v > fits[bi]! ? i : bi),
    0,
  );
  const bestRow = rows[bestIdx]!;
  insights.push({
    kind: 'reward',
    label: 'Peak generation',
    detail: `Gen ${bestRow.generation} led the window at fitness ${bestRow.bestFitness.toFixed(3)} (dist ${bestRow.metrics.distance.toFixed(2)} m, lifts ${bestRow.metrics.footLifts}${bestRow.metrics.fell ? ', fell' : ''}).`,
  });

  const firstFit = fits[0]!;
  const lastFit = fits[fits.length - 1]!;
  const delta = lastFit - firstFit;
  insights.push({
    kind: 'trend',
    label: 'Fitness trajectory',
    detail: `Gen-champion fitness ${firstFit.toFixed(3)} → ${lastFit.toFixed(3)} (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) over ${rows.length} gens; run-best ended at ${rows[rows.length - 1]!.runBestFitness.toFixed(3)}.`,
  });

  const morph = session.morphology;
  insights.push({
    kind: 'trend',
    label: 'Body under test',
    detail: `${morph.name} · ${morph.joints}j/${morph.bones}b/${morph.muscles}m · feet ${morph.feet} · mass ${morph.totalMass} · fp ${morph.fingerprint}`,
  });

  return insights;
}

export function finalizeTrainTelemetry(
  session: TrainTelemetrySession,
): TrainTelemetrySession {
  return {
    ...session,
    endedAt: new Date().toISOString(),
    insights: analyzeTrainTelemetry(session),
  };
}

export function exportTrainTelemetryJson(session: TrainTelemetrySession): string {
  return JSON.stringify(session, null, 2);
}

export function telemetryFilename(session: TrainTelemetrySession): string {
  const name = session.morphology.name.replace(/\s+/g, '_') || 'creature';
  return `${name}_${session.task}_train_log.json`;
}
