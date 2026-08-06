import { isFeatureEnabled } from '../port/featureFlags';
import {
  PLACE_MARKER_TOOLS,
  PLACE_OBSTACLE_TOOLS,
  PLACE_REGION_TOOLS,
  type EnvSelection,
  type EnvTool,
} from '../env/envSelection';
import { selectionLabel } from '../env/envEditOps';
import type { EnvironmentDesign } from '../env/types';

interface Props {
  tool: EnvTool;
  onToolChange: (tool: EnvTool) => void;
  snapEnabled: boolean;
  onSnapChange: (snap: boolean) => void;
  environment: EnvironmentDesign;
  selection: EnvSelection;
  onDeleteSelected: () => void;
  onUndo: () => void;
  undoDisabled: boolean;
  onSineTerrain: () => void;
  onClearTerrain: () => void;
  onClearTower: () => void;
  collapsed?: boolean;
}

/** World bottom dock — tools under the Environment Studio canvas. */
export function WorldDock({
  tool,
  onToolChange,
  snapEnabled,
  onSnapChange,
  environment,
  selection,
  onDeleteSelected,
  onUndo,
  undoDisabled,
  onSineTerrain,
  onClearTerrain,
  onClearTower,
  collapsed,
}: Props) {
  const label = selectionLabel(environment, selection);

  if (collapsed) {
    return (
      <div className="dock-summary">
        <div className="button-row wrap">
          <button
            type="button"
            className={tool === 'select' ? 'active' : ''}
            onClick={() => onToolChange('select')}
          >
            Select
          </button>
          {PLACE_OBSTACLE_TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              className={tool === t ? 'active' : ''}
              onClick={() => onToolChange(t)}
            >
              {t}
            </button>
          ))}
          {isFeatureEnabled('scoreRegions') &&
            PLACE_REGION_TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                className={tool === t ? 'active' : ''}
                onClick={() => onToolChange(t)}
              >
                {t}
              </button>
            ))}
          {isFeatureEnabled('courseMarkers') &&
            PLACE_MARKER_TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                className={tool === t ? 'active' : ''}
                onClick={() => onToolChange(t)}
              >
                {t}
              </button>
            ))}
          {isFeatureEnabled('launchTower') && (
            <button
              type="button"
              className={tool === 'tower' ? 'active' : ''}
              onClick={() => onToolChange('tower')}
            >
              Tower
            </button>
          )}
          <button
            type="button"
            className={tool === 'spawn' ? 'active' : ''}
            onClick={() => onToolChange('spawn')}
          >
            Spawn
          </button>
        </div>
        <span className="dock-summary-stats">{label}</span>
      </div>
    );
  }

  return (
    <div className="dock-full">
      <div className="dock-col">
        <h3 className="subhead">Tools</h3>
        <div className="button-row wrap">
          <button
            type="button"
            className={tool === 'select' ? 'active' : ''}
            onClick={() => onToolChange('select')}
          >
            Select
          </button>
          {isFeatureEnabled('staticObstacles') &&
            PLACE_OBSTACLE_TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                className={tool === t ? 'active' : ''}
                onClick={() => onToolChange(t)}
              >
                + {t}
              </button>
            ))}
          {isFeatureEnabled('scoreRegions') &&
            PLACE_REGION_TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                className={tool === t ? 'active' : ''}
                onClick={() => onToolChange(t)}
                title={
                  t === 'penalty'
                    ? 'Penalty zone — fitness drains while inside'
                    : 'Reward zone — one-time bonus on first touch'
                }
              >
                + {t}
              </button>
            ))}
          {isFeatureEnabled('courseMarkers') &&
            PLACE_MARKER_TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                className={tool === t ? 'active' : ''}
                onClick={() => onToolChange(t)}
                title={
                  t === 'start'
                    ? 'Start marker — arms the course'
                    : t === 'checkpoint'
                      ? 'Checkpoint — must hit in order'
                      : 'Finish marker — completion when armed'
                }
              >
                + {t}
              </button>
            ))}
          {isFeatureEnabled('launchTower') && (
            <button
              type="button"
              className={tool === 'tower' ? 'active' : ''}
              onClick={() => onToolChange('tower')}
            >
              Tower
            </button>
          )}
          <button
            type="button"
            className={tool === 'spawn' ? 'active' : ''}
            onClick={() => onToolChange('spawn')}
            title="Set where creatures spawn when training / playing"
          >
            Spawn
          </button>
        </div>
        <p className="hint muted">
          Click to place · drag to move · handles resize · Alt/Space pan ·
          Del remove (spawn resets to origin). Penalty = time in zone; reward =
          touch once. Markers = start / checkpoint / finish course gates.
        </p>
      </div>

      {isFeatureEnabled('terrainHeightfield') && (
        <div className="dock-col">
          <h3 className="subhead">Terrain</h3>
          <div className="button-row wrap">
            <button type="button" onClick={onSineTerrain}>
              Sine hills
            </button>
            <button
              type="button"
              disabled={!environment.terrain}
              onClick={onClearTerrain}
            >
              Clear terrain
            </button>
          </div>
          <p className="hint muted">
            Drag the Start / End dots on the hills to cover more or less ground.
          </p>
        </div>
      )}

      <div className="dock-col">
        <h3 className="subhead">Edit</h3>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(e) => onSnapChange(e.target.checked)}
          />
          Snap to grid
        </label>
        <div className="button-row wrap" style={{ marginTop: '0.35rem' }}>
          <button type="button" onClick={onUndo} disabled={undoDisabled}>
            Undo
          </button>
          <button
            type="button"
            className="danger-ghost"
            disabled={!selection}
            onClick={onDeleteSelected}
            title={
              selection?.kind === 'spawn'
                ? 'Reset spawn to (0, 0)'
                : 'Remove selection'
            }
          >
            {selection?.kind === 'spawn' ? 'Reset spawn' : 'Delete'}
          </button>
          {isFeatureEnabled('launchTower') && (
            <button
              type="button"
              disabled={!environment.tower}
              onClick={onClearTower}
            >
              Clear tower
            </button>
          )}
        </div>
        <p className="hint muted" style={{ marginTop: '0.35rem' }}>
          {label}
        </p>
      </div>
    </div>
  );
}
