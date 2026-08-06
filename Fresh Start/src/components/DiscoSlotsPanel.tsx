import { useMemo } from 'react';
import {
  DEFAULT_DISCO_MOTION,
  DEFAULT_DISCO_REACTIVITY,
  DISCO_GAIN_LABELS,
  type DiscoMotionControls,
  type DiscoReactivityGains,
} from '../audio/audioAnalysis';
import { BUNDLED_MODELS, type BundledModel } from '../library/bundledModels';
import type { CreaturePackage } from '../library/creaturePackages';
import { designCandidatePool } from '../library/resolveModelDesign';
import type { SavedModel } from '../library/savedModels';
import { resolveDesignForModel } from '../library/resolveModelDesign';
import { mirrorDesignX } from '../creature/mirrorDesign';
import type { CreatureDesign } from '../creature/types';
import { cloneDesign } from '../creature/types';

export interface DiscoSlotSelection {
  design: CreatureDesign;
  label: string;
  /** Dancefloor X placement (persists across respawn). */
  offsetX?: number;
}

export type DiscoSlotState = DiscoSlotSelection | null;

interface Props {
  slots: DiscoSlotState[];
  packages: CreaturePackage[];
  savedModels: SavedModel[];
  currentDesign: CreatureDesign;
  gains: DiscoReactivityGains;
  motion: DiscoMotionControls;
  disabled?: boolean;
  /** When true, omit reactivity sliders (Zone panel owns them). */
  hideTuning?: boolean;
  /** Dense 2×3 slot grid for the bottom dock. */
  compact?: boolean;
  onSlotsChange: (slots: DiscoSlotState[]) => void;
  onGainsChange: (gains: DiscoReactivityGains) => void;
  onMotionChange: (motion: DiscoMotionControls) => void;
}

const SLOT_COUNT = 6;

function slotSummary(slot: DiscoSlotState): string {
  if (!slot) return 'Empty';
  return slot.label;
}

/** 1-based even slots (2, 4, 6) load mirrored designs. */
function prepareSlotDesign(design: CreatureDesign, index: number): CreatureDesign {
  const cloned = cloneDesign(design);
  if ((index + 1) % 2 === 0) return mirrorDesignX(cloned);
  return cloned;
}

