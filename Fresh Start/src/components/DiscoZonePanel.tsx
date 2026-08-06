import { useMemo, useState } from 'react';
import {
  DEFAULT_DISCO_AUTO,
  DEFAULT_DISCO_MOTION,
  DEFAULT_DISCO_REACTIVITY,
  DEFAULT_DISCO_ROUTING,
  DISCO_GAIN_LABELS,
  DISCO_ROUTE_LABELS,
  type DiscoAutoFlags,
  type DiscoBandRouting,
  type DiscoMotionControls,
  type DiscoReactivityGains,
  type DiscoRouteBand,
  type DiscoRouteTarget,
} from '../audio/audioAnalysis';
import { normalizeDriveGroup } from '../brain/driveGroups';
import type { CreatureDesign } from '../creature/types';
import type { EditorSelection } from '../editor/selection';
import type { CreaturePackage } from '../library/creaturePackages';
import {
  DISCO_FOOT_MASS_MAX,
  DISCO_FOOT_MASS_MIN,
  DISCO_PUPPET_MODE_LABELS,
  type DiscoPuppetMode,
} from '../physics/constants';
import type { DiscoSetup } from '../library/discoSetups';
import type { SavedModel } from '../library/savedModels';
import { isFeatureEnabled } from '../port/featureFlags';
import { DiscoSlotsPanel, type DiscoSlotState } from './DiscoSlotsPanel';

interface Props {
  trackName: string;
  hasTrack: boolean;
  playing: boolean;
  dancing: boolean;
  /** Playback position in seconds. */
  trackTime: number;
  /** Track length in seconds (0 if unknown). */
  trackDuration: number;
  puppetMode: DiscoPuppetMode;
  footMass: number;
  gains: DiscoReactivityGains;
  motion: DiscoMotionControls;
  auto: DiscoAutoFlags;
  routing: DiscoBandRouting;
  slots: DiscoSlotState[];
  packages: CreaturePackage[];
  savedModels: SavedModel[];
  currentDesign: CreatureDesign;
  selection: EditorSelection;
  hideMuscles: boolean;
  hideBones: boolean;
  greenscreen: boolean;
  /** H8 — named stage presets. */
  savedSetups?: DiscoSetup[];
  disabled?: boolean;
  collapsed?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStartDancing: () => void;
  /** Respawn dancers at rest pose without pausing audio. */
  onResetPose: () => void;
  onSeek: (seconds: number) => void;
  onPuppetModeChange: (mode: DiscoPuppetMode) => void;
  onFootMassChange: (mass: number) => void;
  onGainsChange: (gains: DiscoReactivityGains) => void;
  onMotionChange: (motion: DiscoMotionControls) => void;
  onAutoChange: (auto: DiscoAutoFlags) => void;
  onRoutingChange: (routing: DiscoBandRouting) => void;
  onSlotsChange: (slots: DiscoSlotState[]) => void;
  onHideMusclesChange: (hide: boolean) => void;
  onHideBonesChange: (hide: boolean) => void;
  onGreenscreenChange: (on: boolean) => void;
  onSaveSetup?: () => void;
  onLoadSetup?: (id: string) => void;
  onDeleteSetup?: (id: string) => void;
}

function formatTrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function targetKey(t: DiscoRouteTarget): string {
  if (t.kind === 'auto') return 'auto';
  if (t.kind === 'muscle') return `muscle:${t.muscleId}`;
  return `group:${t.group}`;
}

function parseTarget(value: string): DiscoRouteTarget {
  if (value === 'auto' || !value) return { kind: 'auto' };
  if (value.startsWith('muscle:')) {
    return { kind: 'muscle', muscleId: Number(value.slice(7)) };
  }
  if (value.startsWith('group:')) {
    return { kind: 'group', group: Number(value.slice(6)) };
  }
  return { kind: 'auto' };
}

