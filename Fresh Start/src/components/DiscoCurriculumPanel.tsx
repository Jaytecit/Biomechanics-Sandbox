/**
 * H7 — Multi-track dance curriculum controls (playlist, learn, refine).
 */
import type { DiscoPlaylistTrack } from '../audio/discoPlaylist';
import { isFeatureEnabled } from '../port/featureFlags';

export interface DiscoCurriculumPanelProps {
  tracks: DiscoPlaylistTrack[];
  activeTrackId: string | null;
  datasetSamples: number;
  datasetDurationSec: number;
  learning?: boolean;
  refining?: boolean;
  learnProgress?: { epoch: number; epochs: number; loss: number; holdoutLoss?: number } | null;
  refineProgress?: {
    generation: number;
    generations: number;
    bestFitness: number;
    meanFitness: number;
  } | null;
  hasDanceBrain?: boolean;
  soloOk?: boolean;
  disabled?: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveTrack: (id: string) => void;
  onSelectTrack: (id: string) => void;
  onAnalyzeAll: () => void;
  onRecordCurriculum: () => void;
  onStopRecord: () => void;
  recording?: boolean;
  onLearnCurriculum: () => void;
  onRefine: () => void;
  onClearDataset: () => void;
}

export function DiscoCurriculumPanel({
  tracks,
  activeTrackId,
  datasetSamples,
  datasetDurationSec,
  learning = false,
  refining = false,
  learnProgress = null,
  refineProgress = null,
  hasDanceBrain = false,
  soloOk = true,
  disabled,
  onAddFiles,
  onRemoveTrack,
  onSelectTrack,
  onAnalyzeAll,
  onRecordCurriculum,
  onStopRecord,
  recording = false,
  onLearnCurriculum,
  onRefine,
  onClearDataset,
}: DiscoCurriculumPanelProps) {
  if (!isFeatureEnabled('discoDanceCurriculum')) return null;

  const busy = disabled || learning || refining;
  const analyzed = tracks.filter((t) => t.analysis).length;

  return (
    <div className="disco-curriculum-panel">
      <h3 className="subhead">Dance curriculum</h3>
      <p className="hint muted disco-inline-hint">
        Load several tracks, analyze offline, record the reactive teacher across
        the playlist, learn (warm-start), then refine for upright + beat sync.
        Solo dancer only. Does not change Free evolve.
      </p>

      <label className="disco-track-picker disco-sidebar-picker">
        <span className="hint muted">Add tracks</span>
        <input
          type="file"
          accept="audio/*"
          multiple
          disabled={busy}
          onChange={(e) => {
            const list = e.target.files;
            if (!list?.length) return;
            onAddFiles(Array.from(list));
            e.target.value = '';
          }}
        />
      </label>

      {tracks.length === 0 ? (
        <p className="hint muted">No playlist tracks yet.</p>
      ) : (
        <ul className="disco-playlist">
          {tracks.map((t) => (
            <li key={t.id} className="library-row disco-playlist-row">
              <button
                type="button"
                className={activeTrackId === t.id ? 'active' : ''}
                disabled={busy}
                onClick={() => onSelectTrack(t.id)}
                title={t.error ?? t.name}
              >
                {t.name}
                <span className="hint muted">
                  {t.analyzing
                    ? ' · analyzing…'
                    : t.analysis
                      ? ` · ${t.analysis.durationSec.toFixed(0)}s`
                      : ' · not analyzed'}
                </span>
              </button>
              <button
                type="button"
                className="danger-ghost"
                disabled={busy}
                onClick={() => onRemoveTrack(t.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="button-row wrap disco-learn-actions">
        <button
          type="button"
          disabled={busy || tracks.length === 0}
          onClick={onAnalyzeAll}
        >
          Analyze all
        </button>
        <button
          type="button"
          className={recording ? 'active' : ''}
          disabled={busy || !soloOk || analyzed === 0}
          title={
            !soloOk
              ? 'Use a single dancer slot'
              : 'Record reactive teacher on the active track'
          }
          onClick={recording ? onStopRecord : onRecordCurriculum}
        >
          {recording ? 'Stop curriculum record' : 'Record track'}
        </button>
        <button
          type="button"
          disabled={busy || !soloOk || datasetSamples < 150 || recording}
          onClick={onLearnCurriculum}
        >
          {learning ? 'Learning…' : 'Learn playlist'}
        </button>
        <button
          type="button"
          disabled={
            busy || !soloOk || !hasDanceBrain || analyzed === 0 || recording
          }
          onClick={onRefine}
        >
          {refining ? 'Refining…' : 'Refine freestyle'}
        </button>
        <button
          type="button"
          disabled={busy || datasetSamples === 0}
          onClick={onClearDataset}
        >
          Clear dataset
        </button>
      </div>

      <span className="hint muted disco-learn-stats">
        {tracks.length} tracks · {analyzed} analyzed · {datasetSamples} samples ·{' '}
        {datasetDurationSec.toFixed(1)}s
        {learnProgress
          ? ` · epoch ${learnProgress.epoch}/${learnProgress.epochs} · loss ${learnProgress.loss.toFixed(4)}${
              learnProgress.holdoutLoss != null
                ? ` · holdout ${learnProgress.holdoutLoss.toFixed(4)}`
                : ''
            }`
          : ''}
        {refineProgress
          ? ` · gen ${refineProgress.generation}/${refineProgress.generations} · best ${refineProgress.bestFitness.toFixed(3)}`
          : ''}
        {!soloOk ? ' · multi-dancer: curriculum disabled' : ''}
      </span>
    </div>
  );
}