/** H5 — up to six dancer slots + optional reactivity sliders. */
export function DiscoSlotsPanel({
  slots,
  packages,
  savedModels,
  currentDesign,
  gains,
  motion,
  disabled,
  hideTuning = false,
  compact = false,
  onSlotsChange,
  onGainsChange,
  onMotionChange,
}: Props) {
  const pool = useMemo(
    () =>
      designCandidatePool(
        packages,
        BUNDLED_MODELS,
        currentDesign,
      ),
    [packages, currentDesign],
  );

  const setSlot = (index: number, next: DiscoSlotState) => {
    const copy = slots.slice(0, SLOT_COUNT);
    while (copy.length < SLOT_COUNT) copy.push(null);
    copy[index] = next;
    onSlotsChange(copy);
  };

  const loadBundled = (index: number, model: BundledModel) => {
    setSlot(index, {
      design: prepareSlotDesign(model.design, index),
      label: model.displayName,
    });
  };

  const loadPackage = (index: number, pkg: CreaturePackage) => {
    setSlot(index, {
      design: prepareSlotDesign(pkg.design, index),
      label: pkg.displayName,
    });
  };

  const loadSaved = (index: number, model: SavedModel) => {
    const design = resolveDesignForModel(model, pool);
    if (!design) return false;
    setSlot(index, {
      design: prepareSlotDesign(design, index),
      label: model.name,
    });
    return true;
  };

  const loadCurrent = (index: number) => {
    if (currentDesign.joints.length === 0) return;
    setSlot(index, {
      design: prepareSlotDesign(currentDesign, index),
      label: currentDesign.name || 'Current',
    });
  };

  const activeCount = slots.filter(Boolean).length;

  return (
    <div className={compact ? 'disco-slots-panel disco-slots-compact' : 'disco-slots-panel'}>
      <h4 className="subhead">Dancers ({activeCount}/6)</h4>
      {!compact && (
        <p className="hint muted">
          Load models per slot. Grab dancers on the floor to place them. Even
          slots (2, 4, 6) load mirrored.
        </p>
      )}
      <ul className="disco-slot-list">
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const slot = slots[i] ?? null;
          const summary = slotSummary(slot);
          const even = (i + 1) % 2 === 0;
          return (
            <li key={i} className="disco-slot-row">
              <span className="disco-slot-label" title={summary}>
                {i + 1}. {summary}
                {even ? ' · mirrored' : ''}
              </span>
              <div className="button-row wrap disco-slot-actions">
                <select
                  disabled={disabled}
                  defaultValue=""
                  aria-label={`Load dancer slot ${i + 1}`}
                  onChange={(e) => {
                    const v = e.target.value;
                    e.target.value = '';
                    if (!v) return;
                    if (v === '__current__') {
                      loadCurrent(i);
                      return;
                    }
                    if (v.startsWith('pkg:')) {
                      const pkg = packages.find((p) => p.id === v.slice(4));
                      if (pkg) loadPackage(i, pkg);
                      return;
                    }
                    if (v.startsWith('bundled:')) {
                      const m = BUNDLED_MODELS.find((b) => b.id === v.slice(8));
                      if (m) loadBundled(i, m);
                      return;
                    }
                    if (v.startsWith('saved:')) {
                      const m = savedModels.find((s) => s.id === v.slice(6));
                      if (m && !loadSaved(i, m)) {
                        window.alert(
                          'Could not find a matching creature body for that saved model. Save/load the design in Creatures first.',
                        );
                      }
                    }
                  }}
                >
                  <option value="">Load…</option>
                  <option value="__current__">Current editor design</option>
                  {BUNDLED_MODELS.map((m) => (
                    <option key={m.id} value={`bundled:${m.id}`}>
                      Bundled · {m.displayName}
                    </option>
                  ))}
                  {packages.slice(0, 16).map((p) => (
                    <option key={p.id} value={`pkg:${p.id}`}>
                      Package · {p.displayName}
                    </option>
                  ))}
                  {savedModels.slice(0, 12).map((m) => (
                    <option key={m.id} value={`saved:${m.id}`}>
                      Saved · {m.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={disabled || !slot}
                  onClick={() => setSlot(i, null)}
                >
                  Clear
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {!hideTuning && (
        <details className="disco-tuning">
          <summary>Reactivity & motion</summary>
          <div className="sliders dock-sliders">
            {DISCO_GAIN_LABELS.map(({ key, label }) => (
              <label key={key} className="slider-row">
                <span>{label}</span>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={gains[key]}
                  disabled={disabled}
                  onChange={(e) =>
                    onGainsChange({
                      ...gains,
                      [key]: Number(e.target.value),
                    })
                  }
                />
                <span className="val">{gains[key].toFixed(2)}</span>
              </label>
            ))}
            <label className="slider-row">
              <span>Motion range</span>
              <input
                type="range"
                min={0.2}
                max={1.5}
                step={0.05}
                value={motion.range}
                disabled={disabled}
                onChange={(e) =>
                  onMotionChange({
                    ...motion,
                    range: Number(e.target.value),
                  })
                }
              />
              <span className="val">{motion.range.toFixed(2)}</span>
            </label>
            <label className="slider-row">
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
            </label>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onGainsChange({ ...DEFAULT_DISCO_REACTIVITY });
                onMotionChange({ ...DEFAULT_DISCO_MOTION });
              }}
            >
              Reset tuning
            </button>
          </div>
        </details>
      )}
    </div>
  );
}

export { SLOT_COUNT as DISCO_SLOT_COUNT };
