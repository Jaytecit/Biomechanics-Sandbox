import type { TaskId } from '../brain/types';
import type { BestEverEntry } from '../library/bestEver';
import type { SavedModel } from '../library/savedModels';

interface Props {
  task: TaskId;
  savedModels: SavedModel[];
  bestEverList: BestEverEntry[];
  evolving: boolean;
  onContinue: (m: SavedModel) => void;
  onDelete: (id: string) => void;
  /** H7 — load a saved dance brain into Disco freestyle (not Free evolve). */
  onLoadDanceFreestyle?: (m: SavedModel) => void;
}

/** B12 — model picker / models hub. */
export function ModelsHub({
  task,
  savedModels,
  bestEverList,
  evolving,
  onContinue,
  onDelete,
  onLoadDanceFreestyle,
}: Props) {
  const forTask = savedModels.filter((m) => m.task === task);
  const others = savedModels.filter((m) => m.task !== task);
  const danceModels = savedModels.filter((m) => m.task === 'dance');
  const best = bestEverList.filter((e) => e.task === task);

  return (
    <section>
      <h2>Saved brains</h2>
      <p className="hint muted">
        Trained brains for <strong>{task}</strong> and all-time bests. Keep
        training from a row, or use Start from in Training setup.
      </p>

      {best.length > 0 && (
        <>
          <h3 className="subhead">Best ever · {task}</h3>
          <ul className="stats">
            {best.map((e) => (
              <li key={e.task}>
                {e.fitness.toFixed(3)} · {e.designName}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="subhead">Saved · {task}</h3>
      {forTask.length === 0 ? (
        <p className="hint muted">No saved models for this task.</p>
      ) : (
        <div className="button-col">
          {forTask.slice(0, 12).map((m) => (
            <div key={m.id} className="library-row">
              <button
                type="button"
                disabled={evolving}
                onClick={() =>
                  m.task === 'dance' && onLoadDanceFreestyle
                    ? onLoadDanceFreestyle(m)
                    : onContinue(m)
                }
                title={
                  m.task === 'dance'
                    ? `Load into Disco freestyle · fit ${m.fitness.toFixed(3)}`
                    : `Keep training · ${m.task} · fit ${m.fitness.toFixed(3)}`
                }
              >
                {m.name}
                <span className="hint muted"> · {m.fitness.toFixed(2)}</span>
              </button>
              <button
                type="button"
                className="danger-ghost"
                onClick={() => onDelete(m.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {onLoadDanceFreestyle && danceModels.length > 0 && task !== 'dance' && (
        <>
          <h3 className="subhead">Dance · load into Disco</h3>
          <p className="hint muted">
            Dance brains open freestyle in Disco (not Free evolve).
          </p>
          <div className="button-col">
            {danceModels.slice(0, 8).map((m) => (
              <div key={m.id} className="library-row">
                <button
                  type="button"
                  disabled={evolving}
                  onClick={() => onLoadDanceFreestyle(m)}
                  title={
                    m.danceMeta
                      ? `stage ${m.danceMeta.stage} · obs v${m.danceMeta.obsPackVersion}`
                      : 'Load dance freestyle'
                  }
                >
                  {m.name}
                  <span className="hint muted">
                    {m.danceMeta ? ` · ${m.danceMeta.stage}` : ' · dance'}
                  </span>
                </button>
                <button
                  type="button"
                  className="danger-ghost"
                  onClick={() => onDelete(m.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {others.length > 0 && (
        <>
          <h3 className="subhead">Other tasks</h3>
          <div className="button-col">
            {others.slice(0, 6).map((m) => (
              <div key={m.id} className="library-row">
                <button
                  type="button"
                  disabled={evolving}
                  onClick={() => onContinue(m)}
                  title={`${m.task} · fit ${m.fitness.toFixed(3)}`}
                >
                  {m.name}
                  <span className="hint muted"> · {m.task}</span>
                </button>
                <button
                  type="button"
                  className="danger-ghost"
                  onClick={() => onDelete(m.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
