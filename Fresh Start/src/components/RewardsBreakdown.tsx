import {
  explainTaskScore,
  type TaskEpisodeMetrics,
} from '../brain/taskScore';
import type { TaskId } from '../brain/types';

interface Props {
  task: TaskId;
  metrics: TaskEpisodeMetrics | null;
  open: boolean;
  onToggle: () => void;
}

/** B10 — rewards / score term breakdown. */
export function RewardsBreakdown({ task, metrics, open, onToggle }: Props) {
  const terms = metrics ? explainTaskScore(task, metrics) : [];
  return (
    <section className="collapsible-panel">
      <button
        type="button"
        className="collapsible-panel-header"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>Rewards</span>
        <span className="collapsible-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="collapsible-panel-body">
          {!metrics ? (
            <p className="hint muted">Complete an episode to see the breakdown.</p>
          ) : (
            <ul className="stats rewards-breakdown">
              {terms.map((t) => (
                <li key={t.label}>
                  <strong>{t.label}</strong>: {t.value}
                  {t.note ? (
                    <span className="hint muted"> · {t.note}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
