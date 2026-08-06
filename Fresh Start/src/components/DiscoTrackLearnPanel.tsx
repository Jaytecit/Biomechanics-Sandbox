/**
 * H6 — Disco track transport + learn-to-freestyle controls for the Zone sidebar.
 */
import { isFeatureEnabled } from '../port/featureFlags';

export interface DiscoTrackLearnPanelProps {
  trackName: string;
  hasTrack: boolean;
  playing: boolean;
  dancing: boolean;
  disabled?: boolean;
  recording?: boolean;
  recordSamples?: number;
  recordDurationSec?: number;
  learning?: boolean;
  learnProgress?: { epoch: number; epochs: number; loss: number } | null;
  hasDanceBrain?: boolean;
  freestyle?: boolean;
  soloOk?: boolean;
  minRecordSamples?: number;
  onToggleRecord?: () => void;
  onLearn?: () => void;
  onToggleFreestyle?: () => void;
  onSaveDance?: () => void;
  onClearRecord?: () => void;
  onLoadFile: (file: File) => void;
  onPlay: () => void;
  onPause: () => void;
  onStartDancing: () => void;
  onResetPose: () => void;
}

export function DiscoTrackLearnPanel({
  trackName,
  hasTrack,
  playing,
  dancing,
  disabled,
  recording = false,
  recordSamples = 0,
  recordDurationSec = 0,
  learning = false,
  learnProgress = null,
  hasDanceBrain = false,
  freestyle = false,
  soloOk = true,
  minRecordSamples = 150,
  onToggleRecord,
  onLearn,
  onToggleFreestyle,
  onSaveDance,
  onClearRecord,
  onLoadFile,
  onPlay,
  onPause,
  onStartDancing,
  onResetPose,
}: DiscoTrackLearnPanelProps) {
  const learnEnabled = isFeatureEnabled('discoDanceLearn');

  return (
    <div className="disco-sidebar-controls">
      <div className="disco-sidebar-track">
        <h3 className="subhead">Track</h3>
        <label className="disco-track-picker disco-sidebar-picker">
          <input
            type="file"
            accept="audio/*"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLoadFile(file);
            }}
          />
        </label>
        {trackName ? (
          <p className="hint muted truncate disco-track-name" title={trackName}>
            {trackName}
          </p>
        ) : (
          <p className="hint muted disco-track-name">No file chosen</p>
        )}
        <div className="button-row wrap disco-transport">
          <button type="button" disabled={disabled || !hasTrack} onClick={onPlay}>
            {playing ? 'Playing…' : 'Play'}
          </button>
          <button type="button" disabled={disabled || !hasTrack} onClick={onPause}>
            Pause
          </button>
          <button
            type="button"
            className={dancing ? 'active' : ''}
            disabled={disabled || !hasTrack}
            onClick={dancing ? onResetPose : onStartDancing}
            title={
              dancing
                ? 'Reset dancer pose without stopping playback'
                : 'Start dancing'
            }
          >
            {dancing ? 'Reset pose' : 'Start dancing'}
          </button>
        </div>
      </div>

      {learnEnabled && (
        <div className="disco-learn-bar disco-sidebar-learn">
          <h3 className="subhead">Learn to freestyle</h3>
          <p className="hint muted disco-inline-hint">
            Record while dancing, learn an MLP from your track + routing, then
            freestyle to live audio. Solo dancer only.
          </p>
          <div className="button-row wrap disco-learn-actions">
            <button
              type="button"
              className={recording ? 'active' : ''}
              disabled={
                disabled ||
                !soloOk ||
                learning ||
                freestyle ||
                !(dancing || recording)
              }
              title={
                !soloOk
                  ? 'Use a single dancer slot to record'
                  : 'Record teacher drives while disco is dancing'
              }
              onClick={onToggleRecord}
            >
              {recording ? 'Stop record' : 'Record'}
            </button>
            <button
              type="button"
              disabled={
                disabled ||
                !soloOk ||
                learning ||
                recording ||
                recordSamples < minRecordSamples
              }
              title={
                recordSamples < minRecordSamples
                  ? `Need ~${(minRecordSamples / 30).toFixed(0)}s of recording`
                  : 'Fit MLP to recorded samples'
              }
              onClick={onLearn}
            >
              {learning ? 'Learning…' : 'Learn'}
            </button>
            <button
              type="button"
              className={freestyle ? 'active' : ''}
              disabled={disabled || !soloOk || learning || !hasDanceBrain}
              title="Run the learned brain with live audio bands"
              onClick={onToggleFreestyle}
            >
              {freestyle ? 'Exit freestyle' : 'Freestyle'}
            </button>
            <button
              type="button"
              disabled={disabled || !hasDanceBrain || learning}
              onClick={onSaveDance}
            >
              Save dancer
            </button>
            <button
              type="button"
              disabled={disabled || learning || recordSamples === 0}
              onClick={onClearRecord}
            >
              Clear buffer
            </button>
          </div>
          <span className="hint muted disco-learn-stats">
            {recordSamples} samples · {recordDurationSec.toFixed(1)}s
            {learnProgress
              ? ` · epoch ${learnProgress.epoch}/${learnProgress.epochs} · loss ${learnProgress.loss.toFixed(4)}`
              : ''}
            {hasDanceBrain && !learnProgress ? ' · brain ready' : ''}
            {!soloOk ? ' · multi-dancer: record/learn disabled' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