function selectionTarget(
  selection: EditorSelection,
  design: CreatureDesign,
): DiscoRouteTarget | null {
  if (!selection || selection.kind !== 'muscle') return null;
  const m = design.muscles.find((x) => x.id === selection.id);
  if (!m) return null;
  const g = normalizeDriveGroup(m.driveGroup);
  if (g !== undefined) return { kind: 'group', group: g };
  return { kind: 'muscle', muscleId: m.id };
}

/** Bottom-dock disco tuning (H1/H2/H5) — track/learn live in the Zone sidebar. */
export function DiscoZonePanel({
  trackName,
  hasTrack,
  playing,
  dancing,
  trackTime,
  trackDuration,
  puppetMode,
  footMass,
  gains,
  motion,
  auto,
  routing,
  slots,
  packages,
  savedModels,
  currentDesign,
  selection,
  hideMuscles,
  hideBones,
  greenscreen,
  savedSetups = [],
  disabled,
  collapsed,
  onPlay,
  onPause,
  onStartDancing,
  onResetPose,
  onSeek,
  onPuppetModeChange,
  onFootMassChange,
  onGainsChange,
  onMotionChange,
  onAutoChange,
  onRoutingChange,
  onSlotsChange,
  onHideMusclesChange,
  onHideBonesChange,
  onGreenscreenChange,
  onSaveSetup,
  onLoadSetup,
  onDeleteSetup,
}: Props) {
  const [scrubTime, setScrubTime] = useState<number | null>(null);
  const [setupPick, setSetupPick] = useState('');
  const duration = Number.isFinite(trackDuration) ? Math.max(0, trackDuration) : 0;
  const displayTime = scrubTime ?? trackTime;
  const setupsEnabled =
    isFeatureEnabled('discoSetups') && typeof onSaveSetup === 'function';

  /** Prefer the first staged dancer so routing lists that body's muscles. */
  const routingDesign = useMemo(() => {
    const primary = slots.find(
      (s) => s !== null && s.design.joints.length > 0,
    );
    return primary?.design ?? currentDesign;
  }, [slots, currentDesign]);

  const groupIds = useMemo(() => {
    const set = new Set<number>();
    for (const m of routingDesign.muscles) {
      const g = normalizeDriveGroup(m.driveGroup);
      if (g !== undefined) set.add(g);
    }
    return [...set].sort((a, b) => a - b);
  }, [routingDesign.muscles]);

  const setRoute = (band: DiscoRouteBand, target: DiscoRouteTarget) => {
    onRoutingChange({ ...routing, [band]: target });
  };

  if (collapsed) {
    return (
      <div className="dock-summary">
        <div className="button-row wrap">
          <button type="button" disabled={disabled || !hasTrack} onClick={onPlay}>
            Play
          </button>
          <button type="button" disabled={disabled || !hasTrack} onClick={onPause}>
            Pause
          </button>
          <button
            type="button"
            className={dancing ? 'active' : ''}
            disabled={disabled || !hasTrack}
            onClick={dancing ? onResetPose : onStartDancing}
          >
            {dancing ? 'Reset pose' : 'Dance'}
          </button>
        </div>
        <span className="dock-summary-stats truncate">
          {trackName || 'No audio'}
          {playing ? ' · playing' : ''}
        </span>
      </div>
    );
  }

  return (
    <div className="dock-full disco-dock">
      <div className="disco-dock-toolbar">
        <div className="disco-dock-toggles">
          <label className="toggle-row disco-viz-toggle">
            <input
              type="checkbox"
              checked={hideMuscles}
              disabled={disabled}
              onChange={(e) => onHideMusclesChange(e.target.checked)}
            />
            Hide muscles
          </label>
          <label className="toggle-row disco-viz-toggle">
            <input
              type="checkbox"
              checked={hideBones}
              disabled={disabled}
              onChange={(e) => onHideBonesChange(e.target.checked)}
            />
            Hide bones
          </label>
          <label className="toggle-row disco-viz-toggle">
            <input
              type="checkbox"
              checked={greenscreen}
              disabled={disabled}
              onChange={(e) => onGreenscreenChange(e.target.checked)}
            />
            Greenscreen
          </label>
          <span
            className="disco-inline-hint muted"
            title="Drag the disco ball on the stage. Double-click to reset."
          >
            Drag ball · dbl-click reset
          </span>
        </div>
        <button
          type="button"
          className="disco-reset"
          disabled={disabled}
          onClick={() => {
            onGainsChange({ ...DEFAULT_DISCO_REACTIVITY });
            onMotionChange({ ...DEFAULT_DISCO_MOTION });
            onAutoChange({ ...DEFAULT_DISCO_AUTO });
            onRoutingChange({ ...DEFAULT_DISCO_ROUTING });
          }}
        >
          Reset tuning & routing
        </button>
      </div>

      {setupsEnabled && (
        <div className="disco-setups-bar">
          <span className="disco-toolbar-label">Setup</span>
          <button
            type="button"
            disabled={disabled}
            title="Name and save dancers, tuning, routing, puppet feel, and optional dance brain"
            onClick={onSaveSetup}
          >
            Save…
          </button>
          {savedSetups.length > 0 && (
            <>
              <select
                className="disco-setup-select"
                value={setupPick}
                disabled={disabled}
                onChange={(e) => setSetupPick(e.target.value)}
                aria-label="Saved disco setup"
              >
                <option value="">Saved setups…</option>
                {savedSetups.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.danceBrain ? ' · brain' : ''}
                    {s.trackHint ? ` · ${s.trackHint}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={disabled || !setupPick}
                onClick={() => {
                  if (!setupPick || !onLoadSetup) return;
                  onLoadSetup(setupPick);
                }}
              >
                Load
              </button>
              <button
                type="button"
                className="disco-setup-delete"
                disabled={disabled || !setupPick}
                title="Delete selected setup"
                onClick={() => {
                  if (!setupPick || !onDeleteSetup) return;
                  onDeleteSetup(setupPick);
                  setSetupPick('');
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      <div className="disco-dock-main">
        <div className="disco-dock-section">
          <h3 className="subhead">Frequency reactivity</h3>
          <p className="hint muted disco-inline-hint">
            Auto jumps a band slider on musical hits; Motion range Auto follows
            overall loudness.
          </p>
          <div className="sliders disco-gain-grid">
            {DISCO_GAIN_LABELS.map(({ key, label }) => {
              const bandAuto =
                key !== 'master' ? auto[key as DiscoRouteBand] : false;
              return (
                <div key={key} className="slider-row">
                  <span>{label}</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={gains[key]}
                    disabled={disabled || bandAuto}
                    onChange={(e) =>
                      onGainsChange({
                        ...gains,
                        [key]: Number(e.target.value),
                      })
                    }
                  />
                  <span className="val">{gains[key].toFixed(2)}</span>
                  {key !== 'master' ? (
                    <input
                      type="checkbox"
                      className="disco-auto-check"
                      checked={bandAuto}
                      disabled={disabled}
                      title={`Auto ${label} — jump on music changes`}
                      aria-label={`Auto ${label}`}
                      onChange={(e) =>
                        onAutoChange({
                          ...auto,
                          [key]: e.target.checked,
                        })
                      }
                    />
                  ) : (
                    <span className="disco-auto-spacer" aria-hidden />
                  )}
                </div>
              );
            })}
            <div className="slider-row">
              <span>Motion range</span>
              <input
                type="range"
                min={0.2}
                max={1.5}
                step={0.05}
                value={motion.range}
                disabled={disabled || auto.motionRange}
                onChange={(e) =>
                  onMotionChange({
                    ...motion,
                    range: Number(e.target.value),
                  })
                }
              />
              <span className="val">{motion.range.toFixed(2)}</span>
              <input
                type="checkbox"
                className="disco-auto-check"
                checked={auto.motionRange}
                disabled={disabled}
                title="Auto motion range — follow overall loudness"
                aria-label="Auto motion range"
                onChange={(e) =>
                  onAutoChange({
                    ...auto,
                    motionRange: e.target.checked,
                  })
                }
              />
            </div>
            <div className="slider-row">
              <span>Motion freq</span>
              <input
                type="range"
                min={0.5}
                max={6}
                step={0.1}
                value={motion.frequency}
                disabled={disabled}
                onChange={(e) =>
                  onMotionChange({
                    ...motion,
                    frequency: Number(e.target.value),
                  })
                }
              />
              <span className="val">{motion.frequency.toFixed(1)}</span>
              <span className="disco-auto-spacer" aria-hidden />
            </div>
          </div>
          <label className="disco-timeline">
            <span className="disco-timeline-time">
              {formatTrackTime(displayTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.05}
              value={duration > 0 ? Math.min(displayTime, duration) : 0}
              disabled={disabled || !hasTrack || duration <= 0}
              aria-label="Track timeline"
              onPointerDown={() => setScrubTime(trackTime)}
              onChange={(e) => {
                const t = Number(e.target.value);
                setScrubTime(t);
                onSeek(t);
              }}
              onPointerUp={() => setScrubTime(null)}
              onPointerCancel={() => setScrubTime(null)}
              onBlur={() => setScrubTime(null)}
            />
            <span className="disco-timeline-time">
              {formatTrackTime(duration)}
            </span>
          </label>
          <label className="disco-puppet-row">
            <span>Puppet mode</span>
            <select
              disabled={disabled}
              value={puppetMode}
              aria-label="Disco puppet mode"
              onChange={(e) =>
                onPuppetModeChange(e.target.value as DiscoPuppetMode)
              }
            >
              {DISCO_PUPPET_MODE_LABELS.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="disco-puppet-row disco-foot-mass-row">
            <span title="Heavier marked feet resist floating in Disco">
              Foot mass
            </span>
            <input
              type="range"
              min={DISCO_FOOT_MASS_MIN}
              max={DISCO_FOOT_MASS_MAX}
              step={0.25}
              value={footMass}
              disabled={disabled}
              aria-label="Disco foot mass"
              onChange={(e) => onFootMassChange(Number(e.target.value))}
            />
            <span className="val">{footMass.toFixed(2)}</span>
          </label>
        </div>

        <div className="disco-dock-section">
          <h3 className="subhead">Band → muscle / group</h3>
          <p className="hint muted disco-inline-hint">
            Muscles from {routingDesign.name || 'active dancer'}. Assign uses
            Edit selection when it matches.
          </p>
          <ul className="disco-route-list">
            {DISCO_ROUTE_LABELS.map(({ key, label }) => (
              <li key={key} className="disco-route-row">
                <span className="disco-route-band">{label}</span>
                <select
                  disabled={disabled}
                  value={targetKey(routing[key])}
                  onChange={(e) => setRoute(key, parseTarget(e.target.value))}
                >
                  <option value="auto">Auto</option>
                  {routingDesign.muscles.map((m, i) => (
                    <option key={m.id} value={`muscle:${m.id}`}>
                      Muscle {i + 1} (#{m.id})
                      {normalizeDriveGroup(m.driveGroup)
                        ? ` · g${normalizeDriveGroup(m.driveGroup)}`
                        : ''}
                    </option>
                  ))}
                  {groupIds.map((g) => (
                    <option key={g} value={`group:${g}`}>
                      Drive group {g}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={
                    disabled ||
                    !(
                      selectionTarget(selection, routingDesign) ||
                      selectionTarget(selection, currentDesign)
                    )
                  }
                  title="Assign currently selected muscle / its group"
                  onClick={() => {
                    const t =
                      selectionTarget(selection, routingDesign) ??
                      selectionTarget(selection, currentDesign);
                    if (t) setRoute(key, t);
                  }}
                >
                  Assign
                </button>
              </li>
            ))}
          </ul>
        </div>

        {isFeatureEnabled('multiDisco') && (
          <div className="disco-dock-section">
            <DiscoSlotsPanel
              slots={slots}
              packages={packages}
              savedModels={savedModels}
              currentDesign={currentDesign}
              gains={gains}
              motion={motion}
              disabled={disabled}
              onSlotsChange={onSlotsChange}
              onGainsChange={onGainsChange}
              onMotionChange={onMotionChange}
              hideTuning
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}
