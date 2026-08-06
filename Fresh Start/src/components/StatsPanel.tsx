import type { TaskEpisodeMetrics } from '../brain/taskScore';
import type { LiveFocusStats } from '../sim/simulation';

interface Props {
  live: LiveFocusStats | null;
  last: TaskEpisodeMetrics | null;
  open: boolean;
  onToggle: () => void;
}

/** B6 — live + last-episode stats. */
export function StatsPanel({ live, last, open, onToggle }: Props) {
  return (
    <section className="collapsible-panel">
      <button
        type="button"
        className="collapsible-panel-header"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>Stats</span>
        <span className="collapsible-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="collapsible-panel-body">
          <h3 className="subhead">Live focus</h3>
          {live ? (
            <ul className="stats">
              <li>Fitness: {live.fitness.toFixed(3)}</li>
              <li>Distance: {live.distance.toFixed(2)}</li>
              <li>
                Course:{' '}
                {!live.courseArmed
                  ? 'ready'
                  : live.finished
                    ? `done ${(live.raceTime ?? 0).toFixed(2)}s`
                    : `${(live.raceTime ?? 0).toFixed(2)}s`}
                {live.checkpointsHit > 0 ? ` · ${live.checkpointsHit} CP` : ''}
              </li>
              <li>Foot lifts: {live.footLifts}</li>
              <li>Peak H: {live.peakHeight.toFixed(2)}</li>
              <li>Air: {live.airTime.toFixed(2)}s</li>
              <li>Upright: {live.uprightQuality.toFixed(2)}</li>
              <li>Fell: {live.fell ? 'yes' : 'no'}</li>
            </ul>
          ) : (
            <p className="hint muted">No live episode yet.</p>
          )}
          <h3 className="subhead" style={{ marginTop: '0.45rem' }}>
            Last episode
          </h3>
          {last ? (
            <ul className="stats">
              <li>Fitness: {last.fitness.toFixed(3)}</li>
              <li>Distance: {last.distance.toFixed(2)}</li>
              <li>
                Course:{' '}
                {!last.courseArmed
                  ? 'never armed'
                  : last.finished
                    ? `finish ${(last.finishTime ?? last.raceTime ?? 0).toFixed(2)}s`
                    : `${(last.raceTime ?? 0).toFixed(2)}s`}
                {last.checkpointsHit > 0 ? ` · ${last.checkpointsHit} CP` : ''}
              </li>
              <li>Foot lifts: {last.footLifts}</li>
              <li>Peak H: {last.peakHeight.toFixed(2)}</li>
              <li>Mean air H: {last.meanAirHeight.toFixed(2)}</li>
              <li>Air: {last.airTime.toFixed(2)}s</li>
              <li>Upright: {last.uprightQuality.toFixed(2)}</li>
              <li>Fell: {last.fell ? 'yes' : 'no'}</li>
            </ul>
          ) : (
            <p className="hint muted">No completed episode yet.</p>
          )}
        </div>
      )}
    </section>
  );
}
