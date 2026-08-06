import { useMemo, useState } from 'react';
import { shapeForDesign } from '../sim/simulation';
import type { HeadToHeadResult } from '../sim/simulation';
import { GOAL_CATALOG, type GoalId } from '../goals/catalog';
import { BUNDLED_MODELS } from '../library/bundledModels';
import type { CreaturePackage } from '../library/creaturePackages';
import {
  designCandidatePool,
  resolveDesignForModel,
} from '../library/resolveModelDesign';
import {
  loadSavedModels,
  modelToSeed,
  type SavedModel,
} from '../library/savedModels';
import type { EnvironmentDesign } from '../env/types';
import { cloneDesign } from '../creature/types';

interface Props {
  savedModels: SavedModel[];
  packages: CreaturePackage[];
  currentDesign: import('../creature/types').CreatureDesign;
  envDesign: EnvironmentDesign;
  episodeSeconds: number;
  busy: boolean;
  lastResult: HeadToHeadResult | null;
  onStartHeat: (opts: {
    modelA: SavedModel;
    modelB: SavedModel;
    goalId: GoalId;
    useCurrentEnv: boolean;
  }) => void;
  onStopHeat: () => void;
  running: boolean;
  progress: { episodeT: number; episodeDuration: number } | null;
}

/** B20/I6 — pick two saved models and run a timed gauntlet heat. */
export function HeadToHeadPanel({
  savedModels,
  packages,
  currentDesign,
  envDesign,
  episodeSeconds,
  busy,
  lastResult,
  onStartHeat,
  onStopHeat,
  running,
  progress,
}: Props) {
  const models = savedModels.length > 0 ? savedModels : loadSavedModels();
  const [modelAId, setModelAId] = useState(models[0]?.id ?? '');
  const [modelBId, setModelBId] = useState(models[1]?.id ?? models[0]?.id ?? '');
  const [goalId, setGoalId] = useState<GoalId>('sprint');
  const [useCurrentEnv, setUseCurrentEnv] = useState(true);

  const pool = useMemo(
    () => designCandidatePool(packages, BUNDLED_MODELS, currentDesign),
    [packages, currentDesign],
  );

  const modelA = models.find((m) => m.id === modelAId);
  const modelB = models.find((m) => m.id === modelBId);

  const canResolve =
    modelA &&
    modelB &&
    modelA.id !== modelB.id &&
    resolveDesignForModel(modelA, pool) &&
    resolveDesignForModel(modelB, pool);

  const shapeOk =
    modelA &&
    modelB &&
    (() => {
      const dA = resolveDesignForModel(modelA, pool);
      const dB = resolveDesignForModel(modelB, pool);
      if (!dA || !dB) return false;
      const sA = shapeForDesign(dA);
      const sB = shapeForDesign(dB);
      return (
        sA.inputCount === modelA.shape.inputCount &&
        sA.outputCount === modelA.shape.outputCount &&
        sB.inputCount === modelB.shape.inputCount &&
        sB.outputCount === modelB.shape.outputCount
      );
    })();

  return (
    <section className="h2h-panel">
      <h2>Head-to-Head</h2>
      <p className="hint muted">
        Pit two saved brains against each other on a gauntlet task. Both spawn
        side-by-side; higher fitness wins the heat.
      </p>

      {models.length < 2 ? (
        <p className="hint muted">
          Save at least two trained models (Train tab) to run a heat.
        </p>
      ) : (
        <>
          <label className="field-row">
            <span>Contender A</span>
            <select
              value={modelAId}
              disabled={busy || running}
              onChange={(e) => setModelAId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.task} · {m.fitness.toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-row">
            <span>Contender B</span>
            <select
              value={modelBId}
              disabled={busy || running}
              onChange={(e) => setModelBId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.task} · {m.fitness.toFixed(2)}
                </option>
              ))}
            </select>
          </label>

          <label className="field-row">
            <span>Gauntlet task</span>
            <select
              value={goalId}
              disabled={busy || running}
              onChange={(e) => setGoalId(e.target.value as GoalId)}
            >
              {GOAL_CATALOG.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>

          <label className="check-row">
            <input
              type="checkbox"
              checked={useCurrentEnv}
              disabled={busy || running}
              onChange={(e) => setUseCurrentEnv(e.target.checked)}
            />
            <span>
              Use current environment
              {useCurrentEnv ? ` (${envDesign.name})` : ''}
            </span>
          </label>
          {goalId === 'sprint' && useCurrentEnv && (
            <p className="hint muted">
              Sprint uses start/finish markers from World when placed.
            </p>
          )}

          {!canResolve && modelA && modelB && (
            <p className="hint warn">
              Could not match one or both models to a creature body in your
              library. Load the matching design in Creatures or save a package
              first.
            </p>
          )}
          {canResolve && !shapeOk && (
            <p className="hint warn">
              Saved brain shape does not match the resolved creature body.
            </p>
          )}

          <div className="button-row">
            <button
              type="button"
              className="primary"
              disabled={busy || running || !canResolve || !shapeOk || !modelA || !modelB}
              onClick={() => {
                if (!modelA || !modelB) return;
                onStartHeat({ modelA, modelB, goalId, useCurrentEnv });
              }}
            >
              Start heat
            </button>
            {running && (
              <button type="button" onClick={onStopHeat}>
                Stop
              </button>
            )}
          </div>

          {running && progress && (
            <p className="hint">
              Heat {progress.episodeT.toFixed(1)}s /{' '}
              {progress.episodeDuration.toFixed(0)}s
            </p>
          )}

          {lastResult && !running && (
            <div className="h2h-scores">
              <h3 className="subhead">Last heat</h3>
              <ul className="stats">
                <li>
                  A: {lastResult.fitness[0].toFixed(3)}
                  {lastResult.fitness[0] >= lastResult.fitness[1] ? ' · winner' : ''}
                </li>
                <li>
                  B: {lastResult.fitness[1].toFixed(3)}
                  {lastResult.fitness[1] > lastResult.fitness[0] ? ' · winner' : ''}
                </li>
              </ul>
            </div>
          )}

          <p className="hint muted">
            Episode length: {episodeSeconds}s (Train dock).
          </p>
        </>
      )}
    </section>
  );
}

/** Build head-to-head entries from saved models + design pool. */
export function headToHeadEntriesFromModels(
  modelA: SavedModel,
  modelB: SavedModel,
  pool: ReturnType<typeof designCandidatePool>,
): {
  entries: [
    { design: ReturnType<typeof cloneDesign>; shape: SavedModel['shape']; weights: Float32Array },
    { design: ReturnType<typeof cloneDesign>; shape: SavedModel['shape']; weights: Float32Array },
  ];
} | null {
  const dA = resolveDesignForModel(modelA, pool);
  const dB = resolveDesignForModel(modelB, pool);
  if (!dA || !dB) return null;
  const seedA = modelToSeed(modelA);
  const seedB = modelToSeed(modelB);
  return {
    entries: [
      { design: cloneDesign(dA), shape: seedA.shape, weights: seedA.weights },
      { design: cloneDesign(dB), shape: seedB.shape, weights: seedB.weights },
    ],
  };
}
